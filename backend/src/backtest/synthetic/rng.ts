/**
 * Случайность генератора рынка. Своя, а не Math.random: график обязан
 * повторяться от зерна — один и тот же запрос свечей всегда даёт одни и те же
 * свечи, в каком бы порядке их ни запросили.
 */

/** Равномерное число из [0, 1). */
export type Rng = () => number;

/** mulberry32: 32 бита состояния, быстрый, разброса для симуляции хватает. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Зерно отдельного потока. У каждых суток свой поток: их минутки не зависят от
 * того, сколько чисел съели другие сутки, и сутки строятся с контрольной точки
 * отдельно. Отрицательные номера — служебные потоки сессии.
 */
export function streamSeed(seed: number, stream: number): number {
  let h = (seed ^ Math.imul(stream + 0x632be5ab, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

export const uniform = (rng: Rng, min: number, max: number) => min + rng() * (max - min);

/** Стандартное нормальное (Бокс — Мюллер). `1 − rng()` — чтобы не взять логарифм нуля. */
export function normal(rng: Rng): number {
  return Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
}

/**
 * t-распределение с четырьмя степенями свободы, приведённое к единичной
 * дисперсии: хвосты доходностей BTC тяжелее нормальных. χ²(4) — это −2·ln(U₁U₂).
 */
export function studentT4(rng: Rng): number {
  const z = normal(rng);
  const chi2 = Math.max(-2 * Math.log((1 - rng()) * (1 - rng())), 1e-12);
  return z / Math.sqrt(chi2 / 4) / Math.SQRT2;
}
