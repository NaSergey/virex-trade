import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { BacktestService } from './backtest.service';
import { SYNTH_VERSION } from './synthetic/params';

const DAY = 86_400_000;
const T0 = Date.UTC(2020, 0, 1);
/** «Сейчас» для эфирных сессий турнира — время задаёт сервер. */
const NOW = Date.UTC(2026, 8, 18, 12, 0, 0);

/**
 * Сервис собирается руками с заглушками: тест про то, что уходит в базу и
 * какие отказы получает пользователь, а не про Nest.
 */
function makeService() {
  const prisma: any = {
    backtestSession: {
      create: jest.fn(({ data }) => ({ id: 's1', ...data })),
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(({ data }) => ({ id: 's1', ...data })),
      count: jest.fn().mockResolvedValue(0),
    },
    backtestTrade: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      create: jest.fn(({ data }) => ({ id: 't1', tags: [], ...data })),
      update: jest.fn(({ data }) => ({ id: 't1', tags: [], ...data })),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    backtestTradeTag: { deleteMany: jest.fn(), createMany: jest.fn() },
    backtestTradeEntry: {
      create: jest.fn(({ data }) => ({ id: 'en1', createdAt: new Date(), ...data })),
    },
    backtestTradeExit: {
      create: jest.fn(({ data }) => ({ id: 'e1', createdAt: new Date(), ...data })),
      findMany: jest.fn().mockResolvedValue([]),
    },
    backtestCloseOrder: {
      deleteMany: jest.fn(),
      create: jest.fn(({ data }) => ({ id: 'o1', createdAt: new Date(), ...data })),
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      delete: jest.fn(),
    },
    backtestEntryOrder: {
      deleteMany: jest.fn(),
      create: jest.fn(({ data }) => ({ id: 'eo1', createdAt: new Date(), ...data })),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    tag: { count: jest.fn() },
    $executeRaw: jest.fn().mockResolvedValue(1),
    $transaction: jest.fn(),
  };
  // Интерактивная транзакция получает тот же объект; пакетная — просто выполняется.
  prisma.$transaction.mockImplementation((arg: unknown) =>
    typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(prisma) : Promise.all(arg as unknown[]),
  );
  const marketData = {
    getCoverage: jest.fn().mockResolvedValue([
      { timeframe: 1440, from: new Date(T0), to: new Date(T0 + 1000 * DAY) },
      { timeframe: 1, from: new Date(T0), to: new Date(T0 + 1000 * DAY) },
    ]),
    getCandles: jest
      .fn()
      .mockResolvedValue([{ time: new Date(T0), open: 1, high: 1, low: 1, close: 50_000, volume: 1 }]),
  };
  const synthetic = {
    start: jest.fn().mockReturnValue({ start: T0 + 400 * DAY, price: 60_000 }),
    getCandles: jest.fn().mockReturnValue([]),
  };
  // Живая цена турнира: время и цену эфирной сделки ставит сервер, не браузер.
  const live = {
    quote: jest.fn().mockResolvedValue({ time: new Date(NOW), price: 70_000 }),
  };
  const service = new BacktestService(prisma as never, marketData as never, synthetic as never, live as never);
  (service as unknown as { rnd: () => number }).rnd = () => 0;
  return { service, prisma, marketData, synthetic, live };
}

/** Отказ сервиса как значение: проверяем и класс исключения, и код для фронта. */
async function rejection(p: Promise<unknown>): Promise<any> {
  return p.then(
    () => {
      throw new Error('ожидался отказ');
    },
    (e) => e,
  );
}

const SESSION = {
  id: 's1',
  userId: 'u1',
  status: 'active',
  startTime: new Date(T0),
  cursorTime: new Date(T0),
  startBalance: 10_000,
  balance: 10_000,
  hideDate: true,
  hidePrice: false,
  priceScale: 1,
  dataSource: 'real',
  seed: null,
  synthVersion: null,
};

const INPUT = { startBalance: 10_000, hideDate: true, hidePrice: false };

const SYNTH = { ...SESSION, dataSource: 'synthetic', seed: 77, synthVersion: SYNTH_VERSION, hideDate: true };

describe('BacktestService — сессии', () => {
  it('ставит старт в начало окна и момент сессии туда же', async () => {
    const { service, prisma, marketData } = makeService();

    await service.createSession('u1', INPUT);

    const start = T0 + 200 * DAY; // rnd = 0 → начало окна
    expect(marketData.getCandles).toHaveBeenCalledWith({ timeframe: 1, to: new Date(start - 60_000), limit: 1 });
    expect(prisma.backtestSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'u1',
        startTime: new Date(start),
        cursorTime: new Date(start),
        startBalance: 10_000,
        balance: 10_000,
        priceScale: 1,
        status: 'active',
      }),
    });
  });

  it('при скрытой цене считает масштаб от цены в точке старта', async () => {
    const { service, prisma } = makeService();

    await service.createSession('u1', { ...INPUT, hidePrice: true });

    const data = prisma.backtestSession.create.mock.calls[0][0].data;
    expect(data.priceScale).toBeCloseTo(100 / 50_000, 12);
  });

  it('без минутной истории сессию не создаёт', async () => {
    const { service, marketData, prisma } = makeService();
    marketData.getCoverage.mockResolvedValue([{ timeframe: 1440, from: new Date(T0), to: new Date(T0 + 1000 * DAY) }]);

    const err = await rejection(service.createSession('u1', INPUT));

    expect(err).toBeInstanceOf(ConflictException);
    expect(err.getResponse()).toMatchObject({ code: 'BACKTEST_NO_HISTORY' });
    expect(prisma.backtestSession.create).not.toHaveBeenCalled();
  });

  it('если минутки есть, но окна не набирается — тоже отказ', async () => {
    const { service, marketData } = makeService();
    marketData.getCoverage.mockResolvedValue([
      { timeframe: 1440, from: new Date(T0), to: new Date(T0 + 1000 * DAY) },
      { timeframe: 1, from: new Date(T0), to: new Date(T0 + 100 * DAY) },
    ]);

    const err = await rejection(service.createSession('u1', INPUT));

    expect(err.getResponse()).toMatchObject({ code: 'BACKTEST_NO_HISTORY' });
  });

  it('если в точке старта нет минутки — отказ, а не сессия без цены', async () => {
    const { service, marketData } = makeService();
    marketData.getCandles.mockResolvedValue([]);

    const err = await rejection(service.createSession('u1', INPUT));

    expect(err.getResponse()).toMatchObject({ code: 'BACKTEST_NO_HISTORY' });
  });

  it('чужая сессия отвечает 404', async () => {
    const { service, prisma } = makeService();
    prisma.backtestSession.findUnique.mockResolvedValue({ ...SESSION, userId: 'u2' });

    const err = await rejection(service.getSession('u1', 's1'));

    expect(err).toBeInstanceOf(NotFoundException);
    expect(err.getResponse()).toMatchObject({ code: 'BACKTEST_SESSION_NOT_FOUND' });
  });

  it('отдаёт сессию со сделками, итогом и просадкой по закрытым', async () => {
    const { service, prisma } = makeService();
    prisma.backtestSession.findUnique.mockResolvedValue({ ...SESSION, startBalance: 1000 });
    // Порядок входа (findMany по entryTime): a, b, c
    // Порядок выхода (exitTime): b закрывается раньше, потом a
    // Просадка считается в порядке закрытия: 1000 → 1100 (b) → 880 (a), макс просадка от пика 20%
    prisma.backtestTrade.findMany.mockResolvedValue([
      { id: 'a', entryTime: new Date(T0), exitTime: new Date(T0 + 5 * DAY), pnl: -220, r: -1, tags: [] },
      { id: 'b', entryTime: new Date(T0 + DAY), exitTime: new Date(T0 + 2 * DAY), pnl: 100, r: 1, tags: [] },
      { id: 'c', entryTime: new Date(T0 + 6 * DAY), exitTime: null, pnl: null, r: null, tags: [] },
    ]);

    const res = await service.getSession('u1', 's1');

    expect(res.trades).toHaveLength(3);
    expect(res.summary.trades).toBe(2);
    // Просадка в порядке закрытия: b (+100) поднимает до 1100, потом a (-220) опускает до 880.
    // Максимальная просадка от пика 1100 = (1100 - 880) / 1100 * 100 ≈ 20%
    expect(res.summary.maxDrawdownPct).toBeCloseTo(20, 9);
  });

  it('двигает момент только вперёд — самим UPDATE, а не сравнением в коде', async () => {
    const { service, prisma } = makeService();
    prisma.backtestSession.findUnique.mockResolvedValue({ ...SESSION, cursorTime: new Date(T0 + 5 * DAY) });

    const res = await service.advance('u1', 's1', new Date(T0 + DAY));

    const sql = (prisma.$executeRaw.mock.calls[0][0] as string[]).join('?');
    expect(sql).toContain('GREATEST');
    expect(res.cursorTime).toEqual(new Date(T0 + 5 * DAY));
  });

  it('не двигает чужую сессию', async () => {
    const { service, prisma } = makeService();
    prisma.backtestSession.findUnique.mockResolvedValue({ ...SESSION, userId: 'u2' });

    await rejection(service.advance('u1', 's1', new Date(T0 + DAY)));

    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it('не завершает сессию с открытой сделкой', async () => {
    const { service, prisma } = makeService();
    prisma.backtestSession.findUnique.mockResolvedValue(SESSION);
    prisma.backtestTrade.count.mockResolvedValue(1);

    const err = await rejection(service.finish('u1', 's1'));

    expect(err.getResponse()).toMatchObject({ code: 'BACKTEST_OPEN_TRADE' });
  });

  it('не завершает уже завершённую', async () => {
    const { service, prisma } = makeService();
    prisma.backtestSession.findUnique.mockResolvedValue({ ...SESSION, status: 'finished' });

    const err = await rejection(service.finish('u1', 's1'));

    expect(err.getResponse()).toMatchObject({ code: 'BACKTEST_SESSION_FINISHED' });
  });

  it('завершает: статус и время завершения', async () => {
    const { service, prisma } = makeService();
    prisma.backtestSession.findUnique.mockResolvedValue(SESSION);

    await service.finish('u1', 's1');

    expect(prisma.backtestSession.update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { status: 'finished', finishedAt: expect.any(Date) },
    });
  });

  it('не завершает: сессию завершили конкурентно между проверкой и локом — до подсчёта сделок не доходит', async () => {
    const { service, prisma } = makeService();
    prisma.backtestSession.findUnique.mockResolvedValue(SESSION);
    prisma.$executeRaw.mockResolvedValueOnce(0);

    const err = await rejection(service.finish('u1', 's1'));

    expect(err.getResponse()).toMatchObject({ code: 'BACKTEST_SESSION_FINISHED' });
    expect(prisma.backtestTrade.count).not.toHaveBeenCalled();
    expect(prisma.backtestSession.update).not.toHaveBeenCalled();
  });
});

