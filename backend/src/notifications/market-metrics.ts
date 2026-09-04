import { WeekdayBucket, WeekdayHourBucket } from '../market-events/market-events.service';

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

/**
 * Минимум свечей в клетке «день недели × час», ниже которого клетка не
 * считается измеренной. Два года истории дают около сотни на клетку; тридцать
 * — граница, ниже которой сравнивать дни между собой уже нечем.
 */
export const MIN_CELL_SAMPLES = 30;

/** Всё, что нужно от часа суток, чтобы отобрать самые волатильные. */
export interface HourVolatility {
  hour: number;
  samples: number;
  avgVolatilityPct: number;
}

/** Четверть часов суток с наибольшей средней волатильностью. */
export const topQuartileHours = (hourly: HourVolatility[]): number[] => {
  const withData = hourly.filter((h) => h.samples > 0);
  const count = Math.max(1, Math.round(withData.length / 4));
  return withData
    .slice()
    .sort((a, b) => b.avgVolatilityPct - a.avgVolatilityPct)
    .slice(0, count)
    .map((h) => h.hour);
};

/**
 * Свод клеток обратно в часы суток — среднее по дням недели, взвешенное
 * выборкой. Нужен, чтобы отбор «волатильных часов вообще» считался из тех же
 * данных, а не вторым запросом за той же таблицей.
 */
export const hourAverages = (cells: WeekdayHourBucket[]): HourVolatility[] => {
  const agg = new Map<number, { samples: number; sum: number }>();
  for (const c of cells) {
    const a = agg.get(c.hour) ?? { samples: 0, sum: 0 };
    a.samples += c.samples;
    a.sum += c.avgVolatilityPct * c.samples;
    agg.set(c.hour, a);
  }
  return [...agg.entries()]
    .map(([hour, a]) => ({
      hour,
      samples: a.samples,
      avgVolatilityPct: a.samples > 0 ? a.sum / a.samples : 0,
    }))
    .sort((a, b) => a.hour - b.hour);
};

export interface WeekdayHourPick {
  weekday: number;
  hour: number;
  /** Средняя волатильность этого часа именно в этот день недели. */
  avgVolatilityPct: number;
  /** Она же, усреднённая по всем семи дням. */
  weekAvgPct: number;
  /** Во сколько раз день волатильнее среднего дня в тот же час. */
  ratio: number;
}

/**
 * Час, о котором стоит предупредить в этот день недели, — или null, если в
 * этот день предупреждать не о чем.
 *
 * Час проходит три условия: он в верхней четверти часов суток вообще; именно
 * этот день недели — самый волатильный из семи в этот час; превышение над
 * средним днём не меньше minRatio. Из прошедших берётся самый волатильный.
 *
 * Отсюда «раз в сутки»: кандидат в дне ровно один или его нет вовсе. Держать
 * частоту одним cooldown'ом было нельзя — пиковый час у разных дней недели
 * стоит в разное время, и любой cooldown около суток то съедал бы завтрашний
 * сигнал, то пропускал второй сегодняшний.
 *
 * Верхняя четверть нужна как раз потому, что сравнение идёт часа с самим
 * собой: в тихие ночные часы день-победитель есть всегда, и без этого условия
 * сигнал звал бы смотреть на пустой рынок.
 */
export const peakHourOfWeekday = (
  cells: WeekdayHourBucket[],
  weekday: number,
  minRatio: number,
  minSamples = MIN_CELL_SAMPLES,
): WeekdayHourPick | null => {
  const volatileHours = new Set(topQuartileHours(hourAverages(cells)));

  const byHour = new Map<number, WeekdayHourBucket[]>();
  for (const c of cells) {
    if (!volatileHours.has(c.hour) || c.samples < minSamples) continue;
    const list = byHour.get(c.hour);
    if (list) list.push(c);
    else byHour.set(c.hour, [c]);
  }

  let best: WeekdayHourPick | null = null;
  for (const [hour, days] of byHour) {
    // День без выборки нельзя считать спокойным — значит, и «самый
    // волатильный день этого часа» с неполной неделей называть нельзя.
    if (days.length < 7) continue;
    const mine = days.find((d) => d.weekday === weekday);
    if (!mine) continue;
    const top = days.reduce((a, b) => (b.avgVolatilityPct > a.avgVolatilityPct ? b : a));
    if (top.weekday !== weekday) continue;
    const weekAvgPct = mean(days.map((d) => d.avgVolatilityPct));
    if (weekAvgPct <= 0) continue;
    const ratio = mine.avgVolatilityPct / weekAvgPct;
    if (ratio < minRatio) continue;
    if (!best || mine.avgVolatilityPct > best.avgVolatilityPct) {
      best = { weekday, hour, avgVolatilityPct: mine.avgVolatilityPct, weekAvgPct, ratio };
    }
  }
  return best;
};

/**
 * Дни недели, в которые лонг исторически закрывался в плюс реже, чем в
 * половине случаев. Порог именно 50%, а не нижний квартиль: «слабый» здесь
 * значит «монетка не в твою пользу», а не «слабее остальных дней».
 */
export const weakWeekdays = (weekday: WeekdayBucket[]): number[] =>
  weekday.filter((w) => w.days > 0 && w.winRateLongPct < 50).map((w) => w.weekday);
