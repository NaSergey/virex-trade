import { checkMinute, touchedEntries, trailStop, type Bar, type Position } from './fills';

// Случаи из frontend/src/widgets/backtest-session/lib/fills.test.ts: правила одни, копий две
// (историю исполняет браузер, эфир турнира — сервер), и расходиться им нельзя.

const T = Date.UTC(2024, 2, 5, 12, 0);
const m = (o: number, h: number, l: number, c: number, t = T): Bar => ({ t, o, h, l, c });
const LONG: Position = { direction: 'long', stopLoss: 98, takeProfit: 105 };
const SHORT: Position = { direction: 'short', stopLoss: 102, takeProfit: 95 };

describe('checkMinute', () => {
  it('касание стопа лонга — по стопу', () => {
    expect(checkMinute(LONG, m(100, 101, 97.5, 99))).toEqual({ reason: 'stop', price: 98 });
  });

  it('стоп ровно на минимуме — сработал', () => {
    expect(checkMinute(LONG, m(100, 101, 98, 99))?.reason).toBe('stop');
  });

  it('гэп за стопом — по цене открытия', () => {
    expect(checkMinute(LONG, m(97, 97.5, 96, 96.5))).toMatchObject({ reason: 'stop', price: 97 });
  });

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

  it('гэп за тейком раньше касания стопа в той же минутке', () => {
    expect(checkMinute(LONG, m(110, 112, 90, 95))).toMatchObject({ reason: 'take', price: 105 });
  });

  it('стоп шорта ровно на максимуме — сработал', () => {
    expect(checkMinute(SHORT, m(100, 102, 99, 101))).toMatchObject({ reason: 'stop', price: 102 });
  });
});

describe('checkMinute — ликвидация', () => {
  // Плечо 25: ликвидация лонга от 100 — на 96, стоп 98 ближе к цене; плечо 100 — на 99, дальше стопа.
  const LONG_LIQ_FAR: Position = { ...LONG, liqPrice: 96 };
  const LONG_LIQ_NEAR: Position = { ...LONG, liqPrice: 99 };
  const SHORT_LIQ_NEAR: Position = { ...SHORT, liqPrice: 101 };

  it('ликвидация ближе стопа — касание ликвидирует по её цене', () => {
    expect(checkMinute(LONG_LIQ_NEAR, m(100, 101, 98.5, 99.5))).toMatchObject({ reason: 'liquidation', price: 99 });
  });

  it('стоп ближе ликвидации — срабатывает стоп, ликвидации нет', () => {
    expect(checkMinute(LONG_LIQ_FAR, m(100, 101, 95, 96))).toMatchObject({ reason: 'stop', price: 98 });
  });

  // Изолированная маржа: убыток не больше маржи, поэтому гэп — по цене ликвидации, а не по открытию.
  it('гэп за ликвидацией — по цене ликвидации, даже если стоп ближе', () => {
    expect(checkMinute(LONG_LIQ_FAR, m(94, 95, 93, 94))).toMatchObject({ reason: 'liquidation', price: 96 });
  });

  it('ликвидация и тейк в одной минутке — ликвидация, как стоп', () => {
    expect(checkMinute(LONG_LIQ_NEAR, m(100, 106, 98.9, 101))?.reason).toBe('liquidation');
  });

  it('ликвидация важнее лимита закрытия в той же минутке', () => {
    const orders = [{ id: 'c1', price: 101, qty: 1 }];
    expect(checkMinute(LONG_LIQ_NEAR, m(100, 101.5, 98.9, 100), orders)?.reason).toBe('liquidation');
  });

  it('шорт зеркально', () => {
    expect(checkMinute(SHORT_LIQ_NEAR, m(100, 101.2, 99, 100))).toMatchObject({ reason: 'liquidation', price: 101 });
    expect(checkMinute({ ...SHORT, liqPrice: 104 }, m(105, 106, 104.5, 105))).toMatchObject({ reason: 'liquidation', price: 104 });
  });

  it('ликвидацию не задело — как без неё', () => {
    expect(checkMinute(LONG_LIQ_NEAR, m(100, 101, 99.5, 100))).toBeNull();
  });
});

