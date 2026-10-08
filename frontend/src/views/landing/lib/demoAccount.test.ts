import { describe, expect, it } from 'vitest';
import {
  DEMO_BALANCE,
  DemoError,
  closeGrid,
  closeTrade,
  createEntryOrders,
  emptyDemo,
  loadDemo,
  moveEntryOrder,
  openTrade,
  tick,
  toDetail,
  watchedSymbols,
  type DemoState,
} from './demoAccount';

const T0 = Date.UTC(2026, 9, 8, 12, 0);
const at = (min: number) => new Date(T0 + min * 60_000).toISOString();

const long = (s: DemoState, over: Partial<Parameters<typeof openTrade>[1]> = {}) =>
  openTrade(s, {
    symbol: 'BTCUSDT',
    direction: 'long',
    entryTime: at(1),
    entryPrice: 100,
    stopLoss: 95,
    riskPct: 1,
    leverage: 10,
    ...over,
  });

describe('demoAccount: вход', () => {
  it('объём — риск ÷ расстояние до стопа', () => {
    const s = long(emptyDemo(T0));
    const t = s.trades[0];
    expect(t.riskUsdt).toBe(100);
    expect(t.qty).toBe(20);
    expect(t.entries).toHaveLength(1);
  });

  it('стоп не по ту сторону — отказ', () => {
    expect(() => long(emptyDemo(T0), { stopLoss: 105 })).toThrow(DemoError);
  });

  it('маржа больше депозита — отказ', () => {
    expect(() => long(emptyDemo(T0), { stopLoss: 99.9, riskPct: 5, leverage: 1 })).toThrowError('margin');
  });

  it('вход в занятую сторону доливает позицию по её стопу', () => {
    const s = long(long(emptyDemo(T0)), { entryPrice: 105, stopLoss: 90, entryTime: at(2) });
    expect(s.trades).toHaveLength(1);
    const t = s.trades[0];
    // Добор: 100 USDT риска до стопа позиции 95 от 105 — 10 монет.
    expect(t.qty).toBeCloseTo(30, 10);
    expect(t.entryPrice).toBeCloseTo((20 * 100 + 10 * 105) / 30, 10);
    expect(t.stopLoss).toBe(95);
    expect(t.entries).toHaveLength(2);
  });
});

describe('demoAccount: закрытие', () => {
  it('частичное и полное: депозит, итог и R с комиссией', () => {
    let s = long(emptyDemo(T0));
    const id = s.trades[0].id;
    s = closeTrade(s, { tradeId: id, exitTime: at(2), exitPrice: 110, reason: 'manual', qty: 10 });
    expect(s.trades[0].exitTime).toBeNull();
    s = closeTrade(s, { tradeId: id, exitTime: at(3), exitPrice: 90, reason: 'manual' });
    const t = s.trades[0];
    const fee = (100 + 110) * 10 * 0.00055 + (100 + 90) * 10 * 0.00055;
    expect(t.exitReason).toBe('manual');
    expect(t.pnl).toBeCloseTo(100 - 100 - fee, 8);
    expect(t.r).toBeCloseTo((0 - fee) / 100, 8);
    expect(s.balance).toBeCloseTo(DEMO_BALANCE - fee, 8);
  });

  it('объём больше остатка — отказ', () => {
    const s = long(emptyDemo(T0));
    expect(() => closeTrade(s, { tradeId: s.trades[0].id, exitTime: at(2), exitPrice: 101, reason: 'manual', qty: 21 })).toThrowError('qty');
  });
});

