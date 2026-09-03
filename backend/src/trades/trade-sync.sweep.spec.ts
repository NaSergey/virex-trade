// Потолок конкурентности читается на загрузке модуля, поэтому переменная
// окружения выставляется до require — обычный import подняло бы выше присваивания.
const CONCURRENCY = 4;
process.env.TRADE_SYNC_CONCURRENCY = String(CONCURRENCY);

/* eslint-disable @typescript-eslint/no-require-imports */
const { TradeSyncService } =
  require('./trade-sync.service') as typeof import('./trade-sync.service');

type Svc = InstanceType<typeof TradeSyncService>;

/** Сервис с заглушками вместо зависимостей: обход не трогает ни одну из них. */
const makeService = (userIds: string[]): Svc => {
  const prisma = {
    user: { findMany: async () => userIds.map((id) => ({ id })) },
  };
  const stub = {} as never;
  return new TradeSyncService(
    prisma as never,
    stub,
    stub,
    stub,
    stub,
    stub,
    stub,
  );
};

/**
 * Обход пользователей был последовательным, и на 1000 подключённых круг занимал
 * десятки минут вместо минуты — упираясь не в процессор, а в ожидание биржи.
 * Тик, попавший на незакрытый обход, при этом молча отбрасывался, так что
 * снаружи это выглядело как работающий синк с необъяснимо старыми сделками.
 */
describe('TradeSyncService.syncAll', () => {
  it('синхронизирует всех и суммирует вставленное', async () => {
    const svc = makeService(['a', 'b', 'c', 'd', 'e']);
    const seen: string[] = [];
    (svc as never as Record<string, unknown>).runLocked = async (
      userId: string,
    ) => {
      seen.push(userId);
      return 2;
    };

    expect(await svc.syncAll()).toEqual({ inserted: 10 });
    expect(seen.sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('идёт параллельно, но не шире TRADE_SYNC_CONCURRENCY', async () => {
    const svc = makeService(Array.from({ length: 20 }, (_, i) => `u${i}`));
    let inFlight = 0;
    let peak = 0;
    (svc as never as Record<string, unknown>).runLocked = async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
      return 0;
    };

    await svc.syncAll();
    expect(peak).toBe(CONCURRENCY);
  });

  it('чужая ошибка не обрывает обход', async () => {
    const svc = makeService(['ok1', 'boom', 'ok2']);
    const done: string[] = [];
    (svc as never as Record<string, unknown>).runLocked = async (
      userId: string,
    ) => {
      if (userId === 'boom') throw new Error('revoked keys');
      done.push(userId);
      return 1;
    };

    expect(await svc.syncAll()).toEqual({ inserted: 2 });
    expect(done.sort()).toEqual(['ok1', 'ok2']);
  });

  it('второй обход поверх незакрытого не запускается', async () => {
    const svc = makeService(['a']);
    let release: () => void = () => undefined;
    (svc as never as Record<string, unknown>).runLocked = async () => {
      await new Promise<void>((r) => (release = r));
      return 1;
    };

    const first = svc.syncAll();
    await Promise.resolve();
    expect(await svc.syncAll()).toEqual({ inserted: 0 });
    release();
    expect(await first).toEqual({ inserted: 1 });
  });
});
