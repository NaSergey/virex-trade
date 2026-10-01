import { LiveEngineService } from './live-engine.service';

/**
 * Уровни на вход в эфире — то, чего раньше не исполнял никто: браузерная
 * прокрутка в эфире выключена, а движок турнира смотрел только на открытые
 * сделки. Выходы движка проверяются тестами `TournamentRunner`, который ходит
 * через этот же движок.
 */
const MIN = 60_000;
const T = Date.UTC(2026, 8, 25, 12, 0, 0);
const bar = (t: number, o: number, h: number, l: number, c: number) => ({
  time: new Date(t),
  open: o,
  high: h,
  low: l,
  close: c,
  volume: 0,
});

const SCOPE = { id: 's1' };

/** Нетронутый уровень BTC: делает монету активной, ничего не исполняя. */
const IDLE = { id: 'idle', price: 1, symbol: 'BTCUSDT' };

function makeEngine(opts: { trades?: any[]; orders?: any[]; minutes?: any[] | ((symbol: string) => any[]) } = {}) {
  // Строки без монеты — BTC, как у прежних сделок. Состояние изменяемое: тест
  // может закрыть позицию между тиками.
  const state = {
    trades: (opts.trades ?? []).map((t) => ({ symbol: 'BTCUSDT', ...t })),
    orders: (opts.orders ?? []).map((o) => ({ symbol: 'BTCUSDT', ...o })),
  };
  const bySymbol = (rows: any[], args: any) => rows.filter((r) => !args?.where?.symbol || r.symbol === args.where.symbol);
  const prisma: any = {
    backtestTrade: { findMany: jest.fn(async (args: any) => bySymbol(state.trades, args)) },
    backtestEntryOrder: { findMany: jest.fn(async (args: any) => bySymbol(state.orders, args)) },
  };
  const live = {
    minutesSince: jest.fn(async (symbol: string) =>
      typeof opts.minutes === 'function' ? opts.minutes(symbol) : (opts.minutes ?? []),
    ),
  };
  const backtest = {
    systemClose: jest.fn(async () => true),
    systemEnter: jest.fn(async () => true),
  };
  const engine = new LiveEngineService(prisma as never, live as never, backtest as never);
  return { engine, prisma, live, backtest, state };
}

describe('LiveEngineService — уровни на вход', () => {
  it('задетый уровень исполняется временем конца отрезка', async () => {
    const h = makeEngine({ orders: [{ id: 'eo1', price: 95 }], minutes: [bar(T, 100, 101, 94, 96)] });

    await h.engine.run('s:s1', new Date(T), T + 2 * MIN, SCOPE);

    expect(h.backtest.systemEnter).toHaveBeenCalledWith('eo1', new Date(T + MIN));
  });

  it('незадетый уровень ждёт', async () => {
    const h = makeEngine({ orders: [{ id: 'eo1', price: 90 }], minutes: [bar(T, 100, 101, 94, 96)] });

    await h.engine.run('s:s1', new Date(T), T + 2 * MIN, SCOPE);

    expect(h.backtest.systemEnter).not.toHaveBeenCalled();
  });

  it('все задетые уровни — в одном отрезке, от ближайшего к открытию', async () => {
    const h = makeEngine({
      orders: [
        { id: 'far', price: 95 },
        { id: 'near', price: 98 },
      ],
      minutes: [bar(T, 100, 101, 94, 96)],
    });

    await h.engine.run('s:s1', new Date(T), T + 2 * MIN, SCOPE);

    expect(h.backtest.systemEnter.mock.calls.map((c: any[]) => c[0])).toEqual(['near', 'far']);
  });

  it('уровень, выставленный внутри отрезка, в нём не исполняется', async () => {
    const h = makeEngine({ orders: [IDLE], minutes: [bar(T, 100, 101, 94, 96)] });

    await h.engine.run('s:s1', new Date(T), T + 2 * MIN, SCOPE);

    // Отрезок — целая минутка с открытием в T: уровни, выставленные позже, ждут.
    expect(h.prisma.backtestEntryOrder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { session: SCOPE, symbol: 'BTCUSDT', createdAt: { lte: new Date(T) } } }),
    );
  });

  it('уровни перечитываются после выходов того же отрезка', async () => {
    const h = makeEngine({
      trades: [
        {
          id: 't1',
          direction: 'long',
          entryTime: new Date(T - MIN),
          entryPrice: 100,
          stopLoss: 95,
          takeProfit: null,
          closeOrders: [],
        },
      ],
      minutes: [bar(T, 100, 101, 94, 96)],
    });

    await h.engine.run('s:s1', new Date(T), T + 2 * MIN, SCOPE);

    // Выходы отрезка — первыми: уровни на вход читаются уже после стопа.
    const closeAt = h.backtest.systemClose.mock.invocationCallOrder[0];
    // Последнее чтение — уровни отрезка; первое — список монет потока.
    const readAt = h.prisma.backtestEntryOrder.findMany.mock.invocationCallOrder.at(-1);
    expect(closeAt).toBeLessThan(readAt);
  });
});

