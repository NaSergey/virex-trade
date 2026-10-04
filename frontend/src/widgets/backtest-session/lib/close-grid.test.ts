import { describe, expect, it } from 'vitest';
import {
  CLOSE_GRID_FIRST_ID,
  CLOSE_GRID_LAST_ID,
  checkCloseGridSide,
  closeGridAnchor,
  closeGridCount,
  closeGridFromDraft,
  closeGridLevels,
  closeGridPlan,
  closeGridPrices,
  closeGridQtys,
  initCloseGrid,
} from './close-grid';
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

  it('прибыль уровня — с комиссией, итог — сумма, средняя цена — взвешенная', () => {
    const plan = closeGridPlan(long, [105, 115], [1, 1], false);
    expect(plan.rows[0].pnl).toBeCloseTo(unrealizedPnl('long', 100, 105, 1), 10);
    expect(plan.pnl).toBeCloseTo(unrealizedPnl('long', 100, 105, 1) + unrealizedPnl('long', 100, 115, 1), 10);
    expect(plan.avgExit).toBeCloseTo(110, 10);
  });

  it('стоп за тейками: после первого — безубыток, дальше — предыдущий тейк, после последнего — позиции нет', () => {
    const plan = closeGridPlan(long, [105, 110, 115], [1, 1, 1], true);
    expect(plan.rows.map((r) => r.stopAfter)).toEqual([100, 105, null]);
    expect(plan.rows.map((r) => r.stopTarget)).toEqual([100, 105, null]);
  });

  it('стоп только подтягивается: более тесный остаётся', () => {
    const plan = closeGridPlan({ ...long, stopLoss: 102 }, [105, 110, 115], [1, 1, 1], true);
    expect(plan.rows.map((r) => r.stopAfter)).toEqual([102, 105, null]);
  });

  it('шорт — тем же правилом вниз', () => {
    const plan = closeGridPlan({ direction: 'short', entryPrice: 100, stopLoss: 105 }, [95, 90], [1, 1], true);
    expect(plan.rows.map((r) => r.stopAfter)).toEqual([100, null]);
  });

  it('без переноса стопа колонки нет', () => {
    const plan = closeGridPlan(long, [105, 110], [1, 1], false);
    expect(plan.rows.map((r) => r.stopAfter)).toEqual([null, null]);
    expect(plan.rows.map((r) => r.stopTarget)).toEqual([null, null]);
  });

  it('закреплённая цель уровня — вместо правила; дальше цепочка идёт от неё', () => {
    const plan = closeGridPlan(long, [105, 110, 115], [1, 1, 1], true, [101, null, null]);
    expect(plan.rows.map((r) => r.stopTarget)).toEqual([101, 105, null]);
    expect(plan.rows.map((r) => r.stopAfter)).toEqual([101, 105, null]);
  });

  it('закреплённая цель слабее прежнего стопа или за ценой уровня — стоп остаётся прежним, цель уходит как есть', () => {
    const plan = closeGridPlan({ ...long, stopLoss: 102 }, [105, 110, 115], [1, 1, 1], true, [99, 112, null]);
    expect(plan.rows.map((r) => r.stopTarget)).toEqual([99, 112, null]);
    expect(plan.rows.map((r) => r.stopAfter)).toEqual([102, 102, null]);
  });
});

