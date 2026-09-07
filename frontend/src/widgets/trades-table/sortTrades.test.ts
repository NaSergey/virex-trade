import { describe, expect, it } from 'vitest';
import type { Trade } from '@/entities/trade';
import { sortTrades } from './sortTrades';

const trade = (over: Partial<Trade> = {}): Trade => ({
  id: over.id ?? 't1',
  symbol: 'BTCUSDT',
  side: 'Buy',
  direction: 'long',
  qty: 1,
  avgEntryPrice: 100,
  avgExitPrice: 110,
  closedPnl: 10,
  openFee: 0,
  closeFee: 0,
  leverage: null,
  orderId: 'o1',
  closedAt: '2026-01-01T00:00:00.000Z',
  openedAt: '2026-01-01T00:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
  parts: 1,
  ...over,
});

describe('sortTrades', () => {
  it('сортирует по closedAt: по умолчанию новые сверху', () => {
    const older = trade({ id: 'a', closedAt: '2026-01-01T00:00:00.000Z' });
    const newer = trade({ id: 'b', closedAt: '2026-01-02T00:00:00.000Z' });
    const result = sortTrades([older, newer], { key: 'closedAt', dir: -1 });
    expect(result.map((t) => t.id)).toEqual(['b', 'a']);
  });

  it('переворачивает направление', () => {
    const older = trade({ id: 'a', closedAt: '2026-01-01T00:00:00.000Z' });
    const newer = trade({ id: 'b', closedAt: '2026-01-02T00:00:00.000Z' });
    const result = sortTrades([older, newer], { key: 'closedAt', dir: 1 });
    expect(result.map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('сортирует по pnl', () => {
    const small = trade({ id: 'a', closedPnl: 5 });
    const big = trade({ id: 'b', closedPnl: 50 });
    const result = sortTrades([small, big], { key: 'pnl', dir: -1 });
    expect(result.map((t) => t.id)).toEqual(['b', 'a']);
  });

  it('сортирует по entry', () => {
    const low = trade({ id: 'a', avgEntryPrice: 90 });
    const high = trade({ id: 'b', avgEntryPrice: 110 });
    const result = sortTrades([low, high], { key: 'entry', dir: -1 });
    expect(result.map((t) => t.id)).toEqual(['b', 'a']);
  });

  it('сделки без openedAt уходят в конец при сортировке по hold, независимо от направления', () => {
    const withHold = trade({ id: 'a', openedAt: '2026-01-01T00:00:00.000Z', closedAt: '2026-01-01T01:00:00.000Z' });
    const noHold = trade({ id: 'b', openedAt: null });
    expect(sortTrades([noHold, withHold], { key: 'hold', dir: -1 }).map((t) => t.id)).toEqual(['a', 'b']);
    expect(sortTrades([noHold, withHold], { key: 'hold', dir: 1 }).map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('сделки без диапазона нужного ТФ уходят в конец при сортировке по range', () => {
    const withRange = trade({ id: 'a', context: { ok: true, atrPct: null, volRel: null, ema200Above: null, trend4h: null, rangePos15m: null, rangePos30m: null, rangePos1h: 42, rangePos4h: null, rangePos1d: null, entryQuality: null, exitQuality: null } });
    const noRange = trade({ id: 'b', context: null });
    expect(sortTrades([noRange, withRange], { key: 'range', dir: -1 }, '1h').map((t) => t.id)).toEqual(['a', 'b']);
    expect(sortTrades([noRange, withRange], { key: 'range', dir: 1 }, '1h').map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('неизвестный ключ сортировки возвращает исходный порядок', () => {
    const a = trade({ id: 'a' });
    const b = trade({ id: 'b' });
    expect(sortTrades([a, b], { key: 'symbol', dir: -1 }).map((t) => t.id)).toEqual(['a', 'b']);
  });
});
