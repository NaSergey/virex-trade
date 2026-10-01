import { describe, expect, it } from 'vitest';
import type { Trade } from '@/entities/trade';
import type { TerminalOrder, TerminalPosition, TerminalState } from '../api/types';
import { parsePositionKey, toDetail, type PositionMeta } from './adapt';

const position = (extra: Partial<TerminalPosition> = {}): TerminalPosition => ({
  symbol: 'BTCUSDT',
  direction: 'long',
  size: 0.1,
  entryPrice: 60_000,
  markPrice: 60_100,
  positionValue: 6000,
  unrealisedPnl: 10,
  leverage: 20,
  liqPrice: 54_300,
  stopLoss: 59_000,
  takeProfit: 62_000,
  ...extra,
});

const order = (id: string, extra: Partial<TerminalOrder> = {}): TerminalOrder => ({
  id,
  symbol: 'BTCUSDT',
  direction: 'long',
  kind: 'entry',
  price: 59_500,
  qty: 0.05,
  stopLoss: 59_000,
  takeProfit: null,
  createdAt: '2026-09-30T10:00:00.000Z',
  ...extra,
});

const state = (extra: Partial<TerminalState> = {}): TerminalState => ({
  serverTime: '2026-09-30T12:00:00.000Z',
  balance: 10_000,
  available: 9000,
  positions: [],
  orders: [],
  ...extra,
});

const closed: Trade = {
  id: 'j1',
  symbol: 'BTCUSDT',
  direction: 'short',
  qty: 0.2,
  avgEntryPrice: 61_000,
  avgExitPrice: 60_500,
  closedPnl: 95,
  openFee: 2,
  closeFee: 3,
  leverage: 10,
  closedAt: '2026-09-29T15:00:00.000Z',
  openedAt: '2026-09-29T14:00:00.000Z',
  parts: 1,
};

const NO_META = new Map<string, PositionMeta>();

describe('toDetail', () => {
  it('счёт биржи читается терминалом как живая сессия без скрытой цены', () => {
    const d = toDetail(state(), NO_META, []);
    expect(d.session).toMatchObject({ dataSource: 'live', status: 'active', balance: 10_000, priceScale: 1, hideDate: false, endTime: null });
    expect(d.tournament).toBeNull();
  });

  it('начало «сессии» не меняется от снимка к снимку', () => {
    // От него зависят подписи графика: время снимка перерисовывало бы его каждые три секунды.
    const a = toDetail(state(), NO_META, []);
    const b = toDetail(state({ serverTime: '2026-09-30T12:00:03.000Z' }), NO_META, []);
    expect(b.session.startTime).toBe(a.session.startTime);
  });

  it('позиция становится открытой сделкой с ценой ликвидации биржи и фактическим риском', () => {
    const meta = new Map([['BTCUSDT:long', { tags: [{ id: 't1', name: 'Пробой', color: '#fff' }], openedAt: '2026-09-30T09:00:00.000Z' }]]);
    const [trade] = toDetail(state({ positions: [position()] }), meta as Map<string, PositionMeta>, []).trades;
    expect(trade).toMatchObject({
      id: 'BTCUSDT:long',
      symbol: 'BTCUSDT',
      direction: 'long',
      entryPrice: 60_000,
      stopLoss: 59_000,
      takeProfit: 62_000,
      qty: 0.1,
      closedQty: 0,
      leverage: 20,
      liqPrice: 54_300,
      exitTime: null,
      entryTime: '2026-09-30T09:00:00.000Z',
      // До стопа 1000 при 0.1 монеты — 100 USDT, один процент баланса.
      riskUsdt: 100,
      riskPct: 1,
    });
    expect(trade.tags).toHaveLength(1);
  });

  it('позиция без стопа и без известного времени открытия так и помечена', () => {
    const [trade] = toDetail(state({ positions: [position({ stopLoss: null, liqPrice: null })] }), NO_META, []).trades;
    // Ноль — «стопа нет»: терминал линию не рисует. null у ликвидации — биржа её не назвала.
    expect(trade).toMatchObject({ stopLoss: 0, riskUsdt: 0, riskPct: 0, liqPrice: null, entryTime: '' });
  });

  it('закрытые сделки журнала идут в сделки ради стрелок и не числятся открытыми', () => {
    const d = toDetail(state({ positions: [position()] }), NO_META, [closed]);
    expect(d.trades.map((x) => x.id)).toEqual(['j1', 'BTCUSDT:long']);
    expect(d.trades[0]).toMatchObject({ exitTime: closed.closedAt, exitPrice: 60_500, pnl: 95, fee: 5, entryPrice: 61_000 });
    expect(d.trades.filter((x) => x.exitTime == null).map((x) => x.id)).toEqual(['BTCUSDT:long']);
  });

  it('лимит на вход несёт свой объём, а риск выводится из него', () => {
    const d = toDetail(state({ orders: [order('e1')] }), NO_META, []);
    // 0.05 монеты при 500 до стопа — 25 USDT, четверть процента баланса.
    expect(d.entryOrders).toEqual([expect.objectContaining({ id: 'e1', price: 59_500, qty: 0.05, stopLoss: 59_000, riskPct: 0.25 })]);
    expect(d.closeOrders).toEqual([]);
  });

  it('лимит на вход без стопа — с нулём вместо стопа и риска', () => {
    const d = toDetail(state({ orders: [order('e1', { stopLoss: null })] }), NO_META, []);
    expect(d.entryOrders[0]).toMatchObject({ stopLoss: 0, riskPct: 0, qty: 0.05 });
  });

  it('лимит закрытия привязан к своей позиции', () => {
    const close = order('c1', { kind: 'close', price: 61_000, qty: 0.04 });
    const d = toDetail(state({ positions: [position()], orders: [close] }), NO_META, []);
    expect(d.closeOrders).toEqual([expect.objectContaining({ id: 'c1', tradeId: 'BTCUSDT:long', price: 61_000, qty: 0.04 })]);
    expect(d.entryOrders).toEqual([]);
  });

  it('лимит закрытия без позиции не показывается: привязать его не к чему', () => {
    const d = toDetail(state({ orders: [order('c1', { kind: 'close' })] }), NO_META, []);
    expect(d.closeOrders).toEqual([]);
  });
});

describe('parsePositionKey', () => {
  it('переводит id сделки терминала обратно в монету и сторону', () => {
    expect(parsePositionKey('ETHUSDT:short')).toEqual({ symbol: 'ETHUSDT', direction: 'short' });
  });

  it('чужой id — не позиция', () => {
    expect(parsePositionKey('clx123')).toBeNull();
    expect(parsePositionKey('BTCUSDT:up')).toBeNull();
  });
});
