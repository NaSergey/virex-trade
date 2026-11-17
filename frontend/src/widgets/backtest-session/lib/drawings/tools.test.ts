import { describe, expect, it } from 'vitest';
import {
  cycleTs,
  fibChannelLines,
  fibExtLevels,
  fibFanTargets,
  fibTimeTs,
  gannTargets,
  necklineOf,
  pitchforkLines,
  quadThrough,
  xabcdRatios,
} from './tools';

const p = (t: number, price: number) => ({ t, p: price });

describe('инструменты: геометрия', () => {
  it('расширение Фибо — от C на долях хода A→B', () => {
    const levels = fibExtLevels(p(0, 100), p(10, 120), p(20, 110));
    expect(levels.find((l) => l.level === 0)?.price).toBe(110);
    expect(levels.find((l) => l.level === 1)?.price).toBe(130);
    expect(levels.find((l) => l.level === 1.618)?.price).toBeCloseTo(142.36);
  });

  it('канал Фибо — ширина от линии AB до третьей точки в её момент', () => {
    const lines = fibChannelLines(p(0, 100), p(10, 110), p(5, 115));
    const one = lines.find((l) => l.k === 1)!;
    expect(one.from).toEqual(p(0, 110));
    expect(one.to).toEqual(p(10, 120));
  });

  it('веер Фибо — точки на вертикали B', () => {
    expect(fibFanTargets(p(0, 100), p(10, 200)).map((x) => x.to.p)).toEqual([138.2, 150, 161.8, 200]);
  });

  it('временные зоны — ряд Фибоначчи от A шагом B−A', () => {
    expect(fibTimeTs(p(100, 0), p(110, 0)).slice(0, 6).map((x) => x.t)).toEqual([100, 110, 120, 130, 150, 180]);
  });

  it('веер Ганна — 1×1 через B, 2×1 вдвое круче', () => {
    const rays = gannTargets(p(0, 100), p(10, 110));
    expect(rays.find((r) => r.label === '1×1')?.to).toEqual(p(10, 110));
    expect(rays.find((r) => r.label === '2×1')?.to).toEqual(p(10, 120));
    expect(rays.find((r) => r.label === '1×2')?.to).toEqual(p(10, 105));
  });

  it('вилы — срединная через середину P1P2, крайние ей параллельны', () => {
    const { median, upper, lower } = pitchforkLines(p(0, 100), p(10, 120), p(10, 100));
    expect(median[1]).toEqual(p(10, 110));
    expect(upper).toEqual([p(10, 120), p(20, 130)]);
    expect(lower).toEqual([p(10, 100), p(20, 110)]);
  });

  it('кривая через точку: контрольная — 2C − (A+B)/2', () => {
    expect(quadThrough(p(0, 0), p(10, 0), p(5, 10))).toEqual(p(5, 20));
  });

  it('XABCD — отношения ходов', () => {
    const r = xabcdRatios(p(0, 100), p(1, 200), p(2, 138.2), p(3, 180), p(4, 121.4));
    expect(r.xb).toBeCloseTo(0.618);
    expect(r.ac).toBeCloseTo(0.68, 2);
    expect(r.xd).toBeCloseTo(0.786);
  });

  it('линия шеи — через шеи, от левого основания до правого', () => {
    const pts = [p(0, 90), p(1, 110), p(2, 100), p(3, 130), p(4, 104), p(5, 112), p(6, 92)];
    expect(necklineOf(pts)).toEqual([p(0, 96), p(6, 108)]);
  });

  it('циклы — от левой точки вправо до края', () => {
    expect(cycleTs(p(20, 0), p(10, 0), 55)).toEqual([10, 20, 30, 40, 50]);
  });

  it('циклы — с левого края экрана, а не с начала: лимит не съедается невидимыми', () => {
    expect(cycleTs(p(0, 0), p(1, 0), 1005, 3, 1000)).toEqual([1000, 1001, 1002]);
  });
});
