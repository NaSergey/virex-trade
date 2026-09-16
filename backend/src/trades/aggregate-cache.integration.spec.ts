import type { Response } from 'express';
import { TradesService } from './trades.service';
import { TradesController } from './trades.controller';
import { AggregateCacheService } from './aggregate-cache';

/**
 * T10 (A2) — сценарий из брифа задачи: два одинаковых запроса подряд, второй
 * не трогает Prisma (контроллер) / не трогает Prisma вовсе (сервис) и отдаёт
 * 304 при совпадении `If-None-Match`; третий запрос после «вставки сделки»
 * (бамп версии данных) отдаёт 200 со свежим результатом.
 *
 * Без реальной БД: `PrismaService`/`DataVersionService` — рукописные фейки,
 * тот же приём, что уже используется в остальных `*.spec.ts` этого модуля
 * (см. `trade-context.quality.spec.ts`). Реальный прогон против
 * `perf-baseline-db` — `backend/src/scripts/load-baseline.ts`, отдельно, с
 * числами в отчёте задачи.
 */

function fakeDataVersion(initial = 1) {
  let version = initial;
  return {
    get: jest.fn(async () => version),
    bump: jest.fn(async (_userId: string) => {
      version++;
    }),
    // тест дёргает напрямую, минуя bump(), чтобы явно смоделировать «версия
    // подросла между запросами» независимо от механизма инкремента
    set: (v: number) => {
      version = v;
    },
  };
}

function fakeRes() {
  const state: { status?: number; ended: boolean; json?: unknown; headers: Record<string, string> } = {
    ended: false,
    headers: {},
  };
  const res: Partial<Response> = {
    status: jest.fn((code: number) => {
      state.status = code;
      return res as Response;
    }) as unknown as Response['status'],
    end: jest.fn(() => {
      state.ended = true;
      return res as Response;
    }) as unknown as Response['end'],
    json: jest.fn((body: unknown) => {
      state.json = body;
      return res as Response;
    }) as unknown as Response['json'],
    setHeader: jest.fn((name: string, value: string) => {
      state.headers[name] = value;
      return res as Response;
    }) as unknown as Response['setHeader'],
  };
  return { res: res as Response, state };
}

describe('TradesService — версия+LRU кэш агрегатов (T10, A2)', () => {
  it('второй идентичный вызов stats() не идёт в Prisma; бамп версии — идёт заново', async () => {
    const findManyMock = jest.fn().mockResolvedValue([]);
    const prisma = { trade: { findMany: findManyMock } } as any;
    const dataVersion = fakeDataVersion(1);
    const service = new TradesService(prisma, dataVersion as any, new AggregateCacheService());

    const r1 = await service.stats('u1', {});
    expect(findManyMock).toHaveBeenCalledTimes(1);

    const r2 = await service.stats('u1', {});
    // Тот же (userId, версия, params) — кэш-хит, Prisma не трогаем вовсе.
    expect(findManyMock).toHaveBeenCalledTimes(1);
    expect(r2).toBe(r1); // тот же объект из кэша, не пересчитан заново

    dataVersion.set(2); // имитация bump() из trade-sync/tags после реальной правки
    await service.stats('u1', {});
    expect(findManyMock).toHaveBeenCalledTimes(2);
  });

  it('разные params одного пользователя — разные записи кэша, не путаются', async () => {
    const findManyMock = jest.fn().mockResolvedValue([]);
    const prisma = { trade: { findMany: findManyMock } } as any;
    const service = new TradesService(prisma, fakeDataVersion(1) as any, new AggregateCacheService());

    await service.stats('u1', { symbol: 'BTCUSDT' });
    await service.stats('u1', { symbol: 'ETHUSDT' });
    expect(findManyMock).toHaveBeenCalledTimes(2);

    await service.stats('u1', { symbol: 'BTCUSDT' });
    // Уже считанная комбинация — снова кэш-хит.
    expect(findManyMock).toHaveBeenCalledTimes(2);
  });

  it('разные пользователи не делят кэш друг друга', async () => {
    const findManyMock = jest.fn().mockResolvedValue([]);
    const prisma = { trade: { findMany: findManyMock } } as any;
    const cache = new AggregateCacheService();
    const dataVersion = fakeDataVersion(1);
    const service = new TradesService(prisma, dataVersion as any, cache);

    await service.stats('u1', {});
    await service.stats('u2', {});
    expect(findManyMock).toHaveBeenCalledTimes(2);
  });
});

