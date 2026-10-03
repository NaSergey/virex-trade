import {
  applyEvent,
  balanceOf,
  fromSnapshot,
  keyHash,
  project,
  usable,
  walletOf,
  type StreamState,
} from './stream-state';

/** Строки — как их отдаёт Bybit: числа строками, позиция события с `entryPrice`. */
const restPos = (extra: Record<string, unknown> = {}) => ({
  symbol: 'BTCUSDT',
  side: 'Buy',
  size: '0.1',
  avgPrice: '60000',
  positionIdx: 0,
  markPrice: '60500',
  unrealisedPnl: '50',
  leverage: '10',
  stopLoss: '59000',
  takeProfit: '',
  updatedTime: '1000',
  ...extra,
});
const wsPos = (extra: Record<string, unknown> = {}) => {
  const { avgPrice, ...rest } = restPos(extra);
  return { ...rest, entryPrice: avgPrice };
};
const order = (extra: Record<string, unknown> = {}) => ({
  orderId: 'o1',
  symbol: 'BTCUSDT',
  side: 'Buy',
  orderType: 'Limit',
  price: '59000',
  qty: '0.1',
  leavesQty: '0.1',
  orderStatus: 'New',
  reduceOnly: false,
  stopOrderType: '',
  updatedTime: '1000',
  ...extra,
});
const account = (usdt: Record<string, string>) => ({
  accountType: 'UNIFIED',
  totalAvailableBalance: '900',
  coin: [{ coin: 'USDT', ...usdt }],
});
const snap = (extra: Partial<{ account: unknown; positions: unknown[]; orders: unknown[] }> = {}) =>
  fromSnapshot({
    account: account({ walletBalance: '1000', unrealisedPnl: '50', equity: '1050' }),
    positions: [restPos()],
    orders: [order()],
    ...extra,
  });

describe('walletOf / balanceOf', () => {
  it('берёт USDT и доступное аккаунта', () => {
    expect(walletOf(account({ walletBalance: '1417.60', unrealisedPnl: '-914.69', equity: '502.91' }))).toEqual({
      walletBalance: 1417.6,
      equity: 502.91,
      unrealisedPnl: -914.69,
      available: 900,
    });
  });

  it('депозит — equity, а без неё — кошелёк плюс открытый результат', () => {
    expect(balanceOf(walletOf(account({ walletBalance: '1417.60', unrealisedPnl: '-914.69' })))).toEqual({
      balance: expect.closeTo(502.91, 10),
      available: 900,
    });
  });

  it('нет аккаунта — ноль и неизвестное доступное', () => {
    expect(walletOf(undefined)).toBeNull();
    expect(balanceOf(null)).toEqual({ balance: 0, available: null });
  });
});

describe('fromSnapshot', () => {
  it('пустые строки позиций, чужие монеты и неактивные ордера в состояние не входят', () => {
    const state = snap({
      positions: [restPos(), restPos({ size: '0', side: '', positionIdx: 1 }), restPos({ symbol: 'BTCPERP' })],
      orders: [order(), order({ orderId: 'o2', orderStatus: 'Untriggered' }), order({ orderId: 'o3', symbol: 'ETHPERP' })],
    });
    expect(Object.keys(state.positions)).toEqual(['BTCUSDT:0']);
    expect(Object.keys(state.orders)).toEqual(['o1']);
  });
});

describe('applyEvent', () => {
  it('позиция события приводится к виду REST: entryPrice становится avgPrice', () => {
    const state = snap({ positions: [] });
    expect(applyEvent(state, { topic: 'position.linear', data: [wsPos({ updatedTime: '2000' })] })).toBe(true);
    expect(state.positions['BTCUSDT:0'].avgPrice).toBe('60000');
  });

  it('позиция с нулевым размером удаляется', () => {
    const state = snap();
    applyEvent(state, { topic: 'position.linear', data: [wsPos({ size: '0', side: '', updatedTime: '2000' })] });
    expect(state.positions).toEqual({});
  });

  it('событие старше строки снимка не перетирает её', () => {
    const state = snap({ positions: [restPos({ size: '0.2', updatedTime: '3000' })] });
    applyEvent(state, { topic: 'position.linear', data: [wsPos({ size: '0.1', updatedTime: '2000' })] });
    expect(state.positions['BTCUSDT:0'].size).toBe('0.2');
  });

  it('хедж: две стороны одной монеты — две строки', () => {
    const state = snap({ positions: [] });
    applyEvent(state, {
      topic: 'position.linear',
      data: [wsPos({ positionIdx: 1 }), wsPos({ positionIdx: 2, side: 'Sell' })],
    });
    expect(Object.keys(state.positions).sort()).toEqual(['BTCUSDT:1', 'BTCUSDT:2']);
  });

  it('ордер: New добавляет, Filled удаляет, повторный Filled ничего не ломает', () => {
    const state = snap({ orders: [] });
    applyEvent(state, { topic: 'order.linear', data: [order({ orderId: 'o9', updatedTime: '2000' })] });
    expect(Object.keys(state.orders)).toEqual(['o9']);
    applyEvent(state, { topic: 'order.linear', data: [order({ orderId: 'o9', orderStatus: 'Filled', updatedTime: '2100' })] });
    applyEvent(state, { topic: 'order.linear', data: [order({ orderId: 'o9', orderStatus: 'Filled', updatedTime: '2100' })] });
    expect(state.orders).toEqual({});
  });

  it('кошелёк события заменяет кошелёк', () => {
    const state = snap();
    applyEvent(state, { topic: 'wallet', data: [account({ walletBalance: '1200', unrealisedPnl: '0', equity: '1200' })] });
    expect(state.wallet?.walletBalance).toBe(1200);
  });

  it('событие кошелька без USDT кошелёк не трогает', () => {
    const state = snap();
    const other = { accountType: 'UNIFIED', totalAvailableBalance: '5', coin: [{ coin: 'BTC', walletBalance: '1' }] };
    expect(applyEvent(state, { topic: 'wallet', data: [other] })).toBe(false);
    expect(state.wallet?.walletBalance).toBe(1000);
  });

  it('незнакомая тема и мусор — без изменений', () => {
    const state = snap();
    expect(applyEvent(state, { topic: 'execution', data: [{}] })).toBe(false);
    expect(applyEvent(state, { topic: 'wallet', data: 'x' })).toBe(false);
  });
});

