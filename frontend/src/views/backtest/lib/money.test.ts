import { describe, expect, it } from 'vitest';
import {
  applyStopChange,
  averageIn,
  checkLevels,
  formatR,
  fromScreen,
  impliedDirection,
  levelImpact,
  levelSliderRange,
  liquidationPrice,
  previewSize,
  riskAmount,
  signedPctFromStop,
  stopFromSignedPct,
  toInput,
  toInputPrice,
  toScreen,
  unrealizedPnl,
} from './money';

describe('previewSize', () => {
  it('риск, размер, номинал и маржа', () => {
    expect(previewSize(10_000, 1, 100, 98, 10, 'long')).toEqual({
      riskUsdt: 100,
      qty: 50,
      notional: 5000,
      margin: 500,
      liqPrice: 90,
    });
  });

  it('стоп на цене входа — размера нет', () => {
    expect(previewSize(10_000, 1, 100, 100, 10, 'long')).toBeNull();
  });
});

describe('liquidationPrice', () => {
  it('лонг — ниже входа на 1/leverage', () => {
    expect(liquidationPrice('long', 100, 10)).toBeCloseTo(90, 9);
    expect(liquidationPrice('long', 100, 100)).toBeCloseTo(99, 9);
  });

  it('шорт — выше входа на 1/leverage', () => {
    expect(liquidationPrice('short', 100, 10)).toBeCloseTo(110, 9);
  });
});

describe('averageIn', () => {
  it('средневзвешенная цена по объёму', () => {
    expect(averageIn(10, 100, 10, 120)).toBeCloseTo(110, 9);
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

  it('цена стопа/тейка округляется до десятых', () => {
    expect(toInputPrice(53233.14)).toBe('53233.1');
    expect(toInputPrice(97)).toBe('97.0');
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

describe('stopFromSignedPct / signedPctFromStop', () => {
  it('вправо (плюс) — лонг, стоп ниже цены', () => {
    expect(stopFromSignedPct(3, 100)).toBe(97);
  });

  it('влево (минус) — шорт, стоп выше цены', () => {
    expect(stopFromSignedPct(-3, 100)).toBe(103);
  });

  it('центр — стоп на самой цене', () => {
    expect(stopFromSignedPct(0, 100)).toBe(100);
  });

  it('туда и обратно', () => {
    expect(signedPctFromStop(97, 100)).toBeCloseTo(3, 6);
    expect(signedPctFromStop(103, 100)).toBeCloseTo(-3, 6);
  });
});

describe('impliedDirection', () => {
  it('открытая сделка решает сама, что бы ни было набрано в полях', () => {
    expect(impliedDirection('short', 105, 90, 100)).toBe('short');
  });

  it('стоп ниже цены — лонг, стоп выше — шорт', () => {
    expect(impliedDirection(null, 98, null, 100)).toBe('long');
    expect(impliedDirection(null, 102, null, 100)).toBe('short');
  });

  it('стопа ещё нет — решает тейк', () => {
    expect(impliedDirection(null, NaN, 105, 100)).toBe('long');
    expect(impliedDirection(null, NaN, 95, 100)).toBe('short');
  });

  it('стоп в приоритете перед тейком, даже если тейк на другую сторону указывает', () => {
    expect(impliedDirection(null, 98, 95, 100)).toBe('long');
  });

  it('ничего не набрано — направления нет', () => {
    expect(impliedDirection(null, NaN, null, 100)).toBeNull();
  });
});

describe('applyStopChange', () => {
  it('стоп меняет сторону — тейк зеркалится через цену', () => {
    // Было: лонг (стоп 98, тейк 110). Новый стоп — 103 (выше цены, шорт).
    const result = applyStopChange({ stop: '98', take: '110' }, 103, 100, null);
    expect(result.stop).toBe('103.0');
    expect(Number(result.take)).toBeCloseTo(90, 6); // 2*100 - 110
  });

  it('сторона не поменялась — тейк не трогаем', () => {
    const result = applyStopChange({ stop: '98', take: '110' }, 97, 100, null);
    expect(result.stop).toBe('97.0');
    expect(result.take).toBe('110');
  });

  it('тейка ещё нет — мирроить нечего', () => {
    const result = applyStopChange({ stop: '98', take: '' }, 103, 100, null);
    expect(result.stop).toBe('103.0');
    expect(result.take).toBe('');
  });

  it('открытая сделка — направление её, не стопа', () => {
    // Стоп двигается в пределах той же (открытой) стороны — тейк не зеркалится,
    // даже если голый расчёт по цене показал бы смену стороны.
    const result = applyStopChange({ stop: '98', take: '110' }, 99, 100, 'long');
    expect(result.take).toBe('110');
  });
});

describe('levelSliderRange', () => {
  it('направление ещё не выбрано — симметрично вокруг цены, стоп уже тейка', () => {
    expect(levelSliderRange('stop', 100, null)).toEqual({ min: 93, max: 107 });
    expect(levelSliderRange('take', 100, null)).toEqual({ min: 80, max: 120 });
  });

  it('лонг: стоп снизу (±7%), тейк сверху (±20%)', () => {
    expect(levelSliderRange('stop', 100, 'long')).toEqual({ min: 93, max: 100 });
    expect(levelSliderRange('take', 100, 'long')).toEqual({ min: 100, max: 120 });
  });

  it('шорт — зеркально', () => {
    expect(levelSliderRange('stop', 100, 'short')).toEqual({ min: 100, max: 107 });
    expect(levelSliderRange('take', 100, 'short')).toEqual({ min: 80, max: 100 });
  });
});

describe('levelImpact', () => {
  it('лонг, стоп ниже цены — убыток и отрицательный процент', () => {
    const { pct, usdt } = levelImpact('long', 100, 98, 50);
    expect(pct).toBeCloseTo(-2, 6);
    expect(usdt).toBeCloseTo(-105.445, 6);
  });

  it('шорт, стоп выше цены — тот же убыток, знак процента положительный (цена выросла)', () => {
    const { pct, usdt } = levelImpact('short', 100, 102, 50);
    expect(pct).toBeCloseTo(2, 6);
    expect(usdt).toBeLessThan(0);
  });

  it('движение в плюс дороги — положительный результат', () => {
    const { pct, usdt } = levelImpact('long', 100, 105, 50);
    expect(pct).toBeCloseTo(5, 6);
    expect(usdt).toBeGreaterThan(0);
  });
});
