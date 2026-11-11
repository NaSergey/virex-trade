import type { StreamContext } from './stop-follow.service';
import type { StreamState } from './stream-state';
import { TrailStopService } from './trail-stop.service';
import type { TrailPlan, TrailUpdate } from './trail-stop.store';

const CREDS = { apiKey: 'k', apiSecret: 's' };
const T0 = Date.UTC(2026, 10, 11, 12, 0, 0);

// Лонг от 60 000 со стопом 59 000, подводящий на 1 000.
const plan = (extra: Partial<TrailPlan> = {}): TrailPlan => ({
  id: 'p1',
  userId: 'u1',
  symbol: 'BTCUSDT',
  direction: 'long',
  distance: 1_000,
  orderIds: [],
  seen: true,
  active: true,
  createdAt: new Date(T0),
  ...extra,
});

const position = (extra: Record<string, unknown> = {}) => ({
  symbol: 'BTCUSDT',
  side: 'Buy',
  size: '0.3',
  avgPrice: '60000',
  positionIdx: 1,
  stopLoss: '59000',
  takeProfit: '65000',
  ...extra,
});

const stateWith = (
  positions: any[],
  orders: Record<string, unknown> = {},
): StreamState => ({
  wallet: null,
  positions: Object.fromEntries(
    positions.map((p) => [`${p.symbol}:${p.positionIdx}`, p]),
  ),
  orders,
});

function setup(
  o: {
    plans?: TrailPlan[];
    state?: StreamState | null;
    mark?: number;
    fresh?: any[];
  } = {},
) {
  const plans = o.plans ?? [plan()];
  const updates: { id: string; data: TrailUpdate }[] = [];
  const store = {
    activeUsers: jest.fn(async () => [
      ...new Set(plans.filter((p) => p.active).map((p) => p.userId)),
    ]),
    activeOf: jest.fn(async (userId: string) =>
      plans
        .filter((p) => p.userId === userId && p.active)
        .map((p) => ({ ...p })),
    ),
    update: jest.fn(async (p: { id: string }, data: TrailUpdate) => {
      const row = plans.find((x) => x.id === p.id);
      if (!row) return false;
      Object.assign(row, data);
      updates.push({ id: p.id, data });
      return true;
    }),
  };
  const state = o.state === undefined ? stateWith([position()]) : o.state;
  const posts: { path: string; body: Record<string, unknown> }[] = [];
  const bybit = {
    // Свежая позиция — та же, что в потоке, если тест не сказал другого.
    privateGet: jest.fn(async () => ({
      list: o.fresh ?? Object.values(state?.positions ?? {}),
    })),
    privatePost: jest.fn(
      async (_c: unknown, path: string, body: Record<string, unknown>) => {
        posts.push({ path, body });
        return {};
      },
    ),
  };
  const market = {
    markPrices: jest.fn(async () => new Map([['BTCUSDT', o.mark ?? 60_500]])),
    requireInstrument: jest.fn(async () => ({ tickSize: '0.10' })),
  };
  const service = new TrailStopService(
    store as never,
    bybit as never,
    market as never,
  );
  const ctx: StreamContext = { creds: CREDS as never, state: () => state };
  let now = T0 + 60_000;
  jest.spyOn(Date, 'now').mockImplementation(() => now);
  const tick = async (ms = 5_000) => {
    now += ms;
    service.onIdle('u1', ctx);
    await service.idle('u1');
  };
  return { service, store, plans, updates, posts, bybit, ctx, tick };
}

afterEach(() => jest.restoreAllMocks());

