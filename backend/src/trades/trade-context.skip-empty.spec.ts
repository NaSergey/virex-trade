import { TradeContextService, CTX_VERSION } from './trade-context.service';

/**
 * T17 (B3): guard ДО `computeMissing` — тик без вставок и без смены
 * CTX_VERSION с прошлого прохода этого процесса не делает НИ ОДНОГО запроса
 * к `trade_contexts`/`trade`. Отдельно от T10-теста
 * (`trade-context.compute-missing.spec.ts`), который проверяет политику
 * бампа версии внутри самого прогона — этот файл проверяет только внешний
 * guard, ничего не меняя в bump-логике T10.
 */
describe('TradeContextService.computeMissing — T17: пропуск пустого тика', () => {
  function makeService() {
    const prisma = {
      tradeContext: {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      trade: { findMany: jest.fn().mockResolvedValue([]) },
    } as any;
    const dataVersion = { bump: jest.fn().mockResolvedValue(undefined) };
    const service = new TradeContextService(prisma, {} as any, {} as any, dataVersion as any);
    return { service, prisma, dataVersion };
  }

  it('первый вызов процесса прогоняет полностью, даже с hadChanges: false — версия ещё не видена', async () => {
    const { service, prisma } = makeService();

    const written = await service.computeMissing('u1', { hadChanges: false });

    expect(written).toBe(0);
    // dropStale реально выполнился — сходил в БД.
    expect(prisma.tradeContext.findMany).toHaveBeenCalledTimes(1);
  });

  it('второй тик без вставок и без смены версии не делает вообще ни одного запроса', async () => {
    const { service, prisma, dataVersion } = makeService();
    await service.computeMissing('u1', { hadChanges: true }); // отмечает версию увиденной
    prisma.tradeContext.findMany.mockClear();
    prisma.tradeContext.deleteMany.mockClear();
    prisma.trade.findMany.mockClear();
    dataVersion.bump.mockClear();

    const written = await service.computeMissing('u1', { hadChanges: false });

    expect(written).toBe(0);
    expect(prisma.tradeContext.findMany).not.toHaveBeenCalled();
    expect(prisma.tradeContext.deleteMany).not.toHaveBeenCalled();
    expect(prisma.trade.findMany).not.toHaveBeenCalled();
    expect(dataVersion.bump).not.toHaveBeenCalled();
  });

  it('hadChanges: true всегда прогоняет полностью, независимо от версии', async () => {
    const { service, prisma } = makeService();
    await service.computeMissing('u1', { hadChanges: true });
    prisma.tradeContext.findMany.mockClear();

    const written = await service.computeMissing('u1', { hadChanges: true });

    expect(written).toBe(0);
    expect(prisma.tradeContext.findMany).toHaveBeenCalledTimes(1);
  });

  it('вызывающий, не передавший opts (обратная совместимость), всегда получает полный прогон', async () => {
    const { service, prisma } = makeService();
    await service.computeMissing('u1');
    prisma.tradeContext.findMany.mockClear();

    await service.computeMissing('u1');

    expect(prisma.tradeContext.findMany).toHaveBeenCalledTimes(1);
  });

  /**
   * Симулирует деплой, поднявший CTX_VERSION, без изменения самой константы
   * (глобальное ограничение спеки — CTX_VERSION не ручка производительности).
   * Подмена приватного «последнего виденного» значения — ровно то отличие,
   * которое реальный бамп CTX_VERSION произвёл бы для этого процесса на
   * следующем тике: `lastCtxVersionSeen !== CTX_VERSION`.
   */
  it('после смены версии контекста первый же тик сносит устаревшие строки, несмотря на hadChanges: false', async () => {
    const { service, prisma, dataVersion } = makeService();
    await service.computeMissing('u1', { hadChanges: true });
    prisma.tradeContext.findMany.mockClear();
    dataVersion.bump.mockClear();
    expect(CTX_VERSION).not.toBe(-1); // sanity: константа не была использована как сентинел

    (service as any).lastCtxVersionSeen = -1;

    const written = await service.computeMissing('u1', { hadChanges: false });

    expect(written).toBe(0);
    expect(prisma.tradeContext.findMany).toHaveBeenCalledTimes(1); // dropStale отработал

    // Флаг обновлён — следующий пустой тик снова пропускается.
    prisma.tradeContext.findMany.mockClear();
    const secondTick = await service.computeMissing('u1', { hadChanges: false });
    expect(secondTick).toBe(0);
    expect(prisma.tradeContext.findMany).not.toHaveBeenCalled();
  });

  it('dropStale бросает исключение — версия не считается увиденной, следующий пустой тик повторяет полный прогон', async () => {
    const { service, prisma } = makeService();
    prisma.tradeContext.findMany.mockRejectedValueOnce(new Error('db down'));

    await expect(service.computeMissing('u1', { hadChanges: false })).rejects.toThrow('db down');

    prisma.tradeContext.findMany.mockClear();
    prisma.tradeContext.findMany.mockResolvedValue([]);
    const written = await service.computeMissing('u1', { hadChanges: false });
    expect(written).toBe(0);
    expect(prisma.tradeContext.findMany).toHaveBeenCalledTimes(1); // не пропущен — версия не была отмечена увиденной
  });
});