describe('BacktestService — сделки', () => {
  const OPEN = {
    direction: 'long' as const,
    entryTime: new Date(T0 + DAY),
    entryPrice: 100,
    stopLoss: 98,
    riskPct: 1,
    leverage: 10,
  };

  const TRADE = {
    id: 't1',
    sessionId: 's1',
    direction: 'long',
    entryTime: new Date(T0),
    entryPrice: 100,
    stopLoss: 98,
    takeProfit: null,
    qty: 50,
    riskUsdt: 100,
    leverage: 10,
    closedQty: 0,
    exitTime: null,
    exitPrice: null,
    session: SESSION,
  };

  it('открывает сделку: размер от депозита сессии, момент двигается под замком', async () => {
    const { service, prisma } = makeService();
    prisma.backtestSession.findUnique.mockResolvedValue(SESSION);

    await service.openTrade('u1', 's1', OPEN);

    expect(prisma.$executeRaw).toHaveBeenCalled();
    expect(prisma.backtestTrade.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sessionId: 's1', direction: 'long', riskUsdt: 100, qty: 50, takeProfit: null }),
      }),
    );
  });

  it('открывает сделку: сохраняет плечо', async () => {
    const { service, prisma } = makeService();
    prisma.backtestSession.findUnique.mockResolvedValue(SESSION);

    await service.openTrade('u1', 's1', OPEN);

    expect(prisma.backtestTrade.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ leverage: 10 }) }),
    );
  });

  it('маржа больше депозита — отказ, сделку не создаёт', async () => {
    const { service, prisma } = makeService();
    // SESSION.balance=10000, entry=100, stop=98 (dist=2). При leverage=1 margin = notional =
    // riskUsdt/dist*entry = (balance*riskPct/100)/2*100 = balance*riskPct/2 — при riskPct=1
    // это 0.5*balance, всегда МЕНЬШЕ баланса (риск считается не в вакууме, а от него же),
    // поэтому обычный riskPct margin никогда не превысит. Берём riskPct=5:
    // riskUsdt=500, qty=250, notional=25000, margin@1x=25000 > 10000.
    prisma.backtestSession.findUnique.mockResolvedValue(SESSION);

    const err = await rejection(service.openTrade('u1', 's1', { ...OPEN, leverage: 1, riskPct: 5 }));

    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.getResponse()).toMatchObject({ code: 'BACKTEST_MARGIN_EXCEEDS_BALANCE' });
    expect(prisma.backtestTrade.create).not.toHaveBeenCalled();
  });

  it('не открывает вторую сделку той же стороны, пока она уже открыта', async () => {
    const { service, prisma } = makeService();
    prisma.backtestSession.findUnique.mockResolvedValue(SESSION);
    prisma.backtestTrade.count.mockResolvedValue(1);

    const err = await rejection(service.openTrade('u1', 's1', OPEN));

    expect(err).toBeInstanceOf(ConflictException);
    expect(err.getResponse()).toMatchObject({ code: 'BACKTEST_OPEN_TRADE' });
    expect(prisma.backtestTrade.count).toHaveBeenCalledWith({
      where: { sessionId: 's1', exitTime: null, direction: 'long' },
    });
    expect(prisma.backtestTrade.create).not.toHaveBeenCalled();
  });

  it('открывает противоположную сторону, даже если одна уже открыта — хедж', async () => {
    const { service, prisma } = makeService();
    prisma.backtestSession.findUnique.mockResolvedValue(SESSION);
    // В БД лежит одна открытая long — count с фильтром direction:'short' её не находит.
    prisma.backtestTrade.count.mockImplementation(({ where }: { where: { direction?: string } }) =>
      Promise.resolve(where.direction === 'short' ? 0 : 1),
    );

    await service.openTrade('u1', 's1', { ...OPEN, direction: 'short', stopLoss: 102 });

    expect(prisma.backtestTrade.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ direction: 'short' }) }),
    );
  });

  it('стоп лонга выше входа — отказ', async () => {
    const { service, prisma } = makeService();
    prisma.backtestSession.findUnique.mockResolvedValue(SESSION);

    const err = await rejection(service.openTrade('u1', 's1', { ...OPEN, stopLoss: 101 }));

    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.getResponse()).toMatchObject({ code: 'BACKTEST_STOP_SIDE' });
  });

  it('тейк шорта выше входа — отказ', async () => {
    const { service, prisma } = makeService();
    prisma.backtestSession.findUnique.mockResolvedValue(SESSION);

    const err = await rejection(
      service.openTrade('u1', 's1', { ...OPEN, direction: 'short', stopLoss: 102, takeProfit: 105 }),
    );

    expect(err.getResponse()).toMatchObject({ code: 'BACKTEST_TAKE_SIDE' });
  });

  it('вход раньше старта сессии — отказ', async () => {
    const { service, prisma } = makeService();
    prisma.backtestSession.findUnique.mockResolvedValue(SESSION);

    const err = await rejection(service.openTrade('u1', 's1', { ...OPEN, entryTime: new Date(T0 - DAY) }));

    expect(err.getResponse()).toMatchObject({ code: 'BACKTEST_TIME_INVALID' });
  });

  it('в завершённой сессии сделку не открыть', async () => {
    const { service, prisma } = makeService();
    prisma.backtestSession.findUnique.mockResolvedValue({ ...SESSION, status: 'finished' });

    const err = await rejection(service.openTrade('u1', 's1', OPEN));

    expect(err.getResponse()).toMatchObject({ code: 'BACKTEST_SESSION_FINISHED' });
  });

  it('сессию завершили конкурентно между проверкой и локом — сделку не открывает', async () => {
    const { service, prisma } = makeService();
    prisma.backtestSession.findUnique.mockResolvedValue(SESSION);
    prisma.$executeRaw.mockResolvedValueOnce(0);

    const err = await rejection(service.openTrade('u1', 's1', OPEN));

    expect(err.getResponse()).toMatchObject({ code: 'BACKTEST_SESSION_FINISHED' });
    expect(prisma.backtestTrade.create).not.toHaveBeenCalled();
  });

  it('депозит слит (баланс под замком <= 0) — сделку не открывает', async () => {
    const { service, prisma } = makeService();
    // Первое чтение (ownedSession) — сессия ещё активна; второе, под замком
    // транзакции, — баланс уже не положителен (слился на прошлой сделке).
    prisma.backtestSession.findUnique.mockResolvedValueOnce(SESSION).mockResolvedValueOnce({ balance: 0 });

    const err = await rejection(service.openTrade('u1', 's1', OPEN));

    expect(err).toBeInstanceOf(ConflictException);
    expect(err.getResponse()).toMatchObject({ code: 'BACKTEST_NO_BALANCE' });
    expect(prisma.backtestTrade.create).not.toHaveBeenCalled();
  });

  it('отрицательный баланс под замком — тоже отказ', async () => {
    const { service, prisma } = makeService();
    prisma.backtestSession.findUnique.mockResolvedValueOnce(SESSION).mockResolvedValueOnce({ balance: -12.5 });

    const err = await rejection(service.openTrade('u1', 's1', OPEN));

    expect(err.getResponse()).toMatchObject({ code: 'BACKTEST_NO_BALANCE' });
    expect(prisma.backtestTrade.create).not.toHaveBeenCalled();
  });

  it('закрывает целиком: пишет exit, агрегирует pnl/fee/r на сделке, депозит растёт', async () => {
    const { service, prisma } = makeService();
    prisma.backtestTrade.findUnique
      .mockResolvedValueOnce(TRADE) // ownedTrade
      .mockResolvedValueOnce({ ...TRADE, exitTime: new Date(T0 + DAY), exitPrice: 104, exitReason: 'take', tags: [] }); // финальный findUnique
    prisma.backtestTradeExit.findMany.mockResolvedValue([
      { id: 'e1', tradeId: 't1', qty: 50, price: 104, fee: 5.61, pnl: 194.39 },
    ]);

    const res = await service.closeTrade('u1', 't1', { exitTime: new Date(T0 + DAY), exitPrice: 104, reason: 'take' });

    const casCall = prisma.backtestTrade.updateMany.mock.calls[0][0];
    expect(casCall.where).toEqual({ id: 't1', closedQty: 0 });
    expect(casCall.data).toEqual({ closedQty: { increment: 50 } });
    expect(prisma.backtestTradeExit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ tradeId: 't1', qty: 50, price: 104, reason: 'take' }),
    });
    const finalUpdate = prisma.backtestTrade.update.mock.calls[0][0];
    expect(finalUpdate.data.pnl).toBeCloseTo(194.39, 6);
    expect(finalUpdate.data.r).toBeCloseTo(1.9439, 6);
    expect(finalUpdate.data.exitReason).toBe('take');
    const inc = prisma.backtestSession.update.mock.calls[0][0].data.balance.increment;
    expect(inc).toBeCloseTo(194.39, 6);
    expect(res.trade.exitReason).toBe('take');
  });

  it('закрывает частично: closedQty растёт, exitTime не проставляется, депозит растёт на часть PnL', async () => {
    const { service, prisma } = makeService();
    prisma.backtestTrade.findUnique
      .mockResolvedValueOnce(TRADE)
      .mockResolvedValueOnce({ ...TRADE, closedQty: 20, tags: [] });

    await service.closeTrade('u1', 't1', { exitTime: new Date(T0 + DAY), exitPrice: 104, reason: 'manual', qty: 20 });

    const casCall = prisma.backtestTrade.updateMany.mock.calls[0][0];
    expect(casCall.where).toEqual({ id: 't1', closedQty: 0 });
    expect(casCall.data).toEqual({ closedQty: { increment: 20 } });
    expect(prisma.backtestTrade.update).not.toHaveBeenCalled(); // 20 < 50 остатка — не финал
    const inc = prisma.backtestSession.update.mock.calls[0][0].data.balance.increment;
    // pnl на 20 монет вместо 50: (104-100)*20 - (100+104)*20*0.00055
    expect(inc).toBeCloseTo(77.756, 3);
  });

  it('закрытие больше остатка — отказ, ничего не пишет', async () => {
    const { service, prisma } = makeService();
    prisma.backtestTrade.findUnique.mockResolvedValue(TRADE);

    const err = await rejection(
      service.closeTrade('u1', 't1', { exitTime: new Date(T0 + DAY), exitPrice: 104, reason: 'manual', qty: 999 }),
    );

    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.getResponse()).toMatchObject({ code: 'BACKTEST_QTY_EXCEEDS_REMAINING' });
    expect(prisma.backtestTrade.updateMany).not.toHaveBeenCalled();
  });

  it('лимит-ордер сработал — closeOrderId удаляет строку в той же транзакции', async () => {
    const { service, prisma } = makeService();
    prisma.backtestTrade.findUnique
      .mockResolvedValueOnce(TRADE)
      .mockResolvedValueOnce({ ...TRADE, closedQty: 20, tags: [] });

    await service.closeTrade('u1', 't1', {
      exitTime: new Date(T0 + DAY),
      exitPrice: 104,
      reason: 'limit',
      qty: 20,
      closeOrderId: 'o1',
    });

    expect(prisma.backtestCloseOrder.deleteMany).toHaveBeenCalledWith({ where: { id: 'o1', tradeId: 't1' } });
  });

  it('выход не позже входа — отказ', async () => {
    const { service, prisma } = makeService();
    prisma.backtestTrade.findUnique.mockResolvedValue(TRADE);

    const err = await rejection(service.closeTrade('u1', 't1', { exitTime: new Date(T0), exitPrice: 104, reason: 'manual' }));

    expect(err.getResponse()).toMatchObject({ code: 'BACKTEST_TIME_INVALID' });
  });

  it('повтор того же закрытия (уже полностью закрыта) — не ошибка и не второе начисление', async () => {
    const { service, prisma } = makeService();
    const closed = { ...TRADE, exitTime: new Date(T0 + DAY), exitPrice: 104 };
    prisma.backtestTrade.findUnique.mockResolvedValue({ ...closed, tags: [] });

    await service.closeTrade('u1', 't1', { exitTime: new Date(T0 + DAY), exitPrice: 104, reason: 'take' });

    expect(prisma.backtestTrade.updateMany).not.toHaveBeenCalled();
    expect(prisma.backtestSession.update).not.toHaveBeenCalled();
  });

  it('закрыть уже полностью закрытую другими данными — отказ', async () => {
    const { service, prisma } = makeService();
    prisma.backtestTrade.findUnique.mockResolvedValue({ ...TRADE, exitTime: new Date(T0 + DAY), exitPrice: 104 });

    const err = await rejection(
      service.closeTrade('u1', 't1', { exitTime: new Date(T0 + 2 * DAY), exitPrice: 90, reason: 'stop' }),
    );

    expect(err.getResponse()).toMatchObject({ code: 'BACKTEST_TRADE_CLOSED' });
  });

  it('гонка: updateMany по closedQty не задел строку, последний exit совпадает — тот же повтор', async () => {
    const { service, prisma } = makeService();
    prisma.backtestTrade.findUnique
      .mockResolvedValueOnce(TRADE) // ownedTrade
      .mockResolvedValueOnce({ ...TRADE, closedQty: 50, tags: [] }); // перечитывание внутри транзакции
    prisma.backtestTrade.updateMany.mockResolvedValueOnce({ count: 0 });
    prisma.backtestTradeExit.findMany.mockResolvedValue([
      { id: 'e1', tradeId: 't1', qty: 50, price: 104, time: new Date(T0 + DAY), reason: 'take', fee: 5.61, pnl: 194.39 },
    ]);
    prisma.backtestSession.findUnique.mockResolvedValue({ balance: 10_194.39 });

    const res = await service.closeTrade('u1', 't1', { exitTime: new Date(T0 + DAY), exitPrice: 104, reason: 'take' });

    expect(prisma.backtestSession.update).not.toHaveBeenCalled();
    expect(res.balance).toBe(10_194.39);
  });

  it('гонка: updateMany не задел строку, последний exit другой — отказ', async () => {
    const { service, prisma } = makeService();
    prisma.backtestTrade.findUnique.mockResolvedValueOnce(TRADE).mockResolvedValueOnce({ ...TRADE, closedQty: 50, tags: [] });
    prisma.backtestTrade.updateMany.mockResolvedValueOnce({ count: 0 });
    prisma.backtestTradeExit.findMany.mockResolvedValue([
      { id: 'e1', tradeId: 't1', qty: 50, price: 90, time: new Date(T0 + DAY), reason: 'stop', fee: 1, pnl: -500 },
    ]);

    const err = await rejection(
      service.closeTrade('u1', 't1', { exitTime: new Date(T0 + DAY), exitPrice: 104, reason: 'take' }),
    );

    expect(err.getResponse()).toMatchObject({ code: 'BACKTEST_TRADE_CLOSED' });
    expect(prisma.backtestSession.update).not.toHaveBeenCalled();
  });

  it('чужая сделка отвечает 404', async () => {
    const { service, prisma } = makeService();
    prisma.backtestTrade.findUnique.mockResolvedValue({ ...TRADE, session: { ...SESSION, userId: 'u2' } });

    const err = await rejection(service.modifyTrade('u1', 't1', { stopLoss: 99 }));

    expect(err).toBeInstanceOf(NotFoundException);
    expect(err.getResponse()).toMatchObject({ code: 'BACKTEST_TRADE_NOT_FOUND' });
  });

  it('тейк можно убрать, передав null', async () => {
    const { service, prisma } = makeService();
    prisma.backtestTrade.findUnique
      .mockResolvedValueOnce({ ...TRADE, takeProfit: 105 })
      .mockResolvedValueOnce({ ...TRADE, takeProfit: null, tags: [] });

    await service.modifyTrade('u1', 't1', { takeProfit: null });

    expect(prisma.backtestTrade.updateMany).toHaveBeenCalledWith({
      where: { id: 't1', exitTime: null },
      data: { takeProfit: null },
    });
  });

  it('закрытую сделку не двигают', async () => {
    const { service, prisma } = makeService();
    prisma.backtestTrade.findUnique.mockResolvedValue({ ...TRADE, exitTime: new Date(T0 + DAY) });

    const err = await rejection(service.modifyTrade('u1', 't1', { stopLoss: 99 }));

    expect(err.getResponse()).toMatchObject({ code: 'BACKTEST_TRADE_CLOSED' });
  });

  it('правку уровней отклоняет: сессию завершили конкурентно между чтением и локом', async () => {
    const { service, prisma } = makeService();
    prisma.backtestTrade.findUnique.mockResolvedValueOnce(TRADE);
    prisma.$executeRaw.mockResolvedValueOnce(0);

    const err = await rejection(service.modifyTrade('u1', 't1', { stopLoss: 99 }));

    expect(err.getResponse()).toMatchObject({ code: 'BACKTEST_SESSION_FINISHED' });
    expect(prisma.backtestTrade.updateMany).not.toHaveBeenCalled();
  });

  it('правку уровней отклоняет: сделку закрыли конкурентно между чтением и локом', async () => {
    const { service, prisma } = makeService();
    prisma.backtestTrade.findUnique.mockResolvedValueOnce(TRADE);
    prisma.backtestTrade.updateMany.mockResolvedValueOnce({ count: 0 });

    const err = await rejection(service.modifyTrade('u1', 't1', { stopLoss: 99 }));

    expect(err.getResponse()).toMatchObject({ code: 'BACKTEST_TRADE_CLOSED' });
  });

  it('теги — только свои', async () => {
    const { service, prisma } = makeService();
    prisma.backtestTrade.findUnique.mockResolvedValue(TRADE);
    prisma.tag.count.mockResolvedValue(1);

    const err = await rejection(service.setTradeTags('u1', 't1', ['g1', 'g2']));

    expect(err.getResponse()).toMatchObject({ code: 'TAGS_NOT_FOUND' });
    expect(prisma.backtestTradeTag.deleteMany).not.toHaveBeenCalled();
  });

  it('заменяет набор тегов целиком', async () => {
    const { service, prisma } = makeService();
    prisma.backtestTrade.findUnique.mockResolvedValue(TRADE);
    prisma.tag.count.mockResolvedValue(2);

    await service.setTradeTags('u1', 't1', ['g1', 'g2', 'g1']);

    expect(prisma.backtestTradeTag.deleteMany).toHaveBeenCalledWith({ where: { tradeId: 't1' } });
    expect(prisma.backtestTradeTag.createMany).toHaveBeenCalledWith({
      data: [
        { tradeId: 't1', tagId: 'g1' },
        { tradeId: 't1', tagId: 'g2' },
      ],
    });
  });

  describe('добор позиции', () => {
    it('усредняет вход и суммирует риск', async () => {
      const { service, prisma } = makeService();
      // TRADE: qty=50 @100, riskUsdt=100, leverage=10. Добор: riskPct=1 на balance=10000 → riskUsdt=100,
      // dist=|110-98|=12, addQty=100/12=25/3≈8.333. newQty=175/3≈58.333,
      // newEntry=(50*100+25/3*110)/(175/3)=17750/175≈101.4286.
      prisma.backtestTrade.findUnique.mockResolvedValueOnce(TRADE).mockResolvedValueOnce({
        ...TRADE,
        qty: TRADE.qty + 100 / 12,
        entryPrice: (50 * 100 + (100 / 12) * 110) / (50 + 100 / 12),
        riskUsdt: 200,
        tags: [],
      });
      prisma.backtestSession.findUnique.mockResolvedValue({ balance: 10_000 });

      await service.addToTrade('u1', 't1', { entryTime: new Date(T0 + DAY), entryPrice: 110, riskPct: 1 });

      const call = prisma.backtestTrade.updateMany.mock.calls[0][0];
      expect(call.where).toEqual({ id: 't1', exitTime: null });
      expect(call.data.qty).toBeCloseTo(58.333, 3);
      expect(call.data.entryPrice).toBeCloseTo(101.4286, 3);
      expect(call.data.riskUsdt).toBeCloseTo(200, 6);
    });

    it('без открытой сделки — отказ', async () => {
      const { service, prisma } = makeService();
      prisma.backtestTrade.findUnique.mockResolvedValue({ ...TRADE, exitTime: new Date(T0 + DAY) });

      const err = await rejection(service.addToTrade('u1', 't1', { entryTime: new Date(T0 + DAY), entryPrice: 110, riskPct: 1 }));

      expect(err.getResponse()).toMatchObject({ code: 'BACKTEST_TRADE_CLOSED' });
    });

    it('добор, загоняющий средний вход за стоп — отказ', async () => {
      const { service, prisma } = makeService();
      // Шорт: стоп 105 выше входа 100 (правильная сторона). Средневзвешенный вход —
      // всегда между старой ценой входа (100) и ценой добора: чтобы он мог перейти
      // за 105, цена самого добора обязана быть НЕ ниже 105 — иначе среднее двух
      // чисел меньше 105 в принципе не может стать больше 105 ни при каком весе.
      // Добор по 110 большим риском (вес добора большой) тянет среднее выше стопа.
      const SHORT_TRADE = { ...TRADE, direction: 'short', entryPrice: 100, stopLoss: 105, riskUsdt: 100, qty: 20 };
      prisma.backtestTrade.findUnique.mockResolvedValue(SHORT_TRADE);
      prisma.backtestSession.findUnique.mockResolvedValue({ balance: 10_000 });

      // riskUsdt_add = 10000*50/100 = 5000, dist = |110-105| = 5, addQty = 1000.
      // newQty = 1020, newEntry = (20*100 + 1000*110)/1020 ≈ 109.8 — выше стопа 105.
      const err = await rejection(service.addToTrade('u1', 't1', { entryTime: new Date(T0 + DAY), entryPrice: 110, riskPct: 50 }));

      expect(err.getResponse()).toMatchObject({ code: 'BACKTEST_STOP_SIDE' });
    });

    it('маржа добора больше депозита — отказ', async () => {
      const { service, prisma } = makeService();
      prisma.backtestTrade.findUnique.mockResolvedValue(TRADE);
      prisma.backtestSession.findUnique.mockResolvedValue({ balance: 10 });

      const err = await rejection(service.addToTrade('u1', 't1', { entryTime: new Date(T0 + DAY), entryPrice: 110, riskPct: 1 }));

      expect(err.getResponse()).toMatchObject({ code: 'BACKTEST_MARGIN_EXCEEDS_BALANCE' });
    });
  });

  describe('лимит-ордера на закрытие', () => {
    it('создаёт ордер в пределах остатка', async () => {
      const { service, prisma } = makeService();
      prisma.backtestTrade.findUnique.mockResolvedValue(TRADE);

      await service.createCloseOrder('u1', 't1', { price: 110, qty: 20 });

      expect(prisma.backtestCloseOrder.create).toHaveBeenCalledWith({ data: { tradeId: 't1', price: 110, qty: 20 } });
    });

    it('объём больше остатка — отказ', async () => {
      const { service, prisma } = makeService();
      prisma.backtestTrade.findUnique.mockResolvedValue(TRADE);

      const err = await rejection(service.createCloseOrder('u1', 't1', { price: 110, qty: 999 }));

      expect(err.getResponse()).toMatchObject({ code: 'BACKTEST_QTY_EXCEEDS_REMAINING' });
    });

    it('на закрытую сделку ордер не поставить', async () => {
      const { service, prisma } = makeService();
      prisma.backtestTrade.findUnique.mockResolvedValue({ ...TRADE, exitTime: new Date(T0 + DAY) });

      const err = await rejection(service.createCloseOrder('u1', 't1', { price: 110, qty: 1 }));

      expect(err.getResponse()).toMatchObject({ code: 'BACKTEST_TRADE_CLOSED' });
    });

    it('отменяет свой ордер', async () => {
      const { service, prisma } = makeService();
      prisma.backtestCloseOrder.findUnique.mockResolvedValue({ id: 'o1', trade: { session: { userId: 'u1' } } });

      await service.cancelCloseOrder('u1', 'o1');

      expect(prisma.backtestCloseOrder.delete).toHaveBeenCalledWith({ where: { id: 'o1' } });
    });

    it('чужой ордер — 404', async () => {
      const { service, prisma } = makeService();
      prisma.backtestCloseOrder.findUnique.mockResolvedValue({ id: 'o1', trade: { session: { userId: 'u2' } } });

      const err = await rejection(service.cancelCloseOrder('u1', 'o1'));

      expect(err).toBeInstanceOf(NotFoundException);
      expect(err.getResponse()).toMatchObject({ code: 'BACKTEST_CLOSE_ORDER_NOT_FOUND' });
    });
  });

  describe('плечо сессии', () => {
    it('меняет плечо у всех открытых сделок сессии', async () => {
      const { service, prisma } = makeService();
      prisma.backtestSession.findUnique
        .mockResolvedValueOnce(SESSION) // ownedSession
        .mockResolvedValueOnce({ balance: 10_000, cursorTime: SESSION.cursorTime }); // свежее чтение под замком
      prisma.backtestTrade.findMany.mockResolvedValueOnce([
        { ...TRADE, id: 't1', direction: 'long', qty: 50, entryPrice: 100 },
        { ...TRADE, id: 't2', direction: 'short', qty: 20, entryPrice: 100 },
      ]);

      await service.setLeverage('u1', 's1', 20);

      expect(prisma.backtestTrade.updateMany).toHaveBeenCalledWith({
        where: { sessionId: 's1', exitTime: null },
        data: { leverage: 20 },
      });
    });

    it('отказ, если новая маржа хоть одной сделки больше депозита', async () => {
      const { service, prisma } = makeService();
      prisma.backtestSession.findUnique
        .mockResolvedValueOnce(SESSION)
        .mockResolvedValueOnce({ balance: 100, cursorTime: SESSION.cursorTime });
      prisma.backtestTrade.findMany.mockResolvedValueOnce([{ ...TRADE, id: 't1', qty: 50, entryPrice: 100 }]);
      // margin = 50*100/1 = 5000 > 100

      const err = await rejection(service.setLeverage('u1', 's1', 1));

      expect(err).toBeInstanceOf(BadRequestException);
      expect(err.getResponse()).toMatchObject({ code: 'BACKTEST_MARGIN_EXCEEDS_BALANCE' });
      expect(prisma.backtestTrade.updateMany).not.toHaveBeenCalled();
    });

    it('чужая сессия — 404', async () => {
      const { service, prisma } = makeService();
      prisma.backtestSession.findUnique.mockResolvedValue({ ...SESSION, userId: 'u2' });

      const err = await rejection(service.setLeverage('u1', 's1', 10));

      expect(err).toBeInstanceOf(NotFoundException);
      expect(err.getResponse()).toMatchObject({ code: 'BACKTEST_SESSION_NOT_FOUND' });
    });

    it('завершённая сессия — отказ', async () => {
      const { service, prisma } = makeService();
      prisma.backtestSession.findUnique.mockResolvedValue({ ...SESSION, status: 'finished' });

      const err = await rejection(service.setLeverage('u1', 's1', 10));

      expect(err.getResponse()).toMatchObject({ code: 'BACKTEST_SESSION_FINISHED' });
    });
  });
});