describe('demoAccount: исполнение по цене', () => {
  it('стоп — по цене опроса, проскочившей его', () => {
    const s = tick(long(emptyDemo(T0)), 'BTCUSDT', 94, T0 + 120_000);
    expect(s.trades[0].exitReason).toBe('stop');
    expect(s.trades[0].exitPrice).toBe(94);
  });

  it('цена между стопом и тейком ничего не делает', () => {
    const s0 = long(emptyDemo(T0), { takeProfit: 120 });
    expect(tick(s0, 'BTCUSDT', 110, T0 + 120_000)).toBe(s0);
  });

  it('другая монета позицию не трогает', () => {
    const s0 = long(emptyDemo(T0));
    expect(tick(s0, 'ETHUSDT', 1, T0 + 120_000)).toBe(s0);
  });

  it('сетка фиксации: тейки по порядку, стоп в безубыток, потом на первый тейк', () => {
    let s = long(emptyDemo(T0));
    const id = s.trades[0].id;
    s = closeGrid(s, { tradeId: id, prices: [105, 110, 115], qtys: [5, 5, 10], stopFollow: true }, T0);
    s = tick(s, 'BTCUSDT', 106, T0 + 60_000);
    expect(s.trades[0].closedQty).toBe(5);
    expect(s.trades[0].stopLoss).toBe(100);
    s = tick(s, 'BTCUSDT', 111, T0 + 120_000);
    expect(s.trades[0].closedQty).toBe(10);
    expect(s.trades[0].stopLoss).toBe(105);
    // Отскок до нового стопа закрывает остаток.
    s = tick(s, 'BTCUSDT', 104, T0 + 180_000);
    expect(s.trades[0].exitReason).toBe('stop');
    expect(s.closeOrders).toHaveLength(0);
  });

  it('лимит на вход срабатывает своей ценой и снимается', () => {
    let s = createEntryOrders(
      emptyDemo(T0),
      { symbol: 'BTCUSDT', direction: 'long', stopLoss: 90, riskPct: 1, leverage: 10, prices: [95] },
      T0,
    );
    expect(watchedSymbols(s)).toEqual(['BTCUSDT']);
    s = tick(s, 'BTCUSDT', 96, T0 + 60_000);
    expect(s.trades).toHaveLength(0);
    s = tick(s, 'BTCUSDT', 94.5, T0 + 120_000);
    expect(s.entryOrders).toHaveLength(0);
    expect(s.trades[0].entryPrice).toBe(95);
  });

  it('неисполнимый лимит снимается, а не висит', () => {
    let s = createEntryOrders(
      emptyDemo(T0),
      { symbol: 'BTCUSDT', direction: 'long', stopLoss: 94.99, riskPct: 50, leverage: 1, prices: [95] },
      T0,
    );
    s = tick(s, 'BTCUSDT', 95, T0 + 60_000);
    expect(s.trades).toHaveLength(0);
    expect(s.entryOrders).toHaveLength(0);
  });

  it('перенос лимита на вход — новый id', () => {
    const s0 = createEntryOrders(
      emptyDemo(T0),
      { symbol: 'BTCUSDT', direction: 'long', stopLoss: 90, riskPct: 1, leverage: 10, prices: [95] },
      T0,
    );
    const s = moveEntryOrder(s0, { orderId: s0.entryOrders[0].id, price: 96 }, T0);
    expect(s.entryOrders).toHaveLength(1);
    expect(s.entryOrders[0].id).not.toBe(s0.entryOrders[0].id);
    expect(s.entryOrders[0].price).toBe(96);
  });
});

describe('demoAccount: снимок и хранилище', () => {
  it('снимок — эфирная сессия с итогами закрытых', () => {
    let s = long(emptyDemo(T0));
    s = closeTrade(s, { tradeId: s.trades[0].id, exitTime: at(2), exitPrice: 110, reason: 'take' });
    const d = toDetail(s);
    expect(d.session.dataSource).toBe('live');
    expect(d.summary.trades).toBe(1);
    expect(d.summary.wins).toBe(1);
  });

  it('битое и чужое в хранилище читается как пустое', () => {
    expect(loadDemo({ getItem: () => '{не json' })).toBeNull();
    expect(loadDemo({ getItem: () => JSON.stringify({ v: 2 }) })).toBeNull();
    const s = emptyDemo(T0);
    expect(loadDemo({ getItem: () => JSON.stringify(s) })).toEqual(s);
  });
});
