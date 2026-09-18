import { mulberry32, normal, streamSeed, studentT4 } from './rng';

const sample = (n: number, f: () => number) => Array.from({ length: n }, f);
const variance = (xs: number[]) => {
  const m = xs.reduce((a, x) => a + x, 0) / xs.length;
  return xs.reduce((a, x) => a + (x - m) ** 2, 0) / xs.length;
};

describe('ГПСЧ генератора', () => {
  it('одно зерно — одна последовательность', () => {
    expect(sample(5, mulberry32(42))).toEqual(sample(5, mulberry32(42)));
    expect(sample(5, mulberry32(43))).not.toEqual(sample(5, mulberry32(42)));
  });

  it('числа в [0, 1)', () => {
    const xs = sample(100_000, mulberry32(7));
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThan(1);
  });

  it('потоки суток различаются', () => {
    const seeds = new Set(Array.from({ length: 1000 }, (_, d) => streamSeed(12345, d)));
    expect(seeds.size).toBe(1000);
    expect(streamSeed(12345, -1)).not.toBe(streamSeed(12345, 0));
  });

  it('нормальное — единичная дисперсия', () => {
    const rng = mulberry32(1);
    const v = variance(sample(200_000, () => normal(rng)));
    expect(v).toBeGreaterThan(0.98);
    expect(v).toBeLessThan(1.02);
  });

  it('t(4) — единичная дисперсия и хвосты тяжелее нормальных', () => {
    const rng = mulberry32(2);
    const xs = sample(200_000, () => Math.max(-8, Math.min(8, studentT4(rng))));
    expect(variance(xs)).toBeGreaterThan(0.9);
    expect(variance(xs)).toBeLessThan(1.1);
    const beyond3 = xs.filter((x) => Math.abs(x) > 3).length / xs.length;
    expect(beyond3).toBeGreaterThan(0.009); // у нормального ≈ 0.0027
    expect(beyond3).toBeLessThan(0.018);
  });
});
