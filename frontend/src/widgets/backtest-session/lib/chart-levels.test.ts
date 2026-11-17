import { describe, expect, it } from 'vitest';
import type { BacktestCloseOrder, BacktestEntryOrder, BacktestTrade } from '../api/types';
import { positionLevels, tradeMarkers, type PositionLevelsInput } from './chart-levels';

const trade = (over: Partial<BacktestTrade> = {}): BacktestTrade => ({
  id: 't1',
  sessionId: 's',
  symbol: 'BTCUSDT',
  direction: 'long',
  entryTime: '2026-11-17T10:00:00.000Z',
  entryPrice: 100,
  stopLoss: 90,
  takeProfit: 120,
  riskPct: 1,
  riskUsdt: 10,
  qty: 1,
  leverage: 10,
  closedQty: 0,
  stopFollow: false,
  trailDist: null,
  exitTime: null,
  exitPrice: null,
  exitReason: null,
  fee: null,
  pnl: null,
  r: null,
  tags: [],
  entries: [],
  ...over,
});

const closeOrder: BacktestCloseOrder = { id: 'c1', tradeId: 't1', price: 110, qty: 0.5, createdAt: '' };
const entryOrder = (symbol: string) =>
  ({
    id: `e-${symbol}`,
    sessionId: 's',
    symbol,
    direction: 'long',
    price: 95,
    riskPct: 1,
    stopLoss: 90,
    takeProfit: null,
    leverage: 10,
    createdAt: '',
  }) as BacktestEntryOrder;

const input = (over: Partial<PositionLevelsInput> = {}): PositionLevelsInput => ({
  trades: [trade(), trade({ id: 't2', symbol: 'ETHUSDT' })],
  closeOrders: [closeOrder],
  entryOrders: [entryOrder('BTCUSDT'), entryOrder('ETHUSDT')],
  symbol: 'BTCUSDT',
  scale: 1,
  livePrice: 105,
  screenPrice: 105,
  balance: 1000,
  qtyStepOf: () => 0,
  draggable: true,
  oddsOn: false,
  trailName: 'trail',
  ...over,
});

describe('positionLevels', () => {
  it('позиция монеты графика: вход, ликвидация, стоп, тейк, лимит закрытия и лимит на вход — только своей монеты', () => {
    const kinds = positionLevels(input()).map((l) => `${l.kind}:${l.id}`);
    expect(kinds).toEqual(['entry:entry-t1', 'liq:liq-t1', 'stop:stop-t1', 'take:take-t1', 'limitClose:c1', 'pendingEntry:e-BTCUSDT']);
  });

  it('PnL плашки входа — от переданной цены (позиция биржи: без комиссий)', () => {
    const entry = positionLevels(input({ trades: [trade({ unrealisedPnl: 0 })] })).find((l) => l.kind === 'entry');
    expect(entry?.pnl).toBeCloseTo(5);
  });

  it('неактивный график: ничего не тянется', () => {
    expect(positionLevels(input({ draggable: false })).every((l) => !l.draggable)).toBe(true);
  });

  it('уровень, который тянут, — на новой цене', () => {
    const stop = positionLevels(input({ pendingLevel: { tradeId: 't1', kind: 'stop', price: 95 } })).find((l) => l.kind === 'stop');
    expect(stop?.price).toBe(95);
  });
});

describe('tradeMarkers', () => {
  it('вход и выход своей монеты; выход с тоном результата', () => {
    const closed = trade({ exitTime: '2026-11-17T11:00:00.000Z', exitPrice: 110, pnl: 10 });
    const marks = tradeMarkers([closed, trade({ id: 't2', symbol: 'ETHUSDT' })], 'BTCUSDT', 1);
    expect(marks.map((m) => [m.kind, m.tone ?? null])).toEqual([
      ['entry', null],
      ['exit', 'profit'],
    ]);
  });
});
