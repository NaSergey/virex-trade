import type { EntryFollow, EntryFollowUpdate } from './entry-follow.store';
import { EntryFollowService } from './entry-follow.service';
import type { StreamContext } from './stop-follow.service';
import type { StreamState } from './stream-state';

const CREDS = { apiKey: 'k', apiSecret: 's' };

const follow = (extra: Partial<EntryFollow> = {}): EntryFollow => ({
  id: 'f1',
  userId: 'u1',
  symbol: 'BTCUSDT',
  direction: 'long',
  orderId: 'e1',
  price: 59_900,
  stopAfter: 59_800,
  fillPrice: null,
  active: true,
  ...extra,
});

const position = (extra: Record<string, unknown> = {}) => ({
  symbol: 'BTCUSDT',
  side: 'Buy',
  size: '0.1',
  avgPrice: '59900',
  positionIdx: 1,
  stopLoss: '59500',
  takeProfit: '62000',
  ...extra,
});

const order = (orderId: string, status: string, extra: Record<string, unknown> = {}) => ({
  orderId,
  symbol: 'BTCUSDT',
  side: 'Buy',
  orderType: 'Limit',
  orderStatus: status,
  avgPrice: '59900',
  updatedTime: '1000',
  ...extra,
});

function setup(
  o: { follows?: EntryFollow[]; state?: StreamState; mark?: number; history?: Record<string, unknown> } = {},
) {
  let rows = o.follows ?? [follow()];
  const updates: { id: string; data: EntryFollowUpdate }[] = [];
  const store = {
    activeUsers: jest.fn(async () => [...new Set(rows.filter((r) => r.active).map((r) => r.userId))]),
    activeOf: jest.fn(async (userId: string) => rows.filter((r) => r.userId === userId && r.active).map((r) => ({ ...r }))),
    update: jest.fn(async (id: string, data: EntryFollowUpdate) => {
      const r = rows.find((x) => x.id === id);
      if (!r) return false;
      Object.assign(r, data);
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
  const service = new EntryFollowService(store as any, bybit as any, market as any, terminal as any);
  return {
    service,
    store,
    posts,
    terminal,
    ctx,
    state,
    rows: () => rows,
    failPost: (v: boolean) => (failPost = v),
  };
}

const settle = () => jest.advanceTimersByTimeAsync(0);
const stops = (posts: { path: string; body: Record<string, unknown> }[]) =>
  posts.filter((p) => p.path === '/position/trading-stop').map((p) => p.body);
const ordersEvent = (...data: unknown[]) => ({ topic: 'order.linear', data });

describe('EntryFollowService', () => {
  beforeEach(() => jest.useFakeTimers({ now: 1_000_000 }));
  afterEach(() => jest.useRealTimers());

  it('без строк события не трогает и базу не читает', async () => {
    const t = setup({ follows: [] });
    await t.service.pinned();
    t.service.onEvent('u1', ordersEvent(order('e1', 'Filled')), t.ctx);
    await settle();
    expect(t.store.activeOf).not.toHaveBeenCalled();
  });

  it('держит соединение тем, у кого есть активная строка', async () => {
    const t = setup();
    expect(await t.service.pinned()).toEqual(['u1']);
  });

  it('лимит исполнился — стоп позиции на цель; тейк позиции передаётся прежний, индекс — самой позиции', async () => {
    const t = setup({ mark: 60_000 });
    await t.service.pinned();
    t.service.onEvent('u1', ordersEvent(order('e1', 'Filled')), t.ctx);
    await settle();
    expect(stops(t.posts)).toEqual([
      { category: 'linear', symbol: 'BTCUSDT', positionIdx: 1, tpslMode: 'Full', stopLoss: '59800.0', takeProfit: '62000.0' },
    ]);
    expect(t.rows()[0]).toMatchObject({ fillPrice: 59_900, active: false });
  });

  it('чужие ордера и ордера, которых нет в строках, игнорируются', async () => {
    const t = setup();
    await t.service.pinned();
    t.service.onEvent('u1', ordersEvent(order('other', 'Filled')), t.ctx);
    await settle();
    expect(t.posts).toHaveLength(0);
    expect(t.rows()[0]).toMatchObject({ fillPrice: null, active: true });
  });

  it('частично исполненный и ещё висящий лимит не двигает стоп', async () => {
    const t = setup();
    await t.service.pinned();
    t.service.onEvent('u1', ordersEvent(order('e1', 'PartiallyFilled')), t.ctx);
    await settle();
    expect(t.posts).toHaveLength(0);
    expect(t.rows()[0]).toMatchObject({ fillPrice: null, active: true });
  });

  it('снятый без исполнения лимит строку закрывает, стоп не трогает', async () => {
    const t = setup();
    await t.service.pinned();
    t.service.onEvent('u1', ordersEvent(order('e1', 'Cancelled')), t.ctx);
    await settle();
    expect(t.posts).toHaveLength(0);
    expect(t.rows()[0]).toMatchObject({ fillPrice: null, active: false });
  });

  it('снятый после частичного исполнения лимит уже открыл позицию — стоп едет', async () => {
    const t = setup({ mark: 60_000 });
    await t.service.pinned();
    t.service.onEvent('u1', ordersEvent(order('e1', 'Cancelled', { cumExecQty: '0.04', avgPrice: '59900' })), t.ctx);
    await settle();
    expect(stops(t.posts)).toHaveLength(1);
    expect(t.rows()[0]).toMatchObject({ fillPrice: 59_900, active: false });
  });

  it('цель не теснее нынешнего стопа — стоп не ослабляется и биржу не дёргает', async () => {
    const t = setup({
      state: { wallet: null, positions: { 'BTCUSDT:1': position({ stopLoss: '59850' }) }, orders: {} },
      mark: 60_000,
    });
    await t.service.pinned();
    t.service.onEvent('u1', ordersEvent(order('e1', 'Filled')), t.ctx);
    await settle();
    expect(t.posts).toHaveLength(0);
    expect(t.rows()[0]).toMatchObject({ active: false });
  });

  it('цель не по ту сторону от цены исполнения — стоп не двигается', async () => {
    // Лимит лонга исполнился ниже цели (скачок вниз): цель оказалась выше входа.
    const t = setup({ follows: [follow({ stopAfter: 59_800 })], mark: 60_000 });
    await t.service.pinned();
    t.service.onEvent('u1', ordersEvent(order('e1', 'Filled', { avgPrice: '59700' })), t.ctx);
    await settle();
    expect(t.posts).toHaveLength(0);
    expect(t.rows()[0]).toMatchObject({ fillPrice: 59_700, active: false });
  });

  it('цена уже за целью — позиция закрывается по рынку, стоп не ставится', async () => {
    const t = setup({ mark: 59_790 });
    await t.service.pinned();
    t.service.onEvent('u1', ordersEvent(order('e1', 'Filled')), t.ctx);
    await settle();
    expect(stops(t.posts)).toHaveLength(0);
    expect(t.terminal.closePosition).toHaveBeenCalledWith('u1', { symbol: 'BTCUSDT', direction: 'long', kind: 'market' });
    expect(t.rows()[0]).toMatchObject({ active: false });
  });

  it('шорт: цель выше входа, и подтягивается она вниз', async () => {
    const t = setup({
      follows: [follow({ direction: 'short', price: 60_100, stopAfter: 60_200 })],
      state: {
        wallet: null,
        positions: { 'BTCUSDT:2': position({ side: 'Sell', positionIdx: 2, avgPrice: '60100', stopLoss: '60500', takeProfit: '58000' }) },
        orders: {},
      },
      mark: 60_000,
    });
    await t.service.pinned();
    t.service.onEvent('u1', ordersEvent(order('e1', 'Filled', { avgPrice: '60100' })), t.ctx);
    await settle();
    expect(stops(t.posts)).toEqual([
      { category: 'linear', symbol: 'BTCUSDT', positionIdx: 2, tpslMode: 'Full', stopLoss: '60200.0', takeProfit: '58000.0' },
    ]);
  });

  describe('позиция ещё не видна', () => {
    const empty = (): StreamState => ({ wallet: null, positions: {}, orders: {} });

    it('исполнение пришло раньше позиции — цель ждёт и встаёт по событию позиции', async () => {
      const state = empty();
      const t = setup({ state, mark: 60_000 });
      await t.service.pinned();
      t.service.onEvent('u1', ordersEvent(order('e1', 'Filled')), t.ctx);
      await settle();
      expect(t.posts).toHaveLength(0);
      // Цена исполнения сохранена: следующий шаг не зависит от того, что пришло в событии.
      expect(t.rows()[0]).toMatchObject({ fillPrice: 59_900, active: true });

      state.positions['BTCUSDT:1'] = position();
      t.service.onEvent('u1', { topic: 'position.linear', data: [position()] }, t.ctx);
      await settle();
      expect(stops(t.posts)).toHaveLength(1);
      expect(t.rows()[0]).toMatchObject({ active: false });
    });

    it('позиции нет полминуты — закрылась сразу после входа, строка закрывается', async () => {
      const t = setup({ state: empty(), mark: 60_000 });
      await t.service.pinned();
      t.service.onEvent('u1', ordersEvent(order('e1', 'Filled')), t.ctx);
      await settle();
      await jest.advanceTimersByTimeAsync(31_000);
      t.service.onEvent('u1', { topic: 'position.linear', data: [] }, t.ctx);
      await settle();
      expect(t.posts).toHaveLength(0);
      expect(t.rows()[0]).toMatchObject({ active: false });
    });

    it('поток переподключается (состояния нет) — это не «позиции нет», шаг ждёт', async () => {
      const t = setup({ mark: 60_000 });
      const noState: StreamContext = { creds: CREDS, state: () => null };
      await t.service.pinned();
      t.service.onEvent('u1', ordersEvent(order('e1', 'Filled')), noState);
      await settle();
      expect(t.posts).toHaveLength(0);
      expect(t.rows()[0]).toMatchObject({ fillPrice: 59_900, active: true });

      t.service.onSnapshot('u1', t.ctx);
      await settle();
      expect(stops(t.posts)).toHaveLength(1);
    });
  });

  it('два лимита подряд: второй, более слабой целью, стоп первого не ослабляет, даже пока событие о нём в пути', async () => {
    const t = setup({
      follows: [follow({ id: 'f1', orderId: 'e1', stopAfter: 59_800 }), follow({ id: 'f2', orderId: 'e2', price: 59_700, stopAfter: 59_600 })],
      mark: 60_000,
    });
    await t.service.pinned();
    // Состояние потока ещё держит старый стоп 59 500 — событие о 59 800 не дошло.
    t.service.onEvent('u1', ordersEvent(order('e1', 'Filled')), t.ctx);
    t.service.onEvent('u1', ordersEvent(order('e2', 'Filled', { avgPrice: '59700' })), t.ctx);
    await settle();
    expect(stops(t.posts).map((b) => b.stopLoss)).toEqual(['59800.0']);
    expect(t.rows().map((r) => r.active)).toEqual([false, false]);
  });

  it('два лимита подряд: вторая цель теснее — стоп подтягивается ещё раз', async () => {
    const t = setup({
      follows: [follow({ id: 'f1', orderId: 'e1', stopAfter: 59_700 }), follow({ id: 'f2', orderId: 'e2', price: 59_900, stopAfter: 59_850 })],
      mark: 60_000,
    });
    await t.service.pinned();
    t.service.onEvent('u1', ordersEvent(order('e1', 'Filled')), t.ctx);
    t.service.onEvent('u1', ordersEvent(order('e2', 'Filled')), t.ctx);
    await settle();
    expect(stops(t.posts).map((b) => b.stopLoss)).toEqual(['59700.0', '59850.0']);
  });

  it('биржа не приняла стоп — строка остаётся, и сверка по тику повторяет шаг', async () => {
    const t = setup({ mark: 60_000 });
    t.failPost(true);
    await t.service.pinned();
    t.service.onEvent('u1', ordersEvent(order('e1', 'Filled')), t.ctx);
    await settle();
    expect(t.rows()[0]).toMatchObject({ fillPrice: 59_900, active: true });

    t.failPost(false);
    await jest.advanceTimersByTimeAsync(11_000);
    t.service.onIdle('u1', t.ctx);
    await settle();
    expect(stops(t.posts)).toHaveLength(1);
    expect(t.rows()[0]).toMatchObject({ active: false });
  });

  describe('сверка после обрыва', () => {
    it('лимит пропал из открытых, история говорит «исполнен» — цель встаёт', async () => {
      const t = setup({ history: { e1: order('e1', 'Filled') }, mark: 60_000 });
      await t.service.pinned();
      t.service.onSnapshot('u1', t.ctx);
      await settle();
      expect(stops(t.posts)).toHaveLength(1);
      expect(t.rows()[0]).toMatchObject({ fillPrice: 59_900, active: false });
    });

    it('лимит ещё висит среди открытых — сверка его не трогает', async () => {
      const state: StreamState = { wallet: null, positions: {}, orders: { e1: order('e1', 'New') } };
      const t = setup({ state });
      await t.service.pinned();
      t.service.onSnapshot('u1', t.ctx);
      await settle();
      expect(t.posts).toHaveLength(0);
      expect(t.rows()[0]).toMatchObject({ fillPrice: null, active: true });
    });

    it('история о пропавшем лимите молчит — строка не закрывается, спросим позже', async () => {
      const t = setup({ history: {} });
      await t.service.pinned();
      t.service.onSnapshot('u1', t.ctx);
      await settle();
      expect(t.posts).toHaveLength(0);
      expect(t.rows()[0]).toMatchObject({ fillPrice: null, active: true });
    });

    it('снятый за время обрыва лимит закрывает строку', async () => {
      const t = setup({ history: { e1: order('e1', 'Cancelled') } });
      await t.service.pinned();
      t.service.onSnapshot('u1', t.ctx);
      await settle();
      expect(t.posts).toHaveLength(0);
      expect(t.rows()[0]).toMatchObject({ active: false });
    });
  });
});
