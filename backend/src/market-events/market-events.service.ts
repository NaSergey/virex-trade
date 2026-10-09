import { Injectable } from '@nestjs/common';
import { Candle, MarketDataService } from '../market-data/market-data.service';

export interface WeekdayBucket {
  weekday: number; // JS getUTCDay(): 0 = Sunday
  days: number;
  upDays: number;
  winRateLongPct: number; // % of days that closed green — long-favouring days
  avgChangePct: number;
}

export interface WeekdayHourBucket {
  weekday: number; // JS getUTCDay(): 0 = Sunday
  hour: number; // UTC hour, 0-23 (candle open time)
  samples: number;
  avgVolatilityPct: number; // avg (high-low)/open
}

/**
 * Отрезок недели для «когда BTC чаще растёт» (спека 2026-10-08): все свечи
 * одного таймфрейма, открывшиеся в этот день недели и в это время суток.
 */
export interface TimeSlot {
  weekday: number; // getUTCDay() открытия свечи: 0 = воскресенье
  minute: number; // минута суток UTC открытия свечи; у дневной — 0
  samples: number;
  upSamples: number; // закрылись выше открытия
  downSamples: number; // закрылись ниже открытия
  /** Доля роста среди свечей, которые сдвинулись: свеча на месте — ни рост, ни падение. */
  upPct: number;
  avgChangePct: number;
}

/**
 * Таймфреймы, по которым считаются слоты, — те, что выбирает страница «Рынок».
 * Мельче не нужно: у 15м в дне 96 строк, у минутки — десять тысяч слотов в
 * неделе и миллион строк из базы на один расчёт.
 */
export const SLOT_TIMEFRAMES = [60, 240, 1440] as const;

export interface HourlyBucket {
  hour: number; // UTC hour, 0-23 (candle open time)
  samples: number;
  winRateLongPct: number; // % of hourly candles that closed green
  avgChangePct: number; // avg (close-open)/open — direction + magnitude
  avgVolatilityPct: number; // avg (high-low)/open — magnitude only, ignores direction
}

/** changePct больше не колонка — свечи хранят только OHLCV. */
const changePct = (c: Candle): number => (c.open > 0 ? ((c.close - c.open) / c.open) * 100 : 0);

// Результат глобальный (BTC один на всех пользователей) и меняется раз в
// час, когда синк свечей кладёт новую строку — считать чаще незачем.
// getWeekdayHourStats дополнительно зовётся из market-alerts каждые пять
// минут, и часовой TTL почти всегда попадает в кэш.
const AGGREGATE_CACHE_TTL_MS = 60 * 60_000;

@Injectable()
export class MarketEventsService {
  constructor(private readonly marketData: MarketDataService) {}

  // Ключ — (метрика, days): разные days для одного и того же метода не
  // должны делить друг с другом закэшированный результат.
  private readonly aggregateCache = new Map<string, { exp: number; data: unknown }>();

  /**
   * Расчёт в полёте по тому же ключу. Без этого два запроса, пришедшие на
   * пустой или протухший кэш одновременно, оба считали бы агрегат заново —
   * тысячи свечей из базы на каждый, — хотя второму хватило бы ответа первого.
   * Упавший расчёт отсюда уходит и не кэшируется.
   */
  private readonly inflight = new Map<string, Promise<unknown>>();

