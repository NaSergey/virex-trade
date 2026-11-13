import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from '../telegram/telegram.service';
import { OWNER_EMAIL } from '../admin/owner';
import { runsBackgroundJobs } from '../role';
import {
  hlInfo,
  hlPausedFor,
  isGateRefusal,
  WEIGHT,
} from '../hyperliquid/hl-gate';
import { positionsOf } from './positions';
import {
  alertText,
  newPositions,
  parseSeen,
  seenOf,
} from './hl-position-watch';
import type { ClearinghouseState } from './hl-types';

/** Как часто смотреть позиции кошельков с колокольчиком: вес 2 на кошелёк, 50 кошельков — 100 из 700 в минуту. */
const TICK_MS = 60_000;

/**
 * Уведомления о взятии позиции на сохранённых кошельках — фоновый сервис
 * `worker` (спека `docs/superpowers/specs/2026-11-12-hl-wallet-position-alerts-design.md`).
 *
 * Шлёт только `worker`: два процесса прислали бы каждое сообщение дважды.
 * Состояние (`HlWallet.notifySeen`) пишется до отправки — как у плана дня:
 * потерянное сообщение лучше двух, а сбой отправки не должен повторяться
 * каждую минуту. Колокольчик, выключенный посреди прохода, сообщения не даёт:
 * запись состояния идёт условно (`notifyAt != null`).
 */
@Injectable()
export class HlPositionWatchService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(HlPositionWatchService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegram: TelegramService,
  ) {}

  onApplicationBootstrap() {
    if (!runsBackgroundJobs() || !this.telegram.enabled) return;
    const run = () =>
      this.tick(Date.now()).catch((e) =>
        this.logger.error(`уведомления о позициях: ${(e as Error).message}`),
      );
    void run();
    this.timer = setInterval(run, TICK_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Чат владельца — как у плана дня и бэкапа: переменной с id чата нет. */
  private async ownerChat(): Promise<string | null> {
    const owner = await this.prisma.user.findFirst({
      where: { email: { equals: OWNER_EMAIL, mode: 'insensitive' } },
      select: { telegramChatId: true },
    });
    return owner?.telegramChatId ?? null;
  }

  async tick(now: number): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      // На паузе после 429 любой запрос её только продлил бы.
      if (hlPausedFor() > 0) return;
      const wallets = await this.prisma.hlWallet.findMany({
        where: { notifyAt: { not: null }, savedAt: { not: null } },
        select: { address: true, note: true, notifySeen: true },
      });
      if (wallets.length === 0) return;
      // Без чата состояние не двигается: позиция, взятая за это время, найдётся
      // после привязки — с оговоркой, что проверка стояла.
      const chatId = await this.ownerChat();
      if (!chatId) return;

      for (const w of wallets) {
        let current;
        try {
          const state = await hlInfo<ClearinghouseState>(
            { type: 'clearinghouseState', user: w.address },
            WEIGHT.clearinghouseState,
          );
          current = positionsOf(w.address, state);
        } catch (e) {
          // Шлюз отказал — дальше то же самое; состояние не трогаем, догоним в следующий проход.
          if (isGateRefusal(e)) break;
          this.logger.warn(
            `позиции ${w.address} не прочитались: ${(e as Error).message}`,
          );
          continue;
        }

        const seen = parseSeen(w.notifySeen);
        const fresh = newPositions(seen?.positions ?? null, current);
        const written = await this.prisma.hlWallet.updateMany({
          where: { address: w.address, notifyAt: { not: null } },
          data: {
            notifySeen: seenOf(
              now,
              current,
            ) as unknown as Prisma.InputJsonValue,
          },
        });
        if (written.count === 0 || fresh.length === 0) continue;

        const sent = await this.telegram.sendText(
          chatId,
          alertText({
            address: w.address,
            note: w.note,
            positions: fresh,
            gapMin: seen ? Math.round((now - seen.at) / 60_000) : 0,
          }),
        );
        if (!sent)
          this.logger.warn(`сообщение о позиции ${w.address} не ушло`);
      }
    } finally {
      this.running = false;
    }
  }
}
