import { AnalyticsService } from './analytics.service';
import { PrismaService } from '../prisma/prisma.service';

/** Успешный fetch-ответ с заданным телом. */
function okResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

function failResponse(status = 500) {
  return { ok: false, status, json: async () => ({}) };
}

const globalBody = {
  data: { total_market_cap: { usd: 1 }, market_cap_change_percentage_24h_usd: 2 },
};
const fngBody = { data: [{ value: '55', value_classification: 'Greed' }] };
const tvlBody = [{ date: 1, tvl: 2 }];
const cmcCoingeckoBody = [
  { market_cap: 100, current_price: 10, price_change_percentage_24h: 1 },
  { market_cap: 200, current_price: 20, price_change_percentage_24h: 2 },
];
const bybitListBody = (list: unknown[]) => ({ result: { list } });

function makeService(prismaOverrides?: Partial<PrismaService>) {
  const prisma = {
    liquiditySnapshot: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    ...prismaOverrides,
  } as unknown as PrismaService;
  return new AnalyticsService(prisma);
}

describe('AnalyticsService — кэш рыночных эндпоинтов', () => {
  const originalCmcKey = process.env.CMC_API_KEY;

  beforeEach(() => {
    delete process.env.CMC_API_KEY;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalCmcKey === undefined) delete process.env.CMC_API_KEY;
    else process.env.CMC_API_KEY = originalCmcKey;
  });

  describe('N запросов подряд — один внешний вызов', () => {
    it('getMarketData', async () => {
      const fetchMock = jest.fn().mockResolvedValue(okResponse(globalBody));
      global.fetch = fetchMock as never;
      const service = makeService();

      await service.getMarketData();
      await service.getMarketData();
      await service.getMarketData();

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('getCMC20 (без CMC_API_KEY, путь через CoinGecko)', async () => {
      const fetchMock = jest.fn().mockResolvedValue(okResponse(cmcCoingeckoBody));
      global.fetch = fetchMock as never;
      const service = makeService();

      await service.getCMC20();
      await service.getCMC20();

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('getFearAndGreed', async () => {
      const fetchMock = jest.fn().mockResolvedValue(okResponse(fngBody));
      global.fetch = fetchMock as never;
      const service = makeService();

      await service.getFearAndGreed();
      await service.getFearAndGreed();

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('getDeFiTVL', async () => {
      const fetchMock = jest.fn().mockResolvedValue(okResponse(tvlBody));
      global.fetch = fetchMock as never;
      const service = makeService();

      await service.getDeFiTVL();
      await service.getDeFiTVL();

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('getLongShortRatio (три запроса к Bybit на первый вызов, ноль на повтор)', async () => {
      const fetchMock = jest
        .fn()
        .mockResolvedValue(okResponse(bybitListBody([])));
      global.fetch = fetchMock as never;
      const service = makeService();

      await service.getLongShortRatio('BTCUSDT');
      expect(fetchMock).toHaveBeenCalledTimes(3);

      await service.getLongShortRatio('BTCUSDT');
      await service.getLongShortRatio('BTCUSDT');

      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('getLiquidityHistory (запрос к БД)', async () => {
      const findMany = jest.fn().mockResolvedValue([]);
      const service = makeService({ liquiditySnapshot: { findMany } } as never);

      await service.getLiquidityHistory('BTCUSDT');
      await service.getLiquidityHistory('BTCUSDT');
      await service.getLiquidityHistory('BTCUSDT');

      expect(findMany).toHaveBeenCalledTimes(1);
    });

    it('getLiquidityHistory держит отдельный кэш по символу', async () => {
      const findMany = jest.fn().mockResolvedValue([]);
      const service = makeService({ liquiditySnapshot: { findMany } } as never);

      await service.getLiquidityHistory('BTCUSDT');
      await service.getLiquidityHistory('ETHUSDT');
      await service.getLiquidityHistory('BTCUSDT');
      await service.getLiquidityHistory('ETHUSDT');

      expect(findMany).toHaveBeenCalledTimes(2);
    });
  });

  describe('при ошибке внешнего вызова отдаётся просроченное значение', () => {
    it('getMarketData: после протухания кэша неудачный fetch возвращает старые данные', async () => {
      let now = 1_000_000;
      jest.spyOn(Date, 'now').mockImplementation(() => now);

      const fetchMock = jest.fn().mockResolvedValueOnce(okResponse(globalBody));
      global.fetch = fetchMock as never;
      const service = makeService();

      const first = await service.getMarketData();
      expect(first).toEqual({ marketCap: 1, marketCapChange24h: 2 });

      // Протухаем TTL (10 минут) и роняем внешний вызов.
      now += 10 * 60_000 + 1;
      fetchMock.mockResolvedValueOnce(failResponse(503));

      const second = await service.getMarketData();

      expect(second).toEqual(first);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('getLongShortRatio: после протухания кэша неудачный fetch возвращает старые данные', async () => {
      let now = 1_000_000;
      jest.spyOn(Date, 'now').mockImplementation(() => now);

      const ratioList = [{ timestamp: 1, buyRatio: '0.5', sellRatio: '0.5' }];
      const fetchMock = jest
        .fn()
        .mockResolvedValueOnce(okResponse(bybitListBody(ratioList)))
        .mockResolvedValueOnce(okResponse(bybitListBody([])))
        .mockResolvedValueOnce(okResponse(bybitListBody([])));
      global.fetch = fetchMock as never;
      const service = makeService();

      const first = await service.getLongShortRatio('BTCUSDT');
      expect(first.points).toHaveLength(1);

      now += 5 * 60_000 + 1;
      fetchMock.mockResolvedValue(failResponse(503));

      const second = await service.getLongShortRatio('BTCUSDT');

      expect(second).toEqual(first);
    });

    it('без кэша ошибка внешнего вызова пробрасывается как есть', async () => {
      const fetchMock = jest.fn().mockResolvedValue(failResponse(503));
      global.fetch = fetchMock as never;
      const service = makeService();

      await expect(service.getFearAndGreed()).rejects.toThrow('External API error');
    });

    it('getLiquidityHistory: после протухания кэша ошибка БД возвращает старые данные', async () => {
      let now = 1_000_000;
      jest.spyOn(Date, 'now').mockImplementation(() => now);

      const rows = [
        { ts: new Date(1000), price: 1, bidCenter: 1, askCenter: 1 },
      ];
      const findMany = jest.fn().mockResolvedValueOnce(rows);
      const service = makeService({ liquiditySnapshot: { findMany } } as never);

      const first = await service.getLiquidityHistory('BTCUSDT');
      expect(first.points).toHaveLength(1);

      now += 5 * 60_000 + 1;
      findMany.mockRejectedValueOnce(new Error('db down'));

      const second = await service.getLiquidityHistory('BTCUSDT');

      expect(second).toEqual(first);
    });
  });
});

/**
 * До 2026-10-02 кэш волатильности был одним слотом на все монеты: страница
 * рынка переключает BTC / ETH / SOL, и первая спрошенная монета 5 минут
 * отвечала за остальные.
 */
describe('AnalyticsService.getVolatility — кэш по монете', () => {
  /** 30 часовых свечей с заданным шагом цены — у разных монет разная волатильность. */
  const klines = (step: number) =>
    Array.from({ length: 30 }, (_, i) => {
      const close = 100 + (i % 2 === 0 ? step : -step);
      return [String(i * 3_600_000), '100', '0', '0', String(close), '1', '1000'];
    });

  let now = 1_000_000;
  beforeEach(() => {
    now = 1_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
  });
  afterEach(() => jest.restoreAllMocks());

  it('BTC и ETH не делят кэш: у каждой свой запрос и свой ответ', async () => {
    const fetchMock = jest.fn(async (url: string) =>
      okResponse(bybitListBody(url.includes('ETHUSDT') ? klines(5) : klines(1))),
    );
    global.fetch = fetchMock as never;
    const service = makeService();

    const btc = await service.getVolatility('BTCUSDT');
    const eth = await service.getVolatility('ETHUSDT');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(eth.currentVolPct).not.toBeCloseTo(btc.currentVolPct);
    // Повторные запросы каждой монеты — из её же кэша.
    await expect(service.getVolatility('BTCUSDT')).resolves.toEqual(btc);
    await expect(service.getVolatility('ETHUSDT')).resolves.toEqual(eth);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('при ошибке биржи запасной ответ — только своей монеты, чужой не подставляется', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce(okResponse(bybitListBody(klines(1))));
    global.fetch = fetchMock as never;
    const service = makeService();
    const btc = await service.getVolatility('BTCUSDT');

    now += 10 * 60_000; // кэш BTC протух
    fetchMock.mockResolvedValue(failResponse());

    await expect(service.getVolatility('ETHUSDT')).rejects.toThrow();
    await expect(service.getVolatility('BTCUSDT')).resolves.toEqual(btc);
  });
});
