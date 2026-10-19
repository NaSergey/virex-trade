import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { runsBackgroundJobs } from '../role';
import {
  fetchLeaderboard,
  hlInfo,
  hlPausedFor,
  isGateRefusal,
  WEIGHT,
} from '../hyperliquid/hl-gate';
import { pickCandidates, volumesOf, type Candidate } from './candidates';
import { analyzePortfolio } from './stability';
import { DISCOVER_EVERY_MS, REANALYZE_MS } from './criteria';
import type { ClearinghouseState, LeaderboardRow, Portfolio } from './hl-types';

/** Как часто проверять, не пора ли отбор: сам отбор — раз в 6 часов. */
const CHECK_EVERY_MS = 10 * 60_000;
/** Разбирать некого — сон до следующей проверки очереди. */
const IDLE_MS = 60_000;
/** Лидерборд короче — сбой источника, а не рынок: стирать по нему отбор нельзя. */
const MIN_LEADERBOARD_ROWS = 1000;
/**
 * Кандидатов меньше — скорее сменился формат лидерборда, чем рынок (обычно их
 * ~3,7 тыс.): отбор по такому списку удалил бы почти всю таблицу.
 */
const MIN_CANDIDATES = 100;

/**
 * Бот отбора кошельков Hyperliquid — фоновый сервис `worker`. Спека —
 * docs/superpowers/specs/2026-10-19-hyperliquid-wallet-scout-design.md.
 *
 * Два цикла. Отбор кандидатов из лидерборда — раз в 6 часов; срок выводится
 * из `max(seenAt)`, а не из памяти процесса: перезапуск не перекачивает 39 МБ.
 * Разбор кривой — по одному кошельку, самый давний первым; темп держит шлюз
 * (`hlInfo` ждёт места в окне), своего таймера разбору не нужно.
 */