  private cached<T>(metric: string, days: number, compute: () => Promise<T>): Promise<T> {
    const key = `${metric}:${days}`;
    const hit = this.aggregateCache.get(key);
    if (hit && hit.exp > Date.now()) return Promise.resolve(hit.data as T);

    const running = this.inflight.get(key);
    if (running) return running as Promise<T>;

    const job = compute()
      .then((data) => {
        this.aggregateCache.set(key, { exp: Date.now() + AGGREGATE_CACHE_TTL_MS, data });
        return data;
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, job);
    return job;
  }

  /** Weekday win-rate/avg-move breakdown for the «Вероятности» panel. */
  async getCorrelation(days = 730) {
    return this.cached('correlation', days, () => this.computeCorrelation(days));
  }

  private async computeCorrelation(days: number) {
    const since = new Date(Date.now() - days * 86_400_000);
    const prices = await this.marketData.getCandles({ timeframe: 1440, from: since });

    const weekdayAgg = Array.from({ length: 7 }, () => ({ days: 0, upDays: 0, sum: 0 }));
    for (const p of prices) {
      const wd = p.time.getUTCDay();
      const change = changePct(p);
      weekdayAgg[wd].days++;
      if (change >= 0) weekdayAgg[wd].upDays++;
      weekdayAgg[wd].sum += change;
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
    return this.cached('hourlyStats', days, () => this.computeHourlyStats(days));
  }

  private async computeHourlyStats(days: number) {
    const since = new Date(Date.now() - days * 86_400_000);
    const candles = await this.marketData.getCandles({ timeframe: 60, from: since });

    const hourAgg = Array.from({ length: 24 }, () => ({ samples: 0, upSamples: 0, changeSum: 0, volSum: 0 }));
    for (const c of candles) {
      const h = c.time.getUTCHours();
      hourAgg[h].samples++;
      const change = changePct(c);
      if (change >= 0) hourAgg[h].upSamples++;
      hourAgg[h].changeSum += change;
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

  /**
   * «Когда BTC чаще растёт»: по каждому времени недели — как часто свеча этого
   * таймфрейма закрывалась ростом и падением. Читает страница «Рынок»;
   * таймфрейм — выбранный там, а не часовик для всех: доля роста четырёхчасовой
   * свечи из часовых не выводится.
   */
  async getTimeSlots(timeframe: number, days = 730) {
    return this.cached(`timeSlots${timeframe}`, days, () => this.computeTimeSlots(timeframe, days));
  }

  private async computeTimeSlots(timeframe: number, days: number) {
    const since = new Date(Date.now() - days * 86_400_000);
    const candles = await this.marketData.getCandles({ timeframe, from: since });

    const agg = new Map<number, { weekday: number; minute: number; samples: number; up: number; down: number; changeSum: number }>();
    for (const c of candles) {
      const weekday = c.time.getUTCDay();
      const minute = c.time.getUTCHours() * 60 + c.time.getUTCMinutes();
      const key = weekday * 1440 + minute;
      let a = agg.get(key);
      if (!a) agg.set(key, (a = { weekday, minute, samples: 0, up: 0, down: 0, changeSum: 0 }));
      a.samples++;
      if (c.close > c.open) a.up++;
      else if (c.close < c.open) a.down++;
      a.changeSum += changePct(c);
    }

    const slots: TimeSlot[] = [...agg.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, a]) => ({
        weekday: a.weekday,
        minute: a.minute,
        samples: a.samples,
        upSamples: a.up,
        downSamples: a.down,
        upPct: a.up + a.down > 0 ? (a.up / (a.up + a.down)) * 100 : 50,
        avgChangePct: a.changeSum / a.samples,
      }));

    return { timeframe, slots, totalSamples: candles.length };
  }

  /**
   * Волатильность по 168 клеткам «день недели × час UTC».
   *
   * Не то же самое, что getHourlyStats: там час усреднён по всем дням недели
   * сразу, поэтому «самый волатильный час суток» получается один и тот же для
   * всех семи дней. Здесь видно обратное — один и тот же час в разные дни
   * недели живёт по-разному, и предупреждать о нём каждый день незачем.
   *
   * Клетка на два года истории набирает около сотни свечей; на более коротком
   * периоде часть клеток остаётся пустой, и потребитель обязан такие
   * отбрасывать, а не считать спокойными.
   */
  async getWeekdayHourStats(days = 730) {
    return this.cached('weekdayHourStats', days, () => this.computeWeekdayHourStats(days));
  }

  private async computeWeekdayHourStats(days: number) {
    const since = new Date(Date.now() - days * 86_400_000);
    const candles = await this.marketData.getCandles({ timeframe: 60, from: since });

    const agg = Array.from({ length: 7 }, () =>
      Array.from({ length: 24 }, () => ({ samples: 0, volSum: 0 })),
    );
    for (const c of candles) {
      const cell = agg[c.time.getUTCDay()][c.time.getUTCHours()];
      cell.samples++;
      if (c.open > 0) cell.volSum += ((c.high - c.low) / c.open) * 100;
    }

    const cells: WeekdayHourBucket[] = [];
    for (let weekday = 0; weekday < 7; weekday++) {
      for (let hour = 0; hour < 24; hour++) {
        const { samples, volSum } = agg[weekday][hour];
        cells.push({
          weekday,
          hour,
          samples,
          avgVolatilityPct: samples > 0 ? volSum / samples : 0,
        });
      }
    }

    return { cells, totalSamples: candles.length };
  }
}
