import { plainNotional, withTheory, withoutTheory } from './money';

describe('money', () => {
  it('с теорией — 1 % текущего счёта', () => {
    const m = withTheory([
      { rNet: 1, stopPct: 0.01 },
      { rNet: -1, stopPct: 0.02 },
    ]);
    expect(m.final).toBeCloseTo(1000 * 1.01 * 0.99);
    expect(m.maxDd).toBeCloseTo(0.01);
    expect(m.worstTrade).toBeCloseTo(-0.01);
    expect(m.equity).toHaveLength(3);
  });

  it('без теории — одинаковый объём', () => {
    const n = plainNotional([
      { rNet: 0, stopPct: 0.01 },
      { rNet: 0, stopPct: 0.02 },
      { rNet: 0, stopPct: 0.03 },
    ]);
    expect(n).toBeCloseTo(500);
    const m = withoutTheory(
      [
        { rNet: 1, stopPct: 0.02 },
        { rNet: -1, stopPct: 0.04 },
        { rNet: 2, stopPct: 0.01 },
      ],
      500,
    );
    expect(m.final).toBeCloseTo(1000);
    expect(m.worstTrade).toBeCloseTo(-20 / 1010);
  });

  it('счёт в ноль — торговля кончилась', () => {
    const m = withoutTheory(
      [
        { rNet: -300, stopPct: 0.01 },
        { rNet: 5, stopPct: 0.01 },
      ],
      500,
    );
    expect(m.final).toBe(0);
    expect(m.maxDd).toBe(1);
    expect(m.equity).toEqual([1000, 0]);
  });

  it('пустой список', () => {
    expect(withTheory([])).toMatchObject({
      final: 1000,
      maxDd: 0,
      worstTrade: 0,
    });
  });
});
