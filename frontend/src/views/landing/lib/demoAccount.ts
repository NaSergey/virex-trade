import type {
  BacktestCloseOrder,
  BacktestEntryOrder,
  BacktestTrade,
  Direction,
  SessionDetail,
  TerminalActions,
} from '@/widgets/backtest-session';

/**
 * Демо-счёт терминала на главной: позиции и ордера живут в браузере гостя, на
 * сервер и на биржу не уходит ничего. Это те же правила, что у сессии бектеста
 * на сервере (`backend/src/backtest/backtest.service.ts`, `backtest-math.ts`), —
 * объём от риска и стопа, добор по стопу позиции, частичные закрытия, сетка
 * фиксации и стоп за тейками, — переписанные чистыми функциями над снимком
 * счёта. Терминалу снимок отдаётся в форме сессии (`toDetail`), и экран не
 * отличает его от настоящей.
 *
 * Своего исполнения у терминала в эфире нет (его делает серверный движок),
 * поэтому стопы, тейки и лимиты демо-счёта исполняет `tick` — по цене, которую
 * ему приносит опрос рынка.
 */

/** Одиночные действия терминала — без набора грид-бота (`bot`) и признаков исполнителя. */
type VarsOf<K extends Exclude<keyof TerminalActions, 'bot' | 'gridStopAfter'>> = Parameters<TerminalActions[K]['mutateAsync']>[0];
export type OpenVars = VarsOf<'open'>;
export type AddVars = VarsOf<'addToTrade'>;
export type ModifyVars = VarsOf<'modify'>;
export type CloseVars = VarsOf<'close'>;
export type CloseOrderVars = VarsOf<'createCloseOrder'>;
export type EntryOrdersVars = VarsOf<'createEntryOrders'>;
export type MoveVars = VarsOf<'moveEntryOrder'>;
export type CloseGridVars = VarsOf<'closeGrid'>;
type ExitReason = NonNullable<BacktestTrade['exitReason']>;

/** Депозит нового демо-счёта. */
export const DEMO_BALANCE = 10_000;
/** Та же ставка комиссии, что на сервере (`FEE_RATE` в backtest-math.ts). */
const FEE_RATE = 0.00055;
/** Допуск на погрешность сложения долей — `QTY_EPS` сервера. */
const QTY_EPS = 1e-8;
const DEFAULT_SYMBOL = 'BTCUSDT';
const SESSION_ID = 'landing-demo';

/** Отказ демо-счёта — код, а текст подставляет вызывающий на языке страницы. */
export type DemoErrorCode = 'noBalance' | 'stopSide' | 'takeSide' | 'margin' | 'qty' | 'gone';
export class DemoError extends Error {
  constructor(readonly code: DemoErrorCode) {
    super(code);
  }
}

interface DemoExit {
  qty: number;
  price: number;
  time: string;
  reason: ExitReason;
  fee: number;
  pnl: number;
}

type DemoCloseOrder = BacktestCloseOrder & { stopAfter: number | null };

export interface DemoState {
  v: 1;
  createdAt: string;
  balance: number;
  /** Счётчик id: у демо-счёта нет базы, которая их выдала бы. */
  seq: number;
  trades: BacktestTrade[];
  /** Выходы по сделке — из них складываются её итоговые комиссия и результат. */
  exits: Record<string, DemoExit[]>;
  closeOrders: DemoCloseOrder[];
  entryOrders: BacktestEntryOrder[];
}

export function emptyDemo(now: number): DemoState {
  return {
    v: 1,
    createdAt: new Date(now).toISOString(),
    balance: DEMO_BALANCE,
    seq: 0,
    trades: [],
    exits: {},
    closeOrders: [],
    entryOrders: [],
  };
}

const iso = (ms: number) => new Date(ms).toISOString();
const nextId = (s: DemoState): [string, DemoState] => [`demo-${s.seq + 1}`, { ...s, seq: s.seq + 1 }];
const stopOnRightSide = (d: Direction, entry: number, stop: number) => (d === 'long' ? stop < entry : stop > entry);
const takeOnRightSide = (d: Direction, entry: number, take: number) => (d === 'long' ? take > entry : take < entry);
const remainingOf = (t: BacktestTrade) => t.qty - t.closedQty;