describe('LiveEngineService — курсор потока', () => {
  it('без хода времени к бирже не ходит и курсор двигать не велит', async () => {
    const h = makeEngine({ orders: [IDLE] });

    expect(await h.engine.run('s:s1', new Date(T), T, SCOPE)).toBe(false);
    expect(h.live.minutesSince).not.toHaveBeenCalled();
  });

  it('без курсора читает последнюю минуту до until', async () => {
    const h = makeEngine({ orders: [IDLE] });

    expect(await h.engine.run('s:s1', null, T + MIN, SCOPE)).toBe(true);
    expect(h.live.minutesSince).toHaveBeenCalledWith('BTCUSDT', T, T + MIN);
  });

  it('снимок недоформированной минутки держится по ключу потока', async () => {
    const h = makeEngine({ orders: [IDLE], minutes: [bar(T, 100, 101, 99, 100)] });

    // Тик посреди минутки: она ещё формируется и остаётся в снимке.
    await h.engine.run('s:s1', new Date(T), T + 30_000, SCOPE);
    await h.engine.run('s:s1', new Date(T + 30_000), T + 40_000, SCOPE);
    // Следующий тик читает с открытия минутки из снимка, а не с курсора.
    expect(h.live.minutesSince).toHaveBeenLastCalledWith('BTCUSDT', T, T + 40_000);

    // Чужой поток снимка не видит.
    await h.engine.run('s:s2', new Date(T + 30_000), T + 40_000, { id: 's2' });
    expect(h.live.minutesSince).toHaveBeenLastCalledWith('BTCUSDT', T + 30_000, T + 40_000);

    // Забытый поток читает снова от курсора.
    h.engine.forget('s:s1');
    await h.engine.run('s:s1', new Date(T + 40_000), T + 50_000, SCOPE);
    expect(h.live.minutesSince).toHaveBeenLastCalledWith('BTCUSDT', T + 40_000, T + 50_000);
  });
});

describe('LiveEngineService — монеты', () => {
  const trade = (over: Record<string, unknown>) => ({
    id: 't',
    direction: 'long',
    entryTime: new Date(T - MIN),
    entryPrice: 100,
    stopLoss: 95,
    takeProfit: null,
    closeOrders: [],
    ...over,
  });

  it('каждая монета — своими минутками: стоп ETH не проверяется по свечам BTC', async () => {
    const h = makeEngine({
      trades: [
        trade({ id: 'btc', symbol: 'BTCUSDT', entryPrice: 70_000, stopLoss: 69_000 }),
        trade({ id: 'eth', symbol: 'ETHUSDT', entryPrice: 2_500, stopLoss: 2_400 }),
      ],
      minutes: (symbol) =>
        symbol === 'ETHUSDT' ? [bar(T, 2_450, 2_460, 2_390, 2_400)] : [bar(T, 70_000, 70_100, 69_900, 70_050)],
    });

    await h.engine.run('s:s1', new Date(T), T + 2 * MIN, SCOPE);

    expect(h.live.minutesSince.mock.calls.map((c: any[]) => c[0])).toEqual(['BTCUSDT', 'ETHUSDT']);
    expect(h.backtest.systemClose).toHaveBeenCalledTimes(1);
    expect(h.backtest.systemClose).toHaveBeenCalledWith('eth', expect.objectContaining({ exitPrice: 2_400, reason: 'stop' }));
  });

  it('поток без позиций и уровней к бирже не ходит, но время идёт', async () => {
    const h = makeEngine();

    expect(await h.engine.run('t:tn1', new Date(T), T + MIN, { tournamentId: 'tn1' })).toBe(true);
    expect(h.live.minutesSince).not.toHaveBeenCalled();
  });

  it('монета без позиций теряет снимок — следующая позиция читает от курсора', async () => {
    const h = makeEngine({ orders: [{ id: 'e', price: 1, symbol: 'ETHUSDT' }], minutes: [bar(T, 100, 101, 99, 100)] });

    // Тик посреди минутки: снимок ETH остаётся.
    await h.engine.run('s:s1', new Date(T), T + 30_000, SCOPE);
    // Уровень сняли — у ETH в потоке ничего нет.
    h.state.orders = [];
    await h.engine.run('s:s1', new Date(T + 30_000), T + 5 * MIN, SCOPE);
    // Новый уровень ETH: рынок читается от курсора, а не от минутки из старого снимка.
    h.state.orders = [{ id: 'e2', price: 1, symbol: 'ETHUSDT' }];
    await h.engine.run('s:s1', new Date(T + 5 * MIN), T + 6 * MIN, SCOPE);

    expect(h.live.minutesSince).toHaveBeenLastCalledWith('ETHUSDT', T + 5 * MIN, T + 6 * MIN);
  });

  it('forget снимает снимки всех монет потока', async () => {
    const h = makeEngine({
      orders: [IDLE, { id: 'e', price: 1, symbol: 'ETHUSDT' }],
      minutes: [bar(T, 100, 101, 99, 100)],
    });

    await h.engine.run('s:s1', new Date(T), T + 30_000, SCOPE);
    h.engine.forget('s:s1');
    h.live.minutesSince.mockClear();
    await h.engine.run('s:s1', new Date(T + 40_000), T + 50_000, SCOPE);

    expect(h.live.minutesSince.mock.calls).toEqual([
      ['BTCUSDT', T + 40_000, T + 50_000],
      ['ETHUSDT', T + 40_000, T + 50_000],
    ]);
  });
});
