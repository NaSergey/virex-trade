import { TradeRiskService, RISK_VERSION, riskOf } from './trade-risk.service';
import { BalanceHistoryService } from './balance-history.service';

/**
 * T14 (A5): `computeMissing` больше не читает якоря баланса на каждую сделку
 * и не пишет метрики по одной строке — см. находку A5 в
 * .superpowers/sdd/2026-09-16-backend-optimization/task-14-brief.md.
 */
const HOUR = 60 * 60 * 1000;
const T0 = new Date('2026-01-01T00:00:00Z');

function makeTrade(id: string, hoursAfterT0: number, exchange = 'bybit') {
  const openedAt = new Date(T0.getTime() + hoursAfterT0 * HOUR);
  return {
    id,
    exchange,
    qty: 1,
    avgEntryPrice: 100,
    stopLoss: 95,
    openedAt,
    closedAt: new Date(openedAt.getTime() + HOUR),
  };
}

function makeService(
  trades: ReturnType<typeof makeTrade>[],
  anchorRows: { at: Date; balance: number; gap: number | null }[],
) {
  const findManyCalls: any[] = [];
  const balanceSnapshotFindMany = jest.fn().mockResolvedValue(anchorRows.map((a) => ({ ...a })));
  const createMany = jest.fn((args: any) => Promise.resolve({ count: args.data.length }));
  const prisma = {
    tradeRisk: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany,
    },
    trade: {
      // Один и тот же мок обслуживает и собственный запрос TradeRiskService
      // (where.risk + take), и запрос loadFlows изнутри BalanceHistoryService
      // (where.closedAt, без take) — как и в реальном PrismaService, это одна
      // и та же модель для обоих потребителей.
      findMany: jest.fn((args: any) => {
        if (args?.where && 'risk' in args.where) {
          findManyCalls.push(args);
          return Promise.resolve(trades.slice(0, args.take ?? trades.length));
        }
        return Promise.resolve([]); // flows: якоря выбраны так, что flows всегда пусты
      }),
    },
    balanceSnapshot: { findMany: balanceSnapshotFindMany },
    fundingFee: { findMany: jest.fn().mockResolvedValue([]) },
  } as any;
  const history = new BalanceHistoryService(prisma);
  const loadAnchorRowsSpy = jest.spyOn(history, 'loadAnchorRows');
  const balanceAtSpy = jest.spyOn(history, 'balanceAt');
  const service = new TradeRiskService(prisma, history);
  return { service, prisma, history, loadAnchorRowsSpy, balanceAtSpy, findManyCalls, createMany, balanceSnapshotFindMany };
}

describe('TradeRiskService.computeMissing — T14: take-лимит, общие якоря, пакетная запись', () => {
  it('передаёт take: BATCH_LIMIT в trade.findMany — 1000 несчитанных сделок не читаются разом', async () => {
    const trades = Array.from({ length: 1000 }, (_, i) => makeTrade(`t${i}`, i));
    const anchors = [{ at: new Date(T0.getTime() + 2000 * HOUR), balance: 100000, gap: null }];
    const { service, findManyCalls } = makeService(trades, anchors);

    const done = await service.computeMissing('u1');

    expect(findManyCalls).toHaveLength(1);
    expect(findManyCalls[0].take).toBe(400);
    // Обработано ровно столько, сколько вернул findMany с учётом take, не 1000.
    expect(done).toBe(400);
  });

  it('читает якоря баланса один раз на биржу, а не по разу на сделку', async () => {
    const trades = Array.from({ length: 50 }, (_, i) => makeTrade(`t${i}`, i));
    const anchors = [{ at: new Date(T0.getTime() + 2000 * HOUR), balance: 100000, gap: null }];
    const { service, loadAnchorRowsSpy, balanceAtSpy, balanceSnapshotFindMany } = makeService(trades, anchors);

    await service.computeMissing('u1');

    // loadAnchorRows — то есть реальный запрос к balanceSnapshot — ровно
    // один раз за весь прогон (одна биржа у всех 50 сделок), а не 50.
    expect(loadAnchorRowsSpy).toHaveBeenCalledTimes(1);
    expect(balanceSnapshotFindMany).toHaveBeenCalledTimes(1);
    // balanceAt по-прежнему вызывается на каждую сделку, но с уже
    // загруженными якорями четвёртым параметром — без этого он сходил бы в
    // БД внутри себя на каждый такой вызов.
    expect(balanceAtSpy).toHaveBeenCalledTimes(50);
    for (const call of balanceAtSpy.mock.calls) {
      expect(call[3]).toBeDefined();
      expect(Array.isArray(call[3])).toBe(true);
    }
  });

  it('читает якоря отдельно на каждую встретившуюся биржу, если сделки с разных бирж', async () => {
    const trades = [makeTrade('a', 1, 'bybit'), makeTrade('b', 2, 'okx'), makeTrade('c', 3, 'bybit')];
    const anchors = [{ at: new Date(T0.getTime() + 2000 * HOUR), balance: 100000, gap: null }];
    const { service, loadAnchorRowsSpy } = makeService(trades, anchors);

    await service.computeMissing('u1');

    expect(loadAnchorRowsSpy).toHaveBeenCalledTimes(2);
    const exchangesQueried = loadAnchorRowsSpy.mock.calls.map((c) => c[1]).sort();
    expect(exchangesQueried).toEqual(['bybit', 'okx']);
  });

  it('пишет метрики одной пакетной createMany, а не по строке на сделку', async () => {
    const trades = Array.from({ length: 5 }, (_, i) => makeTrade(`t${i}`, i));
    const anchors = [{ at: new Date(T0.getTime() + 2000 * HOUR), balance: 100000, gap: null }];
    const { service, createMany } = makeService(trades, anchors);

    const done = await service.computeMissing('u1');

    expect(createMany).toHaveBeenCalledTimes(1);
    expect(createMany.mock.calls[0][0].data).toHaveLength(5);
    expect(done).toBe(5);
  });

  it('регрессия: значения риска после рефакторинга совпадают с riskOf() формулой', async () => {
    const trade = makeTrade('t1', 10);
    const anchor = { at: new Date(T0.getTime() + 2000 * HOUR), balance: 100000, gap: null };
    const { service, createMany } = makeService([trade], [anchor]);

    await service.computeMissing('u1');

    const expected = riskOf(
      { qty: trade.qty, avgEntryPrice: trade.avgEntryPrice, stopLoss: trade.stopLoss },
      anchor.balance,
    );
    const written = createMany.mock.calls[0][0].data[0];
    expect(written).toMatchObject({
      tradeId: 't1',
      balanceAtEntry: anchor.balance,
      balanceSource: 'derived',
      exposurePct: expected.exposurePct,
      plannedRiskPct: expected.plannedRiskPct,
      ok: expected.ok,
      riskVersion: RISK_VERSION,
    });
  });

  it('нет несчитанных сделок — ни якорей не читает, ни createMany не зовёт', async () => {
    const { service, loadAnchorRowsSpy, createMany } = makeService([], []);

    const done = await service.computeMissing('u1');

    expect(done).toBe(0);
    expect(loadAnchorRowsSpy).not.toHaveBeenCalled();
    expect(createMany).not.toHaveBeenCalled();
  });
});
