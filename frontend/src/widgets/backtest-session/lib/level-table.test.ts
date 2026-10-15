import { describe, expect, it } from 'vitest';
import { entryGridTable, gridLevelQtys, gridRiskPcts, levelShares, stopAfterBlocks, distributionWeights } from './level-table';

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
    // Своя цель — у первой строки, у остальных — правило (полпути от стопа до последнего по исполнению уровня: 87,5).
    expect(t.stopsAfter).toEqual([88, 87.5, 87.5]);
    expect(t.rows[0].stopAfter).toBe(88);
    expect(t.rows[0].stopPinned).toBe(true);
    expect(t.rows[1].stopPinned).toBe(false);
    expect(t.blocked).toBe(false);
  });

  it('галочка включена, целей никто не вводил — цифры в каждой строке, по правилу', () => {
    const t = entryGridTable({
      prices: [100, 98, 96], direction: 'long', stop: 90, riskPct: 1, balance: 1000, qtyPins: {}, stopTargets: {}, stopFollow: true,
    });
    // От стопа 90 до последнего по исполнению уровня 96 — полпути: 93. Ниже всех уровней, выше стопа: уровни остаются исполнимыми.
    expect(t.rows.map((r) => r.stopAfter)).toEqual([93, 93, 93]);
    expect(t.rows.every((r) => !r.stopPinned)).toBe(true);
    expect(t.stopsAfter).toEqual([93, 93, 93]);
    expect(t.blocked).toBe(false);
  });

  it('шорт: правило идёт вниз от стопа к последнему по исполнению уровню', () => {
    const t = entryGridTable({
      prices: [100, 102, 104], direction: 'short', stop: 110, riskPct: 1, balance: 1000, qtyPins: {}, stopTargets: {}, stopFollow: true,
    });
    expect(t.rows.map((r) => r.stopAfter)).toEqual([107, 107, 107]);
    expect(t.blocked).toBe(false);
  });

  it('один уровень — тоже есть цифра: полпути до стопа', () => {
    const t = entryGridTable({
      prices: [100], direction: 'long', stop: 90, riskPct: 1, balance: 1000, qtyPins: {}, stopTargets: {}, stopFollow: true,
    });
    expect(t.rows[0].stopAfter).toBe(95);
  });

  it('без галочки цели стопа не уходят на сервер', () => {
    const t = entryGridTable({
      prices: [100, 95], direction: 'long', stop: 90, riskPct: 1, balance: 1000, qtyPins: {}, stopTargets: { 0: 92 }, stopFollow: false,
    });
    expect(t.stopsAfter).toBeUndefined();
    expect(t.rows.every((r) => r.stopAfter == null)).toBe(true);
  });
});

describe('распределение объёма по цене', () => {
  it('ползунок в нуле — веса равны, объёмы поровну', () => {
    expect(distributionWeights([1, 2, 3], 0)).toEqual([1, 1, 1]);
    expect(levelShares(4, {}, distributionWeights([1, 2, 3, 4], 0)).shares).toEqual([0.25, 0.25, 0.25, 0.25]);
  });

  it('к верху — верхние уровни тяжелее, к низу — нижние', () => {
    const up = levelShares(3, {}, distributionWeights([100, 110, 120], 80)).shares;
    expect(up[2]).toBeGreaterThan(up[1]);
    expect(up[1]).toBeGreaterThan(up[0]);
    const down = levelShares(3, {}, distributionWeights([100, 110, 120], -80)).shares;
    expect(down[0]).toBeGreaterThan(down[1]);
    expect(down[1]).toBeGreaterThan(down[2]);
  });

  it('доли с весами в сумме дают 1, закрепление держит своё, остаток делится по весам', () => {
    const { shares, pinned, over } = levelShares(3, { 0: 50 }, [1, 2, 3]);
    expect(pinned).toEqual([true, false, false]);
    expect(shares[0]).toBeCloseTo(0.5, 9);
    expect(shares[2] / shares[1]).toBeCloseTo(1.5, 9);
    expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
    expect(over).toBe(false);
  });

  it('таблица «Сетки» учитывает распределение: объём каждого ордера и сумма риска не меняются', () => {
    const base = { prices: [100, 110, 120], direction: 'long' as const, stop: 90, riskPct: 2, balance: 10_000, qtyPins: {}, stopTargets: {}, stopFollow: false };
    const even = entryGridTable(base);
    const up = entryGridTable({ ...base, tilt: 100 });
    // Верхний уровень (120) — первый в исполнении у лонга: объём к верху больше, чем у нижнего.
    expect(up.rows[0].qty).toBeGreaterThan(up.rows[2].qty);
    expect(even.rows[0].qty).toBeCloseTo(even.rows[2].qty, 9);
    const risk = (rows: typeof up.rows) => rows.reduce((a, r) => a + r.riskUsd, 0);
    expect(risk(up.rows)).toBeCloseTo(risk(even.rows), 6);
  });
});
