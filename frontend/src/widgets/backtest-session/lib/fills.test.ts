import { describe, expect, it } from 'vitest';
import { MINUTE, type Candle } from './candles';
import { checkMinute, findExit, isPartialExit, type Position } from './fills';

const T = Date.UTC(2024, 2, 5, 12, 0);
const m = (o: number, h: number, l: number, c: number, t = T): Candle => ({ t, o, h, l, c });
const LONG: Position = { direction: 'long', stopLoss: 98, takeProfit: 105 };
const SHORT: Position = { direction: 'short', stopLoss: 102, takeProfit: 95 };

describe('checkMinute', () => {
  it('касание стопа лонга — по стопу, в закрытие минутки', () => {
    expect(checkMinute(LONG, m(100, 101, 97.5, 99))).toEqual({ reason: 'stop', price: 98, time: T + MINUTE });
  });

  it('стоп ровно на минимуме — сработал', () => {
    expect(checkMinute(LONG, m(100, 101, 98, 99))?.reason).toBe('stop');
  });

  // Как на бирже: при гэпе стоп исполняется хуже заявленного.
  it('гэп за стопом — по цене открытия', () => {
    expect(checkMinute(LONG, m(97, 97.5, 96, 96.5))).toMatchObject({ reason: 'stop', price: 97 });
  });

  // Лучше заявленного тейк не исполняется — иначе гэп работал бы в пользу трейдера.
  it('гэп за тейком — по тейку, а не по открытию', () => {
    expect(checkMinute(LONG, m(106, 107, 105.5, 106.5))).toMatchObject({ reason: 'take', price: 105 });
  });

  it('касание тейка — по тейку', () => {
    expect(checkMinute(LONG, m(104, 105.2, 103, 105))).toMatchObject({ reason: 'take', price: 105 });
  });

  it('стоп и тейк в одной минутке — стоп', () => {
    expect(checkMinute(LONG, m(100, 106, 97, 101))?.reason).toBe('stop');
  });

  it('шорт зеркально: стоп сверху, тейк снизу', () => {
    expect(checkMinute(SHORT, m(100, 102.5, 99, 101))).toMatchObject({ reason: 'stop', price: 102 });
    expect(checkMinute(SHORT, m(96, 97, 94, 95.5))).toMatchObject({ reason: 'take', price: 95 });
  });

  it('без тейка проверяется только стоп', () => {
    expect(checkMinute({ ...LONG, takeProfit: null }, m(104, 200, 103, 150))).toBeNull();
  });

  // Гэп за тейком проверяется раньше касания стопа: открытие уже за тейком
  // значит, что тейк исполнился первым, что бы ни было потом внутри минутки.
  it('гэп за тейком раньше касания стопа в той же минутке', () => {
    expect(checkMinute(LONG, m(110, 112, 90, 95))).toMatchObject({ reason: 'take', price: 105 });
  });

  it('стоп шорта ровно на максимуме — сработал', () => {
    expect(checkMinute(SHORT, m(100, 102, 99, 101))).toMatchObject({ reason: 'stop', price: 102 });
  });
});

describe('checkMinute — лимит-ордера на закрытие', () => {
  const LONG_WIDE: Position = { direction: 'long', stopLoss: 90, takeProfit: 120 };

  it('касание лимит-ордера — своя цена и объём, стоп/тейк далеко', () => {
    const exit = checkMinute(LONG_WIDE, m(100, 106, 94, 100), [{ id: 'o1', price: 95, qty: 5, tradeId: 't1' }]);
    expect(exit).toEqual({ reason: 'limit', price: 95, time: T + MINUTE, qty: 5, closeOrderId: 'o1' });
  });

  it('стоп важнее лимит-ордера в той же минутке', () => {
    const exit = checkMinute(LONG_WIDE, m(100, 100, 85, 100), [{ id: 'o1', price: 95, qty: 5, tradeId: 't1' }]);
    expect(exit?.reason).toBe('stop');
  });

  it('тейк важнее лимит-ордера в той же минутке', () => {
    const exit = checkMinute(LONG_WIDE, m(100, 125, 100, 100), [{ id: 'o1', price: 115, qty: 5, tradeId: 't1' }]);
    expect(exit?.reason).toBe('take');
  });

  it('несколько лимитов задеты — срабатывает ближайший к открытию свечи', () => {
    const exit = checkMinute(LONG_WIDE, m(100, 106, 94, 100), [
      { id: 'far', price: 95, qty: 1, tradeId: 't1' },
      { id: 'near', price: 102, qty: 2, tradeId: 't1' },
    ]);
    expect(exit?.closeOrderId).toBe('near');
  });

  it('гэп мимо лимит-ордера (диапазон свечи его не задел) — не исполняется', () => {
    // Весь диапазон [98,110] уровня 95 не касается.
    const exit = checkMinute(LONG_WIDE, m(100, 110, 98, 105), [{ id: 'o1', price: 95, qty: 5, tradeId: 't1' }]);
    expect(exit).toBeNull();
  });

  it('без лимит-ордеров ведёт себя как раньше', () => {
    expect(checkMinute(LONG_WIDE, m(100, 105, 95, 100))).toBeNull();
  });
});

describe('findExit — лимит-ордера передаются в каждую минутку', () => {
  it('находит первую минутку, где сработал лимит', () => {
    const minutes = [m(100, 101, 99, 100, T), m(100, 106, 94, 100, T + MINUTE)];
    const exit = findExit(
      { direction: 'long', stopLoss: 90, takeProfit: 120 },
      minutes,
      T,
      T + 2 * MINUTE,
      [{ id: 'o1', price: 95, qty: 5, tradeId: 't1' }],
    );
    expect(exit).toEqual({ reason: 'limit', price: 95, time: T + 2 * MINUTE, qty: 5, closeOrderId: 'o1' });
  });
});

describe('findExit', () => {
  const series = [m(100, 101, 99, 100, T), m(100, 101, 97, 98, T + MINUTE), m(98, 110, 90, 100, T + 2 * MINUTE)];

  it('первая сработавшая минутка в окне', () => {
    expect(findExit(LONG, series, T, T + 3 * MINUTE)).toMatchObject({ reason: 'stop', time: T + 2 * MINUTE });
  });

  it('минутки раньше from не проверяются', () => {
    expect(findExit(LONG, series, T + 2 * MINUTE, T + 3 * MINUTE)).toMatchObject({ time: T + 3 * MINUTE });
  });

  it('минутка, которая закрывается после to, не проверяется', () => {
    expect(findExit(LONG, series, T, T + MINUTE)).toBeNull();
  });
});

describe('isPartialExit', () => {
  const trade = { qty: 3, closedQty: 1 };
  const at = { price: 105, time: T };

  it('лимит закрытия на часть остатка — частичное: позиция остаётся открытой', () => {
    expect(isPartialExit(trade, { ...at, reason: 'limit', qty: 1, closeOrderId: 'o1' })).toBe(true);
  });

  it('лимит на весь остаток, стоп и тейк — полное закрытие', () => {
    expect(isPartialExit(trade, { ...at, reason: 'limit', qty: 2, closeOrderId: 'o1' })).toBe(false);
    // Погрешность сложения долей сетки полным закрытием не мешает.
    expect(isPartialExit(trade, { ...at, reason: 'limit', qty: 2 - 1e-12, closeOrderId: 'o1' })).toBe(false);
    expect(isPartialExit(trade, { ...at, reason: 'stop' })).toBe(false);
    expect(isPartialExit(trade, { ...at, reason: 'take' })).toBe(false);
  });
});
