import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BybitMarketService } from '../bybit/services/bybit-market.service';

const SYMBOL = 'BTCUSDT';
const SYNC_INTERVAL_MS = 30 * 60_000;
// 2024-01-01 — enough history (24 buckets × 1000s of samples each) for a
// stable per-hour read without dragging in years of extra rows/pagination.
const BACKFILL_SINCE_MS = Date.UTC(2024, 0, 1);

const startOfUtcHour = (ms: number) => Math.floor(ms / 3_600_000) * 3_600_000;

/**
 * Keeps `hourly_prices` filled with BTCUSDT hourly candles from Bybit, so the
 * Аналитика page's hour-of-day volatility/direction read from Postgres only
 * — no live kline request per view (same reasoning as DailyPriceSyncService,
 * just finer-grained). Backfills from BACKFILL_SINCE_MS on first run, then
 * tops up from the last stored hour. Only CLOSED UTC hours are stored —
 * the still-forming current hour is skipped until it closes.
 */
@Injectable()
export class HourlyPriceSyncService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(HourlyPriceSyncService.name);
  private timer?: NodeJS.Timeout;
  private syncing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly bybitMarket: BybitMarketService,
  ) {}

  onApplicationBootstrap() {
    this.sync().catch((e) => this.logger.error('initial hourly-price sync failed', e));
    this.timer = setInterval(() => {
      this.sync().catch((e) => this.logger.error('periodic hourly-price sync failed', e));
    }, SYNC_INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async sync(): Promise<{ upserted: number }> {
    if (this.syncing) return { upserted: 0 };
    this.syncing = true;
    try {
      const latest = await this.prisma.hourlyPrice.findFirst({
        where: { symbol: SYMBOL },
        orderBy: { date: 'desc' },
      });
      const start = latest ? latest.date.getTime() + 1 : BACKFILL_SINCE_MS;
      const curHourStart = startOfUtcHour(Date.now());
      if (start >= curHourStart) return { upserted: 0 }; // already caught up to the still-open hour

      // ~2.5y of hourly candles at 1000/page is ~22 pages — default maxPages
      // (25) barely covers a fresh backfill, so bump it here explicitly.
      const candles = await this.bybitMarket.getKlinesRange(SYMBOL, '60', start, Date.now(), 40);
      const closed = candles.filter((c) => c.time < curHourStart);
      if (closed.length === 0) return { upserted: 0 };

      // A closed candle never changes, so inserting and skipping what's already
      // stored is equivalent to the previous per-candle upsert — but it costs a
      // few batched statements instead of one round-trip per row, which on a
      // fresh backfill was ~20k sequential queries.
      const rows = closed
        .filter((c) => c.open > 0)
        .map((c) => ({
          symbol: SYMBOL,
          date: new Date(c.time),
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          changePct: ((c.close - c.open) / c.open) * 100,
        }));
      if (rows.length === 0) return { upserted: 0 };

      const { count } = await this.prisma.hourlyPrice.createMany({
        data: rows,
        skipDuplicates: true,
      });
      if (count > 0) this.logger.log(`upserted ${count} hourly price(s)`);
      return { upserted: count };
    } finally {
      this.syncing = false;
    }
  }
}
