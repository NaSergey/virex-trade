import { describe, expect, it } from 'vitest';
import { checkCloseGridSide, closeGridAnchor, closeGridPlan, closeGridPrices } from './close-grid';
import { unrealizedPnl } from './money';

describe('closeGridPrices', () => {
  it('от первого тейка к последнему с равным шагом — в каком порядке ни введены', () => {
    expect(closeGridPrices(105, 115, 3)).toEqual([105, 110, 115]);
    expect(closeGridPrices(115, 105, 3)).toEqual([115, 110, 105]);
  });

  it('один ордер — на первом тейке', () => {
    expect(closeGridPrices(105, 115, 1)).toEqual([105]);
  });
});

describe('closeGridPlan', () => {
  const long = { direction: 'long' as const, entryPrice: 100, stopLoss: 95 };

  it('делит остаток поровну, последний забирает остаток деления — как сервер', () => {
    const plan = closeGridPlan(long, [105, 110, 115], 0.9, false);
    expect(plan.rows.map((r) => r.qty).reduce((a, b) => a + b, 0)).toBe(0.9);
    expect(plan.rows[0].qty).toBeCloseTo(0.3, 10);
  });

  it('прибыль уровня — с комиссией, итог — сумма, средняя цена — взвешенная', () => {
    const plan = closeGridPlan(long, [105, 115], 2, false);
    expect(plan.rows[0].pnl).toBeCloseTo(unrealizedPnl('long', 100, 105, 1), 10);
    expect(plan.pnl).toBeCloseTo(unrealizedPnl('long', 100, 105, 1) + unrealizedPnl('long', 100, 115, 1), 10);
    expect(plan.avgExit).toBeCloseTo(110, 10);
  });

  it('стоп за тейками: после первого — безубыток, дальше — предыдущий тейк, после последнего — позиции нет', () => {
    const plan = closeGridPlan(long, [105, 110, 115], 3, true);
    expect(plan.rows.map((r) => r.stopAfter)).toEqual([100, 105, null]);
  });

  it('стоп только подтягивается: более тесный остаётся', () => {
    const plan = closeGridPlan({ ...long, stopLoss: 102 }, [105, 110, 115], 3, true);
    expect(plan.rows.map((r) => r.stopAfter)).toEqual([102, 105, null]);
  });

  it('шорт — тем же правилом вниз', () => {
    const plan = closeGridPlan({ direction: 'short', entryPrice: 100, stopLoss: 105 }, [95, 90], 2, true);
    expect(plan.rows.map((r) => r.stopAfter)).toEqual([100, null]);
  });

  it('без переноса стопа колонки нет', () => {
    const plan = closeGridPlan(long, [105, 110], 2, false);
    expect(plan.rows.map((r) => r.stopAfter)).toEqual([null, null]);
  });
});

describe('closeGridAnchor', () => {
  it('позиция в минусе — отсчёт от входа: тейк ниже входа был бы убытком', () => {
    expect(closeGridAnchor('long', 100, 95)).toBe(100);
    expect(closeGridAnchor('short', 100, 105)).toBe(100);
  });

  it('позиция в плюсе — от текущей цены: лимит ближе неё уже рынок', () => {
    expect(closeGridAnchor('long', 100, 108)).toBe(108);
    expect(closeGridAnchor('short', 100, 92)).toBe(92);
  });
});

describe('checkCloseGridSide', () => {
  it('тейки лонга — выше текущей цены, шорта — ниже', () => {
    expect(checkCloseGridSide('long', [105, 110], 104)).toBeNull();
    expect(checkCloseGridSide('long', [103, 110], 104)).toBe('closeGridSide');
    expect(checkCloseGridSide('short', [95, 90], 96)).toBeNull();
    expect(checkCloseGridSide('short', [97], 96)).toBe('closeGridSide');
  });

  it('уровень ровно на цене — уже рынок', () => {
    expect(checkCloseGridSide('long', [104], 104)).toBe('closeGridSide');
  });
});