describe('checkMinute — лимит-ордера на закрытие', () => {
  const LONG_WIDE: Position = { direction: 'long', stopLoss: 90, takeProfit: 120 };

  it('касание лимит-ордера — своя цена и объём, стоп/тейк далеко', () => {
    const exit = checkMinute(LONG_WIDE, m(100, 106, 94, 100), [{ id: 'o1', price: 95, qty: 5 }]);
    expect(exit).toEqual({ reason: 'limit', price: 95, qty: 5, closeOrderId: 'o1' });
  });

  it('стоп важнее лимит-ордера в той же минутке', () => {
    const exit = checkMinute(LONG_WIDE, m(100, 100, 85, 100), [{ id: 'o1', price: 95, qty: 5 }]);
    expect(exit?.reason).toBe('stop');
  });

  it('тейк важнее лимит-ордера в той же минутке', () => {
    const exit = checkMinute(LONG_WIDE, m(100, 125, 100, 100), [{ id: 'o1', price: 115, qty: 5 }]);
    expect(exit?.reason).toBe('take');
  });

  it('несколько лимитов задеты — срабатывает ближайший к открытию', () => {
    const exit = checkMinute(LONG_WIDE, m(100, 106, 94, 100), [
      { id: 'far', price: 95, qty: 1 },
      { id: 'near', price: 102, qty: 2 },
    ]);
    expect(exit?.closeOrderId).toBe('near');
  });

  it('диапазон не задел лимит-ордер — не исполняется', () => {
    expect(checkMinute(LONG_WIDE, m(100, 110, 98, 105), [{ id: 'o1', price: 95, qty: 5 }])).toBeNull();
  });

  it('без лимит-ордеров ведёт себя как раньше', () => {
    expect(checkMinute(LONG_WIDE, m(100, 105, 95, 100))).toBeNull();
  });
});

describe('touchedEntries — уровни на вход', () => {
  const orders = [
    { id: 'far', price: 95 },
    { id: 'near', price: 98 },
    { id: 'miss', price: 90 },
  ];

  it('задетые уровни — от ближайшего к открытию', () => {
    expect(touchedEntries(orders, m(100, 101, 94, 96)).map((o) => o.id)).toEqual(['near', 'far']);
  });

  it('уровень ровно на минимуме — задет', () => {
    expect(touchedEntries(orders, m(100, 101, 95, 99)).map((o) => o.id)).toEqual(['near', 'far']);
  });

  it('гэпа нет: диапазон не задел уровень — ждёт', () => {
    expect(touchedEntries(orders, m(99, 101, 98.5, 100))).toEqual([]);
  });
});

describe('trailStop', () => {
  it('лонг: стоп идёт за максимумом на расстоянии', () =>
    expect(trailStop('long', 98, 2, 105, 101)).toBe(99));
  it('лонг: цена не выше прежнего — стоп стоит', () =>
    expect(trailStop('long', 98, 2, 105, 99.5)).toBe(98));
  it('лонг: не дальше безубытка', () =>
    expect(trailStop('long', 98, 2, 100, 110)).toBe(100));
  it('лонг: стоп в безубытке и дальше — не двигается', () => {
    expect(trailStop('long', 100, 2, 100, 110)).toBe(100);
    expect(trailStop('long', 101, 2, 100, 110)).toBe(101);
  });
  it('шорт — зеркально', () => {
    expect(trailStop('short', 102, 2, 95, 99)).toBe(101);
    expect(trailStop('short', 102, 2, 100, 90)).toBe(100);
    expect(trailStop('short', 99, 2, 100, 90)).toBe(99);
  });
  it('без расстояния — стоп как есть', () => {
    expect(trailStop('long', 98, null, 105, 120)).toBe(98);
    expect(trailStop('long', 98, 0, 105, 120)).toBe(98);
  });
});
