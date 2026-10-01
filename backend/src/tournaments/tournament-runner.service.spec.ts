import { LiveEngineService } from '../backtest/live-engine.service';
import { TournamentRunnerService } from './tournament-runner.service';

/**
 * Движок эфира — единственное, что исполняет стопы, тейки и лимитки турнира:
 * время идёт и у закрытой вкладки. Проверяется, что он не исполняет одно
 * движение дважды, не трогает позицию раньше её входа и что падение одного
 * турнира не оставляет остальные без обслуживания.
 */
const MIN = 60_000;
const T = Date.UTC(2026, 8, 18, 12, 0, 0);
/** Минутка в той форме, в какой её отдаёт хранилище свечей. */
const bar = (t: number, o: number, h: number, l: number, c: number) => ({
  time: new Date(t),
  open: o,
  high: h,
  low: l,
  close: c,
  volume: 0,
});

const TOURNAMENT = {
  id: 'tn1',
  status: 'running',
  endsAt: new Date(T + 10 * MIN),
  processedUntil: null as Date | null,
  entryFee: 0,
  prizeBonus: 0,
  winnersCount: 1,
  payoutShares: [100],
};

const openTrade = (over: Record<string, unknown> = {}) => ({
  id: 't1',
  sessionId: 's1',
  symbol: 'BTCUSDT',
  direction: 'long',
  entryTime: new Date(T - MIN),
  entryPrice: 100,
  stopLoss: 95,
  takeProfit: null,
  qty: 1,
  closedQty: 0,
  exitTime: null,
  closeOrders: [],
  ...over,
});

function makeRunner(opts: {
  tournaments?: any[];
  trades?: any[];
  minutes?: any[] | ((symbol: string) => any[]);
  due?: any[];
  dueStart?: any[];
  finalizeError?: Error;
} = {}) {
  const saved: any[] = [];
  const prisma: any = {
    tournament: {
      findMany: jest.fn(async () => opts.tournaments ?? [TOURNAMENT]),
      update: jest.fn(async ({ where, data }: any) => {
        saved.push({ id: where.id, ...data });
        return {};
      }),
    },
    // Фильтр по монете — как у базы: движок и финал спрашивают сделки монеты.
    backtestTrade: {
      findMany: jest.fn(async (args: any) =>
        (opts.trades ?? []).filter((t) => !args?.where?.symbol || t.symbol === args.where.symbol),
      ),
    },
    backtestEntryOrder: { findMany: jest.fn(async () => []) },
    backtestSession: { findMany: jest.fn(async () => [{ id: 's1', userId: 'u1' }]) },
  };
  const live = {
    minutesSince: jest.fn(async (symbol: string) =>
      typeof opts.minutes === 'function' ? opts.minutes(symbol) : (opts.minutes ?? []),
    ),
  };
  const backtest = {
    systemClose: jest.fn(async () => true),
    systemEnter: jest.fn(async () => true),
    finishTournamentSession: jest.fn(async () => undefined),
  };
  const tournaments = {
    dueForStart: jest.fn(async () => opts.dueStart ?? []),
    startScheduled: jest.fn(async () => 'started'),
    dueForFinal: jest.fn(async () => opts.due ?? []),
    finalize: jest.fn(async () => {
      if (opts.finalizeError) throw opts.finalizeError;
      return true;
    }),
  };

  // Движок настоящий: исполнение уровней — его работа, и тесты ниже проверяют
  // её через тик турнира.
  const engine = new LiveEngineService(prisma as never, live as never, backtest as never);
  const runner = new TournamentRunnerService(
    prisma as never,
    live as never,
    engine,
    backtest as never,
    tournaments as never,
  );
  return { runner, prisma, live, backtest, tournaments, saved };
}

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date(T + 2 * MIN));
});
afterEach(() => {
  jest.useRealTimers();
});

