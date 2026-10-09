import { botGridError, botLevelOf, botPrices, botQty, botStep, levelRiskPct, splitAtPrice } from './bot-grid';

const g = { lower: 100, upper: 140, levels: 4, stopLoss: 90 };

describe('bot-grid', () => {
  it('уровни — низ и N−1 над ним с равным шагом; верхняя продажа на верхней границе', () => {
    expect(botStep(g)).toBe(10);
    expect(botPrices(g)).toEqual([100, 110, 120, 130]);
  });

  it('объём одинаковый: потеря при всех покупках и стопе — ровно риск', () => {
    const q = botQty(g, 1500, 2);
    const loss = botPrices(g).reduce((a, p) => a + q * (p - g.stopLoss), 0);
    expect(loss).toBeCloseTo(30, 9);
  });

  it('риск уровня даёт тот же объём, что и общий расчёт, а их сумма — общий риск', () => {
    const q = botQty(g, 1500, 2);
    for (const p of botPrices(g)) {
      const qty = (1500 * levelRiskPct(g, 2, p)) / 100 / (p - g.stopLoss);
      expect(qty).toBeCloseTo(q, 9);
    }
    const sum = botPrices(g).reduce((a, p) => a + levelRiskPct(g, 2, p), 0);
    expect(sum).toBeCloseTo(2, 9);
  });

  it('уровни на цене и выше — по рынку, ниже — лимитами', () => {
    expect(splitAtPrice([100, 110, 120, 130], 120)).toEqual({ market: [120, 130], limit: [100, 110] });
    expect(splitAtPrice([100, 110, 120, 130], 140)).toEqual({ market: [], limit: [100, 110, 120, 130] });
  });

  it('проверки', () => {
    expect(botGridError(g, 115)).toBeNull();
    expect(botGridError({ ...g, upper: 100 }, 100)).toBe('BACKTEST_BOT_RANGE');
    expect(botGridError({ ...g, stopLoss: 100 }, 115)).toBe('BACKTEST_BOT_STOP');
    expect(botGridError({ ...g, levels: 1 }, 115)).toBe('BACKTEST_BOT_LEVELS');
    expect(botGridError({ ...g, levels: 21 }, 115)).toBe('BACKTEST_BOT_LEVELS');
    expect(botGridError({ ...g, levels: 2.5 }, 115)).toBe('BACKTEST_BOT_LEVELS');
    expect(botGridError(g, 99)).toBe('BACKTEST_BOT_PRICE_OUTSIDE');
    expect(botGridError(g, 141)).toBe('BACKTEST_BOT_PRICE_OUTSIDE');
  });

  it('доли уровней: объём по долям, потеря при всех покупках и стопе — всё тот же риск', () => {
    const w = { ...g, shares: [0.1, 0.2, 0.3, 0.4] };
    const qs = botPrices(w).map((_, j) => botQty(w, 1500, 2, j));
    expect(qs[1] / qs[0]).toBeCloseTo(2, 9);
    expect(qs[3] / qs[0]).toBeCloseTo(4, 9);
    const loss = botPrices(w).reduce((a, p, j) => a + qs[j] * (p - w.stopLoss), 0);
    expect(loss).toBeCloseTo(30, 9);
    // Риск уровня даёт объём своего уровня, сумма рисков — общий риск.
    botPrices(w).forEach((p, j) => {
      expect((1500 * levelRiskPct(w, 2, p, j)) / 100 / (p - w.stopLoss)).toBeCloseTo(qs[j], 9);
    });
    expect(botPrices(w).reduce((a, p, j) => a + levelRiskPct(w, 2, p, j), 0)).toBeCloseTo(2, 9);
  });

  it('уровень по цене — ближайший, в пределах сетки', () => {
    expect(botLevelOf(g, 100)).toBe(0);
    expect(botLevelOf(g, 112)).toBe(1);
    expect(botLevelOf(g, 136)).toBe(3);
    expect(botLevelOf(g, 50)).toBe(0);
  });

  it('доли — по одной на уровень, положительные, в сумме 1', () => {
    expect(botGridError({ ...g, shares: [0.25, 0.25, 0.25, 0.25] }, 115)).toBeNull();
    expect(botGridError({ ...g, shares: [0.5, 0.5] }, 115)).toBe('BACKTEST_BOT_SHARES');
    expect(botGridError({ ...g, shares: [0.5, 0.5, 0, 0] }, 115)).toBe('BACKTEST_BOT_SHARES');
    expect(botGridError({ ...g, shares: [0.3, 0.3, 0.3, 0.3] }, 115)).toBe('BACKTEST_BOT_SHARES');
  });
});
