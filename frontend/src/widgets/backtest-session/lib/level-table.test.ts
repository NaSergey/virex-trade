import { describe, expect, it } from 'vitest';
import { entryGridTable, gridLevelQtys, gridRiskPcts, levelShares, stopAfterBlocks } from './level-table';

describe('levelShares', () => {
  it('без закреплений — поровну', () => {
    expect(levelShares(4, {}).shares).toEqual([0.25, 0.25, 0.25, 0.25]);
  });

  it('закреплённые держат свою долю, остальные делят остаток', () => {
    const { shares, pinned, over } = levelShares(3, { 0: 50 });
    expect(shares[0]).toBeCloseTo(0.5, 12);
    expect(shares[1]).toBeCloseTo(0.25, 12);
    expect(shares[2]).toBeCloseTo(0.25, 12);
    expect(pinned).toEqual([true, false, false]);
    expect(over).toBe(false);
  });

  it('закреплённые вместе больше 100 % — перебор', () => {
    expect(levelShares(2, { 0: 70, 1: 40 }).over).toBe(true);
  });

  it('закреплённые ровно 100 % при свободном уровне — перебор: ему не осталось объёма', () => {
    expect(levelShares(3, { 0: 60, 1: 40 }).over).toBe(true);
  });
});

describe('gridLevelQtys / gridRiskPcts', () => {
  // Лонг-сетка 100 и 95, стоп 90: до стопа 10 и 5.
  const prices = [100, 95];

  it('объём по долям, а потеря при всех исполнениях и стопе — ровно риск', () => {
    const qtys = gridLevelQtys(prices, 90, 30, [0.5, 0.5]);
    expect(qtys[0]).toBeCloseTo(qtys[1], 12);
    expect(qtys[0] * 10 + qtys[1] * 5).toBeCloseTo(30, 9);
  });

  it('риск уровня в процентах даёт его объём на сервере и в сумме — общий риск', () => {
    const shares = [0.25, 0.75];
    const pcts = gridRiskPcts(prices, 90, 2, shares);
    expect(pcts[0] + pcts[1]).toBeCloseTo(2, 12);
    const qtys = gridLevelQtys(prices, 90, (10_000 * 2) / 100, shares);
    // Сервер: объём = депозит · риск / |цена − стоп|.
    expect((10_000 * pcts[0]) / 100 / 10).toBeCloseTo(qtys[0], 9);
    expect((10_000 * pcts[1]) / 100 / 5).toBeCloseTo(qtys[1], 9);
  });
});

describe('stopAfterBlocks', () => {
  it('лонг: цель стопа после уровня не должна доставать до уровней, исполняющихся позже (ниже)', () => {
    // Порядок исполнения лонг-сетки — сверху вниз: 100, 95, 90.
    expect(stopAfterBlocks('long', [100, 95, 90], [89, 0, 0])).toEqual([false, false, false]);
    // 94 — выше нижнего уровня 90: тот уже не исполнится.
    expect(stopAfterBlocks('long', [100, 95, 90], [94, 0, 0])).toEqual([true, false, false]);
    expect(stopAfterBlocks('long', [100, 95, 90], [0, 91, 0])).toEqual([false, true, false]);
  });

  it('цель на цене своего уровня или за ней — не встанет, даже у последнего', () => {
    expect(stopAfterBlocks('long', [100, 95, 90], [0, 0, 90])).toEqual([false, false, true]);
    expect(stopAfterBlocks('short', [100, 105], [0, 104])).toEqual([false, true]);
  });

  it('шорт: зеркально — уровни выше исполняются позже', () => {
    expect(stopAfterBlocks('short', [100, 105, 110], [104, 0, 0])).toEqual([true, false, false]);
    expect(stopAfterBlocks('short', [100, 105, 110], [111, 0, 0])).toEqual([false, false, false]);
  });
});

describe('entryGridTable', () => {
  it('лонг: строки сверху вниз, риск уровней в сумме — общий, цель стопа — по строке', () => {
    const t = entryGridTable({
      prices: [90, 100, 95],
      direction: 'long',
      stop: 85,
      riskPct: 2,
      balance: 10_000,
      qtyPins: {},
      stopTargets: { 0: 88 },
      stopFollow: true,
    });
    expect(t.prices).toEqual([100, 95, 90]);
    expect(t.riskPcts.reduce((x, y) => x + y, 0)).toBeCloseTo(2, 12);
    expect(t.rows.reduce((x, r) => x + r.riskUsd, 0)).toBeCloseTo(200, 9);
    expect(t.stopsAfter).toEqual([88, 0, 0]);
    expect(t.rows[0].stopAfter).toBe(88);
    expect(t.blocked).toBe(false);
  });

  it('без галочки цели стопа не уходят на сервер', () => {
    const t = entryGridTable({
      prices: [100, 95], direction: 'long', stop: 90, riskPct: 1, balance: 1000, qtyPins: {}, stopTargets: { 0: 92 }, stopFollow: false,
    });
    expect(t.stopsAfter).toBeUndefined();
    expect(t.rows.every((r) => r.stopAfter == null)).toBe(true);
  });
});
