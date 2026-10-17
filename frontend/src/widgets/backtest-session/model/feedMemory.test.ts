import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApiCandle } from '../lib/candles';
import { recallFeed, rememberClosed, rememberMinutes, rememberSkew } from './feedMemory';
import { prefetchLiveFeed, type LiveSource } from './useLiveFeed';

const MIN = 60_000;
const T = Date.UTC(2026, 9, 17, 12, 0, 0);
const c = (t: number, close: number) => ({ t, o: close, h: close, l: close, c: close });
const api = (t: number, close: number): ApiCandle => ({
  time: new Date(t).toISOString(),
  open: close,
  high: close,
  low: close,
  close,
  volume: 0,
});

/** Источник-заглушка: у каждого теста свой, память ленты различает их по ссылке. */
const fakeSource = (): LiveSource => ({
  tail: async () => ({ serverTime: new Date(Date.now()).toISOString(), minutes: [api(T, 100)] }),
  candles: async (tf) => (tf === 1 ? [c(T - MIN, 99)] : [c(T - 2 * 60 * MIN, 90), c(T - 60 * MIN, 95)]),
});

/**
 * Память ленты — то, что терминал рисует сразу при возврате на страницу, пока
 * свежие свечи ещё в пути. Ошибка здесь — не заглушка, а чужой график: свечи
 * другой монеты, другого таймфрейма или другой биржи под текущим названием.
 */
describe('feedMemory', () => {
  afterEach(() => vi.useRealTimers());

  it('о монете, которой не видели, ничего не помнит', () => {
    expect(recallFeed(fakeSource(), 'BTCUSDT', 60)).toBeNull();
  });

  it('помнит закрытые свечи, минутки и часы сервера', () => {
    const source = fakeSource();
    rememberClosed(source, 'BTCUSDT', 60, { rows: [c(T - 60 * MIN, 95)], anchor: T });
    rememberMinutes(source, 'BTCUSDT', [c(T, 100)]);
    rememberSkew(source, 1500);

    expect(recallFeed(source, 'BTCUSDT', 60)).toEqual({
      closed: { rows: [c(T - 60 * MIN, 95)], anchor: T },
      minutes: [c(T, 100)],
      skew: 1500,
    });
  });

  it('закрытые свечи — своего таймфрейма, минутки — общие для монеты', () => {
    const source = fakeSource();
    rememberClosed(source, 'BTCUSDT', 60, { rows: [c(T - 60 * MIN, 95)], anchor: T });
    rememberMinutes(source, 'BTCUSDT', [c(T, 100)]);

    const other = recallFeed(source, 'BTCUSDT', 240);

    expect(other?.closed).toBeNull();
    expect(other?.minutes).toEqual([c(T, 100)]);
  });

  it('монеты и источники не смешиваются', () => {
    const bybit = fakeSource();
    const product = fakeSource();
    rememberMinutes(bybit, 'BTCUSDT', [c(T, 100)]);

    expect(recallFeed(bybit, 'ETHUSDT', 60)).toBeNull();
    expect(recallFeed(product, 'BTCUSDT', 60)).toBeNull();
  });

  it('прогрев кладёт в память то же, что лента загрузила бы сама', async () => {
    // Часы — на пятой минуте часа T: граница загруженного (`anchor`) — начало этого часа.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T + 5 * MIN);
    const source = fakeSource();

    await prefetchLiveFeed('BTCUSDT', source);

    const memo = recallFeed(source, 'BTCUSDT', 60);
    expect(memo?.closed?.rows.map((x) => x.t)).toEqual([T - 2 * 60 * MIN, T - 60 * MIN]);
    expect(memo?.closed?.anchor).toBe(T);
    // Минутки суток и хвост — одним рядом, по времени.
    expect(memo?.minutes.map((x) => x.t)).toEqual([T - MIN, T]);
    expect(memo?.skew).not.toBeNull();
  });
});
