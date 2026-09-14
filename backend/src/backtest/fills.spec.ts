import { checkMinute, type Bar, type Position } from './fills';

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
