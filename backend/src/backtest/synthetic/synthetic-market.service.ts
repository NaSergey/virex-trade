import { Injectable } from '@nestjs/common';
import type { Candle } from '../../market-data/market-data.service';
import type { Bar } from './model';
import { buildSeries, querySeries, startOf, type Series, type SeriesQuery } from './series';

/** Сколько осей держать построенными. Промах — не ошибка: тот же прогон даёт то же самое. */
const CACHE_SIZE = 16;

const toCandle = (b: Bar): Candle => ({
  time: new Date(b.t),
  open: b.o,
  high: b.h,
  low: b.l,
  close: b.c,
  volume: Math.round(b.v * 1000) / 1000,
});

/** Свечи сгенерированного рынка по зерну сессии. Перезапуск api графиков не меняет. */
@Injectable()
export class SyntheticMarketService {
  private readonly cache = new Map<number, Series>();

  getCandles(seed: number, q: SeriesQuery): Candle[] {
    return querySeries(this.series(seed), q).map(toCandle);
  }

  /** Момент старта и цена в нём — для новой сессии; заодно прогревает кэш. */
  start(seed: number): { start: number; price: number } {
    return startOf(this.series(seed));
  }

  private series(seed: number): Series {
    const hit = this.cache.get(seed);
    if (hit) {
      // Map помнит порядок вставки: переставленная в конец запись — самая свежая.
      this.cache.delete(seed);
      this.cache.set(seed, hit);
      return hit;
    }
    const built = buildSeries(seed);
    this.cache.set(seed, built);
    if (this.cache.size > CACHE_SIZE) this.cache.delete(this.cache.keys().next().value);
    return built;
  }
}