function openOf(s: DemoState, tradeId: string): BacktestTrade {
  const trade = s.trades.find((x) => x.id === tradeId);
  if (!trade || trade.exitTime != null) throw new DemoError('gone');
  return trade;
}

const replaceTrade = (s: DemoState, trade: BacktestTrade): DemoState => ({
  ...s,
  trades: s.trades.map((x) => (x.id === trade.id ? trade : x)),
});

function checkSides(direction: Direction, entry: number, stop: number, take: number | null | undefined) {
  if (!stopOnRightSide(direction, entry, stop)) throw new DemoError('stopSide');
  if (take != null && !takeOnRightSide(direction, entry, take)) throw new DemoError('takeSide');
}

/**
 * Вход: рынок или сработавший лимит. Позиция на монету и сторону одна — вход в
 * сторону, где она уже открыта, её доливает (`openChecked` сервера).
 */
export function openTrade(s0: DemoState, v: OpenVars): DemoState {
  checkSides(v.direction, v.entryPrice, v.stopLoss, v.takeProfit);
  const s = v.entryOrderId ? { ...s0, entryOrders: s0.entryOrders.filter((o) => o.id !== v.entryOrderId) } : s0;
  const symbol = v.symbol ?? DEFAULT_SYMBOL;
  const open = s.trades.find((x) => x.exitTime == null && x.symbol === symbol && x.direction === v.direction);
  if (open) return addInto(s, open, v);
  if (s.balance <= 0) throw new DemoError('noBalance');
  const riskUsdt = (s.balance * v.riskPct) / 100;
  const qty = riskUsdt / Math.abs(v.entryPrice - v.stopLoss);
  if ((qty * v.entryPrice) / v.leverage > s.balance) throw new DemoError('margin');
  const [id, s1] = nextId(s);
  const trade: BacktestTrade = {
    id,
    sessionId: SESSION_ID,
    symbol,
    direction: v.direction,
    entryTime: v.entryTime,
    entryPrice: v.entryPrice,
    stopLoss: v.stopLoss,
    takeProfit: v.takeProfit ?? null,
    riskPct: v.riskPct,
    riskUsdt,
    qty,
    leverage: v.leverage,
    closedQty: 0,
    stopFollow: false,
    exitTime: null,
    exitPrice: null,
    exitReason: null,
    fee: null,
    pnl: null,
    r: null,
    tags: [],
    entries: [{ id: `${id}-e1`, qty, price: v.entryPrice, time: v.entryTime }],
  };
  return { ...s1, trades: [...s1.trades, trade] };
}

/** Добор по id позиции — «Лонг/Шорт» по занятой стороне. */
export function addToTrade(s: DemoState, v: AddVars): DemoState {
  return addInto(s, openOf(s, v.tradeId), v);
}

/**
 * Объём добора — от риска входа и стопа позиции: уровни у позиции одни. Средняя и
 * маржа — от остатка (`qty − closedQty`), как у сервера (`addCore`): `qty` —
 * всё, что вошло в позицию, и проданный объём не должен тянуть среднюю.
 */
function addInto(s: DemoState, trade: BacktestTrade, v: { entryTime: string; entryPrice: number; riskPct: number }): DemoState {
  if (s.balance <= 0) throw new DemoError('noBalance');
  const addRisk = (s.balance * v.riskPct) / 100;
  const addQty = addRisk / Math.abs(v.entryPrice - trade.stopLoss);
  const remaining = trade.qty - trade.closedQty;
  const qty = trade.qty + addQty;
  const entryPrice = (remaining * trade.entryPrice + addQty * v.entryPrice) / (remaining + addQty);
  checkSides(trade.direction, entryPrice, trade.stopLoss, trade.takeProfit);
  if (((remaining + addQty) * entryPrice) / trade.leverage > s.balance) throw new DemoError('margin');
  const riskUsdt = trade.riskUsdt + addRisk;
  return replaceTrade(s, {
    ...trade,
    qty,
    entryPrice,
    riskUsdt,
    riskPct: (riskUsdt / s.balance) * 100,
    entries: [...trade.entries, { id: `${trade.id}-e${trade.entries.length + 1}`, qty: addQty, price: v.entryPrice, time: v.entryTime }],
  });
}

