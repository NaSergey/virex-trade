import { describe, expect, it } from 'vitest';
import { checkLevels, formatR, fromScreen, levelSliderRange, previewSize, riskAmount, toInput, toScreen, unrealizedPnl } from './money';

describe('previewSize', () => {
  it('риск, размер, номинал и плечо', () => {
    expect(previewSize(10_000, 1, 100, 98)).toEqual({ riskUsdt: 100, qty: 50, notional: 5000, leverage: 0.5 });
  });

  it('стоп на цене входа — размера нет', () => {
    expect(previewSize(10_000, 1, 100, 100)).toBeNull();
  });
});

describe('unrealizedPnl', () => {
  it('с обеими комиссиями, как посчитает сервер при закрытии', () => {
    expect(unrealizedPnl('long', 100, 104, 50)).toBeCloseTo(194.39, 6);
    expect(unrealizedPnl('short', 100, 98, 50)).toBeCloseTo(94.555, 6);
  });
});

describe('масштаб скрытой цены', () => {
  it('туда и обратно без потери точности', () => {
    const scale = 523.7 / 63_512.37;
    for (const p of [63_512.37, 17_234.5, 3_101.01]) {
      expect(Math.abs(fromScreen(toScreen(p, scale), scale) - p) / p).toBeLessThanOrEqual(1e-9);
    }
  });
});

describe('formatR и toInput', () => {
  it('R со знаком', () => {
    expect(formatR(1.9439)).toBe('+1.94R');
    expect(formatR(-1.05445)).toBe('−1.05R');
  });

  it('поле ввода без хвоста из пятнадцати знаков', () => {
    expect(toInput(0.1 + 0.2)).toBe('0.3');
    expect(toInput(523.456789123)).toBe('523.45679');
  });
});

describe('checkLevels', () => {
  it('стоп обязателен', () => {
    expect(checkLevels('long', 100, NaN, null)).toBe('stopRequired');
  });

  it('стоп лонга ниже цены, тейк выше', () => {
    expect(checkLevels('long', 100, 98, 105)).toBeNull();
    expect(checkLevels('long', 100, 100, null)).toBe('stopSide');
    expect(checkLevels('long', 100, 98, 99)).toBe('takeSide');
  });

  it('шорт зеркально', () => {
    expect(checkLevels('short', 100, 102, 95)).toBeNull();
    expect(checkLevels('short', 100, 99, null)).toBe('stopSide');
  });

  it('без тейка при верном стопе — ошибок нет', () => {
    expect(checkLevels('long', 100, 98, null)).toBeNull();
    expect(checkLevels('short', 100, 102, null)).toBeNull();
  });
});

describe('riskAmount', () => {
  it('процент от депозита, не зависит от стопа', () => {
    expect(riskAmount(10_000, 1)).toBe(100);
  });

  it('без депозита или без риска — числа нет', () => {
    expect(riskAmount(0, 1)).toBeNull();
    expect(riskAmount(10_000, 0)).toBeNull();
    expect(riskAmount(10_000, NaN)).toBeNull();
  });
});

describe('levelSliderRange', () => {
  it('направление ещё не выбрано — симметрично вокруг цены', () => {
    expect(levelSliderRange('stop', 100, null)).toEqual({ min: 80, max: 120 });
    expect(levelSliderRange('take', 100, null)).toEqual({ min: 80, max: 120 });
  });

  it('лонг: стоп снизу, тейк сверху', () => {
    expect(levelSliderRange('stop', 100, 'long')).toEqual({ min: 80, max: 100 });
    expect(levelSliderRange('take', 100, 'long')).toEqual({ min: 100, max: 120 });
  });

  it('шорт — зеркально', () => {
    expect(levelSliderRange('stop', 100, 'short')).toEqual({ min: 100, max: 120 });
    expect(levelSliderRange('take', 100, 'short')).toEqual({ min: 80, max: 100 });
  });
});
