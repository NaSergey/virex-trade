import { HourlyBucket, WeekdayBucket } from '../market-events/market-events.service';

/**
 * Чистые метрики рыночных сигналов. Отдельным файлом от сервиса, потому что
 * это единственная часть, которую можно проверить тестом без сети, — и
 * единственная, в которой возможна содержательная ошибка.
 */

export interface HourCandle {
  open: number;
  high: number;
  low: number;
  close: number;
  turnover: number;
}

/**
 * Bybit отдаёт kline строками и от новых к старым: [start, o, h, l, c, v, turnover].
 * Обе особенности уже учтены в AnalyticsService.getVolatility — здесь тот же
 * разбор, вынесенный отдельно, чтобы не дублировать сортировку в каждом чекере.
 */
export const parseKline = (list: unknown): HourCandle[] => {
  if (!Array.isArray(list)) return [];
  return list
    .slice()
    .sort((a: any, b: any) => Number(a[0]) - Number(b[0]))
    .map((k: any) => ({
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      turnover: parseFloat(k[6]),
    }));
};

/** Модуль изменения свечи в процентах: «на сколько увело за час». */
export const hourMovePct = (c: HourCandle): number =>
  c.open > 0 ? (Math.abs(c.close - c.open) / c.open) * 100 : 0;

/**
 * Размах свечи в процентах. Не то же, что движение: свеча, которую сводило на
 * пять процентов в обе стороны и вернуло в открытие, волатильна, хотя её
 * изменение равно нулю.
 */
export const rangePct = (c: HourCandle): number =>
  c.open > 0 ? ((c.high - c.low) / c.open) * 100 : 0;

const mean = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;

/** Во сколько раз размах последней свечи выше среднего по базе. */
export const rangeRatio = (last: HourCandle, baseline: HourCandle[]): number | null => {
  if (baseline.length === 0) return null;
  const base = mean(baseline.map(rangePct));
  if (base <= 0) return null;
  return rangePct(last) / base;
};

export interface BookPoint {
  price: number;
  bidCenter: number;
  askCenter: number;
}

/**
 * Раздвижка книги: расстояние между средневзвешенными центрами сторон,
 * нормированное ценой. Глубины в снимке нет, поэтому «ликвидность упала»
 * меряется именно так — объём уехал от лучших котировок.
 */
export const bookSpreadPct = (s: BookPoint): number =>
  s.price > 0 ? ((s.askCenter - s.bidCenter) / s.price) * 100 : 0;

export const spreadRatio = (last: BookPoint, baseline: BookPoint[]): number | null => {
  if (baseline.length === 0) return null;
  const base = mean(baseline.map(bookSpreadPct));
  if (base <= 0) return null;
  return bookSpreadPct(last) / base;
};

/** Индекс страха и жадности на краю: low — нижняя граница, верхняя симметрична. */
export const fngHolds = (value: number, low: number): boolean =>
  value <= low || value >= 100 - low;

/** Перекос long/short: threshold — доля лонгов, шорт-сторона симметрична. */
export const lsHolds = (buyPct: number, threshold: number): boolean =>
  buyPct >= threshold || buyPct <= 100 - threshold;

/** Четверть часов суток с наибольшей средней волатильностью. */
export const topQuartileHours = (hourly: HourlyBucket[]): number[] => {
  const withData = hourly.filter((h) => h.samples > 0);
  const count = Math.max(1, Math.round(withData.length / 4));
  return withData
    .slice()
    .sort((a, b) => b.avgVolatilityPct - a.avgVolatilityPct)
    .slice(0, count)
    .map((h) => h.hour);
};

/**
 * Дни недели, в которые лонг исторически закрывался в плюс реже, чем в
 * половине случаев. Порог именно 50%, а не нижний квартиль: «слабый» здесь
 * значит «монетка не в твою пользу», а не «слабее остальных дней».
 */
export const weakWeekdays = (weekday: WeekdayBucket[]): number[] =>
  weekday.filter((w) => w.days > 0 && w.winRateLongPct < 50).map((w) => w.weekday);
