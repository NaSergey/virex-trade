import { TradeSyncService, positionSnapshot } from './trade-sync.service';
import { ExchangePositionsCacheService } from '../exchanges/exchange-positions-cache.service';

/**
 * Снимок открытых позиций для профиля игрока (спека 2026-10-16): синк и так
 * читает позиции раз в минуту, и чужой профиль берёт их из базы, а не у биржи
 * ключом владельца — иначе каждый просмотр любого профиля тратил бы общий
 * бюджет шлюза Bybit.
 */
const POS = {
  symbol: 'BTCUSDT',
  direction: 'long' as const,
  size: '0.05',
  avgPrice: '112430.5',
  markPrice: '113000',
  positionValue: '5650',
  unrealisedPnl: '28.47',
  leverage: '10',
  liqPrice: '101500',
};

function makeService(
  positions: unknown[],
  updateMany = jest.fn().mockResolvedValue({ count: 1 }),
  success = true,
) {
  const prisma = {
    user: { findMany: jest.fn().mockResolvedValue([{ id: 'u1' }]) },
    trade: {
      count: jest.fn().mockResolvedValue(5),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    openPositionSeen: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany,
      upsert: jest.fn().mockResolvedValue(undefined),
      deleteMany: jest.fn().mockResolvedValue(undefined),
    },
  } as any;
  const adapter = {
    fetchClosedTrades: jest.fn().mockResolvedValue({ items: [], partial: false }),
    getOpenPositions: jest.fn().mockResolvedValue({ success, positions }),
  };
  const exchanges = { get: () => adapter } as any;
  const credentials = {
    getActive: jest.fn().mockResolvedValue({ exchange: 'bybit', credentials: { apiKey: 'k', apiSecret: 's' } }),
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
  const tradeContext = { computeMissing: jest.fn().mockResolvedValue(0), snapshotNow: jest.fn() } as any;
  const builder = { sync: jest.fn().mockResolvedValue({ fills: 0, positions: 0, stamped: 0 }) } as any;
  const dataVersion = { bump: jest.fn().mockResolvedValue(undefined) } as any;
  const service = new TradeSyncService(
    prisma,
    exchanges,
    credentials,
    tags,
    tradeAlerts,
    tradeContext,
    builder,
    dataVersion,
    new ExchangePositionsCacheService(exchanges),
  );
  return { service, prisma, tradeAlerts };
}

/** Вызовы `updateMany`, писавшие снимок, — не правки реестра по другим поводам. */
const snapshotCalls = (updateMany: jest.Mock) =>
  updateMany.mock.calls.filter((c: any[]) => 'snapshotAt' in c[0].data);

describe('positionSnapshot', () => {
  it('берёт поля биржи строками, а отсутствующие — null, а не «0»', () => {
    const at = new Date('2026-10-16T10:00:00Z');
    expect(positionSnapshot({ symbol: 'X', direction: 'short', size: '2' }, at)).toEqual({
      size: '2',
      avgPrice: null,
      markPrice: null,
      positionValue: null,
      unrealisedPnl: null,
      leverage: null,
      liqPrice: null,
      snapshotAt: at,
    });
  });
});

describe('TradeSyncService: снимок открытых позиций', () => {
  it('каждый тик пишет снимок открытой позиции в её строку реестра', async () => {
    const { service, prisma } = makeService([POS, { ...POS, symbol: 'ETHUSDT', size: '0' }]);

    await service.syncAll();

    const calls = snapshotCalls(prisma.openPositionSeen.updateMany);
    // Позиция нулевого размера уже закрыта — снимок ей не нужен.
    expect(calls).toHaveLength(1);
    expect(calls[0][0].where).toEqual({ userId: 'u1', symbol: 'BTCUSDT', direction: 'long' });
    expect(calls[0][0].data).toMatchObject({ size: '0.05', unrealisedPnl: '28.47', liqPrice: '101500' });
  });

  it('биржа не ответила позициями — снимок не трогается', async () => {
    const { service, prisma } = makeService([POS], undefined, false);

    await service.syncAll();

    expect(snapshotCalls(prisma.openPositionSeen.updateMany)).toHaveLength(0);
  });

  it('сбой записи снимка не роняет тик и не засчитывается неудачей синка', async () => {
    const failing = jest.fn().mockImplementation(async (args: any) => {
      if ('snapshotAt' in args.data) throw new Error('db down');
      return { count: 0 };
    });
    const { service, tradeAlerts } = makeService([POS], failing);

    await expect(service.syncAll()).resolves.toEqual({ inserted: 0 });
    expect(tradeAlerts.syncOutcome).toHaveBeenCalledWith('u1', true);
  });
});