describe('TrailStopService', () => {
  it('держит соединение тем, у кого есть план', async () => {
    const { service } = setup();
    expect(await service.pinned()).toEqual(['u1']);
  });

  it('стоп идёт за маркировкой на расстоянии, тейк позиции передаётся как есть', async () => {
    const { service, posts, tick } = setup({ mark: 60_500 });
    await service.pinned();

    await tick();

    expect(posts).toEqual([
      {
        path: '/position/trading-stop',
        body: {
          category: 'linear',
          symbol: 'BTCUSDT',
          positionIdx: 1,
          tpslMode: 'Full',
          stopLoss: '59500.00',
          takeProfit: '65000.00',
        },
      },
    ]);
  });

  it('не дальше безубытка; стоп в безубытке и дальше — не двигается', async () => {
    const far = setup({ mark: 63_000 });
    await far.service.pinned();
    await far.tick();
    expect(far.posts[0].body.stopLoss).toBe('60000.00');

    const be = setup({
      mark: 63_000,
      state: stateWith([position({ stopLoss: '60000' })]),
    });
    await be.service.pinned();
    await be.tick();
    expect(be.posts).toEqual([]);
  });

  it('шорт — зеркально, и округление — в сторону от цены', async () => {
    const short = position({
      side: 'Sell',
      positionIdx: 2,
      stopLoss: '61000',
      takeProfit: '',
    });
    const { service, posts, tick } = setup({
      plans: [plan({ direction: 'short' })],
      state: stateWith([short]),
      mark: 59_499.97,
    });
    await service.pinned();

    await tick();

    // 59 499.97 + 1 000 = 60 499.97 → вверх до шага: 60 500.00.
    expect(posts[0].body).toEqual({
      category: 'linear',
      symbol: 'BTCUSDT',
      positionIdx: 2,
      tpslMode: 'Full',
      stopLoss: '60500.00',
    });
  });

  it('сдвиг меньше шага (0,05 % цены) — запроса нет', async () => {
    const { service, posts, tick } = setup({ mark: 60_020 });
    await service.pinned();

    await tick();

    expect(posts).toEqual([]);
  });

  it('свежая позиция со стопом теснее (подтянуло другое правило) — не ослабляет', async () => {
    const { service, posts, tick } = setup({
      mark: 60_500,
      fresh: [position({ stopLoss: '59800' })],
    });
    await service.pinned();

    await tick();

    expect(posts).toEqual([]);
  });

  it('с прошлой записи меньше 3 с — ждёт', async () => {
    const { service, posts, tick, ctx } = setup({ mark: 60_500 });
    await service.pinned();
    await tick();
    expect(posts).toHaveLength(1);

    // Поток ещё не видел записи — стоп в нём прежний: без паузы пошёл бы второй запрос.
    await tick(1_000);
    expect(posts).toHaveLength(1);
    expect(ctx.state()).not.toBeNull();
  });

  it('позиция появилась — план её увидел; позиции не стало — план кончился', async () => {
    const state = stateWith([position()]);
    const { service, updates, tick } = setup({
      plans: [plan({ seen: false, orderIds: ['o1'] })],
      state,
    });
    await service.pinned();

    await tick();
    expect(updates).toContainEqual({ id: 'p1', data: { seen: true } });

    state.positions = {};
    await tick();
    expect(updates).toContainEqual({ id: 'p1', data: { active: false } });
  });

  it('неувиденный план ждёт, пока висит его ордер или идут первые 30 с', async () => {
    const pending = setup({
      plans: [plan({ seen: false, orderIds: ['o1'], createdAt: new Date(T0) })],
      state: stateWith([], { o1: { orderId: 'o1' } }),
    });
    await pending.service.pinned();
    await pending.tick(120_000);
    expect(pending.updates).toEqual([]);

    const fresh = setup({
      plans: [
        plan({
          seen: false,
          orderIds: ['o1'],
          createdAt: new Date(T0 + 50_000),
        }),
      ],
      state: stateWith([]),
    });
    await fresh.service.pinned();
    await fresh.tick(1_000);
    expect(fresh.updates).toEqual([]);

    const gone = setup({
      plans: [plan({ seen: false, orderIds: ['o1'], createdAt: new Date(T0) })],
      state: stateWith([]),
    });
    await gone.service.pinned();
    await gone.tick();
    expect(gone.updates).toEqual([{ id: 'p1', data: { active: false } }]);
  });

  it('состояния нет (поток переподключается) — это не «позиции нет»', async () => {
    const { service, updates, posts, tick } = setup({ state: null });
    await service.pinned();

    await tick();

    expect(updates).toEqual([]);
    expect(posts).toEqual([]);
  });

  it('без плана — ни маркировки, ни запросов', async () => {
    const { service, bybit, tick } = setup({ plans: [] });
    await service.pinned();

    await tick();

    expect(bybit.privateGet).not.toHaveBeenCalled();
  });
});
