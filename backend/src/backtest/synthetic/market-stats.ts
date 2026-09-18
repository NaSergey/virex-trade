/**
 * Числа, по которым сгенерированный рынок сверяется с настоящим BTC: одни и те
 * же функции считают профиль и для price_candles, и для генератора.
 */
import { DAY_MS, MINUTE_MS, SYNTH_EPOCH } from './params';
import { querySeries, type Series } from './series';

export interface Ohlc {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
}

export interface MarketProfile {
  /** Стандартное отклонение дневных логдоходностей. */
  dailyVol: number;
  /** 10-й и 90-й перцентили волатильности по 30-дневным окнам. */
  monthlyVol: [number, number];
  /** Эксцесс часовых доходностей (у нормального 3). */
  hourlyKurtosis: number;
  /** Автокорреляция модуля часовой доходности на лагах 1, 6, 24. */
  absAutocorr: [number, number, number];
  /** Средний модуль часовой свечи по часам UTC к общему среднему. */
  hourProfile: number[];
  weekendRatio: number;
  /** Квартили коэффициента эффективности суток по часовым свечам. */
  dailyEfficiency: [number, number, number];
  /** Медиана отношения размаха минутки к её телу. */
  wickToBody: number;
}

const mean = (xs: number[]) => xs.reduce((a, x) => a + x, 0) / xs.length;

function stdev(xs: number[]): number {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}

function kurtosis(xs: number[]): number {
  const m = mean(xs);
  const v = xs.reduce((a, x) => a + (x - m) ** 2, 0) / xs.length;
  return xs.reduce((a, x) => a + (x - m) ** 4, 0) / xs.length / (v * v);
}

function autocorrelation(xs: number[], lag: number): number {
  const m = mean(xs);
  let num = 0;
  let den = 0;
  for (let i = 0; i < xs.length; i++) {
    den += (xs[i] - m) ** 2;
    if (i >= lag) num += (xs[i] - m) * (xs[i - lag] - m);
  }
  return num / den;
}

function quantile(xs: number[], q: number): number {
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

const logReturns = (bars: Ohlc[]) => bars.slice(1).map((b, i) => Math.log(b.c / bars[i].c));
const bodyReturn = (b: Ohlc) => Math.abs(Math.log(b.c / b.o));
const isWeekend = (t: number) => [0, 6].includes(new Date(t).getUTCDay());

export function marketProfile(daily: Ohlc[], hourly: Ohlc[], minutes: Ohlc[]): MarketProfile {
  const dailyReturns = logReturns(daily);
  const monthly: number[] = [];
  for (let i = 0; i + 30 <= dailyReturns.length; i += 30) monthly.push(stdev(dailyReturns.slice(i, i + 30)));

  const hourlyReturns = logReturns(hourly);
  const absHourly = hourlyReturns.map(Math.abs);

  const byHour = Array.from({ length: 24 }, () => [] as number[]);
  for (const b of hourly) byHour[new Date(b.t).getUTCHours()].push(bodyReturn(b));
  const hourAvg = byHour.map((xs) => (xs.length ? mean(xs) : 0));
  const allAvg = mean(hourAvg);

  const weekend = hourly.filter((b) => isWeekend(b.t)).map(bodyReturn);
  const weekday = hourly.filter((b) => !isWeekend(b.t)).map(bodyReturn);

  const efficiency: number[] = [];
  for (let i = 0; i + 24 < hourly.length; i += 24) {
    let path = 0;
    for (let j = i + 1; j <= i + 24; j++) path += Math.abs(hourly[j].c - hourly[j - 1].c);
    if (path > 0) efficiency.push(Math.abs(hourly[i + 24].c - hourly[i].c) / path);
  }

  return {
    dailyVol: stdev(dailyReturns),
    monthlyVol: [quantile(monthly, 0.1), quantile(monthly, 0.9)],
    hourlyKurtosis: kurtosis(hourlyReturns),
    absAutocorr: [autocorrelation(absHourly, 1), autocorrelation(absHourly, 6), autocorrelation(absHourly, 24)],
    hourProfile: hourAvg.map((x) => x / allAvg),
    weekendRatio: mean(weekend) / mean(weekday),
    dailyEfficiency: [quantile(efficiency, 0.25), quantile(efficiency, 0.5), quantile(efficiency, 0.75)],
    wickToBody: quantile(
      minutes.map((b) => (b.h - b.l) / Math.max(Math.abs(b.c - b.o), 0.1)),
      0.5,
    ),
  };
}

/** Профиль истории оси до старта: дневки, часы и неделя минуток перед стартом. */
export function syntheticProfile(series: Series): MarketProfile {
  const { start } = series.axis;
  return marketProfile(
    querySeries(series, { timeframe: 1440, from: SYNTH_EPOCH, to: start - 1, limit: 1000 }),
    querySeries(series, { timeframe: 60, from: SYNTH_EPOCH, to: start - 1, limit: 24 * 1000 }),
    querySeries(series, { timeframe: 1, from: start - 7 * DAY_MS, to: start - MINUTE_MS, limit: 7 * 1440 }),
  );
}
