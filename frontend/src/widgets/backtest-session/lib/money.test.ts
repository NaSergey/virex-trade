import { describe, expect, it } from 'vitest';
import {
  applyEntryChange,
  applyStopChange,
  averageIn,
  checkEntrySide,
  checkLevels,
  curvedSliderPos,
  curvedSliderValue,
  draftTakeFits,
  formatR,
  fromScreen,
  impliedDirection,
  levelDirection,
  levelImpact,
  levelSliderRange,
  liquidationPrice,
  previewSize,
  riskAmount,
  signedPctFromStop,
  stopFromSignedPct,
  STOP_RISK_PCT,
  toInput,
  toInputPrice,
  toScreen,
  unrealizedPnl,
  withoutLockedLevels,
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

  it('цена стопа/тейка округляется до шести значащих цифр', () => {
    // Настоящая цена BTC — те же «до десятых», что и раньше.
    expect(toInputPrice(53233.14)).toBe('53233.1');
    expect(toInputPrice(97)).toBe('97.0000');
    // Скрытая цена (режим hidePrice, priceScale сжимает её в 100–1000) — точнее,
    // иначе ползунок стопа/тейка теряет направление рядом с нулём (см. ниже).
    expect(toInputPrice(313.55555)).toBe('313.556');
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

describe('checkEntrySide', () => {
  // Баг: сетка лонга с верхом выше цены и низом ниже неё отправлялась как есть —
  // checkGridLevels сверяет со стоп/тейком, но не сами уровни с ценой.
  it('лонг — все уровни ниже цены', () => {
    expect(checkEntrySide('long', [98, 96, 94], 100)).toBeNull();
  });

  it('сетка по обе стороны цены не годится ни лонгу, ни шорту', () => {
    expect(checkEntrySide('long', [104, 100.5, 97], 100)).toBe('entrySide');
    expect(checkEntrySide('short', [104, 100.5, 97], 100)).toBe('entrySide');
  });

  it('шорт — все уровни выше цены', () => {
    expect(checkEntrySide('short', [102, 104, 106], 100)).toBeNull();
    expect(checkEntrySide('short', [98, 102], 100)).toBe('entrySide');
  });

  it('уровень ровно на цене — это уже рынок, а не отложенный ордер', () => {
    expect(checkEntrySide('long', [100, 98], 100)).toBe('entrySide');
    expect(checkEntrySide('short', [100, 102], 100)).toBe('entrySide');
  });

  it('одиночный ордер — тот же случай сетки из одного уровня', () => {
    expect(checkEntrySide('long', [105], 100)).toBe('entrySide');
    expect(checkEntrySide('long', [95], 100)).toBeNull();
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

describe('draftTakeFits', () => {
  it('стопа нет — сторону задаёт сам тейк, подходит любой', () => {
    expect(draftTakeFits(0, 95, 100)).toBe(true);
    expect(draftTakeFits(NaN, 105, 100)).toBe(true);
  });

  it('стоп ниже цены (лонг) — тейк только выше цены', () => {
    expect(draftTakeFits(98, 105, 100)).toBe(true);
    expect(draftTakeFits(98, 99, 100)).toBe(false);
    expect(draftTakeFits(98, 100, 100)).toBe(false);
  });

  it('стоп выше цены (шорт) — тейк только ниже цены', () => {
    expect(draftTakeFits(102, 95, 100)).toBe(true);
    expect(draftTakeFits(102, 101, 100)).toBe(false);
  });

  it('цена ушла за тейк — тот же черновик перестаёт подходить без единой правки', () => {
    expect(draftTakeFits(98, 105, 100)).toBe(true);
    expect(draftTakeFits(98, 105, 106)).toBe(false);
  });
});

describe('applyStopChange', () => {
  it('стоп меняет сторону — тейк зеркалится через цену', () => {
    // Было: лонг (стоп 98, тейк 110). Новый стоп — 103 (выше цены, шорт).
    const result = applyStopChange({ stop: '98', take: '110' }, '103.0', 100, null);
    expect(result.stop).toBe('103.0');
    expect(Number(result.take)).toBeCloseTo(90, 6); // 2*100 - 110
  });

  it('сторона не поменялась — тейк не трогаем', () => {
    const result = applyStopChange({ stop: '98', take: '110' }, '97.0', 100, null);
    expect(result.stop).toBe('97.0');
    expect(result.take).toBe('110');
  });

  it('тейка ещё нет — мирроить нечего', () => {
    const result = applyStopChange({ stop: '98', take: '' }, '103.0', 100, null);
    expect(result.stop).toBe('103.0');
    expect(result.take).toBe('');
  });

  it('открытая сделка — направление её, не стопа', () => {
    // Стоп двигается в пределах той же (открытой) стороны — тейк не зеркалится,
    // даже если голый расчёт по цене показал бы смену стороны.
    const result = applyStopChange({ stop: '98', take: '110' }, '99.0', 100, 'long');
    expect(result.take).toBe('110');
  });

  it('тейк уже по одну сторону со стопом — переброс стопа его за собой не тянет', () => {
    // Цена ушла за тейк: стоп 98 и тейк 97 оба ниже цены 100. Стоп перебросили выше —
    // тейк 97 теперь как раз верный для шорта, зеркалить его обратно на сторону стопа нельзя.
    const result = applyStopChange({ stop: '98', take: '97' }, '103.0', 100, null);
    expect(result.stop).toBe('103.0');
    expect(result.take).toBe('97');
  });

  it('сторону решает ровно то, что ляжет в черновик', () => {
    // Цена 500000.8 (шесть разрядов — toInputPrice округляет тут до целого). Сырое
    // 500000.6 ниже цены (лонг, тейк 500002 верный), но в черновик ляжет «500001» —
    // это уже выше цены (шорт), и тейк 500002 для шорта неверный, зеркалится.
    const price = 500000.8;
    expect(toInputPrice(500000.6)).toBe('500001');
    const rounded = applyStopChange({ stop: '499999', take: '500002' }, toInputPrice(500000.6), price, null);
    expect(rounded.take).toBe(toInputPrice(2 * price - 500002)); // 499999.6 → «500000»
    // То же сырое число, напечатанное руками (без toInputPrice) — сторона не
    // меняется, зеркалить нечего.
    const raw = applyStopChange({ stop: '499999', take: '500002' }, '500000.6', price, null);
    expect(raw.take).toBe('500002');
  });

  it('из согласованного черновика любой новый стоп даёт согласованный', () => {
    for (const price of [100, 523.37, 31_500.43]) {
      const stops = ['', toInputPrice(price * 0.98), toInputPrice(price * 1.02)];
      const takes = [0.95, 0.99, 1.01, 1.05].map((k) => toInputPrice(price * k));
      const nextStops = [-5, -1, -0.05, -0.01, 0, 0.01, 0.05, 1, 5].map((pct) => toInputPrice(price * (1 + pct / 100)));
      for (const stop of stops) {
        for (const take of takes) {
          if (!draftTakeFits(Number(stop), Number(take), price)) continue;
          for (const next of nextStops) {
            const r = applyStopChange({ stop, take }, next, price, null);
            expect(draftTakeFits(Number(r.stop), Number(r.take), price), `${price} ${stop}/${take} → ${next}`).toBe(true);
          }
        }
      }
    }
  });
});

describe('applyEntryChange', () => {
  it('вход двинулся глубже в ту же сторону — стоп и тейк переезжают вслед, сохраняя % от входа', () => {
    // Вход не трогали (пусто → якорь это цена 100), стоп 98 (лонг, −2%), тейк 104 (+4%).
    const result = applyEntryChange({ entry: '', stop: '98', take: '104' }, '90', 100);
    expect(result.entry).toBe('90');
    expect(Number(result.stop)).toBeCloseTo(88.2, 6); // 90 × 0.98
    expect(Number(result.take)).toBeCloseTo(93.6, 6); // 90 × 1.04
  });

  it('вход перепрыгнул через цену — сторона стопа переворачивается, а дистанция сохраняется', () => {
    // Было: вход 90 (лонг), стоп 88.2 (−2% от входа). Новый вход 110 — уже выше цены 100, шорт.
    const result = applyEntryChange({ entry: '90', stop: '88.2', take: '' }, '110', 100);
    expect(Number(result.stop)).toBeCloseTo(112.2, 6); // 110 × 1.02 — та же дистанция, но выше входа
  });

  it('стоп и тейк ещё не трогали — перенос входа их не касается', () => {
    const result = applyEntryChange({ entry: '95', stop: '', take: '' }, '80', 100);
    expect(result.stop).toBe('');
    expect(result.take).toBe('');
  });

  it('вход стёрли — стороны решить нечем, стоп и тейк остаются как были', () => {
    const result = applyEntryChange({ entry: '90', stop: '88', take: '92' }, '', 100);
    expect(result.entry).toBe('');
    expect(result.stop).toBe('88');
    expect(result.take).toBe('92');
  });
});

function expectRangeCloseTo(range: { min: number; max: number }, min: number, max: number) {
  expect(range.min).toBeCloseTo(min, 9);
  expect(range.max).toBeCloseTo(max, 9);
}

describe('levelSliderRange', () => {
  it('направление ещё не выбрано — симметрично вокруг цены, стоп уже тейка', () => {
    expectRangeCloseTo(levelSliderRange('stop', 100, null), 93, 107);
    expectRangeCloseTo(levelSliderRange('take', 100, null), 90, 110);
  });

  it('лонг: стоп снизу (±7%), тейк сверху (±10%)', () => {
    expectRangeCloseTo(levelSliderRange('stop', 100, 'long'), 93, 100);
    expectRangeCloseTo(levelSliderRange('take', 100, 'long'), 100, 110);
  });

  it('шорт — зеркально', () => {
    expectRangeCloseTo(levelSliderRange('stop', 100, 'short'), 100, 107);
    expectRangeCloseTo(levelSliderRange('take', 100, 'short'), 90, 100);
  });
});

describe('curvedSliderPos / curvedSliderValue', () => {
  it('нуль — позиция 0, независимо от того, край это или середина диапазона', () => {
    expect(curvedSliderPos(0, 0, 10, 0)).toBe(0);
    expect(curvedSliderPos(100, 90, 110, 100)).toBe(0);
  });

  it('край диапазона — позиция ±100', () => {
    expect(curvedSliderPos(10, 0, 10, 0)).toBeCloseTo(100, 9);
    expect(curvedSliderPos(-7, -7, 7, 0)).toBeCloseTo(-100, 9);
    expect(curvedSliderPos(110, 90, 110, 100)).toBeCloseTo(100, 9);
    expect(curvedSliderPos(90, 90, 110, 100)).toBeCloseTo(-100, 9);
  });

  it('дуга: полпути по позиции — четверть пути по значению (curve=2)', () => {
    expect(curvedSliderPos(2.5, 0, 10, 0)).toBeCloseTo(50, 9);
    expect(curvedSliderValue(50, 0, 10, 0)).toBeCloseTo(2.5, 9);
  });

  it('туда и обратно на асимметричном диапазоне (зеркалит levelSliderRange для шорта)', () => {
    const [min, max, zero] = [90, 100, 100];
    for (const pos of [-100, -75, -50, -25, 0]) {
      expect(curvedSliderPos(curvedSliderValue(pos, min, max, zero), min, max, zero)).toBeCloseTo(pos, 6);
    }
  });

  it('регресс: на скрытой цене (100–1000) ползунок стопа не залипает у нуля', () => {
    // Баг: toInputPrice округлял цену до фиксированной десятой. У обычной цены BTC
    // (десятки тысяч) это меньше самого мелкого шага дуги и незаметно, но у скрытой
    // цены (priceScale сжимает её в 100–1000, см. backend pickPriceScale) то же
    // движение ползунка рядом с нулём даёт сдвиг цены меньше 0.05 — округление
    // возвращало точно ту же цену, позиция на следующий кадр снова падала в 0, и
    // ползунок не двигался с места, сколько его ни тяни.
    for (const price of [100, 313.7, 999]) {
      for (const pos of [1, 2, 4, 8]) {
        const pct = curvedSliderValue(pos, -STOP_RISK_PCT, STOP_RISK_PCT, 0);
        const stopPrice = Number(toInputPrice(stopFromSignedPct(pct, price)));
        expect(stopPrice, `price=${price} pos=${pos}`).not.toBe(price);
      }
    }
  });

  it('вырожденный диапазон (граница совпадает с нулём) не даёт NaN/Infinity', () => {
    expect(curvedSliderPos(5, 0, 0, 0)).toBe(0);
    expect(curvedSliderValue(50, 0, 0, 0)).toBe(0);
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

describe('levelDirection', () => {
  it('стоп ниже цены и тейк выше — лонг, наоборот — шорт', () => {
    expect(levelDirection('stop', 95, 100)).toBe('long');
    expect(levelDirection('stop', 105, 100)).toBe('short');
    expect(levelDirection('take', 110, 100)).toBe('long');
    expect(levelDirection('take', 90, 100)).toBe('short');
  });
});

/**
 * По стороне с открытой позицией «Лонг/Шорт» доливает её по стопу позиции, и
 * стоп с тейком черновика для этой стороны были бы ничьими.
 */
describe('withoutLockedLevels', () => {
  const d = (stop: string, take: string) => ({ risk: '1', stop, take, leverage: '1' });

  it('без открытых позиций — тот же объект', () => {
    const draft = d('95', '110');
    expect(withoutLockedLevels(draft, 100, [])).toBe(draft);
  });

  it('открыт лонг — стоп и тейк лонга сняты, шорта остаются', () => {
    expect(withoutLockedLevels(d('95', '110'), 100, ['long'])).toEqual(d('', ''));
    const short = d('105', '90');
    expect(withoutLockedLevels(short, 100, ['long'])).toBe(short);
  });

  it('открыт шорт — зеркально', () => {
    expect(withoutLockedLevels(d('105', '90'), 100, ['short'])).toEqual(d('', ''));
    const long = d('95', '110');
    expect(withoutLockedLevels(long, 100, ['short'])).toBe(long);
  });

  it('открыты обе стороны — уровней нет вовсе', () => {
    expect(withoutLockedLevels(d('95', '90'), 100, ['long', 'short'])).toEqual(d('', ''));
  });
});
