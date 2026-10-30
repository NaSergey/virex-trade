import type { Summary } from './report.types';

const Z95 = 1.6448536269514722;
const Z975 = 1.959963984540054;

/** Интервал Вильсона для доли k из n (по умолчанию 95 %). */
export function wilson(k: number, n: number, z = Z975): [number, number] {
  if (n === 0) return [NaN, NaN];
  const p = k / n;
  const den = 1 + (z * z) / n;
  const mid = (p + (z * z) / (2 * n)) / den;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / den;
  return [Math.max(0, mid - half), Math.min(1, mid + half)];
}

/**
 * Квантиль t-распределения поправкой Корниша — Фишера к нормальному: при
 * df ≥ 5 точность — третий знак, таблицы не нужны.
 */
export function tQuantile(z: number, df: number): number {
  return (
    z +
    (z ** 3 + z) / (4 * df) +
    (5 * z ** 5 + 16 * z ** 3 + 3 * z) / (96 * df * df)
  );
}

function meanSd(xs: number[]): [number, number] {
  const n = xs.length;
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const v = n > 1 ? xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1) : 0;
  return [mean, Math.sqrt(v)];
}

/** Двусторонний 95 % интервал среднего. */
export function meanCi(xs: number[]): { mean: number; lo: number; hi: number } {
  if (xs.length < 2) {
    return { mean: xs.length ? xs[0] : NaN, lo: NaN, hi: NaN };
  }
  const [mean, sd] = meanSd(xs);
  const half = (tQuantile(Z975, xs.length - 1) * sd) / Math.sqrt(xs.length);
  return { mean, lo: mean - half, hi: mean + half };
}

/** Верхняя граница одностороннего 95 % интервала среднего. */
export function upper95(xs: number[]): number {
  if (xs.length < 2) return NaN;
  const [mean, sd] = meanSd(xs);
  return mean + (tQuantile(Z95, xs.length - 1) * sd) / Math.sqrt(xs.length);
}

/** Сводка по R сделок; сделка с R ≤ 0 — убыточная. */
export function summarize(rs: number[]): Summary {
  let wins = 0;
  let losses = 0;
  let sumWin = 0;
  let sumLoss = 0;
  let sum = 0;
  for (const r of rs) {
    sum += r;
    if (r > 0) {
      wins++;
      sumWin += r;
    } else {
      losses++;
      sumLoss -= r;
    }
  }
  const n = rs.length;
  const avgWin = wins ? sumWin / wins : 0;
  const avgLoss = losses ? sumLoss / losses : 0;
  return {
    n,
    wins,
    winrate: n ? wins / n : 0,
    avgWin,
    avgLoss,
    expectancy: n ? sum / n : 0,
    pf: sumLoss > 0 ? sumWin / sumLoss : null,
    sumR: sum,
    breakeven: avgWin + avgLoss > 0 ? avgLoss / (avgWin + avgLoss) : 0,
  };
}

/** Макс. просадка счёта от максимума при риске `risk` (доля) на сделку, со сложным процентом. */
export function maxDrawdown(rs: number[], risk: number): number {
  let eq = 1;
  let peak = 1;
  let dd = 0;
  for (const r of rs) {
    eq *= 1 + risk * r;
    if (eq > peak) peak = eq;
    dd = Math.max(dd, 1 - eq / peak);
  }
  return dd;
}

/** Самая длинная серия сделок с R ≤ 0. */
export function maxLossStreak(rs: number[]): number {
  let best = 0;
  let cur = 0;
  for (const r of rs) {
    cur = r > 0 ? 0 : cur + 1;
    best = Math.max(best, cur);
  }
  return best;
}

/** ГПСЧ с зерном: перестановки в отчёте одинаковы от пересчёта к пересчёту. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Не больше `max` точек равным шагом, края сохраняются — для графиков отчёта. */
export function thin<T>(xs: T[], max = 200): T[] {
  if (xs.length <= max) return xs;
  const step = (xs.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => xs[Math.round(i * step)]);
}