describe('BacktestService — статистика', () => {
  const tag = (id: string, name: string) => ({ tag: { id, name, color: '#111111', type: 'setup' } });

  // Как в журнале (statsByTag): сделка не делится между тегами, а целиком идёт каждому.
  it('сделка засчитывается каждому своему тегу, общий итог — по одному разу', async () => {
    const { service, prisma } = makeService();
    prisma.backtestSession.count.mockResolvedValue(2);
    prisma.backtestTrade.findMany.mockResolvedValue([
      { id: 'a', pnl: 10, r: 1, tags: [tag('x', 'Пробой'), tag('y', 'Ретест')] },
      { id: 'b', pnl: -5, r: -0.5, tags: [tag('x', 'Пробой')] },
    ]);

    const res = await service.stats('u1');

    expect(res.overall).toMatchObject({ sessions: 2, trades: 2, pnl: 5 });
    expect(res.byTag.map((b) => [b.tag.id, b.trades])).toEqual([
      ['x', 2],
      ['y', 1],
    ]);
    expect(res.byTag[0].totalR).toBeCloseTo(0.5, 9);
  });

  it('берёт только закрытые сделки своих сессий', async () => {
    const { service, prisma } = makeService();

    await service.stats('u1');

    expect(prisma.backtestTrade.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { session: { userId: 'u1', dataSource: 'real', tournamentId: null }, exitTime: { not: null } },
      }),
    );
  });
});