describe('TournamentRunnerService.tick — исполнение уровней', () => {
  it('стоп в отрезке закрывает позицию по цене стопа', async () => {
    const h = makeRunner({
      trades: [openTrade()],
      minutes: [bar(T, 100, 101, 94, 96)],
    });

    await h.runner.tick();

    expect(h.backtest.systemClose).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ reason: 'stop', exitPrice: 95 }),
    );
  });

  it('спокойная минутка ничего не закрывает', async () => {
    const h = makeRunner({ trades: [openTrade()], minutes: [bar(T, 100, 101, 99, 100)] });

    await h.runner.tick();

    expect(h.backtest.systemClose).not.toHaveBeenCalled();
  });

  it('две лимитки срабатывают в одном отрезке — второй проход видит уже снятую первую', async () => {
    const h = makeRunner({
      trades: [
        openTrade({
          closeOrders: [
            { id: 'o1', price: 103, qty: 0.3 },
            { id: 'o2', price: 105, qty: 0.3 },
          ],
        }),
      ],
      // Минутка прошла оба уровня, стопа не задев.
      minutes: [bar(T, 100, 106, 99, 104)],
    });

    await h.runner.tick();

    const fired = h.backtest.systemClose.mock.calls.map((c: any[]) => [c[1].reason, c[1].closeOrderId]);
    expect(fired).toEqual([
      ['limit', 'o1'],
      ['limit', 'o2'],
    ]);
  });

  it('стоп в той же свече опережает лимитку — порядок внутри отрезка не восстановить', async () => {
    const h = makeRunner({
      trades: [openTrade({ closeOrders: [{ id: 'o1', price: 105, qty: 0.4 }] })],
      // Минутка сходила и вверх к лимитке, и вниз за стоп.
      minutes: [bar(T, 100, 106, 94, 96)],
    });

    await h.runner.tick();

    // Правило бектеста, перенесённое без изменений: при обоих касаниях
    // предполагается худшее для участника.
    const reasons = h.backtest.systemClose.mock.calls.map((c: any[]) => c[1].reason);
    expect(reasons).toEqual(['stop']);
  });

  it('позиция не проверяется на движении до своего входа', async () => {
    const h = makeRunner({
      // Вход в середине минутки, уже после того, как цена сходила к стопу.
      trades: [openTrade({ entryTime: new Date(T + 30_000), entryPrice: 100 })],
      minutes: [bar(T, 100, 101, 94, 100)],
    });

    await h.runner.tick();

    expect(h.backtest.systemClose).not.toHaveBeenCalled();
  });

  it('следующий тик читает рынок с того места, где остановился прошлый', async () => {
    const h = makeRunner({ trades: [openTrade()], minutes: [bar(T, 100, 101, 99, 100)] });

    await h.runner.tick();
    const first = h.saved.at(-1);
    expect(first.processedUntil).toEqual(new Date(T + 2 * MIN));

    // Прошла ещё минута, и та же уже разобранная минутка приходит снова.
    jest.setSystemTime(new Date(T + 3 * MIN));
    h.prisma.tournament.findMany.mockResolvedValue([{ ...TOURNAMENT, processedUntil: first.processedUntil }]);
    await h.runner.tick();

    // Читаем с прошлой границы, а не с начала — и старое движение не
    // исполняется второй раз.
    expect(h.live.minutesSince).toHaveBeenLastCalledWith('BTCUSDT', T + 2 * MIN, T + 3 * MIN);
    expect(h.backtest.systemClose).not.toHaveBeenCalled();
  });

  it('без хода времени второй тик к бирже не ходит', async () => {
    const h = makeRunner({ trades: [openTrade()], minutes: [bar(T, 100, 101, 99, 100)] });

    await h.runner.tick();
    h.prisma.tournament.findMany.mockResolvedValue([
      { ...TOURNAMENT, processedUntil: h.saved.at(-1).processedUntil },
    ]);
    await h.runner.tick();

    expect(h.live.minutesSince).toHaveBeenCalledTimes(1);
  });

  it('граница обработки сохраняется каждый тик', async () => {
    const h = makeRunner({ trades: [], minutes: [bar(T, 100, 101, 99, 100)] });

    await h.runner.tick();

    expect(h.saved).toHaveLength(1);
    expect(h.saved[0].id).toBe('tn1');
  });

  it('ошибка одного турнира не оставляет остальные без обслуживания', async () => {
    const h = makeRunner({
      tournaments: [
        { ...TOURNAMENT, id: 'bad' },
        { ...TOURNAMENT, id: 'good' },
      ],
      trades: [openTrade()],
      minutes: [bar(T, 100, 101, 94, 96)],
    });
    h.backtest.systemClose.mockRejectedValueOnce(new Error('база отвалилась'));

    await expect(h.runner.tick()).resolves.toBeUndefined();

    expect(h.saved.map((s) => s.id)).toEqual(['good']);
  });
});

