import { describe, expect, it } from 'vitest';
import type { TerminalOrder, TerminalPosition } from '../api/types';
import { exchangeSounds, type Snapshot } from './sounds';

const position = (extra: Partial<TerminalPosition> = {}): TerminalPosition => ({
  symbol: 'BTCUSDT',
  direction: 'long',
  size: 0.1,
  entryPrice: 60_000,
  markPrice: 60_100,
  positionValue: 6000,
  unrealisedPnl: 10,
  leverage: 10,
  liqPrice: null,
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
  qty: 0.1,
  stopLoss: null,
  takeProfit: null,
  createdAt: null,
  ...extra,
});

const snap = (positions: TerminalPosition[] = [], orders: TerminalOrder[] = []): Snapshot => ({ positions, orders });

describe('exchangeSounds', () => {
  it('молчит, когда ничего не изменилось', () => {
    const s = snap([position()], [order('a')]);
    expect(exchangeSounds(s, snap([position({ markPrice: 60_500, unrealisedPnl: 50 })], [order('a')]))).toEqual([]);
  });

  it('открытие, долив и частичное закрытие — исполнение', () => {
    expect(exchangeSounds(snap(), snap([position()]))).toEqual(['fill']);
    expect(exchangeSounds(snap([position()]), snap([position({ size: 0.2 })]))).toEqual(['fill']);
    expect(exchangeSounds(snap([position()]), snap([position({ size: 0.05 })]))).toEqual(['fill']);
  });

  it('позиция пропала у своего стопа — стоп', () => {
    const was = snap([position({ markPrice: 59_050 })]);
    expect(exchangeSounds(was, snap())).toEqual(['stop']);
  });

  it('позиция пропала у своего тейка — тейк; у шорта стороны наоборот', () => {
    expect(exchangeSounds(snap([position({ markPrice: 61_950 })]), snap())).toEqual(['take']);
    const short = position({ direction: 'short', stopLoss: 61_000, takeProfit: 58_000, markPrice: 58_050 });
    expect(exchangeSounds(snap([short]), snap())).toEqual(['take']);
    expect(exchangeSounds(snap([{ ...short, markPrice: 60_990 }]), snap())).toEqual(['stop']);
  });

  it('позиция закрыта далеко от уровней или без них — просто исполнение', () => {
    expect(exchangeSounds(snap([position()]), snap())).toEqual(['fill']);
    expect(exchangeSounds(snap([position({ stopLoss: null, takeProfit: null, markPrice: 50_000 })]), snap())).toEqual(['fill']);
  });

  it('выставленный и снятый лимит звучат, только если с позициями ничего не случилось', () => {
    expect(exchangeSounds(snap(), snap([], [order('a')]))).toEqual(['placed']);
    expect(exchangeSounds(snap([], [order('a')]), snap())).toEqual(['cancel']);
    // Лимит исполнился: он пропал, а позиция появилась — это исполнение, не отмена.
    expect(exchangeSounds(snap([], [order('a')]), snap([position()]))).toEqual(['fill']);
  });

  it('перенос лимита молчит: id ордера прежний', () => {
    expect(exchangeSounds(snap([], [order('a')]), snap([], [order('a', { price: 59_000 })]))).toEqual([]);
  });

  it('несколько событий в одном снимке идут по важности', () => {
    const was = snap([position({ markPrice: 59_010 }), position({ symbol: 'ETHUSDT', markPrice: 3000, stopLoss: 2900, takeProfit: 3200 })]);
    const now = snap([position({ symbol: 'ETHUSDT', size: 0.3, markPrice: 3000, stopLoss: 2900, takeProfit: 3200 })]);
    expect(exchangeSounds(was, now)).toEqual(['stop', 'fill']);
  });
});
