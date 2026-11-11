import { describe, expect, it, vi } from 'vitest';
import type { BacktestTrade } from '../api/types';
import { sendTrails, stopWithTrail } from './useReplay';

const trade = (over: Partial<BacktestTrade> = {}) => ({ id: 't1', direction: 'long', stopLoss: 98, trailDist: 2, entryPrice: 100, ...over }) as BacktestTrade;
const own = (stop: number, dist = 2, entry = 100) => ({ dist, entry, stop });

describe('stopWithTrail', () => {
  it('свой подтянутый теснее серверного — он', () => {
    expect(stopWithTrail(trade(), own(99))).toBe(99);
    expect(stopWithTrail(trade({ direction: 'short', stopLoss: 102 }), own(101))).toBe(101);
  });

  it('сервер уже дальше (другое правило подтянуло) — серверный', () => {
    expect(stopWithTrail(trade({ stopLoss: 99.5 }), own(99))).toBe(99.5);
  });

  it('расстояние сменилось (стоп перенесли руками) или подводящий выключен — серверный', () => {
    expect(stopWithTrail(trade({ stopLoss: 96, trailDist: 5 }), own(99))).toBe(96);
    expect(stopWithTrail(trade({ trailDist: null }), own(99))).toBe(98);
  });

  it('добор сдвинул средний вход — свой стоп от прежнего не действует (мог встать за новым безубытком)', () => {
    expect(stopWithTrail(trade({ entryPrice: 95 }), own(100))).toBe(98);
  });
});

describe('sendTrails', () => {
  it('шлёт свой стоп, который теснее серверного, по одному запросу на сделку', async () => {
    let finish!: () => void;
    const send = vi.fn(() => new Promise<void>((r) => (finish = r)));
    const trailed = new Map([['t1', own(99)]]);
    const sending = new Set<string>();

    sendTrails([trade()], trailed, sending, send);
    sendTrails([trade()], trailed, sending, send);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ id: 't1' }), 99, 2);

    finish();
    await Promise.resolve();
    await Promise.resolve();
    expect(sending.has('t1')).toBe(false);
  });

  it('сервер уже знает этот стоп — не шлёт', () => {
    const send = vi.fn(() => Promise.resolve());
    sendTrails([trade({ stopLoss: 99 })], new Map([['t1', own(99)]]), new Set(), send);
    expect(send).not.toHaveBeenCalled();
  });
});
