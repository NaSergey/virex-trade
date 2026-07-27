import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BybitMarketService } from '../bybit/services/bybit-market.service';

const SYMBOL = 'BTCUSDT';
const SYNC_INTERVAL_MS = 30 * 60_000;
const BACKFILL_SINCE_MS = Date.UTC(2019, 0, 1);

const startOfUtcDay = (ms: number) => {
  const d = new Date(ms);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
};

/**
 * Keeps `daily_prices` filled with BTCUSDT daily candles from Bybit, so the
 * Аналитика page's weekday/event correlation reads from Postgres only — no
 * live kline request per view (same reasoning as TradeContext caching).
 * Backfills from BACKFILL_SINCE_MS on first run, then tops up from the last
 * stored day. Only CLOSED UTC days are stored — today's still-forming
 * candle is skipped until it closes.
 */
@Injectable()
export class DailyPriceSyncService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(DailyPriceSyncService.name);
  private timer?: NodeJS.Timeout;
  private syncing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly bybitMarket: BybitMarketService,
  ) {}

  onApplicationBootstrap() {
    this.sync().catch((e) => this.logger.error('initial daily-price sync failed', e));
    this.timer = setInterval(() => {
      this.sync().catch((e) => this.logger.error('periodic daily-price sync failed', e));
    }, SYNC_INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async sync(): Promise<{ upserted: number }> {
    if (this.syncing) return { upserted: 0 };
    this.syncing = true;
    try {
      const latest = await this.prisma.dailyPrice.findFirst({
        where: { symbol: SYMBOL },
        orderBy: { date: 'desc' },
      });
      const start = latest ? latest.date.getTime() + 1 : BACKFILL_SINCE_MS;
      const todayStart = startOfUtcDay(Date.now());
      if (start >= todayStart) return { upserted: 0 }; // already caught up to the still-open day

      const candles = await this.bybitMarket.getKlinesRange(SYMBOL, 'D', start, Date.now());
      const closed = candles.filter((c) => c.time < todayStart);
      if (closed.length === 0) return { upserted: 0 };

      let upserted = 0;
      for (const c of closed) {
        if (c.open <= 0) continue;
        await this.prisma.dailyPrice.upsert({
          where: { symbol_date: { symbol: SYMBOL, date: new Date(c.time) } },
          create: {
            symbol: SYMBOL,
            date: new Date(c.time),
            open: c.open,
            close: c.close,
            changePct: ((c.close - c.open) / c.open) * 100,
          },
          update: {
            open: c.open,
            close: c.close,
            changePct: ((c.close - c.open) / c.open) * 100,
          },
        });
        upserted++;
      }
      if (upserted > 0) this.logger.log(`upserted ${upserted} daily price(s)`);
      return { upserted };
    } finally {
      this.syncing = false;
    }
  }
}
