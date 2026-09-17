import { TradeSyncService } from './trade-sync.service';
import { ExchangePositionsCacheService } from '../exchanges/exchange-positions-cache.service';

/**
 * T12 (A3): обход `syncAll` идёт с ограничителем параллелизма (не голым
 * `for`, не голым `Promise.all`), и на каждого пользователя за тик уходит
 * ровно один `getOpenPositions`, а не два. Сервис собирается вручную с
 * заглушками (как в balance-snapshot.service.spec.ts) — тест про сам обход
 * и про то, что уходит в `positions.sync`, а не про Nest DI.
 */
function makeService(
  userIds: string[],
  opts: {
    getOpenPositions: jest.Mock;
    fetchClosedTrades?: jest.Mock;
  },
) {
  const prisma = {
    user: { findMany: jest.fn().mockResolvedValue(userIds.map((id) => ({ id }))) },
    trade: {
      count: jest.fn().mockResolvedValue(0),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    openPositionSeen: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      upsert: jest.fn().mockResolvedValue(undefined),
      deleteMany: jest.fn().mockResolvedValue(undefined),
    },
  } as any;

  const adapter = {
    fetchClosedTrades: opts.fetchClosedTrades ?? jest.fn().mockResolvedValue({ items: [], partial: false }),
    getOpenPositions: opts.getOpenPositions,
  };
  const exchanges = { get: () => adapter } as any;
  const credentials = {
    getActive: jest
      .fn()
      .mockResolvedValue({ exchange: 'bybit', credentials: { apiKey: 'k', apiSecret: 's' } }),
  } as any;
  const tags = {
    linkTagsToNewTrades: jest.fn().mockResolvedValue(0),
    pruneClosedPositions: jest.fn().mockResolvedValue(undefined),
  } as any;
  const tradeAlerts = {
    syncOutcome: jest.fn().mockResolvedValue(undefined),
    tradesClosed: jest.fn().mockResolvedValue(undefined),
    overtradeCheck: jest.fn().mockResolvedValue(undefined),
    positionOpened: jest.fn().mockResolvedValue(undefined),
  } as any;
  const tradeContext = {
    computeMissing: jest.fn().mockResolvedValue(0),
    snapshotNow: jest.fn(),
  } as any;
  const positions = { sync: jest.fn().mockResolvedValue({ fills: 0, positions: 0, stamped: 0 }) } as any;
  const dataVersion = { bump: jest.fn().mockResolvedValue(undefined) } as any;
  // T20 (B4): real cache/coalescing service wired to the same fake `exchanges`
  // — this exercises the actual call path syncUserUnlocked now goes through,
  // not a bypass of it.
  const positionsCache = new ExchangePositionsCacheService(exchanges);

  const service = new TradeSyncService(
    prisma,
    exchanges,
    credentials,
    tags,
    tradeAlerts,
    tradeContext,
    positions,
    dataVersion,
    positionsCache,
  );
  return { service, prisma, adapter, positions };
}

describe('TradeSyncService.syncAll — T12 параллельный обход', () => {
  it('обходит пользователей с ограничением параллелизма — реально параллельно, но не безгранично', async () => {
    const userIds = Array.from({ length: 30 }, (_, i) => `u${i}`);
    let inFlight = 0;
    let maxInFlight = 0;
    const getOpenPositions = jest.fn().mockImplementation(async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return { success: true, positions: [] };
    });
    const { service } = makeService(userIds, { getOpenPositions });

    await service.syncAll();

    expect(getOpenPositions).toHaveBeenCalledTimes(30);
    // Реально шло параллельно (не голый последовательный for)...
    expect(maxInFlight).toBeGreaterThan(1);
    // ...но ограничитель держит верхнюю границу — бриф называет 8-16.
    expect(maxInFlight).toBeLessThanOrEqual(16);
  });

  it('вызывает getOpenPositions ровно один раз на пользователя за тик, не дважды', async () => {
    const getOpenPositions = jest.fn().mockResolvedValue({ success: true, positions: [] });
    const { service, positions } = makeService(['u1'], { getOpenPositions });

    await service.syncAll();

    expect(getOpenPositions).toHaveBeenCalledTimes(1);
    // И тот же результат ушёл параметром в PositionBuilderService.sync, а не
    // был запрошен им самостоятельно ещё раз. `newTradeSymbols: undefined` —
    // T-final-review (re-review): этот тик не вставил новых closed-pnl Trade
    // (fetchClosedTrades вернул пустой items, inserted === 0), внешний opts
    // при этом не задан (undefined).
    expect(positions.sync).toHaveBeenCalledWith(
      'u1',
      'bybit',
      { apiKey: 'k', apiSecret: 's' },
      { success: true, positions: [] },
      { newTradeSymbols: undefined },
    );
  });

  it('отказ getOpenPositions одного пользователя не рушит обход остальных', async () => {
    const getOpenPositions = jest.fn().mockRejectedValue(new Error('network down'));
    const { service } = makeService(['u1', 'u2'], { getOpenPositions });

    await expect(service.syncAll()).resolves.toEqual({ inserted: 0 });
    expect(getOpenPositions).toHaveBeenCalledTimes(2);
  });
});