@Injectable()
export class HlScoutService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(HlScoutService.name);
  private stopped = false;

  constructor(private readonly prisma: PrismaService) {}

  onApplicationBootstrap() {
    if (!runsBackgroundJobs()) return;
    void this.loop('отбор', CHECK_EVERY_MS, async () => {
      await this.discoverIfDue(Date.now());
      return false;
    });
    void this.loop('разбор', IDLE_MS, async () => {
      // На паузе после 429 любой запрос её только продлил бы. Отбор лидерборда
      // идёт мимо шлюза и паузы не ждёт.
      const paused = hlPausedFor();
      if (paused > 0) {
        await this.sleep(paused);
        return true;
      }
      return this.analyzeNext();
    });
  }

  onModuleDestroy() {
    this.stopped = true;
  }

  /** `step` вернул true — работа есть, следующий шаг сразу; иначе сон `idleMs`. */
  private async loop(
    name: string,
    idleMs: number,
    step: () => Promise<boolean>,
  ) {
    while (!this.stopped) {
      let busy = false;
      try {
        busy = await step();
      } catch (e) {
        this.logger.error(
          `${name} кошельков Hyperliquid упал: ${(e as Error).message}`,
        );
      }
      if (!busy) await this.sleep(idleMs);
    }
  }

  private sleep(ms: number) {
    // unref: спящий цикл не держит процесс при остановке.
    return new Promise<void>((resolve) => setTimeout(resolve, ms).unref());
  }

  async discoverIfDue(now: number): Promise<void> {
    const last = await this.prisma.hlWallet.aggregate({
      _max: { seenAt: true },
    });
    const at = last._max.seenAt?.getTime();
    if (at != null && now - at < DISCOVER_EVERY_MS) return;

    const board = await this.readLeaderboard();
    if (!board) return;
    await this.store(board.candidates, board.volumes, now);
    this.logger.log(
      `отбор Hyperliquid: ${board.candidates.length} кандидатов из ${board.total}`,
    );
  }

  /**
   * Скачать и сжать лидерборд до кандидатов и оборотов. Отдельной функцией,
   * чтобы ~140 МБ разобранного JSON отпускались до транзакции, а не держались
   * до конца отбора.
   */
  private async readLeaderboard(): Promise<{
    candidates: Candidate[];
    volumes: Map<string, number>;
    total: number;
  } | null> {
    const body = (await fetchLeaderboard()) as {
      leaderboardRows?: LeaderboardRow[];
    } | null;
    const rows = body?.leaderboardRows ?? [];
    if (rows.length < MIN_LEADERBOARD_ROWS) {
      this.logger.warn(
        `лидерборд Hyperliquid подозрительно короткий (${rows.length}) — отбор пропущен`,
      );
      return null;
    }
    const candidates = pickCandidates(rows);
    if (candidates.length < MIN_CANDIDATES) {
      this.logger.warn(
        `в лидерборде Hyperliquid всего ${candidates.length} кандидатов — отбор пропущен`,
      );
      return null;
    }
    return { candidates, volumes: volumesOf(rows), total: rows.length };
  }

  /**
   * Одной транзакцией: снять отметку со всех, вставить или обновить кандидатов,
   * удалить не-кандидатов без сохранения. По шагам таблица владельца на миг
   * показала бы пустоту или вчерашний отбор.
   */
  async store(
    candidates: Candidate[],
    volumes: Map<string, number>,
    now: number,
  ): Promise<void> {
    const at = new Date(now);
    const addrs = candidates.map((c) => c.address);
    const vols = candidates.map((c) => c.volumeWeek);
    await this.prisma.$transaction([
      this.prisma.hlWallet.updateMany({
        where: { candidate: true },
        data: { candidate: false },
      }),
      this.prisma.$executeRaw`
        INSERT INTO "hl_wallets" ("address", "candidate", "seenAt", "volumeWeek")
        SELECT a, true, ${at}, v FROM unnest(${addrs}::text[], ${vols}::float8[]) AS x(a, v)
        ON CONFLICT ("address") DO UPDATE SET
          "candidate" = true, "seenAt" = EXCLUDED."seenAt", "volumeWeek" = EXCLUDED."volumeWeek"`,
      // Удалённые владельцем остаются меткой: сотри мы строку — следующий отбор
      // вернул бы кошелёк в таблицу.
      this.prisma.hlWallet.deleteMany({
        where: { candidate: false, savedAt: null, hiddenAt: null },
      }),
    ]);
    // Сохранённые, выпавшие из кандидатов, берут оборот из того же лидерборда:
    // «живой» у них считается так же, как у остальных. Их единицы — не тысячи.
    const saved = await this.prisma.hlWallet.findMany({
      where: { candidate: false, savedAt: { not: null } },
      select: { address: true },
    });
    for (const { address } of saved) {
      await this.prisma.hlWallet.updateMany({
        where: { address },
        data: { volumeWeek: volumes.get(address) ?? 0 },
      });
    }
  }

  /**
   * Разобрать самый давний кошелёк из очереди. false — разбирать некого.
   * `clock` — ради тестов: время берётся и до запроса (очередь), и после него
   * (кривая и `analyzedAt`), — шлюз может продержать запрос до двух минут.
   */
  async analyzeNext(clock: () => number = Date.now): Promise<boolean> {
    const wallet = await this.prisma.hlWallet.findFirst({
      where: {
        // Удалённый владельцем кошелёк запросов не тратит.
        hiddenAt: null,
        OR: [{ candidate: true }, { savedAt: { not: null } }],
        AND: [
          {
            OR: [
              { analyzedAt: null },
              { analyzedAt: { lt: new Date(clock() - REANALYZE_MS) } },
            ],
          },
        ],
      },
      orderBy: { analyzedAt: { sort: 'asc', nulls: 'first' } },
      select: { address: true },
    });
    if (!wallet) return false;
    const { address } = wallet;
    try {
      const [pf, state] = await Promise.all([
        hlInfo<Portfolio>(
          { type: 'portfolio', user: address },
          WEIGHT.portfolio,
        ),
        hlInfo<ClearinghouseState>(
          { type: 'clearinghouseState', user: address },
          WEIGHT.clearinghouseState,
        ),
      ]);
      const now = clock();
      const { stats, reason } = analyzePortfolio(pf, now);
      // updateMany, а не update: отбор мог удалить строку, пока шёл запрос.
      await this.prisma.hlWallet.updateMany({
        where: { address },
        data: {
          ...stats,
          analyzedAt: new Date(now),
          qualified: reason == null,
          rejectReason: reason,
          openPositions: (state?.assetPositions ?? []).filter(
            (p) => Number(p.position.szi) !== 0,
          ).length,
        },
      });
    } catch (e) {
      // Отказ шлюза — не беда кошелька: он остаётся первым в очереди, а цикл
      // засыпает. Сдвинь мы его, каждый следующий отказ сдвигал бы следующего,
      // и вся очередь «разобралась» бы за секунды без единого запроса.
      if (isGateRefusal(e)) throw e;
      this.logger.warn(`разбор ${address} не удался: ${(e as Error).message}`);
      // Сбой самого кошелька — сдвигаем: иначе он стоял бы первым в очереди всегда.
      await this.prisma.hlWallet.updateMany({
        where: { address },
        data: { analyzedAt: new Date(clock()) },
      });
    }
    return true;
  }
}
