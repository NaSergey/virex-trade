import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { runsBackgroundJobs } from '../role';
import {
  addEvent,
  BYBIT_PUBLIC_WS,
  binanceLiqUrl,
  bybitLiqTopics,
  LIQ_SYMBOLS,
  mergeBack,
  parseBinance,
  parseBybit,
  type LiqBucket,
} from './liquidation-feed';
import {
  LiquidationSocket,
  type FeedSpec,
  type SocketLike,
} from './liquidation-socket';

/** Как часто сбрасывать минуты в базу: падение процесса теряет не больше этого. */
const FLUSH_MS = 10_000;
/** Переподключение: от 2 с, удваивается до минуты; соединение, прожившее минуту, сбрасывает счёт. */
const BACKOFF_MIN_MS = 2_000;
const BACKOFF_MAX_MS = 60_000;
const STABLE_MS = 60_000;
/** База лежит долго — буфер не растёт без предела (12 ключей × минуты: это сутки с запасом). */
const MAX_BUCKETS = 20_000;

export const FEEDS: FeedSpec[] = [
  {
    exchange: 'bybit',
    url: BYBIT_PUBLIC_WS,
    hello: [
      JSON.stringify({ op: 'subscribe', args: bybitLiqTopics(LIQ_SYMBOLS) }),
    ],
    ping: { message: JSON.stringify({ op: 'ping' }), everyMs: 20_000 },
    silenceMs: 45_000,
    parse: parseBybit,
  },
  {
    exchange: 'binance',
    url: binanceLiqUrl(LIQ_SYMBOLS),
    hello: [],
    // Binance шлёт пинг-фрейм раз в 3 минуты: два пропущенных — соединение мертво.
    silenceMs: 7 * 60_000,
    parse: parseBinance,
  },
];

interface FeedState {
  spec: FeedSpec;
  socket?: LiquidationSocket;
  openedAt?: number;
  /** Строка `liquidation_feed_sessions` текущего соединения; заводится при сбросе. */
  sessionId?: string;
  backoffMs: number;
  retry?: NodeJS.Timeout;
}

/**
 * Запись ликвидаций Binance и Bybit по минутам — фоновый сервис `worker`.
 *
 * Только `worker`: второй процесс удвоил бы суммы (запись — сложением).
 * Сеансы соединений пишутся рядом (`liquidation_feed_sessions`), чтобы при
 * анализе отличать тихую минуту от минуты, когда записи не было.
 */