describe('TournamentRunnerService.tick — финал', () => {
  const ENDED = { ...TOURNAMENT, endsAt: new Date(T + MIN) };

  it('закрывает сессии по цене последней минутки и подводит итоги', async () => {
    const h = makeRunner({
      tournaments: [],
      due: [ENDED],
      trades: [openTrade()],
      // Минутка, которой кончается турнир, уже закрыта.
      minutes: [bar(T, 100, 105, 99, 103)],
    });

    await h.runner.tick();

    expect(h.backtest.finishTournamentSession).toHaveBeenCalledWith('s1', ENDED.endsAt, { BTCUSDT: 103 });
    expect(h.tournaments.finalize).toHaveBeenCalledWith(ENDED);
  });

  it('без закрытой финальной минутки итоги ждут следующего тика', async () => {
    const h = makeRunner({ tournaments: [], due: [ENDED], trades: [openTrade()], minutes: [] });

    await h.runner.tick();

    expect(h.backtest.finishTournamentSession).not.toHaveBeenCalled();
    expect(h.tournaments.finalize).not.toHaveBeenCalled();
  });

  it('падение одного финала не отменяет остальные', async () => {
    const h = makeRunner({
      tournaments: [],
      due: [{ ...ENDED, id: 'bad' }, { ...ENDED, id: 'good' }],
      trades: [openTrade()],
      minutes: [bar(T, 100, 105, 99, 103)],
    });
    h.tournaments.finalize.mockRejectedValueOnce(new Error('упало'));

    await expect(h.runner.tick()).resolves.toBeUndefined();

    expect(h.tournaments.finalize).toHaveBeenCalledTimes(2);
  });

  it('финальная цена — у каждой монеты открытых позиций своя', async () => {
    const h = makeRunner({
      tournaments: [],
      due: [ENDED],
      trades: [openTrade(), openTrade({ id: 't2', symbol: 'ETHUSDT' })],
      minutes: (symbol) => [symbol === 'ETHUSDT' ? bar(T, 2_500, 2_520, 2_490, 2_510) : bar(T, 100, 105, 99, 103)],
    });

    await h.runner.tick();

    expect(h.backtest.finishTournamentSession).toHaveBeenCalledWith('s1', ENDED.endsAt, {
      BTCUSDT: 103,
      ETHUSDT: 2_510,
    });
  });

  it('нет цены хоть одной монеты — итоги ждут', async () => {
    const h = makeRunner({
      tournaments: [],
      due: [ENDED],
      trades: [openTrade(), openTrade({ id: 't2', symbol: 'ETHUSDT' })],
      minutes: (symbol) => (symbol === 'ETHUSDT' ? [] : [bar(T, 100, 105, 99, 103)]),
    });

    await h.runner.tick();

    expect(h.backtest.finishTournamentSession).not.toHaveBeenCalled();
    expect(h.tournaments.finalize).not.toHaveBeenCalled();
  });

  it('без открытых позиций итоги не ждут ни одной цены', async () => {
    const h = makeRunner({ tournaments: [], due: [ENDED], trades: [], minutes: [] });

    await h.runner.tick();

    expect(h.live.minutesSince).not.toHaveBeenCalled();
    expect(h.backtest.finishTournamentSession).toHaveBeenCalledWith('s1', ENDED.endsAt, {});
    expect(h.tournaments.finalize).toHaveBeenCalledWith(ENDED);
  });
});

describe('TournamentRunnerService.tick — старт по времени', () => {
  const LOBBY = { ...TOURNAMENT, status: 'lobby', startsAt: new Date(T + MIN) };

  it('каждое лобби с наступившим временем уходит в startScheduled', async () => {
    const h = makeRunner({ tournaments: [], dueStart: [LOBBY, { ...LOBBY, id: 'tn2' }] });

    await h.runner.tick();

    expect(h.tournaments.startScheduled).toHaveBeenCalledWith(LOBBY.id, new Date(T + 2 * MIN));
    expect(h.tournaments.startScheduled).toHaveBeenCalledWith('tn2', new Date(T + 2 * MIN));
  });

  it('падение одного старта не мешает другому', async () => {
    const h = makeRunner({ tournaments: [], dueStart: [{ ...LOBBY, id: 'bad' }, { ...LOBBY, id: 'good' }] });
    h.tournaments.startScheduled.mockRejectedValueOnce(new Error('упало'));

    await expect(h.runner.tick()).resolves.toBeUndefined();

    expect(h.tournaments.startScheduled).toHaveBeenCalledTimes(2);
  });
});
