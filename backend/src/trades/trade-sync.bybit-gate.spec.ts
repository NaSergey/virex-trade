import { TradeSyncService } from './trade-sync.service';
import { ExchangePositionsCacheService } from '../exchanges/exchange-positions-cache.service';

/**
 * Синк и шлюз к Bybit (`bybit/bybit-gate.ts`): неудача, в которой виноват наш
 * шлюз, — не неудача ключа пользователя. Иначе пауза после бана IP через три
 * минуты разослала бы каждому «проверь API-ключи», хотя ключи в порядке.
 *
 * Шлюз подменён модулем целиком: его состояние — общее на процесс, и
 * настоящий шлюз, переведённый в паузу, остался бы в ней для соседних тестов.
 */
const gate = { paused: false, rejections: 0 };
jest.mock('../bybit/bybit-gate', () => ({
  bybitPaused: () => gate.paused,
  bybitRejections: () => gate.rejections,
}));

function makeService(fetchClosedTrades: jest.Mock) {
  const prisma = {
    user: { findMany: jest.fn().mockResolvedValue([{ id: 'u1' }]) },
    trade: {
      count: jest.fn().mockResolvedValue(5),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    openPositionSeen: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      upsert: jest.fn().mockResolvedValue(undefined),
      deleteMany: jest.fn().mockResolvedValue(undefined),
    },
  } as any;
  const adapter = {
    fetchClosedTrades,
    getOpenPositions: jest.fn().mockResolvedValue({ success: true, positions: [] }),
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
  const positions = { sync: jest.fn().mockResolvedValue({ fills: 0, positions: 0, stamped: 0 }) } as any;
  const dataVersion = { bump: jest.fn().mockResolvedValue(undefined) } as any;
  const service = new TradeSyncService(
    prisma,
    exchanges,
    credentials,
    tags,
    tradeAlerts,
    tradeContext,
    positions,
    dataVersion,
    new ExchangePositionsCacheService(exchanges),
  );
  return { service, adapter, tradeAlerts };
}

beforeEach(() => {
  gate.paused = false;
  gate.rejections = 0;
});

describe('TradeSyncService и шлюз Bybit', () => {
  it('пауза шлюза — тик пропускается: к бирже не ходит, неудачу не засчитывает', async () => {
    gate.paused = true;
    const fetchClosedTrades = jest.fn();
    const { service, tradeAlerts } = makeService(fetchClosedTrades);

    await expect(service.syncAll()).resolves.toEqual({ inserted: 0 });
    expect(fetchClosedTrades).not.toHaveBeenCalled();
    expect(tradeAlerts.syncOutcome).not.toHaveBeenCalled();
  });

  it('прогон упал, потому что шлюз отказал посреди него, — неудача не засчитывается', async () => {
    const fetchClosedTrades = jest.fn().mockImplementation(async () => {
      gate.rejections++;
      throw new Error('BYBIT_PAUSED');
    });
    const { service, tradeAlerts } = makeService(fetchClosedTrades);

    await service.syncAll();
    expect(fetchClosedTrades).toHaveBeenCalled();
    expect(tradeAlerts.syncOutcome).not.toHaveBeenCalled();
  });

  it('частичный прогон из-за шлюза — тоже не засчитывается', async () => {
    const fetchClosedTrades = jest.fn().mockImplementation(async () => {
      gate.rejections++;
      return { items: [], partial: true, error: 'BYBIT_BUSY' };
    });
    const { service, tradeAlerts } = makeService(fetchClosedTrades);

    await service.syncAll();
    expect(tradeAlerts.syncOutcome).not.toHaveBeenCalled();
  });

  it('неудача без участия шлюза засчитывается, как раньше', async () => {
    const fetchClosedTrades = jest.fn().mockRejectedValue(new Error('invalid api key'));
    const { service, tradeAlerts } = makeService(fetchClosedTrades);

    await service.syncAll();
    expect(tradeAlerts.syncOutcome).toHaveBeenCalledWith('u1', false);
  });

  it('удачный прогон засчитывается удачей', async () => {
    const fetchClosedTrades = jest.fn().mockResolvedValue({ items: [], partial: false });
    const { service, tradeAlerts } = makeService(fetchClosedTrades);

    await service.syncAll();
    expect(tradeAlerts.syncOutcome).toHaveBeenCalledWith('u1', true);
  });
});