/** Стоп и тейк позиции. Сторону от текущей цены проверил экран — сервер её тоже не знает. */
export function modifyTrade(s: DemoState, v: ModifyVars): DemoState {
  const trade = openOf(s, v.tradeId);
  return replaceTrade(s, {
    ...trade,
    stopLoss: v.stopLoss ?? trade.stopLoss,
    takeProfit: v.takeProfit === undefined ? trade.takeProfit : v.takeProfit,
  });
}

/** Закрытие целиком или частью — `applyClose` сервера. */
export function closeTrade(s: DemoState, v: CloseVars): DemoState {
  const trade = openOf(s, v.tradeId);
  const remaining = remainingOf(trade);
  const qty = v.qty ?? remaining;
  if (qty > remaining + QTY_EPS) throw new DemoError('qty');

  const sign = trade.direction === 'long' ? 1 : -1;
  const fee = (trade.entryPrice + v.exitPrice) * qty * FEE_RATE;
  const pnl = sign * (v.exitPrice - trade.entryPrice) * qty - fee;
  const exits = [...(s.exits[trade.id] ?? []), { qty, price: v.exitPrice, time: v.exitTime, reason: v.reason, fee, pnl }];
  const order = v.closeOrderId ? s.closeOrders.find((o) => o.id === v.closeOrderId) : undefined;
  const closedQty = trade.closedQty + qty;
  const full = closedQty >= trade.qty - QTY_EPS;

  let next: BacktestTrade = { ...trade, closedQty };
  if (full) {
    const total = exits.reduce((acc, e) => ({ fee: acc.fee + e.fee, pnl: acc.pnl + e.pnl }), { fee: 0, pnl: 0 });
    next = {
      ...next,
      exitTime: v.exitTime,
      exitPrice: v.exitPrice,
      exitReason: v.reason,
      fee: total.fee,
      pnl: total.pnl,
      r: total.pnl / trade.riskUsdt,
    };
  } else if (v.reason === 'limit') {
    next = followStop(next, exits, v.exitPrice, order?.stopAfter ?? null);
  }

  return {
    ...replaceTrade(s, next),
    balance: s.balance + pnl,
    exits: { ...s.exits, [trade.id]: exits },
    // Лимиты закрытия уходят вместе с позицией; ордера на вход остаются (как на бирже).
    closeOrders: s.closeOrders.filter((o) => o.id !== v.closeOrderId && !(full && o.tradeId === trade.id)),
  };
}

/**
 * Стоп за тейками (`followStop` сервера): после первого исполненного лимита —
 * в безубыток, после следующего — на цену предыдущего; своя цель уровня сетки
 * важнее правила. Только подтягивается и только по свою сторону от цены
 * исполнения.
 */
function followStop(trade: BacktestTrade, exits: DemoExit[], fillPrice: number, explicit: number | null): BacktestTrade {
  if (!trade.stopFollow) return trade;
  const limits = exits.filter((e) => e.reason === 'limit');
  const target = explicit ?? (limits.length >= 2 ? limits[limits.length - 2].price : trade.entryPrice);
  if (!stopOnRightSide(trade.direction, fillPrice, target)) return trade;
  const tighter = trade.direction === 'long' ? target > trade.stopLoss : target < trade.stopLoss;
  return tighter ? { ...trade, stopLoss: target } : trade;
}

export function createCloseOrder(s: DemoState, v: CloseOrderVars, now: number): DemoState {
  const trade = openOf(s, v.tradeId);
  if (v.qty > remainingOf(trade) + QTY_EPS) throw new DemoError('qty');
  const [id, s1] = nextId(s);
  return { ...s1, closeOrders: [...s1.closeOrders, { id, tradeId: trade.id, price: v.price, qty: v.qty, createdAt: iso(now), stopAfter: null }] };
}

export const cancelCloseOrder = (s: DemoState, id: string): DemoState => ({
  ...s,
  closeOrders: s.closeOrders.filter((o) => o.id !== id),
});

export const moveCloseOrder = (s: DemoState, v: MoveVars): DemoState => ({
  ...s,
  closeOrders: s.closeOrders.map((o) => (o.id === v.orderId ? { ...o, price: v.price } : o)),
});

