import {
  averageIn,
  DAY_MS,
  maxDrawdownPct,
  pickPriceScale,
  pickStart,
  positionSize,
  startWindow,
  stopOnRightSide,
  summarize,
  takeOnRightSide,
  tradeResult,
} from './backtest-math';

const T0 = Date.UTC(2018, 0, 1);

describe('positionSize', () => {
  it('считает риск в USDT и размер от расстояния до стопа', () => {
    expect(positionSize(10_000, 1, 100, 98)).toEqual({ riskUsdt: 100, qty: 50 });
  });

  it('одинаков для лонга и шорта — важно только расстояние', () => {
    expect(positionSize(10_000, 1, 100, 102)).toEqual({ riskUsdt: 100, qty: 50 });
  });
});

describe('tradeResult', () => {
  it('лонг в плюс: PnL после комиссии и R', () => {
    const r = tradeResult({ direction: 'long', entryPrice: 100, exitPrice: 104, qty: 50, riskUsdt: 100 });
    expect(r.fee).toBeCloseTo(5.61, 6); // (100 + 104) × 50 × 0.00055
    expect(r.pnl).toBeCloseTo(194.39, 6);
    expect(r.r).toBeCloseTo(1.9439, 6);
  });

  it('шорт в плюс, когда цена падает', () => {
    const r = tradeResult({ direction: 'short', entryPrice: 100, exitPrice: 98, qty: 50, riskUsdt: 100 });
    expect(r.pnl).toBeCloseTo(94.555, 6);
  });

  // Комиссия — правда о торговле: полный стоп стоит чуть больше одного риска.
  it('стоп даёт чуть хуже −1R из-за комиссии', () => {
    const r = tradeResult({ direction: 'long', entryPrice: 100, exitPrice: 98, qty: 50, riskUsdt: 100 });
    expect(r.r).toBeCloseTo(-1.05445, 6);
    expect(r.r).toBeLessThan(-1);
  });
});

describe('стороны уровней', () => {
  it('стоп лонга ниже входа, шорта — выше', () => {
    expect(stopOnRightSide('long', 100, 98)).toBe(true);
    expect(stopOnRightSide('long', 100, 101)).toBe(false);
    expect(stopOnRightSide('short', 100, 102)).toBe(true);
    expect(stopOnRightSide('short', 100, 100)).toBe(false);
  });

  it('тейк лонга выше входа, шорта — ниже', () => {
    expect(takeOnRightSide('long', 100, 105)).toBe(true);
    expect(takeOnRightSide('short', 100, 105)).toBe(false);
    expect(takeOnRightSide('short', 100, 95)).toBe(true);
  });
});

describe('startWindow', () => {
  const span = (from: number, to: number) => ({ from: new Date(from), to: new Date(to) });

  it('берёт позднее из двух ограничений снизу и отступает 30 дней от конца минуток', () => {
    const win = startWindow(span(T0, T0 + 3000 * DAY_MS), span(T0, T0 + 3000 * DAY_MS));
    expect(win).toEqual({ from: T0 + 200 * DAY_MS, to: T0 + 2970 * DAY_MS });
  });

  it('если минутки начинаются позже дневок — от начала минуток плюс сутки', () => {
    const minuteFrom = T0 + 1000 * DAY_MS;
    const win = startWindow(span(T0, T0 + 3000 * DAY_MS), span(minuteFrom, T0 + 3000 * DAY_MS));
    expect(win?.from).toBe(minuteFrom + DAY_MS);
  });

  it('нет окна, если минутной истории мало', () => {
    expect(startWindow(span(T0, T0 + 3000 * DAY_MS), span(T0, T0 + 100 * DAY_MS))).toBeNull();
  });

  it('нет окна, если какой-то истории нет вовсе', () => {
    expect(startWindow(span(T0, T0 + DAY_MS), undefined)).toBeNull();
    expect(startWindow(undefined, span(T0, T0 + DAY_MS))).toBeNull();
    expect(startWindow({ from: null, to: null }, span(T0, T0 + 3000 * DAY_MS))).toBeNull();
  });
});

describe('pickStart', () => {
  const win = { from: T0 + 200 * DAY_MS, to: T0 + 2970 * DAY_MS };

  it('на нуле — начало окна', () => {
    expect(pickStart(win, () => 0)).toBe(win.from);
  });

  it('всегда в окне и выровнен на минуту', () => {
    const t = pickStart(win, () => 0.999999);
    expect(t).toBeLessThanOrEqual(win.to);
    expect(t).toBeGreaterThanOrEqual(win.from);
    expect(t % 60_000).toBe(0);
  });
});

describe('pickPriceScale', () => {
  it('переводит стартовую цену в диапазон 100–1000', () => {
    expect(pickPriceScale(50_000, () => 0) * 50_000).toBeCloseTo(100, 9);
    expect(pickPriceScale(50_000, () => 1) * 50_000).toBeCloseTo(1000, 9);
  });
});

describe('summarize', () => {
  it('ноль в PnL — не выигрыш', () => {
    const s = summarize([
      { pnl: 10, r: 1 },
      { pnl: -5, r: -0.5 },
      { pnl: 0, r: 0 },
    ]);
    expect(s.trades).toBe(3);
    expect(s.wins).toBe(1);
    expect(s.winRate).toBeCloseTo(33.3333, 3);
    expect(s.totalR).toBeCloseTo(0.5, 9);
    expect(s.avgR).toBeCloseTo(0.16667, 4);
    expect(s.pnl).toBe(5);
  });

  it('пустой список — нули, а не NaN', () => {
    expect(summarize([])).toEqual({ trades: 0, wins: 0, winRate: 0, totalR: 0, avgR: 0, pnl: 0 });
  });
});

describe('maxDrawdownPct', () => {
  it('считает просадку от пика, а не от старта', () => {
    // 1000 → 1100 (пик) → 880 (−20% от пика) → 930
    expect(maxDrawdownPct(1000, [100, -220, 50])).toBeCloseTo(20, 9);
  });

  it('без убытков — ноль', () => {
    expect(maxDrawdownPct(1000, [10, 20])).toBe(0);
  });
});

describe('averageIn', () => {
  it('средневзвешенная цена по объёму', () => {
    expect(averageIn(10, 100, 10, 120)).toBeCloseTo(110, 9);
  });

  it('разные объёмы — вес больше у большего', () => {
    expect(averageIn(30, 100, 10, 140)).toBeCloseTo(110, 9);
  });
});
