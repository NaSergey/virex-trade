import { describe, expect, it } from 'vitest';
import { advanceTo } from './advance';
import { MINUTE } from './candles';

const at = (n: number) => Date.UTC(2024, 2, 5, 12, 0) + n * MINUTE;

const mins = (from: number, n: number, price = 100) =>
  Array.from({ length: n }, (_, i) => ({ t: from + i * MINUTE, o: price, h: price + 1, l: price - 1, c: price }));

describe('advanceTo', () => {
  it('доходит до target, когда минутки загружены дальше', () => {
    const r = advanceTo({ from: at(0), target: at(5), minutes: mins(at(0), 10), loadedUntil: at(10), positions: [] });
    expect(r).toEqual({ reach: at(5), complete: true, exits: [], entryFill: null });
  });

  it('останавливается на загруженном крае, если он раньше target', () => {
    const r = advanceTo({ from: at(0), target: at(5), minutes: mins(at(0), 3), loadedUntil: at(3), positions: [] });
    expect(r).toEqual({ reach: at(3), complete: false, exits: [], entryFill: null });
  });

  it('без прогресса (from === target) — срабатывание не проверяется', () => {
    const r = advanceTo({
      from: at(5),
      target: at(5),
      minutes: mins(at(0), 10),
      loadedUntil: at(10),
      positions: [{ tradeId: 'a', direction: 'long', stopLoss: 90, takeProfit: null, entryTime: at(0) }],
    });
    expect(r.exits).toEqual([]);
  });

  it('стоп сработал внутри окна — exit возвращается с id сделки', () => {
    const minutes = mins(at(0), 5, 100);
    minutes[2] = { ...minutes[2], l: 89 };
    const r = advanceTo({
      from: at(0),
      target: at(5),
      minutes,
      loadedUntil: at(5),
      positions: [{ tradeId: 'a', direction: 'long', stopLoss: 90, takeProfit: null, entryTime: at(0) }],
    });
    expect(r.exits).toEqual([{ reason: 'stop', price: 90, time: at(3), tradeId: 'a' }]);
  });

  it('позиций нет — срабатывания не бывает, даже если цена его коснулась', () => {
    const minutes = mins(at(0), 5, 100);
    minutes[2] = { ...minutes[2], l: 1 };
    const r = advanceTo({ from: at(0), target: at(5), minutes, loadedUntil: at(5), positions: [] });
    expect(r.exits).toEqual([]);
  });

  it('две открытые позиции — обе проверяются в одном проходе', () => {
    const minutes = mins(at(0), 5, 100);
    minutes[2] = { ...minutes[2], l: 89, h: 111 }; // и стоп лонга, и стоп шорта в одной минутке
    const r = advanceTo({
      from: at(0),
      target: at(5),
      minutes,
      loadedUntil: at(5),
      positions: [
        { tradeId: 'long1', direction: 'long', stopLoss: 90, takeProfit: null, entryTime: at(0) },
        { tradeId: 'short1', direction: 'short', stopLoss: 110, takeProfit: null, entryTime: at(0) },
      ],
    });
    expect(r.exits).toEqual([
      { reason: 'stop', price: 90, time: at(3), tradeId: 'long1' },
      { reason: 'stop', price: 110, time: at(3), tradeId: 'short1' },
    ]);
  });

  it('срабатывает только одна из двух позиций', () => {
    const minutes = mins(at(0), 5, 100);
    minutes[2] = { ...minutes[2], l: 89 };
    const r = advanceTo({
      from: at(0),
      target: at(5),
      minutes,
      loadedUntil: at(5),
      positions: [
        { tradeId: 'long1', direction: 'long', stopLoss: 90, takeProfit: null, entryTime: at(0) },
        { tradeId: 'short1', direction: 'short', stopLoss: 200, takeProfit: null, entryTime: at(0) },
      ],
    });
    expect(r.exits).toEqual([{ reason: 'stop', price: 90, time: at(3), tradeId: 'long1' }]);
  });

  it('лимит-ордер на закрытие фильтруется по своей сделке', () => {
    const minutes = mins(at(0), 3, 100);
    const r = advanceTo({
      from: at(0),
      target: at(3),
      minutes,
      loadedUntil: at(3),
      positions: [{ tradeId: 'long1', direction: 'long', stopLoss: 50, takeProfit: null, entryTime: at(0) }],
      // Ордер на другую сделку не должен сработать здесь, даже если цена его задела.
      closeOrders: [{ id: 'o1', price: 100, qty: 5, tradeId: 'other-trade' }],
    });
    expect(r.exits).toEqual([]);
  });

  it('уровень сетки на вход обрывает продвижение точно на своём моменте', () => {
    const minutes = mins(at(0), 5, 100);
    minutes[2] = { ...minutes[2], l: 95 };
    const r = advanceTo({
      from: at(0),
      target: at(5),
      minutes,
      loadedUntil: at(5),
      positions: [],
      entryOrders: [{ id: 'e1', direction: 'long', price: 96 }],
    });
    expect(r).toEqual({
      reach: at(3),
      complete: true,
      exits: [],
      entryFill: { orderId: 'e1', direction: 'long', price: 96, time: at(3) },
    });
  });

  it('exit раньше касания сетки — решает exit, уровень сетки ждёт следующего вызова', () => {
    const minutes = mins(at(0), 5, 100);
    minutes[1] = { ...minutes[1], l: 89 }; // стоп открытой сделки сработает первым, на at(2)
    minutes[3] = { ...minutes[3], h: 106 }; // уровень сетки — позже, на at(4); минуте стопа его не видно (h там 101)
    const r = advanceTo({
      from: at(0),
      target: at(5),
      minutes,
      loadedUntil: at(5),
      positions: [{ tradeId: 'long1', direction: 'long', stopLoss: 90, takeProfit: null, entryTime: at(0) }],
      entryOrders: [{ id: 'e1', direction: 'short', price: 105 }],
    });
    expect(r.reach).toEqual(at(2));
    expect(r.exits).toEqual([{ reason: 'stop', price: 90, time: at(2), tradeId: 'long1' }]);
    expect(r.entryFill).toBeNull();
  });

  it('касание сетки раньше exit — решает уровень сетки, exit ждёт следующего вызова', () => {
    const minutes = mins(at(0), 5, 100);
    minutes[1] = { ...minutes[1], h: 106 }; // уровень сетки сработает первым, на at(2)
    minutes[3] = { ...minutes[3], l: 89 }; // стоп открытой сделки — позже, на at(4)
    const r = advanceTo({
      from: at(0),
      target: at(5),
      minutes,
      loadedUntil: at(5),
      positions: [{ tradeId: 'long1', direction: 'long', stopLoss: 90, takeProfit: null, entryTime: at(0) }],
      entryOrders: [{ id: 'e1', direction: 'short', price: 105 }],
    });
    expect(r.reach).toEqual(at(2));
    expect(r.exits).toEqual([]);
    expect(r.entryFill).toEqual({ orderId: 'e1', direction: 'short', price: 105, time: at(2) });
  });
});