describe('BacktestService — тренажёр', () => {
  it('создаёт synthetic-сессию без хранилища: зерно, версия, старт генератора, дата скрыта всегда', async () => {
    const { service, prisma, marketData, synthetic } = makeService();

    await service.createSession('u1', { ...INPUT, hideDate: false, dataSource: 'synthetic' });

    expect(marketData.getCoverage).not.toHaveBeenCalled();
    expect(synthetic.start).toHaveBeenCalledWith(0);
    expect(prisma.backtestSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        dataSource: 'synthetic',
        seed: 0,
        synthVersion: SYNTH_VERSION,
        startTime: new Date(T0 + 400 * DAY),
        cursorTime: new Date(T0 + 400 * DAY),
        hideDate: true,
        priceScale: 1,
      }),
    });
  });

  it('скрытая цена тренажёра — масштаб от цены генератора в точке старта', async () => {
    const { service, prisma } = makeService();

    await service.createSession('u1', { ...INPUT, hidePrice: true, dataSource: 'synthetic' });

    expect(prisma.backtestSession.create.mock.calls[0][0].data.priceScale).toBeCloseTo(100 / 60_000, 12);
  });

  it('свечи тренажёра — по зерну сессии, время в миллисекундах', async () => {
    const { service, prisma, synthetic } = makeService();
    prisma.backtestSession.findUnique.mockResolvedValue(SYNTH);

    await service.sessionCandles('u1', 's1', { timeframe: 60, to: new Date(T0), limit: 300 });

    expect(synthetic.getCandles).toHaveBeenCalledWith(77, { timeframe: 60, from: undefined, to: T0, limit: 300 });
  });

  it('свечи чужой сессии — 404', async () => {
    const { service, prisma } = makeService();
    prisma.backtestSession.findUnique.mockResolvedValue({ ...SYNTH, userId: 'u2' });

    const err = await rejection(service.sessionCandles('u1', 's1', { timeframe: 60, limit: 1 }));

    expect(err).toBeInstanceOf(NotFoundException);
  });

  it('у реальной сессии свечей генератора нет — 400', async () => {
    const { service, prisma } = makeService();
    prisma.backtestSession.findUnique.mockResolvedValue(SESSION);

    const err = await rejection(service.sessionCandles('u1', 's1', { timeframe: 60, limit: 1 }));

    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.getResponse()).toMatchObject({ code: 'BACKTEST_NOT_SYNTHETIC' });
  });

  it('сессия прежней версии генератора свечей не получает — 409', async () => {
    const { service, prisma, synthetic } = makeService();
    prisma.backtestSession.findUnique.mockResolvedValue({ ...SYNTH, synthVersion: SYNTH_VERSION - 1 });

    const err = await rejection(service.sessionCandles('u1', 's1', { timeframe: 60, limit: 1 }));

    expect(err).toBeInstanceOf(ConflictException);
    expect(err.getResponse()).toMatchObject({ code: 'BACKTEST_SYNTH_OUTDATED' });
    expect(synthetic.getCandles).not.toHaveBeenCalled();
  });

  it('неизвестный таймфрейм — 400', async () => {
    const { service, prisma } = makeService();
    prisma.backtestSession.findUnique.mockResolvedValue(SYNTH);

    const err = await rejection(service.sessionCandles('u1', 's1', { timeframe: 7, limit: 1 }));

    expect(err).toBeInstanceOf(BadRequestException);
  });

  it('устаревшая сессия завершается: открытый остаток закрыт по цене входа с комиссией', async () => {
    const { service, prisma } = makeService();
    const cursor = new Date(T0 + 401 * DAY);
    prisma.backtestSession.findUnique.mockResolvedValue({ ...SYNTH, synthVersion: SYNTH_VERSION - 1, cursorTime: cursor });
    prisma.backtestTrade.findMany.mockResolvedValue([
      { id: 't1', direction: 'long', entryPrice: 60_000, qty: 0.1, closedQty: 0.04, riskUsdt: 100 },
    ]);
    const fee = (60_000 + 60_000) * 0.06 * 0.00055;
    prisma.backtestTradeExit.findMany.mockResolvedValue([
      { fee: 1, pnl: 10 },
      { fee, pnl: -fee },
    ]);

    await service.finish('u1', 's1');

    const exit = prisma.backtestTradeExit.create.mock.calls[0][0].data;
    expect(exit).toMatchObject({ tradeId: 't1', price: 60_000, time: cursor, reason: 'finish' });
    expect(exit.qty).toBeCloseTo(0.06, 12);
    expect(exit.fee).toBeCloseTo(fee, 9);
    expect(exit.pnl).toBeCloseTo(-fee, 9);
    const update = prisma.backtestTrade.update.mock.calls[0][0];
    expect(update.where).toEqual({ id: 't1' });
    expect(update.data).toMatchObject({ closedQty: 0.1, exitTime: cursor, exitPrice: 60_000, exitReason: 'finish' });
    expect(update.data.pnl).toBeCloseTo(10 - fee, 9);
    expect(prisma.backtestCloseOrder.deleteMany).toHaveBeenCalledWith({ where: { trade: { sessionId: 's1' } } });
    expect(prisma.backtestSession.update).toHaveBeenLastCalledWith({
      where: { id: 's1' },
      data: { status: 'finished', finishedAt: expect.any(Date) },
    });
  });

  it('актуальная synthetic-сессия с открытой сделкой не завершается — закрывает браузер', async () => {
    const { service, prisma } = makeService();
    prisma.backtestSession.findUnique.mockResolvedValue(SYNTH);
    prisma.backtestTrade.count.mockResolvedValue(1);

    const err = await rejection(service.finish('u1', 's1'));

    expect(err.getResponse()).toMatchObject({ code: 'BACKTEST_OPEN_TRADE' });
    expect(prisma.backtestTradeExit.create).not.toHaveBeenCalled();
  });

  it('статистика тренажёра — только по synthetic-сессиям', async () => {
    const { service, prisma } = makeService();

    await service.stats('u1', 'synthetic');

    expect(prisma.backtestSession.count).toHaveBeenCalledWith({
      where: { userId: 'u1', dataSource: 'synthetic', tournamentId: null },
    });
    expect(prisma.backtestTrade.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { session: { userId: 'u1', dataSource: 'synthetic', tournamentId: null }, exitTime: { not: null } },
      }),
    );
  });

  it('сессия отдаёт признак устаревшей версии генератора', async () => {
    const { service, prisma } = makeService();
    prisma.backtestSession.findUnique.mockResolvedValue({ ...SYNTH, synthVersion: SYNTH_VERSION - 1 });
    expect((await service.getSession('u1', 's1')).synthOutdated).toBe(true);

    prisma.backtestSession.findUnique.mockResolvedValue(SYNTH);
    expect((await service.getSession('u1', 's1')).synthOutdated).toBe(false);

    prisma.backtestSession.findUnique.mockResolvedValue(SESSION);
    expect((await service.getSession('u1', 's1')).synthOutdated).toBe(false);
  });
});