describe('closeGridQtys', () => {
  it('без закреплений — поровну, сумма ровно остаток', () => {
    const { qtys, pinned, over } = closeGridQtys(0.9, 3, {});
    expect(qtys[0]).toBeCloseTo(0.3, 10);
    expect(qtys.reduce((a, b) => a + b, 0)).toBe(0.9);
    expect(pinned).toEqual([false, false, false]);
    expect(over).toBe(false);
  });

  it('закреплённая доля держит своё, остальные делят остаток', () => {
    const { qtys, pinned } = closeGridQtys(1, 3, { 1: 50 });
    expect(qtys[1]).toBe(0.5);
    expect(qtys[0]).toBeCloseTo(0.25, 10);
    expect(qtys.reduce((a, b) => a + b, 0)).toBe(1);
    expect(pinned).toEqual([false, true, false]);
  });

  it('закреплены все и вместе меньше — остаток остаётся в позиции', () => {
    expect(closeGridQtys(1, 2, { 0: 30, 1: 30 })).toMatchObject({ qtys: [0.3, 0.3], over: false });
  });

  it('закреплённые доли больше 100 % — перебор, свободным ничего', () => {
    expect(closeGridQtys(1, 3, { 0: 70, 1: 60 })).toMatchObject({ qtys: [0.7, 0.6, 0], over: true });
  });

  it('закрепления за последним уровнем не действуют', () => {
    const { qtys, pinned } = closeGridQtys(1, 2, { 4: 90 });
    expect(pinned).toEqual([false, false]);
    expect(qtys).toEqual([0.5, 0.5]);
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

describe('closeGridCount', () => {
  it('целое от 1 до 10, мусор в поле — один ордер', () => {
    expect(closeGridCount('3')).toBe(3);
    expect(closeGridCount('2.6')).toBe(3);
    expect(closeGridCount('25')).toBe(10);
    expect(closeGridCount('')).toBe(1);
    expect(closeGridCount('abc')).toBe(1);
  });
});

describe('initCloseGrid', () => {
  const trade = { id: 't1', direction: 'long' as const, entryPrice: 100, stopFollow: false };

  it('тейки — +1 % и +3 % от точки отсчёта, три ордера, без закреплений', () => {
    const d = initCloseGrid(trade, 1, 110, 0);
    expect(d.tradeId).toBe('t1');
    expect(d).toMatchObject({ qtyPins: {}, stopPins: {} });
    expect(d.first).toBeCloseTo(111.1, 10);
    expect(d.last).toBeCloseTo(113.3, 10);
    expect(d.count).toBe('3');
  });

  it('позиция в минусе — от входа, шорт — вниз, в экранных ценах', () => {
    const d = initCloseGrid({ ...trade, direction: 'short' }, 2, 210, 0);
    expect(d.first).toBeCloseTo(198, 10);
    expect(d.last).toBeCloseTo(194, 10);
  });

  it('перенос включён у позиции без лимитов закрытия и у той, где он уже стоит', () => {
    expect(initCloseGrid(trade, 1, 110, 0).stopFollow).toBe(true);
    expect(initCloseGrid(trade, 1, 110, 2).stopFollow).toBe(false);
    expect(initCloseGrid({ ...trade, stopFollow: true }, 1, 110, 2).stopFollow).toBe(true);
  });
});

describe('closeGridLevels', () => {
  const trade = { direction: 'long' as const, entryPrice: 100, stopLoss: 95, qty: 1, closedQty: 0.1 };
  const draft = { tradeId: 't1', first: 105, last: 115, count: '3', stopFollow: false, qtyPins: {}, stopPins: {} };

  it('линия на уровень, тянутся только первый и последний тейк', () => {
    const levels = closeGridLevels(trade, draft, 1);
    expect(levels.map((l) => l.price)).toEqual([105, 110, 115]);
    expect(levels.map((l) => l.kind)).toEqual(['gridTake', 'gridTake', 'gridTake']);
    expect(levels.map((l) => l.draggable)).toEqual([true, false, true]);
    expect(levels[0].id).toBe(CLOSE_GRID_FIRST_ID);
    expect(levels[2].id).toBe(CLOSE_GRID_LAST_ID);
  });

  it('объём — части остатка, результат — от входа позиции', () => {
    const levels = closeGridLevels(trade, draft, 2);
    expect(levels.reduce((s, l) => s + (l.qty ?? 0), 0)).toBeCloseTo(0.9, 10);
    expect(levels[0].impactAt?.(210)).toBeCloseTo(unrealizedPnl('long', 100, 105, 0.3), 10);
  });

  it('один ордер — одна линия, и она тянется', () => {
    const levels = closeGridLevels(trade, { ...draft, count: '1' }, 1);
    expect(levels).toHaveLength(1);
    expect(levels[0]).toMatchObject({ id: CLOSE_GRID_FIRST_ID, draggable: true, price: 105 });
  });

  it('недописанное число в поле — линий нет', () => {
    expect(closeGridLevels(trade, { ...draft, first: Number.NaN }, 1)).toEqual([]);
    expect(closeGridLevels(trade, { ...draft, last: 0 }, 1)).toEqual([]);
  });
});

describe('closeGridFromDraft', () => {
  const trade = { direction: 'long' as const, entryPrice: 100, stopLoss: 95, qty: 1, closedQty: 0 };

  it('закреплённая доля — в монетах от остатка, цель стопа — в настоящей цене, остальное посчитано', () => {
    const draft = { tradeId: 't1', first: 210, last: 230, count: '3', stopFollow: true, qtyPins: { 0: 50 }, stopPins: { 0: 202 } };
    const { prices, split, plan } = closeGridFromDraft(trade, draft, 2);
    expect(prices).toEqual([105, 110, 115]);
    expect(split.qtys).toEqual([0.5, 0.25, 0.25]);
    expect(plan.rows.map((r) => r.stopTarget)).toEqual([101, 105, null]);
  });
});
