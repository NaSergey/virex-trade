import { describe, expect, it } from 'vitest';
import { anchoredVwap, regression, volumeProfile } from './series';

const c = (t: number, close: number, v?: number, h = close + 1, l = close - 1) => ({ t, o: close, h, l, c: close, v });

describe('расчёты по свечам', () => {
  it('регрессия по прямой — без разброса', () => {
    const rows = [c(0, 100), c(10, 110), c(20, 120), c(30, 130)];
    const r = regression(rows, 0, 30)!;
    expect(r.from.p).toBeCloseTo(100);
    expect(r.to.p).toBeCloseTo(130);
    expect(r.sigma).toBeCloseTo(0);
  });

  it('регрессия — только свечи участка; меньше двух — пусто', () => {
    expect(regression([c(0, 1), c(10, 2)], 5, 9)).toBeNull();
  });

  it('профиль: POC — строка с наибольшим объёмом, зона растёт к большей соседней', () => {
    const rows = [c(0, 100, 10, 100, 100), c(1, 105, 100, 105, 105), c(2, 110, 30, 110, 110), c(3, 103, 50, 103, 103)];
    const prof = volumeProfile(rows, 0, 3, 10)!;
    expect(prof.lo).toBe(100);
    expect(prof.hi).toBe(110);
    expect(prof.rows.reduce((s, x) => s + x, 0)).toBeCloseTo(190);
    expect(prof.poc).toBe(5);
    expect(prof.vaLo).toBeLessThanOrEqual(3);
    expect(prof.vaHi).toBeGreaterThanOrEqual(5);
  });

  it('профиль без объёма — пусто', () => {
    expect(volumeProfile([c(0, 100), c(1, 101)], 0, 1)).toBeNull();
  });

  it('VWAP — от якоря, взвешенный по объёму', () => {
    const rows = [c(0, 50, 100), c(10, 100, 1, 101, 99), c(20, 200, 3, 201, 199)];
    expect(anchoredVwap(rows, 10).map((x) => x.p)).toEqual([100, 175]);
  });
});
