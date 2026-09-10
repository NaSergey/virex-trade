import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { BacktestService } from './backtest.service';

const DAY = 86_400_000;
const T0 = Date.UTC(2020, 0, 1);

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
    },
    backtestTradeTag: { deleteMany: jest.fn(), createMany: jest.fn() },
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
  const service = new BacktestService(prisma as never, marketData as never);
  (service as unknown as { rnd: () => number }).rnd = () => 0;
  return { service, prisma, marketData };
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
  defaultRiskPct: 1,
  hideDate: true,
  hidePrice: false,
  priceScale: 1,
};

const INPUT = { startBalance: 10_000, defaultRiskPct: 1, hideDate: true, hidePrice: false };

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
});

describe('BacktestService — сделки', () => {
  const OPEN = {
    direction: 'long' as const,
    entryTime: new Date(T0 + DAY),
    entryPrice: 100,
    stopLoss: 98,
    riskPct: 1,
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

  it('не открывает вторую сделку, пока есть открытая', async () => {
    const { service, prisma } = makeService();
    prisma.backtestSession.findUnique.mockResolvedValue(SESSION);
    prisma.backtestTrade.count.mockResolvedValue(1);

    const err = await rejection(service.openTrade('u1', 's1', OPEN));

    expect(err).toBeInstanceOf(ConflictException);
    expect(err.getResponse()).toMatchObject({ code: 'BACKTEST_OPEN_TRADE' });
    expect(prisma.backtestTrade.create).not.toHaveBeenCalled();
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

  it('закрывает: PnL, R и комиссию считает сервер, депозит растёт на PnL', async () => {
    const { service, prisma } = makeService();
    prisma.backtestTrade.findUnique.mockResolvedValue(TRADE);

    await service.closeTrade('u1', 't1', { exitTime: new Date(T0 + DAY), exitPrice: 104, reason: 'take' });

    const data = prisma.backtestTrade.update.mock.calls[0][0].data;
    expect(data.pnl).toBeCloseTo(194.39, 6);
    expect(data.r).toBeCloseTo(1.9439, 6);
    expect(data.fee).toBeCloseTo(5.61, 6);
    expect(data.exitReason).toBe('take');
    const inc = prisma.backtestSession.update.mock.calls[0][0].data.balance.increment;
    expect(inc).toBeCloseTo(194.39, 6);
  });

  it('выход не позже входа — отказ', async () => {
    const { service, prisma } = makeService();
    prisma.backtestTrade.findUnique.mockResolvedValue(TRADE);

    const err = await rejection(service.closeTrade('u1', 't1', { exitTime: new Date(T0), exitPrice: 104, reason: 'manual' }));

    expect(err.getResponse()).toMatchObject({ code: 'BACKTEST_TIME_INVALID' });
  });

  // Ответ на первое закрытие потерялся в сети, браузер отправил то же ещё раз.
  it('повтор того же закрытия — не ошибка и не второе начисление', async () => {
    const { service, prisma } = makeService();
    const closed = { ...TRADE, exitTime: new Date(T0 + DAY), exitPrice: 104 };
    prisma.backtestTrade.findUnique.mockResolvedValue({ ...closed, tags: [] });

    await service.closeTrade('u1', 't1', { exitTime: new Date(T0 + DAY), exitPrice: 104, reason: 'take' });

    expect(prisma.backtestTrade.update).not.toHaveBeenCalled();
    expect(prisma.backtestSession.update).not.toHaveBeenCalled();
  });

  it('закрыть уже закрытую другими данными — отказ', async () => {
    const { service, prisma } = makeService();
    prisma.backtestTrade.findUnique.mockResolvedValue({ ...TRADE, exitTime: new Date(T0 + DAY), exitPrice: 104 });

    const err = await rejection(service.closeTrade('u1', 't1', { exitTime: new Date(T0 + 2 * DAY), exitPrice: 90, reason: 'stop' }));

    expect(err.getResponse()).toMatchObject({ code: 'BACKTEST_TRADE_CLOSED' });
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
    prisma.backtestTrade.findUnique.mockResolvedValue({ ...TRADE, takeProfit: 105 });

    await service.modifyTrade('u1', 't1', { takeProfit: null });

    expect(prisma.backtestTrade.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 't1' }, data: { takeProfit: null } }),
    );
  });

  it('закрытую сделку не двигают', async () => {
    const { service, prisma } = makeService();
    prisma.backtestTrade.findUnique.mockResolvedValue({ ...TRADE, exitTime: new Date(T0 + DAY) });

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
});
