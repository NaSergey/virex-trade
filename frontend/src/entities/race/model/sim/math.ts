/** Помощники симуляции гонки. Файл — в двух копиях, см. `config.ts`. */

export type Rnd = () => number;

export const clamp = (v: number, a: number, b: number): number =>
  v < a ? a : v > b ? b : v;
export const lerp = (a: number, b: number, t: number): number =>
  a + (b - a) * t;
export const easeInOut = (t: number): number =>
  -Math.cos(t * Math.PI) / 2 + 0.5;

/**
 * mulberry32: одно зерно — одна последовательность на сервере и в браузере.
 * Трасса строится из зерна дважды, и расхождение в одном числе дало бы две
 * разные дороги.
 */
export function rng(seed: number): Rnd {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
