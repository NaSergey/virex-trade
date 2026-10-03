import { describe, expect, it } from 'vitest';
import { byFrequency, linePoints, pathOf, radarPoint, trend, windowSums } from './charts';

describe('trend', () => {
  it('сравнивает последнее значение со значением N дней назад', () => {
    expect(trend([100, 110, 120, 150], 2)).toEqual({ abs: 40, pct: (40 / 110) * 100 });
  });
  it('у короткого ряда база — первое значение; ноль в базе — без доли', () => {
    expect(trend([50, 80], 30)).toEqual({ abs: 30, pct: 60 });
    expect(trend([0, 20], 7)).toEqual({ abs: 20, pct: null });
    expect(trend([], 7)).toEqual({ abs: 0, pct: null });
  });
});

describe('windowSums', () => {
  it('складывает последние N и N перед ними', () => {
    expect(windowSums([1, 2, 3, 4, 5, 6], 2)).toEqual({ now: 11, before: 7 });
    expect(windowSums([5], 7)).toEqual({ now: 5, before: 0 });
  });
});

describe('linePoints', () => {
  it('растягивает ряд на ширину и переворачивает ось Y', () => {
    const pts = linePoints([0, 10], 100, 50, 5);
    expect(pts).toEqual([
      { x: 5, y: 45 },
      { x: 95, y: 5 },
    ]);
    expect(pathOf(pts)).toBe('M5.0 45.0 L95.0 5.0');
  });
  it('ровный ряд — по середине высоты', () => {
    expect(linePoints([7, 7, 7], 100, 40, 4).every((p) => p.y === 20)).toBe(true);
  });
  it('одна точка не делит на ноль', () => {
    expect(linePoints([3], 100, 40, 4)).toEqual([{ x: 4, y: 20 }]);
  });
});

describe('radarPoint', () => {
  it('первая ось смотрит вверх, значение режется в 0–1', () => {
    const p = radarPoint(0, 5, 1, 10, 50, 50);
    expect(p.x).toBeCloseTo(50);
    expect(p.y).toBeCloseTo(40);
    expect(radarPoint(0, 5, 2, 10, 50, 50).y).toBeCloseTo(40);
  });
});

describe('byFrequency', () => {
  it('сначала дни за 90, при равенстве — сыграно всего', () => {
    const g = (id: string, days90: number, played: number) => ({ id, days90, played });
    const out = byFrequency([g('a', 3, 10), g('b', 9, 1), g('c', 3, 50), g('d', 0, 0)]);
    expect(out.map((x) => x.id)).toEqual(['b', 'c', 'a', 'd']);
  });
});
