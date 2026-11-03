/**
 * Случайность забега — mulberry32 с состоянием снаружи: состояние одно число и
 * лежит в забеге, поэтому забег, восстановленный из localStorage, продолжается
 * той же последовательностью. Движок достаёт коробку из состояния на входе
 * шага и кладёт её число обратно на выходе — снаружи шаг остаётся чистым.
 */
export interface Rand {
  s: number;
}

export const rand = (seed: number): Rand => ({ s: seed >>> 0 });

/** То же, что `mulberry32` из `model/random.ts`, но состояние — в коробке. */
export function next(r: Rand): number {
  r.s = (r.s + 0x6d2b79f5) >>> 0;
  let t = r.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Целое от `lo` до `hi` включительно. */
export const int = (r: Rand, lo: number, hi: number): number => lo + Math.floor(next(r) * (hi - lo + 1));

export const chance = (r: Rand, p: number): boolean => next(r) < p;

export function pick<T>(r: Rand, list: readonly T[]): T {
  return list[Math.floor(next(r) * list.length)];
}

export function shuffle<T>(r: Rand, list: readonly T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next(r) * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Выбор по весам; нулевой вес не выпадает никогда. */
export function weighted<T>(r: Rand, entries: readonly (readonly [T, number])[]): T {
  const total = entries.reduce((s, [, w]) => s + Math.max(0, w), 0);
  let x = next(r) * total;
  for (const [value, w] of entries) {
    if (w <= 0) continue;
    x -= w;
    if (x < 0) return value;
  }
  return entries.filter(([, w]) => w > 0).at(-1)![0];
}

/** Зерно из строки (FNV-1a): дата дня — одна погода и одни задания на всех устройствах. */
export function seedOf(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