@Injectable()
export class LiquidationRecorderService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(LiquidationRecorderService.name);
  private readonly buckets = new Map<string, LiqBucket>();
  private readonly feeds: FeedState[] = FEEDS.map((spec) => ({
    spec,
    backoffMs: BACKOFF_MIN_MS,
  }));
  private flushTimer?: NodeJS.Timeout;
  private flushing = false;
  private stopped = false;
  /** Подмена соединения в тестах; не параметр конструктора — DI Nest его не разрешит. */
  openSocket?: (url: string) => SocketLike;

  constructor(private readonly prisma: PrismaService) {}

  onApplicationBootstrap() {
    if (!runsBackgroundJobs()) return;
    for (const f of this.feeds) this.connect(f);
    this.flushTimer = setInterval(() => void this.flush(), FLUSH_MS);
  }

  async onModuleDestroy() {
    this.stopped = true;
    if (this.flushTimer) clearInterval(this.flushTimer);
    for (const f of this.feeds) {
      if (f.retry) clearTimeout(f.retry);
      f.socket?.close();
    }
    await this.flush();
  }

  private connect(f: FeedState): void {
    if (this.stopped) return;
    f.openedAt = undefined;
    f.sessionId = undefined;
    const socket = new LiquidationSocket(
      f.spec,
      {
        onOpen: () => {
          f.openedAt = Date.now();
          this.logger.log(`${f.spec.exchange}: поток ликвидаций подключён`);
        },
        onEvents: (events) => {
          for (const e of events) addEvent(this.buckets, e);
        },
        onWarn: (text) => this.logger.warn(text),
        onClosed: () => this.reconnect(f, socket),
      },
      this.openSocket,
    );
    f.socket = socket;
  }

  private reconnect(f: FeedState, socket: LiquidationSocket): void {
    const lived = f.openedAt ? Date.now() - f.openedAt : 0;
    void this.closeSession(f, socket.lastSeen());
    f.socket = undefined;
    if (this.stopped) return;
    f.backoffMs =
      lived >= STABLE_MS
        ? BACKOFF_MIN_MS
        : Math.min(f.backoffMs * 2, BACKOFF_MAX_MS);
    this.logger.warn(
      `${f.spec.exchange}: поток ликвидаций оборвался, переподключение через ${f.backoffMs / 1000} с`,
    );
    f.retry = setTimeout(() => this.connect(f), f.backoffMs);
  }

  /** Сеанс кончился: его конец — последний признак жизни соединения. */
  private async closeSession(f: FeedState, lastSeen: number): Promise<void> {
    const { openedAt, sessionId } = f;
    if (!openedAt) return;
    try {
      if (sessionId) {
        await this.prisma.liquidationFeedSession.update({
          where: { id: sessionId },
          data: { seenAt: new Date(lastSeen) },
        });
      } else {
        await this.prisma.liquidationFeedSession.create({
          data: {
            exchange: f.spec.exchange,
            startedAt: new Date(openedAt),
            seenAt: new Date(lastSeen),
          },
        });
      }
    } catch (e) {
      this.logger.warn(
        `${f.spec.exchange}: конец сеанса не записан: ${(e as Error).message}`,
      );
    }
  }

  async flush(): Promise<void> {
    if (this.flushing) return;
    this.flushing = true;
    try {
      await this.writeBuckets();
      await this.touchSessions();
    } finally {
      this.flushing = false;
    }
  }

  private async writeBuckets(): Promise<void> {
    if (this.buckets.size === 0) return;
    const batch = [...this.buckets.values()];
    this.buckets.clear();
    try {
      await this.prisma.$executeRaw`
        INSERT INTO "liquidation_minutes" (exchange, symbol, side, minute, count, qty, usd, "maxUsd")
        VALUES ${Prisma.join(
          batch.map(
            (b) =>
              Prisma.sql`(${b.exchange}, ${b.symbol}, ${b.side}, ${new Date(b.minute)}, ${b.count}, ${b.qty}, ${b.usd}, ${b.maxUsd})`,
          ),
        )}
        ON CONFLICT (exchange, symbol, side, minute) DO UPDATE SET
          count = "liquidation_minutes".count + EXCLUDED.count,
          qty = "liquidation_minutes".qty + EXCLUDED.qty,
          usd = "liquidation_minutes".usd + EXCLUDED.usd,
          "maxUsd" = GREATEST("liquidation_minutes"."maxUsd", EXCLUDED."maxUsd")
      `;
    } catch (e) {
      mergeBack(this.buckets, batch);
      this.logger.warn(
        `ликвидации не записаны, повтор при следующем сбросе: ${(e as Error).message}`,
      );
      if (this.buckets.size > MAX_BUCKETS) {
        const old = [...this.buckets.entries()].sort(
          (a, b) => a[1].minute - b[1].minute,
        );
        for (const [key] of old.slice(0, this.buckets.size - MAX_BUCKETS))
          this.buckets.delete(key);
        this.logger.error(
          'буфер ликвидаций переполнен, старые минуты выброшены',
        );
      }
    }
  }

  /** Живым соединениям — свежий конец сеанса; новым — строка сеанса. */
  private async touchSessions(): Promise<void> {
    for (const f of this.feeds) {
      const socket = f.socket;
      if (!socket || !f.openedAt) continue;
      const seenAt = new Date(socket.lastSeen());
      try {
        if (f.sessionId) {
          await this.prisma.liquidationFeedSession.update({
            where: { id: f.sessionId },
            data: { seenAt },
          });
        } else {
          const row = await this.prisma.liquidationFeedSession.create({
            data: {
              exchange: f.spec.exchange,
              startedAt: new Date(f.openedAt),
              seenAt,
            },
            select: { id: true },
          });
          // Соединение могло смениться, пока шла запись.
          if (f.socket === socket) f.sessionId = row.id;
        }
      } catch (e) {
        this.logger.warn(
          `${f.spec.exchange}: сеанс не записан: ${(e as Error).message}`,
        );
      }
    }
  }
}
