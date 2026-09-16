import { BybitMarketService } from './bybit-market.service';

function stubFetch(lastPrice: string) {
  globalThis.fetch = (async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      retCode: 0,
      retMsg: 'OK',
      result: { list: [{ lastPrice }] },
    }),
  })) as unknown as typeof fetch;
}

/**
 * T22 (B8): cache entries in BybitMarketService are only ever overwritten by
 * the next request for the same key, never removed on their own.
 * evictExpired() — run periodically by the service's own sweepTimer, and
 * called directly here — is the sweep that actually frees an expired key.
 */
describe('BybitMarketService cache sweep (T22)', () => {
  const realFetch = globalThis.fetch;
  let service: BybitMarketService;

  afterEach(() => {
    globalThis.fetch = realFetch;
    jest.restoreAllMocks();
    service.onModuleDestroy();
  });

  it('removes an expired entry from the cache once evictExpired() runs', async () => {
    service = new BybitMarketService();
    stubFetch('100');
    jest.spyOn(Date, 'now').mockReturnValue(1_000_000);

    await service.getLastPrice('BTCUSDT');
    expect(service.cacheSize).toBe(1);

    // Past PRICE_TTL_MS (3s) — the entry is now expired but still sitting in
    // the map, since nothing but a sweep or a matching request removes it.
    jest.spyOn(Date, 'now').mockReturnValue(1_000_000 + 3_000 + 1);
    service.evictExpired();

    expect(service.cacheSize).toBe(0);
  });

  it('keeps a fresh entry when evictExpired() runs before its TTL elapses', async () => {
    service = new BybitMarketService();
    stubFetch('100');
    jest.spyOn(Date, 'now').mockReturnValue(1_000_000);

    await service.getLastPrice('BTCUSDT');
    service.evictExpired();

    expect(service.cacheSize).toBe(1);
  });

  it('sweeps only the expired keys, leaving fresher ones in place', async () => {
    service = new BybitMarketService();
    jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    stubFetch('100');
    await service.getLastPrice('BTCUSDT'); // expires at 1_003_000

    jest.spyOn(Date, 'now').mockReturnValue(1_002_000);
    stubFetch('3000');
    await service.getLastPrice('ETHUSDT'); // expires at 1_005_000
    expect(service.cacheSize).toBe(2);

    jest.spyOn(Date, 'now').mockReturnValue(1_003_500); // BTCUSDT expired, ETHUSDT not yet
    service.evictExpired();

    expect(service.cacheSize).toBe(1);
  });
});
