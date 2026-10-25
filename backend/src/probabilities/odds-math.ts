/**
 * Математика экспериментальных вероятностей (спека
 * docs/superpowers/specs/2026-10-25-probability-indicators-design.md): исход
 * по барьерам и частота стороны с проверкой вперёд. Без БД и сети.
 */

export interface Bar {
  /** Время открытия свечи, мс. */
  t: number;
  h: number;
  l: number;
  c: number;
}

export type Side = 'up' | 'down';

/** Доля стороны и её 95 % интервал Вильсона; доли — 0..100. */
export interface OddsCount {
  n: number;
  hits: number;
  share: number;
  low: number;
  high: number;
}

/** Частота стороны в истории (до SPLIT) и на проверке вперёд (с SPLIT). */
export interface OddsStat {
  side: Side;
  train: OddsCount;
  test: OddsCount;
  holds: boolean;
}

/** Исход одного события: время свечи события и сторона, коснувшаяся первой. */
export interface Outcome {
  t: number;
  side: Side;
}

/** Граница истории и проверки вперёд. */
export const SPLIT = Date.UTC(2023, 0, 1);
/** Горизонт исхода в свечах — он же свежесть сигнала на плашке терминала. */
export const HORIZON = 20;
export const ATR_LEN = 14;

const Z = 1.96;

/** 95 % интервал Вильсона доли `hits` из `n`, в процентах. */
export function wilson(hits: number, n: number): { low: number; high: number } {
  if (n === 0) return { low: 0, high: 100 };
  const p = hits / n;
  const z2 = Z * Z;
  const den = 1 + z2 / n;
  const mid = (p + z2 / (2 * n)) / den;
  const half = (Z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / den;
  return {
    low: Math.max(0, mid - half) * 100,
    high: Math.min(1, mid + half) * 100,
  };
}

export function countOf(hits: number, n: number): OddsCount {
  return { n, hits, share: n ? (hits / n) * 100 : 0, ...wilson(hits, n) };
}

/**
 * ATR Уайлдера. Первое значение — на свече `len` (среднее TR свечей 1..len),
 * до неё NaN: ATR из нескольких свечей — не ATR, и такие события не мерятся.
 */
export function atrOf(bars: readonly Bar[], len = ATR_LEN): number[] {
  const out = new Array<number>(bars.length).fill(NaN);
  let sum = 0;
  let atr = NaN;
  for (let i = 1; i < bars.length; i++) {
    const b = bars[i];
    const pc = bars[i - 1].c;
    const tr = Math.max(b.h - b.l, Math.abs(b.h - pc), Math.abs(b.l - pc));
    if (i < len) {
      sum += tr;
    } else if (i === len) {
      atr = (sum + tr) / len;
      out[i] = atr;
    } else {
      atr = (atr * (len - 1) + tr) / len;
      out[i] = atr;
    }
  }
  return out;
}

/**
 * Какую границу `±dist` от закрытия свечи `i` цена коснулась первой за
 * `horizon` свечей. Обе в одной свече (порядок внутри свечи неизвестен), ни
 * одной или ряд кончился раньше — null: такие события в выборку не идут.
 */
export function firstBarrier(
  bars: readonly Bar[],
  i: number,
  dist: number,
  horizon = HORIZON,
): Side | null {
  const up = bars[i].c + dist;
  const dn = bars[i].c - dist;
  for (let j = i + 1; j <= i + horizon && j < bars.length; j++) {
    const u = bars[j].h >= up;
    const d = bars[j].l <= dn;
    if (u && d) return null;
    if (u) return 'up';
    if (d) return 'down';
  }
  return null;
}

/**
 * Частота стороны `side` (у дивергенции — по её смыслу). «Держится» — доля на проверке по ту же сторону от 50 %, что в истории, и её
 * интервал 50 % не задевает: у заданной стороны это бывает и ниже 50 % —
 * бычья дивергенция, после которой цена устойчиво шла вниз. Исходов нет — null.
 */
export function statOf(
  outcomes: readonly Outcome[],
  side: Side,
  split = SPLIT,
): OddsStat | null {
  if (outcomes.length === 0) return null;
  const tally = (inPart: (o: Outcome) => boolean) => {
    let n = 0;
    let up = 0;
    for (const o of outcomes) {
      if (!inPart(o)) continue;
      n++;
      if (o.side === 'up') up++;
    }
    return { n, up };
  };
  const tr = tally((o) => o.t < split);
  const te = tally((o) => o.t >= split);
  const hitsOf = (x: { n: number; up: number }) =>
    side === 'up' ? x.up : x.n - x.up;
  const train = countOf(hitsOf(tr), tr.n);
  const test = countOf(hitsOf(te), te.n);
  const holds =
    train.n > 0 &&
    test.n > 0 &&
    train.share !== 50 &&
    (train.share > 50 ? test.low > 50 : test.high < 50);
  return { side, train, test, holds };
}
