import { describe, expect, it } from 'vitest';
import type { BacktestCloseOrder, BacktestEntryOrder, BacktestTrade } from '../api/types';
import { lengthOf, schedule, soundsOf, GAP_MS, type Snapshot } from './sounds';

const trade = (over: Partial<BacktestTrade> = {}): BacktestTrade => ({
  id: 't1',
  sessionId: 's1',
  symbol: 'BTCUSDT',
  direction: 'long',
  entryTime: '2026-09-26T10:00:00.000Z',
  entryPrice: 100,
  stopLoss: 90,
  takeProfit: 120,
  riskPct: 1,
  riskUsdt: 10,
  qty: 1,
  leverage: 1,
  closedQty: 0,
  stopFollow: false,
  exitTime: null,
  exitPrice: null,
  exitReason: null,
  fee: null,
  pnl: null,
  r: null,
  tags: [],
  entries: [{ id: 'e1', qty: 1, price: 100, time: '2026-09-26T10:00:00.000Z' }],
  ...over,
});

const closed = (reason: BacktestTrade['exitReason'], over: Partial<BacktestTrade> = {}) =>
  trade({ exitTime: '2026-09-26T11:00:00.000Z', exitPrice: 110, exitReason: reason, closedQty: 1, ...over });

const entryOrder = (id: string): BacktestEntryOrder => ({
  id,
  sessionId: 's1',
  symbol: 'BTCUSDT',
  direction: 'long',
  price: 95,
  riskPct: 1,
  stopLoss: 90,
  takeProfit: null,
  leverage: 1,
  createdAt: '2026-09-26T10:00:00.000Z',
});

const closeOrder = (id: string): BacktestCloseOrder => ({
  id,
  tradeId: 't1',
  price: 115,
  qty: 0.5,
  createdAt: '2026-09-26T10:00:00.000Z',
});

const snap = (over: Partial<Snapshot> = {}): Snapshot => ({ trades: [], closeOrders: [], entryOrders: [], ...over });

describe('soundsOf', () => {
  it('тот же снимок молчит', () => {
    const s = snap({ trades: [trade()], entryOrders: [entryOrder('o1')] });
    expect(soundsOf(s, s)).toEqual([]);
  });

  it('новая сделка — исполнение', () => {
    expect(soundsOf(snap(), snap({ trades: [trade()] }))).toEqual(['fill']);
  });

  it('добор — исполнение', () => {
    const added = trade({ entries: [...trade().entries, { id: 'e2', qty: 1, price: 98, time: '2026-09-26T10:30:00.000Z' }] });
    expect(soundsOf(snap({ trades: [trade()] }), snap({ trades: [added] }))).toEqual(['fill']);
  });

  it('частичное закрытие — исполнение', () => {
    expect(soundsOf(snap({ trades: [trade()] }), snap({ trades: [trade({ closedQty: 0.5 })] }))).toEqual(['fill']);
  });

  it('закрытие звучит своей причиной', () => {
    const open = snap({ trades: [trade()] });
    expect(soundsOf(open, snap({ trades: [closed('stop')] }))).toEqual(['stop']);
    expect(soundsOf(open, snap({ trades: [closed('take')] }))).toEqual(['take']);
    expect(soundsOf(open, snap({ trades: [closed('manual')] }))).toEqual(['fill']);
    expect(soundsOf(open, snap({ trades: [closed('limit')] }))).toEqual(['fill']);
  });

  it('конец сессии не звучит и не выдаёт снятые ордера за отмену', () => {
    const prev = snap({ trades: [trade()], closeOrders: [closeOrder('c1')] });
    expect(soundsOf(prev, snap({ trades: [closed('finish')] }))).toEqual([]);
  });

  it('уже закрытая история не звучит повторно', () => {
    const s = snap({ trades: [closed('stop')] });
    expect(soundsOf(s, snap({ trades: [closed('stop')] }))).toEqual([]);
  });

  /** Эфир опрашивается раз в три секунды: сделка успевает открыться и закрыться между опросами. */
  it('сделка, пришедшая уже закрытой, даёт и открытие, и закрытие — важное первым', () => {
    expect(soundsOf(snap(), snap({ trades: [closed('take')] }))).toEqual(['take', 'fill']);
  });

  it('правка стопа молчит', () => {
    expect(soundsOf(snap({ trades: [trade()] }), snap({ trades: [trade({ stopLoss: 95 })] }))).toEqual([]);
  });

  it('выставленные ордера — один сигнал на снимок', () => {
    const next = snap({ entryOrders: [entryOrder('o1'), entryOrder('o2'), entryOrder('o3')] });
    expect(soundsOf(snap(), next)).toEqual(['placed']);
  });

  it('перенос лимита на вход молчит, как правка стопа', () => {
    // Сервер переносит лимит снятием и новым ордером с теми же условиями.
    const prev = snap({ entryOrders: [entryOrder('o1'), entryOrder('o2')] });
    const next = snap({ entryOrders: [entryOrder('o2'), { ...entryOrder('o3'), price: 97 }] });
    expect(soundsOf(prev, next)).toEqual([]);
  });

  it('снят один лимит и выставлен другой, с другими условиями, — оба сигнала', () => {
    const prev = snap({ entryOrders: [entryOrder('o1')] });
    const next = snap({ entryOrders: [{ ...entryOrder('o2'), stopLoss: 80 }] });
    expect(soundsOf(prev, next)).toEqual(['placed', 'cancel']);
  });

  it('перенос лимита закрытия молчит', () => {
    const prev = snap({ trades: [trade()], closeOrders: [closeOrder('c1')] });
    const next = snap({ trades: [trade()], closeOrders: [{ ...closeOrder('c1'), price: 117 }] });
    expect(soundsOf(prev, next)).toEqual([]);
  });

  it('снятый ордер без исполнений — отмена', () => {
    const prev = snap({ trades: [trade()], closeOrders: [closeOrder('c1')] });
    expect(soundsOf(prev, snap({ trades: [trade()] }))).toEqual(['cancel']);
  });

  it('ордер, ушедший в исполнение, — не отмена', () => {
    // Уровень сетки сработал и открыл сделку.
    expect(soundsOf(snap({ entryOrders: [entryOrder('o1')] }), snap({ trades: [trade()] }))).toEqual(['fill']);
    // Стоп закрыл позицию, сервер снял её лимитку.
    const prev = snap({ trades: [trade()], closeOrders: [closeOrder('c1')] });
    expect(soundsOf(prev, snap({ trades: [closed('stop')] }))).toEqual(['stop']);
  });
});

describe('schedule', () => {
  it('сигналы снимка идут подряд, без наложения', () => {
    expect(schedule(['stop', 'fill'])).toEqual([
      { sound: 'stop', delay: 0 },
      { sound: 'fill', delay: lengthOf('stop') + GAP_MS },
    ]);
  });
});