describe('TradesController — ETag/304 (T10, A2)', () => {
  function makeController(statsImpl: (...a: unknown[]) => Promise<unknown>, dataVersion: ReturnType<typeof fakeDataVersion>) {
    const tradesService = { stats: jest.fn(statsImpl) };
    const controller = new TradesController(
      tradesService as any,
      {} as any, // TradeSyncService — не участвует в этом пути
      {} as any, // TradeContextService
      {} as any, // LabService
      {} as any, // HabitsService
      {} as any, // CredentialsService
      {} as any, // ExchangeRegistry
      dataVersion as any,
    );
    return { controller, tradesService };
  }

  it('запрос без If-None-Match считает агрегат и отдаёт 200 + ETag', async () => {
    const dataVersion = fakeDataVersion(1);
    const { controller, tradesService } = makeController(
      async () => ({ success: true, stats: {}, equity: [] }),
      dataVersion,
    );

    const { res, state } = fakeRes();
    await controller.stats('u1', undefined, res);

    expect(tradesService.stats).toHaveBeenCalledTimes(1);
    expect(state.status).toBe(200);
    expect(state.json).toEqual({ success: true, stats: {}, equity: [] });
    expect(state.headers['ETag']).toMatch(/^W\/"1:[0-9a-f]+"$/);
  });

  it('совпавший If-None-Match — 304, пустое тело, сервис агрегата НЕ вызывается вовсе', async () => {
    const dataVersion = fakeDataVersion(1);
    const { controller, tradesService } = makeController(
      async () => ({ success: true, stats: {}, equity: [] }),
      dataVersion,
    );

    const first = fakeRes();
    await controller.stats('u1', undefined, first.res);
    const etag = first.state.headers['ETag'];
    expect(tradesService.stats).toHaveBeenCalledTimes(1);

    const second = fakeRes();
    await controller.stats('u1', etag, second.res);

    // Единственная работа на этом пути — dataVersion.get() (проверка версии);
    // сервис агрегата (и тем самым Prisma внутри него) не вызывается вовсе.
    expect(tradesService.stats).toHaveBeenCalledTimes(1);
    expect(dataVersion.get).toHaveBeenCalledTimes(2); // 1-й запрос + проверка 2-го
    expect(second.state.status).toBe(304);
    expect(second.state.ended).toBe(true);
    expect(second.state.json).toBeUndefined();
  });

  it('после бампа версии тот же If-None-Match устарел — 200 со свежими числами', async () => {
    const dataVersion = fakeDataVersion(1);
    let call = 0;
    const { controller, tradesService } = makeController(async () => {
      call++;
      return { success: true, stats: { totalTrades: call }, equity: [] };
    }, dataVersion);

    const first = fakeRes();
    await controller.stats('u1', undefined, first.res);
    const staleEtag = first.state.headers['ETag'];
    expect(first.state.json).toEqual({ success: true, stats: { totalTrades: 1 }, equity: [] });

    // «Синк вставил сделку» — версия данных пользователя поднялась.
    await dataVersion.bump('u1');

    const third = fakeRes();
    await controller.stats('u1', staleEtag, third.res);

    expect(tradesService.stats).toHaveBeenCalledTimes(2);
    expect(third.state.status).toBe(200);
    expect(third.state.json).toEqual({ success: true, stats: { totalTrades: 2 }, equity: [] });
    expect(third.state.headers['ETag']).toMatch(/^W\/"2:[0-9a-f]+"$/);
    expect(third.state.headers['ETag']).not.toBe(staleEtag);
  });
});
