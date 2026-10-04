import type { FollowPlan, FollowUpdate } from './stop-follow.store';
import { StopFollowService, type StreamContext } from './stop-follow.service';
import type { StreamState } from './stream-state';

const CREDS = { apiKey: 'k', apiSecret: 's' };

const plan = (extra: Partial<FollowPlan> = {}): FollowPlan => ({
  id: 'p1',
  userId: 'u1',
  symbol: 'BTCUSDT',
  direction: 'long',
  entryPrice: 60_000,
  orderIds: ['t1', 't2', 't3'],
  prices: [61_000, 62_000, 63_000],
  stops: [],
  filled: [],
  fillPrices: [],
  cancelled: [],
  target: null,
  applied: true,
  active: true,
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

const filled = (orderId: string, avgPrice: string) => ({
  orderId,
  symbol: 'BTCUSDT',
  side: 'Sell',
  orderType: 'Limit',
  orderStatus: 'Filled',
  avgPrice,
  updatedTime: '1000',
});

function setup(o: { plans?: FollowPlan[]; state?: StreamState; mark?: number; history?: Record<string, unknown> } = {}) {
  let plans = o.plans ?? [plan()];
  const updates: { id: string; data: FollowUpdate }[] = [];
  const store = {
    activeUsers: jest.fn(async () => [...new Set(plans.filter((p) => p.active).map((p) => p.userId))]),
    activeOf: jest.fn(async (userId: string) => plans.filter((p) => p.userId === userId && p.active).map((p) => ({ ...p }))),
    update: jest.fn(async (id: string, data: FollowUpdate) => {
      const p = plans.find((x) => x.id === id);
      if (!p) return false;
      Object.assign(p, data);
      updates.push({ id, data });
      return true;
    }),
  };
  const posts: { path: string; body: Record<string, unknown> }[] = [];
  let failPost = false;
  const bybit = {
    privatePost: jest.fn(async (_c: unknown, path: string, body: Record<string, unknown>) => {
      if (failPost) throw new Error('busy');
      posts.push({ path, body });
      return {};
    }),
    privateGet: jest.fn(async (_c: unknown, _path: string, params: Record<string, string>) => ({
      list: o.history?.[params.orderId] ? [o.history[params.orderId]] : [],
    })),
  };
  const market = {
    requireInstrument: jest.fn(async () => ({ tickSize: '0.1' })),
    markPrices: jest.fn(async () => new Map(o.mark != null ? [['BTCUSDT', o.mark]] : [])),
  };
  const terminal = { closePosition: jest.fn(async () => ({ success: true })) };
  const state: StreamState = o.state ?? { wallet: null, positions: { 'BTCUSDT:1': position() }, orders: {} };
  const ctx: StreamContext = { creds: CREDS, state: () => state };
  const service = new StopFollowService(store as any, bybit as any, market as any, terminal as any);
  return {
    service,
    store,
    posts,
    terminal,
    bybit,
    ctx,
    state,
    plans: () => plans,
    setPlans: (p: FollowPlan[]) => (plans = p),
    failPost: (v: boolean) => (failPost = v),
  };
}

/** Дать очереди пользователя отработать. */
const settle = () => jest.advanceTimersByTimeAsync(0);
const stops = (posts: { path: string; body: Record<string, unknown> }[]) =>
  posts.filter((p) => p.path === '/position/trading-stop').map((p) => p.body);

describe('StopFollowService', () => {
  beforeEach(() => jest.useFakeTimers({ now: 1_000_000 }));
  afterEach(() => jest.useRealTimers());

  it('без плана события не трогает и базу не читает', async () => {
    const t = setup({ plans: [] });
    await t.service.pinned();
    t.service.onEvent('u1', { topic: 'order.linear', data: [filled('t1', '61000')] }, t.ctx);
    await settle();
    expect(t.store.activeOf).not.toHaveBeenCalled();
  });

  it('первый тейк — стоп в безубыток; тейк позиции передаётся прежний, индекс — самой позиции', async () => {
    const t = setup({ mark: 61_200 });
    await t.service.pinned();
    t.service.onEvent('u1', { topic: 'order.linear', data: [filled('t1', '61000')] }, t.ctx);
    await settle();
    expect(stops(t.posts)).toEqual([
      { category: 'linear', symbol: 'BTCUSDT', positionIdx: 1, tpslMode: 'Full', stopLoss: '60000.0', takeProfit: '65000.0' },
    ]);
    expect(t.plans()[0]).toMatchObject({ filled: ['t1'], fillPrices: [61_000], target: 60_000, applied: true, active: true });
  });

  it('у тейка своя цель стопа — стоп идёт на неё, а не в безубыток', async () => {
    const t = setup({ plans: [plan({ stops: [60_400, 0, 0] })], mark: 61_200 });
    await t.service.pinned();
    t.service.onEvent('u1', { topic: 'order.linear', data: [filled('t1', '61000')] }, t.ctx);
    await settle();
    expect(stops(t.posts)[0]).toMatchObject({ stopLoss: '60400.0' });
    expect(t.plans()[0]).toMatchObject({ target: 60_400 });
  });

  it('цель у второго тейка, а исполнился первый — первому правило', async () => {
    const t = setup({ plans: [plan({ stops: [0, 61_500, 0] })], mark: 61_200 });
    await t.service.pinned();
    t.service.onEvent('u1', { topic: 'order.linear', data: [filled('t1', '61000')] }, t.ctx);
    await settle();
    expect(stops(t.posts)[0]).toMatchObject({ stopLoss: '60000.0' });
  });

  it('второй тейк — стоп на цену первого', async () => {
    const t = setup({ plans: [plan({ filled: ['t1'], fillPrices: [61_000], target: 60_000 })], mark: 62_100 });
    t.state.positions['BTCUSDT:1'].stopLoss = '60000';
    await t.service.pinned();
    t.service.onEvent('u1', { topic: 'order.linear', data: [filled('t2', '62000')] }, t.ctx);
    await settle();
    expect(stops(t.posts)[0]).toMatchObject({ stopLoss: '61000.0' });
  });

  it('у позиции без тейка тейк не передаётся вовсе', async () => {
    const t = setup({ mark: 61_200 });
    t.state.positions['BTCUSDT:1'].takeProfit = '';
    await t.service.pinned();
    t.service.onEvent('u1', { topic: 'order.linear', data: [filled('t1', '61000')] }, t.ctx);
    await settle();
    expect(stops(t.posts)[0]).not.toHaveProperty('takeProfit');
  });

  it('тот же ордер дважды (двойной Filled) — один шаг', async () => {
    const t = setup({ mark: 61_200 });
    await t.service.pinned();
    t.service.onEvent('u1', { topic: 'order.linear', data: [filled('t1', '61000')] }, t.ctx);
    t.service.onEvent('u1', { topic: 'order.linear', data: [filled('t1', '61000')] }, t.ctx);
    await settle();
    expect(stops(t.posts)).toHaveLength(1);
  });

  it('ручной стоп теснее цели — не ослабляется', async () => {
    const t = setup({ mark: 61_200 });
    t.state.positions['BTCUSDT:1'].stopLoss = '60500';
    await t.service.pinned();
    t.service.onEvent('u1', { topic: 'order.linear', data: [filled('t1', '61000')] }, t.ctx);
    await settle();
    expect(stops(t.posts)).toEqual([]);
    expect(t.plans()[0].filled).toEqual(['t1']);
  });

  it('цена уже за целью — остаток закрывается по рынку, как сработал бы стоп', async () => {
    const t = setup({ mark: 59_900 });
    await t.service.pinned();
    t.service.onEvent('u1', { topic: 'order.linear', data: [filled('t1', '61000')] }, t.ctx);
    await settle();
    expect(stops(t.posts)).toEqual([]);
    expect(t.terminal.closePosition).toHaveBeenCalledWith('u1', { symbol: 'BTCUSDT', direction: 'long', kind: 'market' });
    expect(t.plans()[0].active).toBe(false);
  });

  it('биржа не приняла стоп — повтор через 10 с на тике потока', async () => {
    const t = setup({ mark: 61_200 });
    await t.service.pinned();
    t.failPost(true);
    t.service.onEvent('u1', { topic: 'order.linear', data: [filled('t1', '61000')] }, t.ctx);
    await settle();
    expect(t.plans()[0]).toMatchObject({ target: 60_000, applied: false });

    t.failPost(false);
    t.service.onIdle('u1', t.ctx);
    await settle();
    expect(stops(t.posts)).toEqual([]); // ещё рано
    await jest.advanceTimersByTimeAsync(10_000);
    t.service.onIdle('u1', t.ctx);
    await settle();
    expect(stops(t.posts)[0]).toMatchObject({ stopLoss: '60000.0' });
    expect(t.plans()[0].applied).toBe(true);
  });

  it('все тейки сняты — план кончается: соединение держать больше незачем', async () => {
    const t = setup();
    await t.service.pinned();
    const cancel = (id: string) => ({ ...filled(id, '0'), orderStatus: 'Cancelled' });
    t.service.onEvent('u1', { topic: 'order.linear', data: [cancel('t1'), cancel('t2'), cancel('t3')] }, t.ctx);
    await settle();
    expect(t.plans()[0]).toMatchObject({ cancelled: ['t1', 't2', 't3'], active: false });
  });

  it('позиции больше нет — план кончается', async () => {
    const t = setup();
    await t.service.pinned();
    delete t.state.positions['BTCUSDT:1'];
    t.service.onEvent('u1', { topic: 'position.linear', data: [position({ size: '0', side: '' })] }, t.ctx);
    await settle();
    expect(t.plans()[0].active).toBe(false);
  });

  it('план заменён новой сеткой посреди шага — стоп по старому не ставится', async () => {
    const t = setup({ mark: 61_200 });
    await t.service.pinned();
    t.store.update.mockImplementationOnce(async () => false);
    t.service.onEvent('u1', { topic: 'order.linear', data: [filled('t1', '61000')] }, t.ctx);
    await settle();
    expect(stops(t.posts)).toEqual([]);
  });

  it('после обрыва: тейк пропал из открытых — история ордеров говорит, что исполнен, и стоп догоняет', async () => {
    const t = setup({ mark: 61_200, history: { t1: filled('t1', '61000') } });
    t.state.orders = { t2: { orderId: 't2' }, t3: { orderId: 't3' } };
    await t.service.pinned();
    t.service.onSnapshot('u1', t.ctx);
    await settle();
    expect(stops(t.posts)[0]).toMatchObject({ stopLoss: '60000.0' });
    expect(t.plans()[0].filled).toEqual(['t1']);
  });

  it('новый план, найденный тиком, сверяется сразу — тейк мог исполниться до того, как поток о нём узнал', async () => {
    const t = setup({ mark: 61_200, history: { t1: filled('t1', '61000') } });
    t.state.orders = { t2: { orderId: 't2' }, t3: { orderId: 't3' } };
    await t.service.pinned();
    t.service.onIdle('u1', t.ctx);
    await settle();
    expect(stops(t.posts)).toHaveLength(1);
  });

  it('повтор не ослабляет стоп, подтянутый руками, пока шаг ждал', async () => {
    const t = setup({ plans: [plan({ filled: ['t1'], fillPrices: [61_000], target: 60_000, applied: false })], mark: 61_200 });
    t.state.positions['BTCUSDT:1'].stopLoss = '60500';
    t.state.orders = { t2: { orderId: 't2' }, t3: { orderId: 't3' } };
    await t.service.pinned();
    t.service.onIdle('u1', t.ctx);
    await settle();
    expect(stops(t.posts)).toEqual([]);
    expect(t.plans()[0].applied).toBe(true);
  });

  it('состояния потока нет (переподключение) — это не «позиции нет», план живёт', async () => {
    const t = setup();
    await t.service.pinned();
    const empty: StreamContext = { creds: CREDS, state: () => null };
    t.service.onEvent('u1', { topic: 'position.linear', data: [position({ size: '0', side: '' })] }, empty);
    t.service.onEvent('u1', { topic: 'order.linear', data: [filled('t1', '61000')] }, empty);
    await settle();
    expect(t.plans()[0].active).toBe(true);
    expect(stops(t.posts)).toEqual([]);
  });

  it('перед закрытием по рынку снимаются оставшиеся тейки плана', async () => {
    const t = setup({ mark: 59_900 });
    await t.service.pinned();
    t.service.onEvent('u1', { topic: 'order.linear', data: [filled('t1', '61000')] }, t.ctx);
    await settle();
    expect(t.posts.filter((p) => p.path === '/order/cancel').map((p) => p.body.orderId)).toEqual(['t2', 't3']);
    expect(t.terminal.closePosition).toHaveBeenCalledTimes(1);
  });

  it('сверка: история ордеров — с символом; упала — повтор через 10 с', async () => {
    const t = setup({ mark: 61_200, history: { t1: filled('t1', '61000') } });
    t.state.orders = { t2: { orderId: 't2' }, t3: { orderId: 't3' } };
    t.bybit.privateGet.mockRejectedValueOnce(new Error('busy'));
    await t.service.pinned();
    t.service.onIdle('u1', t.ctx);
    await settle();
    expect(stops(t.posts)).toEqual([]);

    await jest.advanceTimersByTimeAsync(10_000);
    t.service.onIdle('u1', t.ctx);
    await settle();
    expect(t.bybit.privateGet).toHaveBeenLastCalledWith(CREDS, '/order/history', {
      category: 'linear',
      symbol: 'BTCUSDT',
      orderId: 't1',
    });
    expect(stops(t.posts)[0]).toMatchObject({ stopLoss: '60000.0' });
  });

  it('тейк пропал из открытых, а истории о нём ещё нет — спросим позже', async () => {
    const t = setup({ mark: 61_200, history: {} });
    t.state.orders = { t2: { orderId: 't2' }, t3: { orderId: 't3' } };
    await t.service.pinned();
    t.service.onIdle('u1', t.ctx);
    await settle();
    t.bybit.privateGet.mockClear();
    await jest.advanceTimersByTimeAsync(10_000);
    t.service.onIdle('u1', t.ctx);
    await settle();
    expect(t.bybit.privateGet).toHaveBeenCalledTimes(1);
  });

  it('безубыток — средний вход позиции сейчас: долитая после сетки позиция сменила цену', async () => {
    const t = setup({ mark: 61_200 });
    t.state.positions['BTCUSDT:1'].avgPrice = '60200';
    await t.service.pinned();
    t.service.onEvent('u1', { topic: 'order.linear', data: [filled('t1', '61000')] }, t.ctx);
    await settle();
    expect(stops(t.posts)[0]).toMatchObject({ stopLoss: '60200.0' });
  });
});

