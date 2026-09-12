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
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
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
  hideDate: true,
  hidePrice: false,
  priceScale: 1,
};

const INPUT = { startBalance: 10_000, hideDate: true, hidePrice: false };

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

  it('закрывает: PnL, R и комиссию считает сервер, депозит растёт на PnL', async () => {
    const { service, prisma } = makeService();
    prisma.backtestTrade.findUnique
      .mockResolvedValueOnce(TRADE)
      .mockResolvedValueOnce({ ...TRADE, exitTime: new Date(T0 + DAY), exitPrice: 104, exitReason: 'take', tags: [] });

    await service.closeTrade('u1', 't1', { exitTime: new Date(T0 + DAY), exitPrice: 104, reason: 'take' });

    const call = prisma.backtestTrade.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: 't1', exitTime: null });
    expect(call.data.pnl).toBeCloseTo(194.39, 6);
    expect(call.data.r).toBeCloseTo(1.9439, 6);
    expect(call.data.fee).toBeCloseTo(5.61, 6);
    expect(call.data.exitReason).toBe('take');
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

  // Оба запроса читают exitTime: null до входа в свою транзакцию; побеждает
  // тот, кто первым прошёл bumpCursor. Второй должен увидеть уже закрытую
  // сделку внутри транзакции, а не начислить PnL повторно.
  it('гонка при закрытии: updateMany не задел строку, но данные совпадают — тот же повтор', async () => {
    const { service, prisma } = makeService();
    prisma.backtestTrade.findUnique
      .mockResolvedValueOnce(TRADE) // ownedTrade — ещё не закрыта на момент чтения
      .mockResolvedValueOnce({ ...TRADE, exitTime: new Date(T0 + DAY), exitPrice: 104, tags: [] }); // перечитывание внутри транзакции
    prisma.backtestTrade.updateMany.mockResolvedValueOnce({ count: 0 });
    prisma.backtestSession.findUnique.mockResolvedValue({ balance: 10_194.39 });

    const res = await service.closeTrade('u1', 't1', { exitTime: new Date(T0 + DAY), exitPrice: 104, reason: 'take' });

    expect(prisma.backtestSession.update).not.toHaveBeenCalled();
    expect(res.balance).toBe(10_194.39);
  });

  it('гонка при закрытии: updateMany не задел строку, данные другие — отказ', async () => {
    const { service, prisma } = makeService();
    prisma.backtestTrade.findUnique
      .mockResolvedValueOnce(TRADE)
      .mockResolvedValueOnce({ ...TRADE, exitTime: new Date(T0 + DAY), exitPrice: 90, tags: [] });
    prisma.backtestTrade.updateMany.mockResolvedValueOnce({ count: 0 });

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

      await service.addToTrade('u1', 't1', { entryPrice: 110, riskPct: 1 });

      const call = prisma.backtestTrade.updateMany.mock.calls[0][0];
      expect(call.where).toEqual({ id: 't1', exitTime: null });
      expect(call.data.qty).toBeCloseTo(58.333, 3);
      expect(call.data.entryPrice).toBeCloseTo(101.4286, 3);
      expect(call.data.riskUsdt).toBeCloseTo(200, 6);
    });

    it('без открытой сделки — отказ', async () => {
      const { service, prisma } = makeService();
      prisma.backtestTrade.findUnique.mockResolvedValue({ ...TRADE, exitTime: new Date(T0 + DAY) });

      const err = await rejection(service.addToTrade('u1', 't1', { entryPrice: 110, riskPct: 1 }));

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
      const err = await rejection(service.addToTrade('u1', 't1', { entryPrice: 110, riskPct: 50 }));

      expect(err.getResponse()).toMatchObject({ code: 'BACKTEST_STOP_SIDE' });
    });

    it('маржа добора больше депозита — отказ', async () => {
      const { service, prisma } = makeService();
      prisma.backtestTrade.findUnique.mockResolvedValue(TRADE);
      prisma.backtestSession.findUnique.mockResolvedValue({ balance: 10 });

      const err = await rejection(service.addToTrade('u1', 't1', { entryPrice: 110, riskPct: 1 }));

      expect(err.getResponse()).toMatchObject({ code: 'BACKTEST_MARGIN_EXCEEDS_BALANCE' });
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
      expect.objectContaining({ where: { session: { userId: 'u1' }, exitTime: { not: null } } }),
    );
  });
});
