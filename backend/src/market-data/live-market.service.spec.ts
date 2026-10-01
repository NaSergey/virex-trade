import { LiveMarketService } from './live-market.service';
import type { BinanceCandle } from './binance-klines.client';

const MIN = 60_000;
const T0 = Date.UTC(2026, 8, 14, 12, 0);

const kline = (t: number, close = 100): BinanceCandle => ({ time: t, open: close, high: close + 1, low: close - 1, close, volume: 1 });
const stored = (t: number, close = 50) => ({ time: new Date(t), open: close, high: close, low: close, close, volume: 1 });

function make(tail: BinanceCandle[] = [kline(T0 - MIN), kline(T0, 101)]) {
  const binance = { fetchRecent: jest.fn().mockResolvedValue(tail), fetchRange: jest.fn().mockResolvedValue([]) };
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
    const minutes = await service.minutesSince('BTCUSDT', T0 - MIN, T0 + 20_000);
    expect(marketData.getCandles).not.toHaveBeenCalled();
    expect(minutes.map((c) => c.time.getTime())).toEqual([T0 - MIN, T0]);
  });

  it('minutesSince: хранилище до хвоста, хвост замещает по времени, до until не включительно', async () => {
    const { service, marketData } = make();
    marketData.getCandles.mockResolvedValue([stored(T0 - 3 * MIN), stored(T0 - 2 * MIN), stored(T0 - MIN, 7)]);

    const minutes = await service.minutesSince('BTCUSDT', T0 - 3 * MIN, T0);

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

    const minutes = await service.minutesSince('BTCUSDT', T0 - 10_000 * MIN, T0 + MIN);

    expect(minutes).toHaveLength(5000);
    expect(minutes[minutes.length - 1].time.getTime()).toBe(T0 - 10_000 * MIN + 4999 * MIN);
  });

  describe('монеты', () => {
    it('хвост и кэш у каждой монеты свои', async () => {
      const { service, binance } = make();
      await service.recentMinutes('BTCUSDT');
      await service.recentMinutes('ETHUSDT');
      await service.recentMinutes('ETHUSDT');
      expect(binance.fetchRecent.mock.calls).toEqual([
        ['BTCUSDT', 1, 30],
        ['ETHUSDT', 1, 30],
      ]);
    });

    it('quote берёт хвост своей монеты', async () => {
      const { service, binance } = make();
      await service.quote('SOLUSDT');
      expect(binance.fetchRecent).toHaveBeenCalledWith('SOLUSDT', 1, 30);
    });

    it('minutesSince не-BTC до хвоста идёт к Binance, а не в хранилище', async () => {
      const { service, binance, marketData } = make();
      binance.fetchRange.mockResolvedValue([kline(T0 - 3 * MIN, 7), kline(T0 - 2 * MIN, 8)]);

      const minutes = await service.minutesSince('ETHUSDT', T0 - 3 * MIN, T0 + MIN);

      expect(marketData.getCandles).not.toHaveBeenCalled();
      expect(binance.fetchRange).toHaveBeenCalledWith('ETHUSDT', 1, {
        startTime: T0 - 3 * MIN,
        endTime: T0 - MIN - 1,
        limit: 1000,
      });
      expect(minutes.map((c) => [c.time.getTime(), c.close])).toEqual([
        [T0 - 3 * MIN, 7],
        [T0 - 2 * MIN, 8],
        [T0 - MIN, 100],
        [T0, 101],
      ]);
    });

    it('prices: монета без ответа биржи пропускается, остальные есть', async () => {
      const { service, binance } = make();
      binance.fetchRecent.mockImplementation(async (symbol: string) => {
        if (symbol === 'XRPUSDT') throw new Error('network');
        return [kline(T0, symbol === 'ETHUSDT' ? 2500 : 70_000)];
      });

      expect(await service.prices(['ETHUSDT', 'XRPUSDT'])).toEqual({ ETHUSDT: 2500 });
    });
  });

  describe('history — история монеты без хранилища', () => {
    const H = 60 * MIN;

    it('без from листает назад от to, склеивает страницы по возрастанию', async () => {
      const { service, binance } = make();
      const older = Array.from({ length: 200 }, (_, i) => kline(T0 - (1400 - i) * H));
      const newer = Array.from({ length: 1000 }, (_, i) => kline(T0 - (1200 - i) * H));
      binance.fetchRange.mockResolvedValueOnce(newer).mockResolvedValueOnce(older);

      const rows = await service.history('ETHUSDT', { timeframe: 60, to: new Date(T0 - 200 * H), limit: 1200 });

      expect(binance.fetchRange.mock.calls[0]).toEqual(['ETHUSDT', 60, { endTime: T0 - 200 * H, limit: 1000 }]);
      expect(binance.fetchRange.mock.calls[1]).toEqual(['ETHUSDT', 60, { endTime: T0 - 1200 * H - 1, limit: 200 }]);
      expect(rows).toHaveLength(1200);
      expect(rows[0].time.getTime()).toBe(T0 - 1400 * H);
      expect(rows[1199].time.getTime()).toBe(T0 - 201 * H);
    });

    it('с from листает вперёд и останавливается на неполной странице', async () => {
      const { service, binance } = make();
      binance.fetchRange.mockResolvedValueOnce([kline(T0 - 10 * MIN), kline(T0 - 9 * MIN)]);

      const rows = await service.history('ETHUSDT', { timeframe: 1, from: new Date(T0 - 10 * MIN), limit: 5000 });

      expect(binance.fetchRange).toHaveBeenCalledTimes(1);
      expect(binance.fetchRange).toHaveBeenCalledWith('ETHUSDT', 1, {
        startTime: T0 - 10 * MIN,
        endTime: undefined,
        limit: 1000,
      });
      expect(rows).toHaveLength(2);
    });

    it('незакрытую свечу не отдаёт — у хранилища её тоже нет', async () => {
      const { service, binance, setNow } = make();
      // Минутка T0 ещё формируется; T0 − 1 мин закрыта с запасом CLOSE_GRACE_MS.
      setNow(T0 + 40_000);
      binance.fetchRange.mockResolvedValueOnce([kline(T0 - MIN), kline(T0)]);

      const rows = await service.history('ETHUSDT', { timeframe: 1, limit: 300 });

      expect(rows.map((c) => c.time.getTime())).toEqual([T0 - MIN]);
    });

    it('неизвестный таймфрейм — 400', async () => {
      const { service } = make();
      await expect(service.history('ETHUSDT', { timeframe: 7, limit: 10 })).rejects.toMatchObject({ status: 400 });
    });
  });
});
