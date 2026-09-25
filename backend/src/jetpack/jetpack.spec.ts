import { crashX100, msTo, payout, randomUnit, x100At } from './jetpack';
import { MAX_X100 } from './jetpack.config';

describe('crashX100', () => {
  it('ноль — мгновенный краш, а не меньше 1.00x', () => {
    expect(crashX100(0)).toBe(100);
  });

  it('точные двоичные r дают точные точки', () => {
    expect(crashX100(0.5)).toBe(198);
    expect(crashX100(0.75)).toBe(396);
    expect(crashX100(0.875)).toBe(792);
  });

  it('потолок — 1000x', () => {
    expect(crashX100(1 - 2 ** -20)).toBe(MAX_X100);
  });

  // Равномерная сетка r вместо случайных: тест детерминирован, а доля — та же.
  it.each([
    [101, 0.99 / 1.01],
    [200, 0.99 / 2],
    [1000, 0.99 / 10],
  ])('шанс дожить до %i сотых — 0.99/x', (x, p) => {
    const N = 200_000;
    let hit = 0;
    for (let i = 0; i < N; i++) if (crashX100(i / N) >= x) hit++;
    expect(Math.abs(hit / N - p)).toBeLessThan(0.002);
  });
});

describe('randomUnit', () => {
  // Настоящий генератор, без подмены: подменённый в тестах сервиса, он
  // однажды уже бросал на каждом взлёте.
  it('в [0, 1) и не вырожден', () => {
    const xs = Array.from({ length: 2000 }, () => randomUnit());
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(Math.abs(mean - 0.5)).toBeLessThan(0.05);
  });
});

describe('x100At / msTo', () => {
  it('на старте 1.00x', () => {
    expect(x100At(0)).toBe(100);
    expect(x100At(-5)).toBe(100);
  });

  it('msTo обратна x100At', () => {
    for (const x of [101, 150, 200, 1234, 100_000]) {
      const ms = msTo(x);
      expect(x100At(ms + 1)).toBeGreaterThanOrEqual(x);
      expect(x100At(ms - 1)).toBeLessThan(x);
    }
  });

  it('2x — около 8.7 с', () => {
    expect(Math.round(msTo(200))).toBe(8664);
  });
});

describe('payout', () => {
  it('округляет вниз до целой монеты', () => {
    expect(payout(10, 235)).toBe(23);
    expect(payout(3, 101)).toBe(3);
    expect(payout(10_000, 100_000)).toBe(10_000_000);
  });
});
