import {
  maxDrawdown,
  maxLossStreak,
  meanCi,
  mulberry32,
  summarize,
  thin,
  tQuantile,
  upper95,
  wilson,
} from './stats';

describe('stats', () => {
  it('thin — не больше max точек, края сохраняются', () => {
    const xs = Array.from({ length: 1000 }, (_, i) => i);
    const t = thin(xs, 10);
    expect(t).toHaveLength(10);
    expect(t[0]).toBe(0);
    expect(t[9]).toBe(999);
    expect(thin([1, 2], 10)).toEqual([1, 2]);
  });

  it('wilson — известный интервал 5 из 10', () => {
    const [lo, hi] = wilson(5, 10);
    expect(lo).toBeCloseTo(0.2366, 3);
    expect(hi).toBeCloseTo(0.7634, 3);
  });

  it('wilson — пустая выборка даёт NaN', () => {
    expect(wilson(0, 0).every(Number.isNaN)).toBe(true);
  });

  it('tQuantile — к нормальному при большом df и t(0,95; 19) ≈ 1,729', () => {
    expect(tQuantile(1.959964, 1e9)).toBeCloseTo(1.959964, 5);
    expect(tQuantile(1.6448536, 19)).toBeCloseTo(1.729, 2);
  });

  it('summarize — пример видео: цель 8R, винрейт 15 % → +0,35R', () => {
    const rs = [...Array(15).fill(8), ...Array(85).fill(-1)];
    const s = summarize(rs);
    expect(s.n).toBe(100);
    expect(s.winrate).toBeCloseTo(0.15);
    expect(s.expectancy).toBeCloseTo(0.35);
    expect(s.avgWin).toBe(8);
    expect(s.avgLoss).toBe(1);
    expect(s.breakeven).toBeCloseTo(1 / 9);
    expect(s.pf).toBeCloseTo(120 / 85);
  });

  it('summarize — без убытков pf = null', () => {
    expect(summarize([1, 2]).pf).toBeNull();
  });

  it('meanCi и upper95', () => {
    const xs = [-1, -1, -1, -1, 1, -1, -1, -1, -1, -1];
    const ci = meanCi(xs);
    expect(ci.mean).toBeCloseTo(-0.8);
    expect(ci.lo).toBeLessThan(ci.mean);
    expect(ci.hi).toBeGreaterThan(ci.mean);
    expect(upper95(xs)).toBeLessThan(ci.hi);
    expect(upper95(xs)).toBeLessThan(0);
  });

  it('maxDrawdown — сложный процент', () => {
    expect(maxDrawdown([-1, -1], 0.5)).toBeCloseTo(0.75);
    expect(maxDrawdown([1, -1], 0.1)).toBeCloseTo(0.1);
  });

  it('maxLossStreak', () => {
    expect(maxLossStreak([1, -1, -1, 0, 2, -1])).toBe(3);
  });

  it('mulberry32 воспроизводим', () => {
    const a = mulberry32(7);
    const b = mulberry32(7);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});
