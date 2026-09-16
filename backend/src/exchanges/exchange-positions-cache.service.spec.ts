import { ExchangePositionsCacheService } from './exchange-positions-cache.service';
import { ExchangeRegistry } from './exchange-registry.service';
import { PositionsResult } from './exchange.types';

const creds = { apiKey: 'k', apiSecret: 's' };

function makeService(getOpenPositions: jest.Mock) {
  const adapter = { id: 'bybit', getOpenPositions } as any;
  const exchanges = {
    get: jest.fn().mockReturnValue(adapter),
  } as unknown as ExchangeRegistry;
  return { service: new ExchangePositionsCacheService(exchanges), exchanges };
}

/**
 * T20 (B4): same cached()+inflight shape as BybitMarketService, applied to
 * getOpenPositions — the call exchange.controller's /api/exchange/positions
 * (2x/min per browser tab) and the background sync tick both make.
 */
describe('ExchangePositionsCacheService (T20)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('coalesces two concurrent calls into a single adapter call — a real race, not two sequential awaits', async () => {
    let resolveAdapter!: (v: PositionsResult) => void;
    const pending = new Promise<PositionsResult>((r) => {
      resolveAdapter = r;
    });
    const getOpenPositions = jest.fn().mockReturnValue(pending);
    const { service } = makeService(getOpenPositions);

    // Two callers ask before the first upstream call has settled — exactly
    // two browser tabs of the same user polling at the same moment.
    const p1 = service.getOpenPositions('u1', 'bybit', creds);
    const p2 = service.getOpenPositions('u1', 'bybit', creds);
    resolveAdapter({ success: true, positions: [] });
    const [r1, r2] = await Promise.all([p1, p2]);

    expect(getOpenPositions).toHaveBeenCalledTimes(1);
    expect(r1).toBe(r2);
  });

  it('serves the cached snapshot for a later call inside the 12s TTL window', async () => {
    const getOpenPositions = jest
      .fn()
      .mockResolvedValue({ success: true, positions: [] });
    const { service } = makeService(getOpenPositions);
    jest.spyOn(Date, 'now').mockReturnValue(1_000_000);

    await service.getOpenPositions('u1', 'bybit', creds);
    await service.getOpenPositions('u1', 'bybit', creds);

    expect(getOpenPositions).toHaveBeenCalledTimes(1);
  });

  it('calls the adapter again once the 12s TTL has elapsed', async () => {
    const getOpenPositions = jest
      .fn()
      .mockResolvedValue({ success: true, positions: [] });
    const { service } = makeService(getOpenPositions);
    jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    await service.getOpenPositions('u1', 'bybit', creds);

    jest.spyOn(Date, 'now').mockReturnValue(1_000_000 + 12_000 + 1);
    await service.getOpenPositions('u1', 'bybit', creds);

    expect(getOpenPositions).toHaveBeenCalledTimes(2);
  });

  it('does not cache a failed response — the next call retries the adapter', async () => {
    const getOpenPositions = jest
      .fn()
      .mockResolvedValue({ success: false, positions: [], error: 'boom' });
    const { service } = makeService(getOpenPositions);
    jest.spyOn(Date, 'now').mockReturnValue(1_000_000);

    await service.getOpenPositions('u1', 'bybit', creds);
    await service.getOpenPositions('u1', 'bybit', creds);

    expect(getOpenPositions).toHaveBeenCalledTimes(2);
  });

  it('keeps a rejected adapter call retryable instead of pinning the rejection', async () => {
    const getOpenPositions = jest
      .fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({ success: true, positions: [] });
    const { service } = makeService(getOpenPositions);

    await expect(
      service.getOpenPositions('u1', 'bybit', creds),
    ).rejects.toThrow('network down');
    await expect(
      service.getOpenPositions('u1', 'bybit', creds),
    ).resolves.toEqual({
      success: true,
      positions: [],
    });
    expect(getOpenPositions).toHaveBeenCalledTimes(2);
  });

  it('keys per exchange — a switched active exchange never returns the previous one’s cached snapshot', async () => {
    const bybitPositions: PositionsResult = {
      success: true,
      positions: [{ symbol: 'BTCUSDT', direction: 'long', size: '1' }],
    };
    const okxPositions: PositionsResult = {
      success: true,
      positions: [{ symbol: 'ETHUSDT', direction: 'short', size: '2' }],
    };
    const bybitAdapter = {
      id: 'bybit',
      getOpenPositions: jest.fn().mockResolvedValue(bybitPositions),
    };
    const okxAdapter = {
      id: 'okx',
      getOpenPositions: jest.fn().mockResolvedValue(okxPositions),
    };
    const exchanges = {
      get: jest.fn((id: string) =>
        id === 'bybit' ? bybitAdapter : okxAdapter,
      ),
    } as unknown as ExchangeRegistry;
    const service = new ExchangePositionsCacheService(exchanges);

    const bybitResult = await service.getOpenPositions('u1', 'bybit', creds);
    const okxResult = await service.getOpenPositions('u1', 'okx', creds);

    expect(bybitResult).toEqual(bybitPositions);
    expect(okxResult).toEqual(okxPositions);
  });

  it('does not coalesce different users — each gets its own adapter call', async () => {
    const getOpenPositions = jest
      .fn()
      .mockResolvedValue({ success: true, positions: [] });
    const { service } = makeService(getOpenPositions);

    await Promise.all([
      service.getOpenPositions('u1', 'bybit', creds),
      service.getOpenPositions('u2', 'bybit', creds),
    ]);

    expect(getOpenPositions).toHaveBeenCalledTimes(2);
  });

  // T20 fix (review, Important #2): rotating the key of an already-active
  // exchange keeps the same cache key (`${userId}:${exchange}` doesn't
  // change), so without an explicit invalidate() the old key's snapshot
  // would keep being served for up to the 12s TTL.
  describe('invalidate() (T20 fix, Important #2)', () => {
    it('forces the next call to hit the adapter again, still inside the TTL window', async () => {
      const getOpenPositions = jest
        .fn()
        .mockResolvedValue({ success: true, positions: [] });
      const { service } = makeService(getOpenPositions);
      jest.spyOn(Date, 'now').mockReturnValue(1_000_000);

      await service.getOpenPositions('u1', 'bybit', creds);
      expect(getOpenPositions).toHaveBeenCalledTimes(1);

      service.invalidate('u1', 'bybit');
      await service.getOpenPositions('u1', 'bybit', creds);

      // Time never advanced — only invalidate() explains the second call.
      expect(getOpenPositions).toHaveBeenCalledTimes(2);
    });

    it('a key rotation on the active exchange is reflected on the very next call, not after the old snapshot expires', async () => {
      const oldPositions: PositionsResult = {
        success: true,
        positions: [{ symbol: 'BTCUSDT', direction: 'long', size: '1' }],
      };
      const newPositions: PositionsResult = {
        success: true,
        positions: [{ symbol: 'BTCUSDT', direction: 'long', size: '2' }],
      };
      const getOpenPositions = jest
        .fn()
        .mockResolvedValueOnce(oldPositions)
        .mockResolvedValueOnce(newPositions);
      const { service } = makeService(getOpenPositions);
      jest.spyOn(Date, 'now').mockReturnValue(1_000_000);

      const before = await service.getOpenPositions('u1', 'bybit', creds);
      expect(before).toEqual(oldPositions);

      // settings.controller.ts: connect() saves the rotated key, then
      // invalidates both the credentials cache and this one.
      service.invalidate('u1', 'bybit');

      const after = await service.getOpenPositions('u1', 'bybit', creds);
      expect(after).toEqual(newPositions);
    });

    it('only clears the given user+exchange — other keys keep their cached snapshot', async () => {
      const bybitAdapter = {
        id: 'bybit',
        getOpenPositions: jest
          .fn()
          .mockResolvedValue({ success: true, positions: [] }),
      };
      const okxAdapter = {
        id: 'okx',
        getOpenPositions: jest
          .fn()
          .mockResolvedValue({ success: true, positions: [] }),
      };
      const exchanges = {
        get: jest.fn((id: string) =>
          id === 'bybit' ? bybitAdapter : okxAdapter,
        ),
      } as unknown as ExchangeRegistry;
      const service = new ExchangePositionsCacheService(exchanges);
      jest.spyOn(Date, 'now').mockReturnValue(1_000_000);

      await service.getOpenPositions('u1', 'bybit', creds);
      await service.getOpenPositions('u1', 'okx', creds);
      await service.getOpenPositions('u2', 'bybit', creds);

      service.invalidate('u1', 'bybit');

      await service.getOpenPositions('u1', 'bybit', creds); // re-fetched
      await service.getOpenPositions('u1', 'okx', creds); // still cached
      await service.getOpenPositions('u2', 'bybit', creds); // still cached

      expect(bybitAdapter.getOpenPositions).toHaveBeenCalledTimes(3); // u1 x2 + u2 x1
      expect(okxAdapter.getOpenPositions).toHaveBeenCalledTimes(1);
    });

    it('is a no-op when nothing is cached for that key', () => {
      const { service } = makeService(jest.fn());
      expect(() => service.invalidate('u1', 'bybit')).not.toThrow();
    });
  });
});
