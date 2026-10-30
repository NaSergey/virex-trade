import { mulberry32 } from './stats';
import { Series, toSeries } from './series';

export type Ohlc = [number, number, number, number];

/** Ряд из [open, high, low, close] с шагом tf минут от `start` (мс). */
export function bars(rows: Ohlc[], tf = 15, start = 0): Series {
  return toSeries(
    tf,
    rows.map(([open, high, low, close], i) => ({
      time: start + i * tf * 60_000,
      open,
      high,
      low,
      close,
    })),
  );
}

/** Зеркало ряда: шорт зеркального ряда — тот же лонг. */
export function mirror(s: Series): Series {
  return {
    ...s,
    o: s.o.map((x) => -x),
    h: s.l.map((x) => -x),
    l: s.h.map((x) => -x),
    c: s.c.map((x) => -x),
  };
}

/** Ровные свечи вокруг цены p — разгон ATR без свингов. */
export const flat = (n: number, p = 100): Ohlc[] =>
  Array.from({ length: n }, (): Ohlc => [p, p + 1, p - 1, p]);

/**
 * Сценарий A+ сетапа (лонг): свинг-хай 106 (свеча 16), свинг-лоу 97 (19),
 * внутренний свинг-хай 102 (22), свип 97 медвежьей свечой 25, FVG на 27,
 * закрытие выше 102 на 28.
 */
export const SCENARIO: Ohlc[] = [
  ...flat(14),
  [100, 102, 99.5, 101.5], // 14
  [101.5, 104, 101, 103.5], // 15
  [103.5, 106, 103, 105], // 16 свинг-хай 106
  [105, 105.5, 102, 102.5], // 17
  [102.5, 103, 100, 100.5], // 18
  [100.5, 101, 97, 97.5], // 19 свинг-лоу 97
  [97.5, 100, 97.5, 99.5], // 20
  [99.5, 101, 98.5, 100.5], // 21
  [100.5, 102, 99.5, 101], // 22 внутренний свинг-хай 102
  [101, 101.5, 98.5, 99], // 23
  [99, 99.5, 97.5, 98], // 24
  [98.6, 98.8, 96, 98.2], // 25 свип 97, медвежья — ордерблок
  [98.2, 100, 98, 99.8], // 26
  [99.8, 101.5, 99.6, 101.2], // 27 FVG: лоу 99,6 > хай 25 (98,8)
  [101.2, 103, 101, 102.8], // 28 закрытие выше 102 — слом
];

/** Случайное блуждание 15m-свечей — для сквозных тестов. */
export function walk(
  n: number,
  seed = 1,
  start = Date.UTC(2020, 0, 1),
): Series {
  const rnd = mulberry32(seed);
  let p = 10_000;
  const rows = [];
  for (let i = 0; i < n; i++) {
    const open = p;
    const close = open * (1 + (rnd() - 0.5) * 0.006);
    const high = Math.max(open, close) * (1 + rnd() * 0.002);
    const low = Math.min(open, close) * (1 - rnd() * 0.002);
    rows.push({ time: start + i * 15 * 60_000, open, high, low, close });
    p = close;
  }
  return toSeries(15, rows);
}

/** Свечи старшего ТФ из младших (группы по началу старшей свечи). */
export function aggregate(s: Series, tf: number): Series {
  const step = tf * 60_000;
  const rows: {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
  }[] = [];
  for (let i = 0; i < s.n; i++) {
    const time = Math.floor(s.t[i] / step) * step;
    const last = rows[rows.length - 1];
    if (last && last.time === time) {
      last.high = Math.max(last.high, s.h[i]);
      last.low = Math.min(last.low, s.l[i]);
      last.close = s.c[i];
    } else {
      rows.push({
        time,
        open: s.o[i],
        high: s.h[i],
        low: s.l[i],
        close: s.c[i],
      });
    }
  }
  return toSeries(tf, rows);
}