describe('project', () => {
  const marks = new Map([['BTCUSDT', 61_000]]);

  it('PnL позиции и депозит — от маркировки, а не от последнего события', () => {
    const out = project(snap(), marks);
    // лонг 0.1 от 60 000 при маркировке 61 000 — +100; кошелёк 1000 → депозит 1100.
    expect(out.positions[0]).toMatchObject({ markPrice: 61_000, unrealisedPnl: 100 });
    expect(out.balance).toBeCloseTo(1100, 10);
    expect(out.available).toBe(900);
  });

  it('депозит — equity биржи, сдвинутая на изменение PnL, а не своя сумма кошелька и PnL', () => {
    // equity 1040 — на 10 меньше «кошелёк + PnL»: комиссии и фандинг биржа учла, мы — нет.
    const state = snap({ account: account({ walletBalance: '1000', unrealisedPnl: '50', equity: '1040' }) });
    // PnL позиции по маркировке 61 000 — 100 вместо 50 на момент кошелька: депозит 1040 + 50.
    expect(project(state, marks).balance).toBeCloseTo(1090, 10);
    // без маркировки сдвига нет — ровно equity биржи
    expect(project(state, new Map()).balance).toBeCloseTo(1040, 10);
  });

  it('шорт зарабатывает на падении', () => {
    const state = snap({ positions: [restPos({ side: 'Sell' })] });
    expect(project(state, new Map([['BTCUSDT', 59_000]])).positions[0].unrealisedPnl).toBeCloseTo(100, 10);
  });

  it('маркировки монеты нет — PnL из последнего события', () => {
    const out = project(snap(), new Map());
    expect(out.positions[0].unrealisedPnl).toBe(50);
    expect(out.balance).toBeCloseTo(1050, 10);
  });

  it('ордера — через тот же toOrder, что у REST', () => {
    expect(project(snap(), marks).orders).toEqual([expect.objectContaining({ id: 'o1', kind: 'entry', price: 59_000 })]);
  });

  it('без кошелька депозит ноль', () => {
    const state: StreamState = { wallet: null, positions: {}, orders: {} };
    expect(project(state, marks)).toMatchObject({ balance: 0, available: null, positions: [], orders: [] });
  });
});

describe('usable', () => {
  const NOW = 1_000_000;
  const row = (extra: Partial<{ keyHash: string; liveAt: Date; eventAt: Date; state: unknown }> = {}) => ({
    keyHash: keyHash('k'),
    state: { wallet: null, positions: {}, orders: {} },
    liveAt: new Date(NOW - 5_000),
    eventAt: new Date(NOW - 20_000),
    ...extra,
  });

  it('живая строка своего ключа годится', () => {
    expect(usable(row(), keyHash('k'), null, NOW)).toBe(true);
  });

  it('нет строки, нет состояния, чужой ключ или пульс старше 30 с — нет', () => {
    expect(usable(null, keyHash('k'), null, NOW)).toBe(false);
    expect(usable(row({ state: null }), keyHash('k'), null, NOW)).toBe(false);
    expect(usable(row(), keyHash('other'), null, NOW)).toBe(false);
    expect(usable(row({ liveAt: new Date(NOW - 31_000) }), keyHash('k'), null, NOW)).toBe(false);
  });

  it('своя запись, которую поток ещё не увидел, — нет; через 3 с или после события — да', () => {
    expect(usable(row(), keyHash('k'), NOW - 1_000, NOW)).toBe(false);
    expect(usable(row(), keyHash('k'), NOW - 3_500, NOW)).toBe(true);
    expect(usable(row({ eventAt: new Date(NOW - 500) }), keyHash('k'), NOW - 1_000, NOW)).toBe(true);
  });

  it('отпечаток ключа — 16 знаков и не сам ключ', () => {
    expect(keyHash('abc')).toMatch(/^[0-9a-f]{16}$/);
    expect(keyHash('abc')).toBe(keyHash('abc'));
  });
});