/** Лимиты на вход — сколько угодно, открытая позиция им не мешает. */
export function createEntryOrders(s0: DemoState, v: EntryOrdersVars, now: number): DemoState {
  for (const price of v.prices) checkSides(v.direction, price, v.stopLoss, v.takeProfit);
  let s = s0;
  const orders: BacktestEntryOrder[] = [];
  for (const [i, price] of v.prices.entries()) {
    const [id, s1] = nextId(s);
    s = s1;
    orders.push({
      id,
      sessionId: SESSION_ID,
      symbol: v.symbol ?? DEFAULT_SYMBOL,
      direction: v.direction,
      price,
      // Риск уровня из таблицы «Сетки», если она его задала.
      riskPct: v.riskPcts?.[i] ?? v.riskPct,
      stopLoss: v.stopLoss,
      takeProfit: v.takeProfit ?? null,
      leverage: v.leverage,
      createdAt: iso(now),
    });
  }
  return { ...s, entryOrders: [...s.entryOrders, ...orders] };
}

export const cancelEntryOrder = (s: DemoState, id: string): DemoState => ({
  ...s,
  entryOrders: s.entryOrders.filter((o) => o.id !== id),
});

/** Перенос лимита на вход — снять и выставить заново с новым id, как на сервере. */
export function moveEntryOrder(s: DemoState, v: MoveVars, now: number): DemoState {
  const order = s.entryOrders.find((o) => o.id === v.orderId);
  if (!order) throw new DemoError('gone');
  checkSides(order.direction, v.price, order.stopLoss, order.takeProfit);
  const [id, s1] = nextId(s);
  return {
    ...s1,
    entryOrders: [...s1.entryOrders.filter((o) => o.id !== v.orderId), { ...order, id, price: v.price, createdAt: iso(now) }],
  };
}

/** Сетка фиксации заменяет прежние лимиты закрытия позиции и ставит флажок переноса стопа. */
export function closeGrid(s0: DemoState, v: CloseGridVars, now: number): DemoState {
  const trade = openOf(s0, v.tradeId);
  const total = v.qtys.reduce((a, b) => a + b, 0);
  if (total > remainingOf(trade) + QTY_EPS) throw new DemoError('qty');
  let s: DemoState = { ...s0, closeOrders: s0.closeOrders.filter((o) => o.tradeId !== trade.id) };
  for (const [i, price] of v.prices.entries()) {
    const [id, s1] = nextId(s);
    s = {
      ...s1,
      closeOrders: [
        ...s1.closeOrders,
        { id, tradeId: trade.id, price, qty: v.qtys[i], createdAt: iso(now), stopAfter: v.stops?.[i] || null },
      ],
    };
  }
  return replaceTrade(s, { ...trade, stopFollow: v.stopFollow });
}

/**
 * Исполнение по цене опроса рынка: стопы, тейки, лимиты закрытия и лимиты на
 * вход монеты, которых эта цена достала. Проверяется сама цена, а не путь до
 * неё: путь между опросами неизвестен, и проверка по отрезку «прошлая цена →
 * эта» ловила бы стоп по цене, бывшей до входа или до переноса стопа. Цена
 * исполнения — уровень, а у стопа — сама цена: проскочив стоп, хуже его.
 */
