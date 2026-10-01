import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { BacktestService } from '../backtest/backtest.service';
import { LiveEngineService } from '../backtest/live-engine.service';
import { LiveMarketService } from '../market-data/live-market.service';
import { PrismaService } from '../prisma/prisma.service';
import { runsBackgroundJobs } from '../role';
import { TournamentsService } from './tournaments.service';

const TICK_MS = 2_000;
const MINUTE_MS = 60_000;

/** Ключ потока турнира в движке эфира. */
const stream = (id: string) => `t:${id}`;

/**
 * Эфир турниров: раз в две секунды гоняет каждый идущий турнир через движок
 * эфира (`LiveEngineService` — стопы, тейки, лимитки, уровни на вход),
 * запускает турниры, чьё назначенное время пришло, и подводит итоги тех, у
 * кого вышел срок.
 *
 * Исполнение у турнира и у своей сессии эфира одно; турнир отличается курсором
 * (`Tournament.processedUntil`, общий на всех участников), границей (дальше
 * `endsAt` движок не смотрит) и финалом. Браузеру турнира не верят вовсе — на
 * кону призовой фонд.
 */
@Injectable()
export class TournamentRunnerService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(TournamentRunnerService.name);
  private timer?: NodeJS.Timeout;
  private busy = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly live: LiveMarketService,
    private readonly engine: LiveEngineService,
    private readonly backtest: BacktestService,
    private readonly tournaments: TournamentsService,
  ) {}

  onApplicationBootstrap() {
    // T11: фоновый сервис — только роль worker (и дефолтная all). Второй
    // экземпляр движка исполнял бы те же уровни второй раз.
    if (!runsBackgroundJobs()) return;
    this.timer = setInterval(() => {
      this.tick().catch((e) => this.logger.error('тик движка турниров упал', e as Error));
    }, TICK_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.startDue();
      await this.finishDue();
      await this.processRunning();
    } finally {
      this.busy = false;
    }
  }

  /**
   * Лобби, чьё назначенное время пришло: старт или отмена — решает
   * `TournamentsService.startScheduled`. Первым шагом тика: турнир, начатый
   * здесь, тем же тиком попадает в эфир.
   */
  private async startDue(): Promise<void> {
    const now = new Date();
    for (const t of await this.tournaments.dueForStart(now)) {
      try {
        await this.tournaments.startScheduled(t.id, now);
      } catch (e) {
        // Как у финала: чужая упавшая транзакция не должна задерживать остальных.
        this.logger.error(`старт турнира ${t.id} упал`, e as Error);
      }
    }
  }

  /** Итоги турниров, у которых вышел срок и закрылась последняя минутка. */
  private async finishDue(): Promise<void> {
    const due = await this.tournaments.dueForFinal(new Date());
    for (const t of due) {
      try {
        if (!t.endsAt) continue;
        // Цена финала — закрытие минутки, которой турнир кончается, у каждой
        // монеты открытых позиций своя. Пока хоть одной нет (Binance молчит),
        // турнир ждёт следующего тика: сделки после endsAt сервер всё равно не
        // принимает, и ожидание ничего не меняет.
        const prices = await this.finalPrices(t.id, t.endsAt);
        if (prices == null) continue;

        const sessions = await this.prisma.backtestSession.findMany({
          where: { tournamentId: t.id, status: 'active' },
          select: { id: true },
        });
        for (const s of sessions) {
          await this.backtest.finishTournamentSession(s.id, t.endsAt, prices);
        }
        await this.tournaments.finalize(t);
        this.engine.forget(stream(t.id));
      } catch (e) {
        // Один турнир не должен лишить остальных финала: у каждого свои
        // деньги, и падение чужой транзакции их не касается.
        this.logger.error(`финал турнира ${t.id} упал`, e as Error);
      }
    }
  }

  /**
   * Цены финала по монетам открытых позиций турнира; `null` — хоть одной ещё
   * нет. Позиций нет вовсе — закрывать нечего, и цены не нужны.
   */
  private async finalPrices(tournamentId: string, endsAt: Date): Promise<Record<string, number> | null> {
    const open = await this.prisma.backtestTrade.findMany({
      where: { session: { tournamentId, status: 'active' }, exitTime: null },
      select: { symbol: true },
      distinct: ['symbol'],
    });
    const prices: Record<string, number> = {};
    for (const { symbol } of open) {
      const price = await this.finalPrice(symbol, endsAt);
      if (price == null) return null;
      prices[symbol] = price;
    }
    return prices;
  }

  /** Закрытие минутки монеты, в которую попадает конец турнира. */
  private async finalPrice(symbol: string, endsAt: Date): Promise<number | null> {
    const from = endsAt.getTime() - MINUTE_MS;
    const minutes = await this.live.minutesSince(symbol, from, endsAt.getTime());
    const last = minutes.at(-1);
    return last ? last.close : null;
  }

  private async processRunning(): Promise<void> {
    const running = await this.prisma.tournament.findMany({
      where: { status: 'running', mode: 'live' },
    });
    for (const t of running) {
      try {
        await this.processTournament(t);
      } catch (e) {
        this.logger.error(`тик турнира ${t.id} упал`, e as Error);
      }
    }
  }

  private async processTournament(t: {
    id: string;
    endsAt: Date | null;
    processedUntil: Date | null;
  }): Promise<void> {
    const now = Date.now();
    // Дальше конца турнира движок не смотрит: то, что случилось после, к
    // результату отношения не имеет — его подведёт финал.
    const until = Math.min(now, t.endsAt?.getTime() ?? now);
    if (!(await this.engine.run(stream(t.id), t.processedUntil, until, { tournamentId: t.id }))) return;
    await this.prisma.tournament.update({ where: { id: t.id }, data: { processedUntil: new Date(until) } });
  }
}
