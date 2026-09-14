import { LiveMarketService } from './live-market.service';
import type { BinanceCandle } from './binance-klines.client';

const MIN = 60_000;
const T0 = Date.UTC(2026, 8, 14, 12, 0);

const kline = (t: number, close = 100): BinanceCandle => ({ time: t, open: close, high: close + 1, low: close - 1, close, volume: 1 });
const stored = (t: number, close = 50) => ({ time: new Date(t), open: close, high: close, low: close, close, volume: 1 });

function make(tail: BinanceCandle[] = [kline(T0 - MIN), kline(T0, 101)]) {
  const binance = { fetchRecent: jest.fn().mockResolvedValue(tail) };
  const marketData = { getCandles: jest.fn().mockResolvedValue([]) };
  const service = new LiveMarketService(binance as never, marketData as never);
  let now = T0 + 20_000;
  (service as unknown as { now: () => number }).now = () => now;
  return { service, binance, marketData, setNow: (v: number) => (now = v) };
}

describe('LiveMarketService', () => {
  it('в пределах кэша второй раз в Binance не ходит', async () => {
    const { service, binance, setNow } = make();
    await service.recentMinutes();
    setNow(T0 + 21_000);
    await service.recentMinutes();
    expect(binance.fetchRecent).toHaveBeenCalledTimes(1);
    expect(binance.fetchRecent).toHaveBeenCalledWith('BTCUSDT', 1, 30);
  });

  it('устаревший кэш перезапрашивается', async () => {
    const { service, binance, setNow } = make();
    await service.recentMinutes();
    setNow(T0 + 22_000);
    await service.recentMinutes();
    expect(binance.fetchRecent).toHaveBeenCalledTimes(2);
  });

  it('одновременные вызовы ждут один запрос', async () => {
    const { service, binance } = make();
    await Promise.all([service.recentMinutes(), service.recentMinutes(), service.recentMinutes()]);
    expect(binance.fetchRecent).toHaveBeenCalledTimes(1);
  });

  it('цена ордера — закрытие последней минутки хвоста, время — сервера', async () => {
    const { service } = make();
    const q = await service.quote();
    expect(q).toEqual({ price: 101, time: new Date(T0 + 20_000) });
  });

  it('биржа не ответила — 503 с кодом, а не падение запроса', async () => {
    const { service, binance } = make();
    binance.fetchRecent.mockRejectedValue(new Error('network'));
    await expect(service.quote()).rejects.toMatchObject({
      response: { code: 'LIVE_PRICE_UNAVAILABLE' },
      status: 503,
    });
  });

  it('minutesSince внутри хвоста в базу не ходит', async () => {
    const { service, marketData } = make();
    const minutes = await service.minutesSince(T0 - MIN, T0 + 20_000);
    expect(marketData.getCandles).not.toHaveBeenCalled();
    expect(minutes.map((c) => c.time.getTime())).toEqual([T0 - MIN, T0]);
  });

  it('minutesSince: хранилище до хвоста, хвост замещает по времени, до until не включительно', async () => {
    const { service, marketData } = make();
    marketData.getCandles.mockResolvedValue([stored(T0 - 3 * MIN), stored(T0 - 2 * MIN), stored(T0 - MIN, 7)]);

    const minutes = await service.minutesSince(T0 - 3 * MIN, T0);

    expect(marketData.getCandles).toHaveBeenCalledWith({
      timeframe: 1,
      from: new Date(T0 - 3 * MIN),
      to: new Date(T0 - MIN - 1),
      limit: 5000,
    });
    expect(minutes.map((c) => [c.time.getTime(), c.close])).toEqual([
      [T0 - 3 * MIN, 50],
      [T0 - 2 * MIN, 50],
      [T0 - MIN, 100],
    ]);
  });

  it('minutesSince: хранилище упёрлось в лимит — хвост не приклеивается через дыру', async () => {
    const { service, marketData } = make();
    const rows = Array.from({ length: 5000 }, (_, i) => stored(T0 - 10_000 * MIN + i * MIN));
    marketData.getCandles.mockResolvedValue(rows);

    const minutes = await service.minutesSince(T0 - 10_000 * MIN, T0 + MIN);

    expect(minutes).toHaveLength(5000);
    expect(minutes[minutes.length - 1].time.getTime()).toBe(T0 - 10_000 * MIN + 4999 * MIN);
  });
});