/**
 * Турнирная сессия — та же `BacktestSession`, но цену и время её сделок ставит
 * сервер: время идёт и у закрытой вкладки, а на кону призовой фонд. Проверяется
 * граница между «браузер сказал» и «сервер решил».
 */
describe('BacktestService — турнирная сессия в эфире', () => {
  const TOURNAMENT = { id: 'tn1', name: 'Дуэль', mode: 'live', status: 'running', endsAt: new Date(NOW + DAY) };
  const LIVE_SESSION = {
    ...SESSION,
    startTime: new Date(NOW - DAY),
    cursorTime: new Date(NOW - DAY),
    tournamentId: 'tn1',
    endTime: new Date(NOW + DAY),
    tournament: TOURNAMENT,
  };
  const ENDED_SESSION = {
    ...LIVE_SESSION,
    endTime: new Date(NOW - 1000),
    tournament: { ...TOURNAMENT, endsAt: new Date(NOW - 1000) },
  };

  const openInput = {
    direction: 'long' as const,
    // Браузер шлёт своё время и цену — сервер их в эфире не читает.
    entryTime: new Date(NOW - 10 * DAY),
    entryPrice: 1,
    stopLoss: 69_000,
    riskPct: 1,
    leverage: 10,
  };

  const openTradeRow = (over: Record<string, unknown> = {}) => ({
    id: 't1',
    sessionId: 's1',
    direction: 'long',
    entryTime: new Date(NOW - DAY),
    entryPrice: 69_000,
    stopLoss: 68_000,
    takeProfit: null,
    riskPct: 1,
    riskUsdt: 100,
    qty: 1,
    closedQty: 0,
    leverage: 10,
    exitTime: null,
    tags: [],
    entries: [],
    ...over,
  });

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date(NOW));
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('вход берёт цену и время у сервера, а не у браузера', async () => {
    const { service, prisma, live } = makeService();
    prisma.backtestSession.findUnique.mockResolvedValueOnce(LIVE_SESSION).mockResolvedValue({ balance: 10_000 });

    await service.openTrade('u1', 's1', openInput);

    expect(live.quote).toHaveBeenCalled();
    const data = prisma.backtestTrade.create.mock.calls[0][0].data;
    expect(data.entryPrice).toBe(70_000);
    expect(data.entryTime).toEqual(new Date(NOW));
  });

  it('добор тоже идёт по живой цене', async () => {
    const { service, prisma, live } = makeService();
    prisma.backtestTrade.findUnique.mockResolvedValue(openTradeRow({ session: LIVE_SESSION }));
    prisma.backtestSession.findUnique.mockResolvedValue({ balance: 10_000 });

    await service.addToTrade('u1', 't1', { entryTime: new Date(NOW - 5 * DAY), entryPrice: 1, riskPct: 1 });

    expect(live.quote).toHaveBeenCalled();
    const entry = prisma.backtestTradeEntry.create.mock.calls[0][0].data;
    expect(entry.price).toBe(70_000);
    expect(entry.time).toEqual(new Date(NOW));
  });

  it('выход по стопу из браузера не принимается — стопы исполняет сервер', async () => {
    const { service, prisma } = makeService();
    prisma.backtestTrade.findUnique.mockResolvedValue(openTradeRow({ session: LIVE_SESSION }));

    const e = await rejection(
      service.closeTrade('u1', 't1', { exitTime: new Date(NOW), exitPrice: 68_000, reason: 'stop' }),
    );

    expect(e).toBeInstanceOf(BadRequestException);
    expect(e.response.code).toBe('TOURNAMENT_LIVE_EXIT');
  });

  it('ручное закрытие берёт живую цену сервера', async () => {
    const { service, prisma } = makeService();
    prisma.backtestTrade.findUnique.mockResolvedValue(openTradeRow({ session: LIVE_SESSION }));
    prisma.backtestSession.update.mockResolvedValue({ balance: 10_100 });

    await service.closeTrade('u1', 't1', { exitTime: new Date(NOW - DAY / 2), exitPrice: 1, reason: 'manual' });

    const exit = prisma.backtestTradeExit.create.mock.calls[0][0].data;
    expect(exit.price).toBe(70_000);
    expect(exit.time).toEqual(new Date(NOW));
  });

  it('после конца турнира сделки не принимаются', async () => {
    const { service, prisma } = makeService();
    prisma.backtestSession.findUnique.mockResolvedValue(ENDED_SESSION);

    const e = await rejection(service.openTrade('u1', 's1', openInput));

    expect(e).toBeInstanceOf(ConflictException);
    expect(e.response.code).toBe('TOURNAMENT_ENDED');
  });

  it('участник не завершает эфирную сессию сам — она кончается вместе с турниром', async () => {
    const { service, prisma } = makeService();
    prisma.backtestSession.findUnique.mockResolvedValue(LIVE_SESSION);

    const e = await rejection(service.finish('u1', 's1'));

    expect(e).toBeInstanceOf(ConflictException);
    expect(e.response.code).toBe('TOURNAMENT_LIVE_FINISH');
  });

  it('сохранение момента в эфире ничего не двигает', async () => {
    const { service, prisma } = makeService();
    prisma.backtestSession.findUnique.mockResolvedValue(LIVE_SESSION);

    const res = await service.advance('u1', 's1', new Date(NOW + 5 * DAY));

    expect(prisma.$executeRaw).not.toHaveBeenCalled();
    expect(res.cursorTime).toEqual(LIVE_SESSION.cursorTime);
  });

  it('сессия отдаёт турнир и границу отдельно от самой сессии', async () => {
    const { service, prisma } = makeService();
    prisma.backtestSession.findUnique.mockResolvedValue(LIVE_SESSION);

    const res = await service.getSession('u1', 's1');

    expect(res.tournament).toEqual({
      id: 'tn1',
      name: 'Дуэль',
      mode: 'live',
      status: 'running',
      endsAt: TOURNAMENT.endsAt,
    });
    expect(res.session.endTime).toEqual(LIVE_SESSION.endTime);
    // Турнир целиком внутрь сессии не заворачивается — второй копии быть не должно.
    expect((res.session as Record<string, unknown>).tournament).toBeUndefined();
  });

  it('список и статистика бектеста не показывают турнирные сессии', async () => {
    const { service, prisma } = makeService();

    await service.listSessions('u1');
    expect(prisma.backtestSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1', tournamentId: null } }),
    );

    await service.stats('u1');
    expect(prisma.backtestSession.count).toHaveBeenCalledWith({
      where: { userId: 'u1', dataSource: 'real', tournamentId: null },
    });
    expect(prisma.backtestTrade.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { session: { userId: 'u1', dataSource: 'real', tournamentId: null }, exitTime: { not: null } },
      }),
    );
  });
});