export function tick(s0: DemoState, symbol: string, price: number, now: number): DemoState {
  let s = s0;
  const time = iso(now);

  for (const t0 of s0.trades) {
    if (t0.symbol !== symbol || t0.exitTime != null) continue;
    const long = t0.direction === 'long';
    // В сторону прибыли: у лонга лимиты закрытия — продажа, они исполняются ценой не ниже своей.
    const reached = (level: number) => (long ? price >= level : price <= level);

    if (t0.stopLoss > 0 && (long ? price <= t0.stopLoss : price >= t0.stopLoss)) {
      s = closeTrade(s, { tradeId: t0.id, exitTime: time, exitPrice: price, reason: 'stop' });
      continue;
    }
    // Лимиты — по порядку, в каком их достала бы цена: перенос стопа идёт от первого.
    const orders = s.closeOrders
      .filter((o) => o.tradeId === t0.id && reached(o.price))
      .sort((a, b) => (long ? a.price - b.price : b.price - a.price));
    for (const o of orders) {
      const cur = s.trades.find((x) => x.id === t0.id)!;
      if (cur.exitTime != null) break;
      const qty = Math.min(o.qty, remainingOf(cur));
      s = closeTrade(s, { tradeId: cur.id, exitTime: time, exitPrice: o.price, reason: 'limit', qty, closeOrderId: o.id });
    }
    const cur = s.trades.find((x) => x.id === t0.id)!;
    if (cur.exitTime == null && cur.takeProfit != null && reached(cur.takeProfit)) {
      s = closeTrade(s, { tradeId: cur.id, exitTime: time, exitPrice: cur.takeProfit, reason: 'take' });
    }
  }

  // Лимит на покупку стоит ниже цены, на продажу — выше.
  const hit = s.entryOrders.filter((o) => o.symbol === symbol && (o.direction === 'long' ? price <= o.price : price >= o.price));
  for (const o of hit) {
    try {
      s = openTrade(s, {
        symbol: o.symbol,
        direction: o.direction,
        entryTime: time,
        entryPrice: o.price,
        stopLoss: o.stopLoss,
        takeProfit: o.takeProfit ?? undefined,
        riskPct: o.riskPct,
        leverage: o.leverage,
        entryOrderId: o.id,
      });
    } catch (e) {
      // Неисполнимый ордер (маржа, депозит, сторона стопа) снимается — как отклонила бы биржа.
      if (!(e instanceof DemoError)) throw e;
      s = cancelEntryOrder(s, o.id);
    }
  }
  return s;
}

/** Монеты, по которым счёту нужна цена: открытые позиции и висящие лимиты на вход. */
export function watchedSymbols(s: DemoState): string[] {
  const set = new Set<string>();
  for (const t of s.trades) if (t.exitTime == null) set.add(t.symbol);
  for (const o of s.entryOrders) set.add(o.symbol);
  return [...set].sort();
}

/** Снимок счёта в форме сессии эфира — её терминал и показывает. */
export function toDetail(s: DemoState): SessionDetail {
  const closed = s.trades.filter((t) => t.exitTime != null);
  const wins = closed.filter((t) => (t.pnl ?? 0) > 0).length;
  const totalR = closed.reduce((a, t) => a + (t.r ?? 0), 0);
  const pnl = closed.reduce((a, t) => a + (t.pnl ?? 0), 0);
  let balance = DEMO_BALANCE;
  let peak = DEMO_BALANCE;
  let dd = 0;
  for (const t of [...closed].sort((a, b) => Date.parse(a.exitTime!) - Date.parse(b.exitTime!))) {
    balance += t.pnl ?? 0;
    peak = Math.max(peak, balance);
    dd = Math.max(dd, ((peak - balance) / peak) * 100);
  }
  return {
    session: {
      id: SESSION_ID,
      startTime: s.createdAt,
      cursorTime: s.createdAt,
      startBalance: DEMO_BALANCE,
      balance: s.balance,
      hideDate: false,
      hidePrice: false,
      priceScale: 1,
      dataSource: 'live',
      status: 'active',
      createdAt: s.createdAt,
      finishedAt: null,
      tournamentId: null,
      endTime: null,
    },
    tournament: null,
    synthOutdated: false,
    trades: s.trades,
    closeOrders: s.closeOrders,
    entryOrders: s.entryOrders,
    summary: {
      trades: closed.length,
      wins,
      winRate: closed.length ? (wins / closed.length) * 100 : 0,
      totalR,
      avgR: closed.length ? totalR / closed.length : 0,
      pnl,
      maxDrawdownPct: dd,
    },
  };
}

const STORAGE_KEY = 'virex.landing.demo';

/** Сохранённый счёт этого браузера; битый или чужой версии — как не было. */
export function loadDemo(storage: Pick<Storage, 'getItem'>): DemoState | null {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as DemoState;
    const ok =
      s?.v === 1 &&
      typeof s.balance === 'number' &&
      Array.isArray(s.trades) &&
      Array.isArray(s.closeOrders) &&
      Array.isArray(s.entryOrders) &&
      typeof s.exits === 'object';
    return ok ? s : null;
  } catch {
    return null;
  }
}

export function saveDemo(storage: Pick<Storage, 'setItem'>, s: DemoState): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // Хранилище закрыто (приватное окно) — счёт живёт до перезагрузки страницы.
  }
}
