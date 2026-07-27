import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface WeekdayBucket {
  weekday: number; // JS getUTCDay(): 0 = Sunday
  days: number;
  upDays: number;
  winRateLongPct: number; // % of days that closed green — long-favouring days
  avgChangePct: number;
}

export interface HourlyBucket {
  hour: number; // UTC hour, 0-23 (candle open time)
  samples: number;
  winRateLongPct: number; // % of hourly candles that closed green
  avgChangePct: number; // avg (close-open)/open — direction + magnitude
  avgVolatilityPct: number; // avg (high-low)/open — magnitude only, ignores direction
}

@Injectable()
export class MarketEventsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Weekday win-rate/avg-move breakdown for the «Вероятности» panel. */
  async getCorrelation(days = 730) {
    const since = new Date(Date.now() - days * 86_400_000);
    const prices = await this.prisma.dailyPrice.findMany({
      where: { symbol: 'BTCUSDT', date: { gte: since } },
      orderBy: { date: 'asc' },
    });

    const weekdayAgg = Array.from({ length: 7 }, () => ({ days: 0, upDays: 0, sum: 0 }));
    for (const p of prices) {
      const wd = p.date.getUTCDay();
      weekdayAgg[wd].days++;
      if (p.changePct >= 0) weekdayAgg[wd].upDays++;
      weekdayAgg[wd].sum += p.changePct;
    }
    const weekday: WeekdayBucket[] = weekdayAgg.map((w, wd) => ({
      weekday: wd,
      days: w.days,
      upDays: w.upDays,
      winRateLongPct: w.days > 0 ? (w.upDays / w.days) * 100 : 0,
      avgChangePct: w.days > 0 ? w.sum / w.days : 0,
    }));

    return { weekday, totalDays: prices.length };
  }

  /**
   * Hour-of-day (UTC) volatility + direction breakdown for BTC. Volatility
   * is range-based — (high-low)/open — so a candle that wicked hard and
   * closed flat still counts as volatile, unlike avgChangePct which only
   * sees the net open→close move.
   */
  async getHourlyStats(days = 730) {
    const since = new Date(Date.now() - days * 86_400_000);
    const candles = await this.prisma.hourlyPrice.findMany({
      where: { symbol: 'BTCUSDT', date: { gte: since } },
      orderBy: { date: 'asc' },
    });

    const hourAgg = Array.from({ length: 24 }, () => ({ samples: 0, upSamples: 0, changeSum: 0, volSum: 0 }));
    for (const c of candles) {
      const h = c.date.getUTCHours();
      hourAgg[h].samples++;
      if (c.changePct >= 0) hourAgg[h].upSamples++;
      hourAgg[h].changeSum += c.changePct;
      if (c.open > 0) hourAgg[h].volSum += ((c.high - c.low) / c.open) * 100;
    }
    const hourly: HourlyBucket[] = hourAgg.map((h, hour) => ({
      hour,
      samples: h.samples,
      winRateLongPct: h.samples > 0 ? (h.upSamples / h.samples) * 100 : 0,
      avgChangePct: h.samples > 0 ? h.changeSum / h.samples : 0,
      avgVolatilityPct: h.samples > 0 ? h.volSum / h.samples : 0,
    }));

    return { hourly, totalSamples: candles.length };
  }
}