/**
 * Закрытия, которые делает движок турнира: у них нет владельца в запросе и нет
 * браузера, который бы их подтвердил.
 */
describe('BacktestService — закрытия движком', () => {
  const OPEN_TRADE = {
    id: 't1',
    sessionId: 's1',
    direction: 'long',
    entryTime: new Date(NOW - DAY),
    entryPrice: 69_000,
    riskUsdt: 100,
    qty: 1,
    closedQty: 0,
    exitTime: null,
    tags: [],
    entries: [],
  };

  it('systemClose закрывает сделку без проверки владельца', async () => {
    const { service, prisma } = makeService();
    prisma.backtestTrade.findUnique.mockResolvedValue(OPEN_TRADE);
    prisma.backtestSession.update.mockResolvedValue({ balance: 10_100 });

    const ok = await service.systemClose('t1', {
      exitTime: new Date(NOW),
      exitPrice: 70_000,
      reason: 'stop',
    });

    expect(ok).toBe(true);
    const exit = prisma.backtestTradeExit.create.mock.calls[0][0].data;
    expect(exit).toMatchObject({ tradeId: 't1', price: 70_000, reason: 'stop' });
  });

  it('проигранный CAS — не ошибка: сделку уже закрыли', async () => {
    const { service, prisma } = makeService();
    prisma.backtestTrade.findUnique.mockResolvedValue(OPEN_TRADE);
    prisma.backtestTrade.updateMany.mockResolvedValue({ count: 0 });

    expect(await service.systemClose('t1', { exitTime: new Date(NOW), exitPrice: 70_000, reason: 'stop' })).toBe(false);
    expect(prisma.backtestTradeExit.create).not.toHaveBeenCalled();
  });

  it('несуществующая сделка — false, а не исключение', async () => {
    const { service, prisma } = makeService();
    prisma.backtestTrade.findUnique.mockResolvedValue(null);

    expect(await service.systemClose('нет', { exitTime: new Date(NOW), exitPrice: 1, reason: 'stop' })).toBe(false);
  });

  it('finishTournamentSession закрывает остаток по цене финала и завершает сессию', async () => {
    const { service, prisma } = makeService();
    prisma.backtestTrade.findMany.mockResolvedValue([{ ...OPEN_TRADE, qty: 2, closedQty: 0.5 }]);
    prisma.backtestTradeExit.findMany.mockResolvedValue([{ fee: 1, pnl: 10 }]);

    await service.finishTournamentSession('s1', new Date(NOW), 71_000);

    const exit = prisma.backtestTradeExit.create.mock.calls[0][0].data;
    expect(exit.qty).toBeCloseTo(1.5);
    expect(exit.price).toBe(71_000);
    expect(exit.reason).toBe('finish');
    // Висящие ордера обеих сортов сняты: исполнять их больше некому.
    expect(prisma.backtestCloseOrder.deleteMany).toHaveBeenCalled();
    expect(prisma.backtestEntryOrder.deleteMany).toHaveBeenCalledWith({ where: { sessionId: 's1' } });
    expect(prisma.backtestSession.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 's1' }, data: expect.objectContaining({ status: 'finished' }) }),
    );
  });
});
