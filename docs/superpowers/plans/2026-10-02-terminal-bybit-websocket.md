# Терминал: счёт из приватного WebSocket Bybit — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** экран терминала берёт счёт из состояния, которое `worker` держит по приватному WebSocket Bybit, а не тремя REST-запросами на каждый опрос.

**Architecture:**
- `worker` на каждого пользователя с открытым терминалом держит сокет (`BybitPrivateSocket`), собирает состояние (REST-снимок плюс события, `stream-state.ts`) и пишет его в `terminal_streams`.
- `api` отмечает в той же таблице спрос и читает оттуда счёт, пересчитывая PnL по общей маркировке.
- Нет годной строки — нынешний REST-путь без изменений.

**Tech Stack:** NestJS, Prisma/PostgreSQL, `ws` 8, Jest.

Спека: `docs/superpowers/specs/2026-10-02-terminal-bybit-websocket-design.md`.

## Global Constraints

- Адрес — `wss://stream.bybit.com/v5/private`. Подпись входа — HMAC-SHA256 секрета по строке `GET/realtime` + `expires` (мс). Пинг — раз в 20 с. Темы — `position.linear`, `order.linear`, `wallet`.
- Спрос: `api` пишет `wantedAt` не чаще раза в 20 с на пользователя в процессе. `worker` держит соединения тех, у кого `wantedAt` за последние 60 с.
- Пульс `liveAt` — раз в 10 с; строка годна, пока `liveAt` не старше 30 с.
- Своя запись `api` моложе 3 с и позже `eventAt` — REST-путь.
- Сброс состояния в базу — не чаще раза в 150 мс на пользователя.
- Переподключение — пауза 1, 2, 4… до 60 с; отказ входа — 5 минут.
- Ограничитель — 450 соединений за 5 минут на процесс.
- Повторный снимок — раз в 10 минут ±25 %.
- Маркировка — один `GET /market/tickers?category=linear`, кэш 2 с, после сбоя — прошлый ответ не старше 30 с.
- В счёт идут только символы на `USDT`.
- Фронтенд не меняется. Ответ `GET /api/terminal/state` — тот же `TerminalState`.
- Код не коммитить: в тех же файлах лежит незакоммиченная работа 2026-10-02. Коммит — по решению владельца.

## Риски (гибрид)

- Task 1–3 — **A** (счёт с настоящими деньгами на экране, соединения, конкурентность снимка и событий). Контрольная точка — после Task 3.
- Task 4–5 — **A/B** (выбор пути чтения, рефактор работающего REST-пути, схема БД). Контрольная точка — после Task 5, в неё же стык с фронтом (форма ответа).
- Task 6 — **C** (подключение, зависимость, документация), идёт во вторую точку.

---

### Task 1: Состояние счёта — чистые функции

**Files:**
- Create: `backend/src/terminal/stream/stream-state.ts`
- Create: `backend/src/terminal/stream/stream-state.spec.ts`

**Interfaces:**
- Produces:
  - `interface StreamWallet { walletBalance: number; equity: number | null; unrealisedPnl: number; available: number | null }`
  - `interface StreamState { wallet: StreamWallet | null; positions: Record<string, any>; orders: Record<string, any> }`
  - `interface AccountSnapshot { account: any; positions: any[]; orders: any[] }`
  - `walletOf(account: any): StreamWallet | null`
  - `balanceOf(w: StreamWallet | null): { balance: number; available: number | null }`
  - `fromSnapshot(s: AccountSnapshot): StreamState`
  - `applyEvent(state: StreamState, msg: { topic?: unknown; data?: unknown }): boolean`
  - `project(state: StreamState, marks: ReadonlyMap<string, number>): { balance: number; available: number | null; positions: TerminalPosition[]; orders: TerminalOrder[] }`
  - `keyHash(apiKey: string): string`
  - `interface StoredStream { keyHash: string | null; state: unknown; liveAt: Date | null; eventAt: Date | null }`
  - `usable(row: StoredStream | null, hash: string, lastWriteAt: number | null, now: number): boolean`
  - константы `LIVE_FRESH_MS = 30_000`, `OWN_WRITE_MS = 3_000`

- [ ] **Step 1: Тесты**

`backend/src/terminal/stream/stream-state.spec.ts`:

```ts
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
```

- [ ] **Step 2: Прогнать — падает**

Run: `npx jest src/terminal/stream/stream-state.spec.ts`
Expected: FAIL — `Cannot find module './stream-state'`.

- [ ] **Step 3: Реализация**

`backend/src/terminal/stream/stream-state.ts`:

```ts
import { createHash } from 'crypto';
import { toOrder, toPosition, type TerminalOrder, type TerminalPosition } from '../terminal-math';

/**
 * Состояние счёта терминала, собранное из приватного WebSocket Bybit
 * (спека `2026-10-02-terminal-bybit-websocket-design.md`).
 *
 * Хранятся сырые строки биржи, приведённые к виду REST, а не вид экрана:
 * перевод в позиции и ордера терминала — тот же `toPosition`/`toOrder`, что у
 * REST-пути, и правило остаётся одним.
 */

/** Кошелёк USDT в виде, общем у ответа `wallet-balance` и события `wallet`. */
export interface StreamWallet {
  walletBalance: number;
  equity: number | null;
  unrealisedPnl: number;
  available: number | null;
}

export interface StreamState {
  wallet: StreamWallet | null;
  /** По ключу `символ:positionIdx`: в хедже у монеты две строки. */
  positions: Record<string, any>;
  /** Активные ордера по `orderId`. */
  orders: Record<string, any>;
}

/** Снимок счёта через REST: аккаунт `wallet-balance`, строки позиций и открытых ордеров. */
export interface AccountSnapshot {
  account: any;
  positions: any[];
  orders: any[];
}

/** Строка `terminal_streams`, как её читает `api`. */
export interface StoredStream {
  keyHash: string | null;
  state: unknown;
  liveAt: Date | null;
  eventAt: Date | null;
}

/** Пульс старше этого — соединения, скорее всего, уже нет (`worker` бьёт раз в 10 с). */
export const LIVE_FRESH_MS = 30_000;
/** Столько после своей записи ждём, что поток её увидит, прежде чем снова ему верить. */
export const OWN_WRITE_MS = 3_000;

const ACTIVE = new Set(['New', 'PartiallyFilled']);

const num = (v: unknown): number | null => {
  const n = parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : null;
};

/** В счёт идут USDT-перпы — тот же круг, что `settleCoin: USDT` у REST. */
const usdt = (row: any): boolean => typeof row?.symbol === 'string' && row.symbol.endsWith('USDT');

/** Событие не старше строки, которую заменяет: буфер до снимка не должен откатить снимок. */
const notOlder = (event: any, stored: any): boolean => {
  const e = Number(event?.updatedTime);
  const s = Number(stored?.updatedTime);
  return !(Number.isFinite(e) && Number.isFinite(s) && e < s);
};

/** Отпечаток ключа: по нему `api` узнаёт, что состояние собрано тем же ключом. */
export const keyHash = (apiKey: string): string => createHash('sha256').update(apiKey).digest('hex').slice(0, 16);

/** Аккаунт из `wallet-balance` или события `wallet` → кошелёк USDT; null — аккаунта нет. */
export function walletOf(account: any): StreamWallet | null {
  if (!account) return null;
  const coin = account.coin?.find((c: { coin?: string }) => c?.coin === 'USDT');
  return {
    walletBalance: num(coin?.walletBalance) ?? 0,
    equity: num(coin?.equity),
    unrealisedPnl: num(coin?.unrealisedPnl) ?? 0,
    available: num(account.totalAvailableBalance),
  };
}

/**
 * Депозит — текущий: USDT кошелька вместе с нереализованным результатом
 * (`equity` у Bybit), а без неё — кошелёк плюс открытый результат.
 */
export function balanceOf(w: StreamWallet | null): { balance: number; available: number | null } {
  if (!w) return { balance: 0, available: null };
  return { balance: w.equity ?? w.walletBalance + w.unrealisedPnl, available: w.available };
}

function applyPositions(state: StreamState, rows: unknown[]): void {
  for (const raw of rows as any[]) {
    if (!usdt(raw)) continue;
    // В событии цена входа — `entryPrice`, в REST — `avgPrice`.
    const row = raw.avgPrice == null && raw.entryPrice != null ? { ...raw, avgPrice: raw.entryPrice } : raw;
    const key = `${row.symbol}:${row.positionIdx ?? 0}`;
    if (!notOlder(row, state.positions[key])) continue;
    if ((num(row.size) ?? 0) > 0) state.positions[key] = row;
    else delete state.positions[key];
  }
}

function applyOrders(state: StreamState, rows: unknown[]): void {
  for (const row of rows as any[]) {
    if (!usdt(row) || !row.orderId) continue;
    const key = String(row.orderId);
    if (!notOlder(row, state.orders[key])) continue;
    // Исполненный, снятый, отклонённый — уже не висит. Двойной `Filled`
    // (отмена, совпавшая с исполнением) просто удаляет ещё раз.
    if (ACTIVE.has(row.orderStatus)) state.orders[key] = row;
    else delete state.orders[key];
  }
}

export function fromSnapshot(s: AccountSnapshot): StreamState {
  const state: StreamState = { wallet: walletOf(s.account), positions: {}, orders: {} };
  applyPositions(state, s.positions ?? []);
  applyOrders(state, s.orders ?? []);
  return state;
}

/** Сообщение темы → состояние. false — тема не наша или данных нет. */
export function applyEvent(state: StreamState, msg: { topic?: unknown; data?: unknown }): boolean {
  if (!Array.isArray(msg.data)) return false;
  switch (msg.topic) {
    case 'position.linear':
      applyPositions(state, msg.data);
      return true;
    case 'order.linear':
      applyOrders(state, msg.data);
      return true;
    case 'wallet': {
      const account = msg.data.find((a: any) => a?.accountType === 'UNIFIED') ?? msg.data[0];
      const wallet = walletOf(account);
      if (!wallet) return false;
      state.wallet = wallet;
      return true;
    }
    default:
      return false;
  }
}

/**
 * Состояние → счёт экрана. Изменение цены событий не даёт, поэтому PnL позиции
 * и депозит считаются здесь — от маркировки этой секунды; монета без
 * маркировки берёт PnL из последнего события.
 */
export function project(
  state: StreamState,
  marks: ReadonlyMap<string, number>,
): { balance: number; available: number | null; positions: TerminalPosition[]; orders: TerminalOrder[] } {
  let open = 0;
  const positions: TerminalPosition[] = [];
  for (const row of Object.values(state.positions)) {
    const p = toPosition(row);
    if (!p) continue;
    const mark = marks.get(p.symbol);
    const live =
      mark != null && p.entryPrice > 0
        ? { ...p, markPrice: mark, unrealisedPnl: (mark - p.entryPrice) * p.size * (p.direction === 'long' ? 1 : -1) }
        : p;
    open += live.unrealisedPnl ?? 0;
    positions.push(live);
  }
  const orders = Object.values(state.orders)
    .map(toOrder)
    .filter((o): o is TerminalOrder => o != null);
  const w = state.wallet;
  return { balance: w ? w.walletBalance + open : 0, available: w?.available ?? null, positions, orders };
}

/**
 * Годится ли строка потока вместо REST: тот же ключ, живой пульс и нет своей
 * записи, которую поток ещё не увидел, — после ордера экран обязан показать
 * счёт после ордера, даже если событие биржи ещё в пути.
 */
export function usable(row: StoredStream | null, hash: string, lastWriteAt: number | null, now: number): boolean {
  if (!row?.state || !row.liveAt || row.keyHash !== hash) return false;
  if (now - row.liveAt.getTime() > LIVE_FRESH_MS) return false;
  const unseenWrite =
    lastWriteAt != null && now - lastWriteAt < OWN_WRITE_MS && (!row.eventAt || row.eventAt.getTime() < lastWriteAt);
  return !unseenWrite;
}
```

- [ ] **Step 4: Прогнать — проходит**

Run: `npx jest src/terminal/stream/stream-state.spec.ts`
Expected: PASS.

---

### Task 2: Сокет одного ключа и ограничитель соединений

**Files:**
- Create: `backend/src/terminal/stream/bybit-private-socket.ts`
- Create: `backend/src/terminal/stream/bybit-private-socket.spec.ts`
- Create: `backend/src/terminal/stream/connect-limiter.ts`
- Create: `backend/src/terminal/stream/connect-limiter.spec.ts`
- Modify: `backend/package.json` — `ws` в `dependencies`, `@types/ws` в `devDependencies`

**Interfaces:**
- Produces:
  - `BYBIT_PRIVATE_WS = 'wss://stream.bybit.com/v5/private'`
  - `interface SocketLike { on(event: string, cb: (...args: any[]) => void): unknown; send(data: string): void; close(): void }`
  - `interface SocketHandlers { onReady(): void; onTopic(msg: { topic: string; data: unknown[] }): void; onClosed(reason: 'auth' | 'closed'): void }`
  - `class BybitPrivateSocket { constructor(creds: BybitCredentials, handlers: SocketHandlers, open?: (url: string) => SocketLike, now?: () => number); close(): void }`
  - `class ConnectLimiter { constructor(limit: number, windowMs: number); tryTake(now: number): boolean }`

- [ ] **Step 1: Зависимость**

Run (из `backend/`): `npm install ws@^8.21.3 && npm install -D @types/ws`
Expected: `package.json` и lock-файл обновлены; `ws` уже стоял транзитивно (8.21.3), новых пакетов в дереве почти нет.

- [ ] **Step 2: Тесты**

`connect-limiter.spec.ts`:

```ts
import { ConnectLimiter } from './connect-limiter';

describe('ConnectLimiter', () => {
  it('пускает не больше лимита за окно и освобождает место, когда старое выходит из окна', () => {
    const limiter = new ConnectLimiter(2, 1_000);
    expect(limiter.tryTake(0)).toBe(true);
    expect(limiter.tryTake(500)).toBe(true);
    expect(limiter.tryTake(900)).toBe(false);
    expect(limiter.tryTake(1_000)).toBe(true); // первое вышло из окна
    expect(limiter.tryTake(1_400)).toBe(false);
  });
});
```

`bybit-private-socket.spec.ts`:

```ts
import { createHmac } from 'crypto';
import { BybitPrivateSocket, BYBIT_PRIVATE_WS, type SocketHandlers } from './bybit-private-socket';

/** Сокет-заглушка: держит обработчики и отправленное. */
class FakeSocket {
  sent: any[] = [];
  closed = false;
  private handlers = new Map<string, (...args: any[]) => void>();
  constructor(readonly url: string) {}
  on(event: string, cb: (...args: any[]) => void) {
    this.handlers.set(event, cb);
  }
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.closed = true;
  }
  emit(event: string, ...args: unknown[]) {
    this.handlers.get(event)?.(...args);
  }
  reply(msg: unknown) {
    this.emit('message', Buffer.from(JSON.stringify(msg)));
  }
}

const NOW = 1_700_000_000_000;

function setup() {
  let fake!: FakeSocket;
  const handlers: jest.Mocked<SocketHandlers> = { onReady: jest.fn(), onTopic: jest.fn(), onClosed: jest.fn() };
  const socket = new BybitPrivateSocket(
    { apiKey: 'key', apiSecret: 'secret' },
    handlers,
    (url) => (fake = new FakeSocket(url)),
    () => Date.now(), // часы Jest: идут вместе с таймерами
  );
  return { socket, handlers, fake: () => fake };
}

describe('BybitPrivateSocket', () => {
  beforeEach(() => jest.useFakeTimers({ now: NOW }));
  afterEach(() => jest.useRealTimers());

  it('входит подписью по «GET/realtime» + expires и подписывается на три темы', () => {
    const { handlers, fake } = setup();
    expect(fake().url).toBe(BYBIT_PRIVATE_WS);

    fake().emit('open');
    const [auth] = fake().sent;
    const expires = auth.args[1];
    expect(auth).toEqual({
      op: 'auth',
      args: ['key', expires, createHmac('sha256', 'secret').update(`GET/realtime${expires}`).digest('hex')],
    });
    expect(expires).toBeGreaterThan(NOW);

    fake().reply({ op: 'auth', success: true });
    expect(fake().sent[1]).toEqual({ op: 'subscribe', args: ['position.linear', 'order.linear', 'wallet'] });
    expect(handlers.onReady).not.toHaveBeenCalled();

    fake().reply({ op: 'subscribe', success: true });
    expect(handlers.onReady).toHaveBeenCalledTimes(1);
  });

  it('сообщения тем отдаёт дальше, служебные — нет', () => {
    const { handlers, fake } = setup();
    fake().emit('open');
    fake().reply({ op: 'auth', success: true });
    fake().reply({ op: 'subscribe', success: true });
    fake().reply({ op: 'pong' });
    fake().reply({ topic: 'wallet', data: [{ coin: [] }] });
    fake().emit('message', Buffer.from('не json'));
    expect(handlers.onTopic).toHaveBeenCalledTimes(1);
    expect(handlers.onTopic).toHaveBeenCalledWith({ topic: 'wallet', data: [{ coin: [] }] });
  });

  it('отказ входа — onClosed("auth") и закрытый сокет', () => {
    const { handlers, fake } = setup();
    fake().emit('open');
    fake().reply({ op: 'auth', success: false, ret_msg: 'Params Error' });
    expect(handlers.onClosed).toHaveBeenCalledWith('auth');
    expect(fake().closed).toBe(true);
  });

  it('обрыв сообщается один раз; своё закрытие не сообщается вовсе', () => {
    const first = setup();
    first.fake().emit('error', new Error('x'));
    first.fake().emit('close');
    expect(first.handlers.onClosed).toHaveBeenCalledTimes(1);
    expect(first.handlers.onClosed).toHaveBeenCalledWith('closed');

    const second = setup();
    second.socket.close();
    second.fake().emit('close');
    expect(second.handlers.onClosed).not.toHaveBeenCalled();
    expect(second.fake().closed).toBe(true);
  });

  it('пинг раз в 20 с; минута тишины — соединение считается мёртвым', () => {
    const { handlers, fake } = setup();
    fake().emit('open');
    fake().reply({ op: 'auth', success: true });
    fake().reply({ op: 'subscribe', success: true });

    jest.advanceTimersByTime(20_000);
    expect(fake().sent.at(-1)).toEqual({ op: 'ping' });

    fake().reply({ op: 'pong' }); // ответ продлевает жизнь
    jest.advanceTimersByTime(40_000);
    expect(handlers.onClosed).not.toHaveBeenCalled();

    jest.advanceTimersByTime(40_000); // 60+ с без единого сообщения
    expect(handlers.onClosed).toHaveBeenCalledWith('closed');
  });
});
```

- [ ] **Step 3: Прогнать — падают**

Run: `npx jest src/terminal/stream/connect-limiter.spec.ts src/terminal/stream/bybit-private-socket.spec.ts`
Expected: FAIL — модулей нет.

- [ ] **Step 4: Реализация**

`connect-limiter.ts`:

```ts
/**
 * Скользящее окно новых соединений. Bybit пускает не больше 500 новых
 * WebSocket-соединений за 5 минут; ограничитель держит процесс ниже, а лишнее
 * соединение просто откладывается до следующего прохода.
 */
export class ConnectLimiter {
  private readonly taken: number[] = [];

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  tryTake(now: number): boolean {
    while (this.taken.length > 0 && this.taken[0] <= now - this.windowMs) this.taken.shift();
    if (this.taken.length >= this.limit) return false;
    this.taken.push(now);
    return true;
  }
}
```

`bybit-private-socket.ts`:

```ts
import { createHmac } from 'crypto';
import WebSocket from 'ws';
import type { BybitCredentials } from '../../bybit/services/bybit-auth.service';

/** Приватный поток Bybit V5. В REST-лимит 600 запросов на IP он не входит. */
export const BYBIT_PRIVATE_WS = 'wss://stream.bybit.com/v5/private';
const TOPICS = ['position.linear', 'order.linear', 'wallet'];
/** Bybit просит пинг раз в 20 с. */
const PING_MS = 20_000;
/** Столько без единого сообщения (пинг получает ответ) — соединение мертво, даже если TCP молчит. */
const SILENCE_MS = 60_000;
/** Срок подписи входа. */
const AUTH_TTL_MS = 10_000;

export interface SocketLike {
  on(event: string, cb: (...args: any[]) => void): unknown;
  send(data: string): void;
  close(): void;
}

export interface SocketHandlers {
  /** Вошли и подписались — события пошли. */
  onReady(): void;
  /** Сообщение темы. */
  onTopic(msg: { topic: string; data: unknown[] }): void;
  /** Соединение кончилось, ровно один раз. `auth` — биржа не приняла ключ. */
  onClosed(reason: 'auth' | 'closed'): void;
}

/**
 * Одно соединение приватного потока на один ключ: вход, подписка, пинг.
 * Переподключение — забота владельца соединения (`TerminalStreamService`):
 * здесь соединение живёт один раз и сообщает о конце.
 */
export class BybitPrivateSocket {
  private readonly ws: SocketLike;
  private timer?: NodeJS.Timeout;
  private ended = false;
  private seenAt: number;

  constructor(
    private readonly creds: BybitCredentials,
    private readonly handlers: SocketHandlers,
    open: (url: string) => SocketLike = (url) => new WebSocket(url),
    private readonly now: () => number = Date.now,
  ) {
    this.seenAt = this.now();
    this.ws = open(BYBIT_PRIVATE_WS);
    this.ws.on('open', () => this.auth());
    this.ws.on('message', (raw: unknown) => this.receive(raw));
    this.ws.on('close', () => this.end('closed'));
    // `ws` после ошибки сам шлёт close, но без обработчика ошибка роняла бы процесс.
    this.ws.on('error', () => this.end('closed'));
  }

  /** Закрыть по своей воле: о конце не сообщается — его и так знают. */
  close(): void {
    if (this.ended) return;
    this.ended = true;
    this.stop();
  }

  private auth(): void {
    const expires = this.now() + AUTH_TTL_MS;
    const signature = createHmac('sha256', this.creds.apiSecret).update(`GET/realtime${expires}`).digest('hex');
    this.send({ op: 'auth', args: [this.creds.apiKey, expires, signature] });
  }

  private receive(raw: unknown): void {
    this.seenAt = this.now();
    let msg: any;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (msg?.op === 'auth') {
      if (msg.success) this.send({ op: 'subscribe', args: TOPICS });
      else this.end('auth');
      return;
    }
    if (msg?.op === 'subscribe') {
      if (!msg.success) return this.end('closed');
      this.timer = setInterval(() => this.beat(), PING_MS);
      this.handlers.onReady();
      return;
    }
    if (typeof msg?.topic === 'string' && Array.isArray(msg.data)) this.handlers.onTopic(msg);
  }

  private beat(): void {
    if (this.now() - this.seenAt >= SILENCE_MS) return this.end('closed');
    this.send({ op: 'ping' });
  }

  private send(msg: unknown): void {
    try {
      this.ws.send(JSON.stringify(msg));
    } catch {
      this.end('closed');
    }
  }

  private end(reason: 'auth' | 'closed'): void {
    if (this.ended) return;
    this.ended = true;
    this.stop();
    this.handlers.onClosed(reason);
  }

  private stop(): void {
    if (this.timer) clearInterval(this.timer);
    try {
      this.ws.close();
    } catch {
      // уже закрыт
    }
  }
}
```

- [ ] **Step 5: Прогнать — проходят**

Run: `npx jest src/terminal/stream`
Expected: PASS.

---

### Task 3: Менеджер соединений в `worker`

**Files:**
- Create: `backend/src/terminal/account-snapshot.ts`
- Create: `backend/src/terminal/stream/terminal-stream.service.ts`
- Create: `backend/src/terminal/stream/terminal-stream.service.spec.ts`

**Interfaces:**
- Consumes: Task 1 (`fromSnapshot`, `applyEvent`, `keyHash`, `StreamState`, `AccountSnapshot`), Task 2 (`BybitPrivateSocket`, `SocketHandlers`, `ConnectLimiter`), `TerminalStreamStore` из Task 4 (сигнатуры ниже — менеджер зависит от интерфейса, сам стор пишется в Task 4).
- Produces:
  - `readAccount(bybit: BybitTerminalClient, creds: BybitCredentials): Promise<AccountSnapshot>`
  - `interface StreamStore { wanted(since: Date): Promise<string[]>; save(userId: string, row: { keyHash: string; state: StreamState; eventAt: Date }): Promise<void>; heartbeat(userIds: string[]): Promise<void>; drop(userId: string): Promise<void> }`
  - `STREAM_STORE`, `STREAM_SOCKET` — токены DI; `type OpenStreamSocket = (creds: BybitCredentials, handlers: SocketHandlers) => { close(): void }`
  - `class TerminalStreamService` с `tick(): Promise<void>`, `beat(): Promise<void>`

- [ ] **Step 1: `account-snapshot.ts`**

```ts
import type { BybitCredentials } from '../bybit/services/bybit-auth.service';
import type { BybitTerminalClient } from './bybit-terminal.client';
import type { AccountSnapshot } from './stream/stream-state';

/** Страниц открытых ордеров за один снимок: двести ордеров — больше, чем ставят руками. */
const ORDER_PAGES = 4;

/**
 * Снимок счёта через REST — три запроса: кошелёк, позиции USDT-перпов и
 * открытые ордера. Один на REST-путь экрана (`TerminalService.readState`) и
 * на начало потока (`TerminalStreamService`): снимка при подписке Bybit не
 * присылает.
 */
export async function readAccount(bybit: BybitTerminalClient, creds: BybitCredentials): Promise<AccountSnapshot> {
  const [wallet, positions, orders] = await Promise.all([
    bybit.privateGet(creds, '/account/wallet-balance', { accountType: 'UNIFIED' }),
    bybit.privateGet(creds, '/position/list', { category: 'linear', settleCoin: 'USDT', limit: '200' }),
    openOrderRows(bybit, creds),
  ]);
  return { account: wallet.list?.[0] ?? null, positions: positions.list ?? [], orders };
}

async function openOrderRows(bybit: BybitTerminalClient, creds: BybitCredentials): Promise<any[]> {
  const rows: any[] = [];
  let cursor = '';
  for (let page = 0; page < ORDER_PAGES; page++) {
    const params: Record<string, string> = { category: 'linear', settleCoin: 'USDT', limit: '50' };
    if (cursor) params.cursor = cursor;
    const result = await bybit.privateGet(creds, '/order/realtime', params);
    rows.push(...(result.list ?? []));
    cursor = result.nextPageCursor || '';
    if (!cursor) break;
  }
  return rows;
}
```

- [ ] **Step 2: Тесты менеджера**

`terminal-stream.service.spec.ts`:

```ts
import type { SocketHandlers } from './bybit-private-socket';
import { keyHash } from './stream-state';
import { TerminalStreamService } from './terminal-stream.service';

const NOW = 1_700_000_000_000;
const CREDS = { apiKey: 'k1', apiSecret: 's1' };

const account = (walletBalance: string) => ({ accountType: 'UNIFIED', coin: [{ coin: 'USDT', walletBalance }] });
const pos = (size: string, updatedTime: string) => ({
  symbol: 'BTCUSDT',
  side: 'Buy',
  size,
  avgPrice: '60000',
  positionIdx: 0,
  updatedTime,
});

/** Сокеты, открытые менеджером: обработчики и закрытие. */
interface Opened {
  creds: { apiKey: string };
  h: SocketHandlers;
  closed: boolean;
}

function setup(o: { wanted?: string[]; creds?: typeof CREDS | null; active?: string } = {}) {
  let wanted = o.wanted ?? ['u1'];
  let creds: typeof CREDS | null = o.creds === undefined ? CREDS : o.creds;
  const opened: Opened[] = [];
  const store = {
    wanted: jest.fn(async () => wanted),
    save: jest.fn(async () => undefined),
    heartbeat: jest.fn(async () => undefined),
    drop: jest.fn(async () => undefined),
  };
  const credentials = {
    activeExchange: jest.fn(async () => o.active ?? 'bybit'),
    get: jest.fn(async () => creds),
  };
  let snapshot: { account: unknown; positions: unknown[] } = { account: account('1000'), positions: [] };
  let failSnapshot = false;
  const bybit = {
    privateGet: jest.fn(async (_c: unknown, path: string) => {
      if (failSnapshot) throw new Error('busy');
      if (path === '/account/wallet-balance') return { list: [snapshot.account] };
      if (path === '/position/list') return { list: snapshot.positions };
      return { list: [] };
    }),
  };
  const open = (c: { apiKey: string }, h: SocketHandlers) => {
    const s: Opened = { creds: c, h, closed: false };
    opened.push(s);
    return { close: () => (s.closed = true) };
  };
  const service = new TerminalStreamService(store as any, credentials as any, bybit as any, open);
  return {
    service,
    store,
    bybit,
    opened,
    setWanted: (w: string[]) => (wanted = w),
    setCreds: (c: typeof CREDS | null) => (creds = c),
    setSnapshot: (s: typeof snapshot) => (snapshot = s),
    failSnapshot: (v: boolean) => (failSnapshot = v),
  };
}

/** Дать отработать промисам снимка. */
const settle = () => jest.advanceTimersByTimeAsync(0);

describe('TerminalStreamService', () => {
  beforeEach(() => jest.useFakeTimers({ now: NOW }));
  afterEach(() => jest.useRealTimers());

  it('открывает соединение тому, кто смотрит терминал, и после подписки пишет снимок с отпечатком ключа', async () => {
    const t = setup();
    await t.service.tick();
    expect(t.opened).toHaveLength(1);
    expect(t.store.save).not.toHaveBeenCalled();

    t.opened[0].h.onReady();
    await settle();
    expect(t.bybit.privateGet).toHaveBeenCalledTimes(3);
    expect(t.store.save).toHaveBeenCalledWith('u1', {
      keyHash: keyHash('k1'),
      state: expect.objectContaining({ wallet: expect.objectContaining({ walletBalance: 1000 }) }),
      eventAt: expect.any(Date),
    });
  });

  it('события до снимка не теряются, а старые не откатывают снимок', async () => {
    const t = setup();
    t.setSnapshot({ account: account('1000'), positions: [pos('0.2', '3000')] });
    await t.service.tick();
    const { h } = t.opened[0];
    // События идут только после подписки: подписка — снимок начат — события во время снимка.
    h.onReady();
    h.onTopic({ topic: 'position.linear', data: [pos('0.1', '2000')] }); // старше снимка
    h.onTopic({ topic: 'wallet', data: [account('1200')] }); // пришло после начала снимка
    await settle();
    const state = (t.store.save.mock.calls.at(-1) as any)[1].state;
    expect(state.positions['BTCUSDT:0'].size).toBe('0.2');
    expect(state.wallet.walletBalance).toBe(1200);
  });

  it('события после снимка уходят в базу пачкой, не чаще раза в 150 мс', async () => {
    const t = setup();
    await t.service.tick();
    t.opened[0].h.onReady();
    await settle();
    t.store.save.mockClear();

    t.opened[0].h.onTopic({ topic: 'position.linear', data: [pos('0.1', '5000')] });
    t.opened[0].h.onTopic({ topic: 'position.linear', data: [pos('0.3', '5100')] });
    expect(t.store.save).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(150);
    expect(t.store.save).toHaveBeenCalledTimes(1);
    expect((t.store.save.mock.calls[0] as any)[1].state.positions['BTCUSDT:0'].size).toBe('0.3');
  });

  it('ушедший со страницы теряет соединение', async () => {
    const t = setup();
    await t.service.tick();
    t.setWanted([]);
    await t.service.tick();
    expect(t.opened[0].closed).toBe(true);
    expect(t.store.drop).toHaveBeenCalledWith('u1');
  });

  it('смена ключа пересоздаёт соединение, потеря ключа или не-Bybit — закрывает', async () => {
    const t = setup();
    await t.service.tick();
    t.setCreds({ apiKey: 'k2', apiSecret: 's2' });
    await t.service.tick();
    expect(t.opened[0].closed).toBe(true);
    expect(t.opened[1].creds.apiKey).toBe('k2');

    t.setCreds(null);
    await t.service.tick();
    expect(t.opened[1].closed).toBe(true);
    expect(t.opened).toHaveLength(2);
  });

  it('обрыв — пауза 1 с, потом 2 с; отказ входа — 5 минут', async () => {
    const t = setup();
    await t.service.tick();
    t.opened[0].h.onClosed('closed');
    expect(t.store.drop).toHaveBeenCalledWith('u1');
    await t.service.tick();
    expect(t.opened).toHaveLength(1); // пауза
    await jest.advanceTimersByTimeAsync(1_000);
    await t.service.tick();
    expect(t.opened).toHaveLength(2);

    t.opened[1].h.onClosed('closed');
    await jest.advanceTimersByTimeAsync(1_000);
    await t.service.tick();
    expect(t.opened).toHaveLength(2); // вторая пауза — 2 с
    await jest.advanceTimersByTimeAsync(1_000);
    await t.service.tick();
    expect(t.opened).toHaveLength(3);

    t.opened[2].h.onClosed('auth');
    await jest.advanceTimersByTimeAsync(4 * 60_000);
    await t.service.tick();
    expect(t.opened).toHaveLength(3);
    await jest.advanceTimersByTimeAsync(60_000);
    await t.service.tick();
    expect(t.opened).toHaveLength(4);
  });

  it('снимок не прочитался — соединение закрывается и ждёт паузу', async () => {
    const t = setup();
    t.failSnapshot(true);
    await t.service.tick();
    t.opened[0].h.onReady();
    await settle();
    expect(t.opened[0].closed).toBe(true);
    expect(t.store.save).not.toHaveBeenCalled();
    t.failSnapshot(false);
    await jest.advanceTimersByTimeAsync(1_000);
    await t.service.tick();
    expect(t.opened).toHaveLength(2);
  });

  it('не больше 450 новых соединений за 5 минут', async () => {
    const t = setup({ wanted: Array.from({ length: 500 }, (_, i) => `u${i}`) });
    await t.service.tick();
    expect(t.opened).toHaveLength(450);
    await jest.advanceTimersByTimeAsync(5 * 60_000);
    await t.service.tick();
    expect(t.opened).toHaveLength(500);
  });

  it('пульс отмечает только живые соединения', async () => {
    const t = setup({ wanted: ['u1', 'u2'] });
    await t.service.tick();
    t.opened[0].h.onReady();
    await settle();
    await t.service.beat();
    expect(t.store.heartbeat).toHaveBeenCalledWith(['u1']);
  });

  it('раз в ~10 минут состояние перечитывается снимком', async () => {
    const t = setup();
    await t.service.tick();
    t.opened[0].h.onReady();
    await settle();
    t.bybit.privateGet.mockClear();
    await jest.advanceTimersByTimeAsync(13 * 60_000);
    await t.service.tick();
    await settle();
    expect(t.bybit.privateGet).toHaveBeenCalledTimes(3);
    expect(t.opened).toHaveLength(1); // соединение то же
  });
});
```

- [ ] **Step 3: Прогнать — падает**

Run: `npx jest src/terminal/stream/terminal-stream.service.spec.ts`
Expected: FAIL — модуля нет.

- [ ] **Step 4: Реализация**

`terminal-stream.service.ts`:

```ts
import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy, Optional } from '@nestjs/common';
import type { BybitCredentials } from '../../bybit/services/bybit-auth.service';
import { CredentialsService } from '../../credentials/credentials.service';
import { runsBackgroundJobs } from '../../role';
import { readAccount } from '../account-snapshot';
import { BybitTerminalClient } from '../bybit-terminal.client';
import { BybitPrivateSocket, type SocketHandlers } from './bybit-private-socket';
import { ConnectLimiter } from './connect-limiter';
import { applyEvent, fromSnapshot, keyHash, type StreamState } from './stream-state';

const TICK_MS = 2_000;
const HEARTBEAT_MS = 10_000;
/** Спрос: экран спрашивал счёт за это время (`api` отмечает не чаще раза в 20 с). */
const WANTED_MS = 60_000;
const FLUSH_MS = 150;
const RESNAPSHOT_MS = 10 * 60_000;
const RETRY_MIN_MS = 1_000;
const RETRY_MAX_MS = 60_000;
/** Отказ входа: ключ отозван или без прав — частые попытки только жгут лимит соединений. */
const RETRY_AUTH_MS = 5 * 60_000;
/** Bybit — не больше 500 новых соединений за 5 минут; держимся ниже. */
const CONNECTS = { limit: 450, windowMs: 5 * 60_000 };

export interface StreamStore {
  wanted(since: Date): Promise<string[]>;
  save(userId: string, row: { keyHash: string; state: StreamState; eventAt: Date }): Promise<void>;
  heartbeat(userIds: string[]): Promise<void>;
  drop(userId: string): Promise<void>;
}
export const STREAM_STORE = Symbol('STREAM_STORE');

export type OpenStreamSocket = (creds: BybitCredentials, handlers: SocketHandlers) => { close(): void };
export const STREAM_SOCKET = Symbol('STREAM_SOCKET');
const openBybit: OpenStreamSocket = (creds, handlers) => new BybitPrivateSocket(creds, handlers);

interface Stream {
  userId: string;
  creds: BybitCredentials;
  hash: string;
  socket: { close(): void } | null;
  /** null — снимка ещё нет. */
  state: StreamState | null;
  /** События, пришедшие во время снимка; null — снимок не идёт. */
  buffer: { topic: string; data: unknown[] }[] | null;
  live: boolean;
  eventAt: number;
  nextSnapshotAt: number;
  retryAt: number;
  failures: number;
  flush?: NodeJS.Timeout;
}

/**
 * Счёт терминала из приватного WebSocket Bybit — роль `worker`
 * (спека `2026-10-02-terminal-bybit-websocket-design.md`).
 *
 * Кому нужно соединение, говорит `api` (`terminal_streams.wantedAt`: экран
 * спрашивал счёт). На соединение — REST-снимок (подписка снимка не даёт),
 * поверх него события; состояние уходит в базу, `api` читает его оттуда.
 * Соединения живут в памяти этого процесса — поэтому здесь, в `worker`,
 * который и так ровно один, а не в `api`.
 */
@Injectable()
export class TerminalStreamService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(TerminalStreamService.name);
  private readonly streams = new Map<string, Stream>();
  private readonly limiter = new ConnectLimiter(CONNECTS.limit, CONNECTS.windowMs);
  private timers: NodeJS.Timeout[] = [];
  private busy = false;

  constructor(
    @Inject(STREAM_STORE) private readonly store: StreamStore,
    private readonly credentials: CredentialsService,
    private readonly bybit: BybitTerminalClient,
    @Optional() @Inject(STREAM_SOCKET) private readonly open: OpenStreamSocket = openBybit,
  ) {}

  onApplicationBootstrap() {
    if (!runsBackgroundJobs()) return;
    this.timers = [
      setInterval(() => void this.tick().catch((e) => this.logger.error('тик потоков упал', e as Error)), TICK_MS),
      setInterval(() => void this.beat().catch((e) => this.logger.error('пульс потоков упал', e as Error)), HEARTBEAT_MS),
    ];
  }

  onModuleDestroy() {
    for (const t of this.timers) clearInterval(t);
    for (const s of this.streams.values()) this.close(s);
    this.streams.clear();
  }

  async tick(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const wanted = new Set(await this.store.wanted(new Date(Date.now() - WANTED_MS)));
      for (const s of [...this.streams.values()]) if (!wanted.has(s.userId)) this.stop(s);
      for (const userId of wanted) await this.ensure(userId);
    } finally {
      this.busy = false;
    }
  }

  async beat(): Promise<void> {
    const live = [...this.streams.values()].filter((s) => s.live).map((s) => s.userId);
    if (live.length > 0) await this.store.heartbeat(live);
  }

  private async ensure(userId: string): Promise<void> {
    const creds = await this.credsOf(userId);
    let s = this.streams.get(userId);
    if (!creds) {
      if (s) this.stop(s);
      return;
    }
    const hash = keyHash(creds.apiKey);
    if (s && s.hash !== hash) {
      this.stop(s);
      s = undefined;
    }
    if (!s) {
      s = { userId, creds, hash, socket: null, state: null, buffer: null, live: false, eventAt: 0, nextSnapshotAt: 0, retryAt: 0, failures: 0 };
      this.streams.set(userId, s);
    }
    const now = Date.now();
    if (!s.socket) {
      if (now >= s.retryAt && this.limiter.tryTake(now)) this.connect(s);
    } else if (s.live && s.buffer == null && now >= s.nextSnapshotAt) {
      void this.snapshot(s, s.socket);
    }
  }

  private async credsOf(userId: string): Promise<BybitCredentials | null> {
    if ((await this.credentials.activeExchange(userId)) !== 'bybit') return null;
    const creds = await this.credentials.get(userId, 'bybit');
    return creds ? { apiKey: creds.apiKey, apiSecret: creds.apiSecret } : null;
  }

  private connect(s: Stream): void {
    s.state = null;
    s.buffer = null;
    s.live = false;
    const socket = this.open(s.creds, {
      onReady: () => void this.snapshot(s, socket),
      onTopic: (msg) => this.onTopic(s, socket, msg),
      onClosed: (reason) => this.onClosed(s, socket, reason),
    });
    s.socket = socket;
  }

  /**
   * Снимок REST под уже идущей подпиской: события, пришедшие за время снимка,
   * копятся в буфере и ложатся поверх него — старше строки снимка они её не
   * откатят (`applyEvent`). Повторный снимок идёт так же, а экран тем
   * временем видит прежнее состояние с теми же событиями.
   */
  private async snapshot(s: Stream, socket: { close(): void }): Promise<void> {
    s.buffer = [];
    try {
      const snap = await readAccount(this.bybit, s.creds);
      if (s.socket !== socket) return;
      const state = fromSnapshot(snap);
      for (const msg of s.buffer ?? []) applyEvent(state, msg);
      s.state = state;
      s.buffer = null;
      s.live = true;
      s.failures = 0;
      s.eventAt = Date.now();
      s.nextSnapshotAt = s.eventAt + RESNAPSHOT_MS * (0.75 + Math.random() * 0.5);
      await this.save(s);
    } catch (e) {
      if (s.socket !== socket) return;
      this.logger.warn(`user ${s.userId}: снимок счёта не прочитан — ${(e as Error).message}`);
      socket.close();
      this.onClosed(s, socket, 'closed');
    }
  }

  private onTopic(s: Stream, socket: { close(): void }, msg: { topic: string; data: unknown[] }): void {
    if (s.socket !== socket) return;
    s.buffer?.push(msg);
    if (!s.state || !applyEvent(s.state, msg)) return;
    s.eventAt = Date.now();
    if (s.live && !s.flush) {
      s.flush = setTimeout(() => {
        s.flush = undefined;
        void this.save(s);
      }, FLUSH_MS);
    }
  }

  private onClosed(s: Stream, socket: { close(): void }, reason: 'auth' | 'closed'): void {
    if (s.socket !== socket) return;
    s.socket = null;
    s.live = false;
    s.state = null;
    s.buffer = null;
    if (s.flush) clearTimeout(s.flush);
    s.flush = undefined;
    s.failures++;
    const pause = reason === 'auth' ? RETRY_AUTH_MS : Math.min(RETRY_MAX_MS, RETRY_MIN_MS * 2 ** (s.failures - 1));
    s.retryAt = Date.now() + pause;
    if (reason === 'auth') this.logger.warn(`user ${s.userId}: Bybit не принял ключ в приватном потоке`);
    void this.store.drop(s.userId).catch(() => undefined);
  }

  private async save(s: Stream): Promise<void> {
    if (!s.live || !s.state) return;
    try {
      await this.store.save(s.userId, { keyHash: s.hash, state: s.state, eventAt: new Date(s.eventAt) });
    } catch (e) {
      this.logger.warn(`user ${s.userId}: состояние потока не записано — ${(e as Error).message}`);
    }
  }

  /** Своей волей: ушёл со страницы, сменил ключ или биржу. */
  private stop(s: Stream): void {
    this.close(s);
    this.streams.delete(s.userId);
    void this.store.drop(s.userId).catch(() => undefined);
  }

  private close(s: Stream): void {
    if (s.flush) clearTimeout(s.flush);
    s.flush = undefined;
    s.socket?.close();
    s.socket = null;
    s.live = false;
  }
}
```

- [ ] **Step 5: Прогнать — проходит**

Run: `npx jest src/terminal/stream`
Expected: PASS.

**Контрольная точка ревью (A):** Task 1–3 одним пакетом. Фокус:
- гонка снимка и событий: буфер, старые события, повторный снимок под живой подпиской;
- жизненный цикл соединения: обрыв, отказ входа, смена ключа, остановка, ограничитель;
- соответствие протоколу Bybit: подпись, темы, пинг, двойной `Filled`, `size 0`, `entryPrice`.

---

### Task 4: Таблица, стор и маркировка

**Files:**
- Modify: `backend/prisma/schema.prisma` — модель `TerminalStream`, обратная связь в `User`
- Create: `backend/src/terminal/stream/terminal-stream.store.ts`
- Create: `backend/src/terminal/stream/terminal-stream.store.spec.ts`
- Modify: `backend/src/terminal/terminal-market.service.ts` — `markPrices()`
- Modify: `backend/src/terminal/terminal-market.service.spec.ts`

**Interfaces:**
- Produces:
  - `class TerminalStreamStore implements StreamStore`, плюс `want(userId: string): void` и `read(userId: string): Promise<StoredStream | null>`
  - `TerminalMarketService.markPrices(): Promise<ReadonlyMap<string, number>>`

- [ ] **Step 1: Схема**

В `schema.prisma` — модель:

```prisma
/// Счёт терминала из приватного WebSocket Bybit
/// (спека 2026-10-02-terminal-bybit-websocket-design.md). `wantedAt` пишет
/// api — экран спрашивал счёт; остальное — worker, который держит соединение.
model TerminalStream {
  userId   String    @id
  user     User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  wantedAt DateTime
  /// Отпечаток ключа, которым собрано состояние: сменил ключ — api не верит строке.
  keyHash  String?
  /// Сырые строки биржи (stream-state.ts): кошелёк USDT, позиции, активные ордера.
  state    Json?
  /// Пульс живого соединения; старше 30 с — api идёт в REST.
  liveAt   DateTime?
  /// Когда worker применил последнее событие или снимок.
  eventAt  DateTime?

  @@index([wantedAt])
  @@map("terminal_streams")
}
```

В `model User` — поле `terminalStream TerminalStream?`.

Run: `npx prisma db push` (локальная база; новая таблица, данных не трогает), затем `npx prisma generate`. Если `generate` падает с EPERM — движок держит запущенный `nest --watch`: остановить бэкенд, сгенерировать, поднять обратно.

- [ ] **Step 2: Тесты стора и маркировки**

`terminal-stream.store.spec.ts`:

```ts
import { TerminalStreamStore } from './terminal-stream.store';

function setup() {
  const prisma = {
    terminalStream: {
      upsert: jest.fn(async () => ({})),
      findUnique: jest.fn(async () => null),
      findMany: jest.fn(async () => [{ userId: 'u1' }, { userId: 'u2' }]),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
  };
  return { store: new TerminalStreamStore(prisma as any), prisma };
}

describe('TerminalStreamStore', () => {
  beforeEach(() => jest.useFakeTimers({ now: 1_000_000 }));
  afterEach(() => jest.useRealTimers());

  it('спрос пишется не чаще раза в 20 с на пользователя', async () => {
    const { store, prisma } = setup();
    store.want('u1');
    store.want('u1');
    expect(prisma.terminalStream.upsert).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(20_000);
    store.want('u1');
    store.want('u2');
    expect(prisma.terminalStream.upsert).toHaveBeenCalledTimes(3);
  });

  it('упавшая запись спроса не роняет запрос и даёт повторить сразу', async () => {
    const { store, prisma } = setup();
    prisma.terminalStream.upsert.mockRejectedValueOnce(new Error('db'));
    store.want('u1');
    await jest.advanceTimersByTimeAsync(0);
    store.want('u1');
    expect(prisma.terminalStream.upsert).toHaveBeenCalledTimes(2);
  });

  it('список спроса — id пользователей', async () => {
    const { store, prisma } = setup();
    expect(await store.wanted(new Date(0))).toEqual(['u1', 'u2']);
    expect(prisma.terminalStream.findMany).toHaveBeenCalledWith({
      where: { wantedAt: { gte: new Date(0) } },
      select: { userId: true },
    });
  });

  it('пульс одной командой на всех; пустой список — без запроса', async () => {
    const { store, prisma } = setup();
    await store.heartbeat([]);
    expect(prisma.terminalStream.updateMany).not.toHaveBeenCalled();
    await store.heartbeat(['u1', 'u2']);
    expect(prisma.terminalStream.updateMany).toHaveBeenCalledWith({
      where: { userId: { in: ['u1', 'u2'] } },
      data: { liveAt: new Date(1_000_000) },
    });
  });
});
```

В `terminal-market.service.spec.ts`, в моке `/market/tickers`, добавить `markPrice: '60010'` в строку BTC и тест:

```ts
  it('маркировка — один запрос на все монеты, кэш 2 с, после сбоя — прошлый ответ до 30 с', async () => {
    const { market, bybit } = setup(() => []);
    const tickers = () => bybit.publicGet.mock.calls.filter(([p]) => p === '/market/tickers').length;

    expect((await market.markPrices()).get('BTCUSDT')).toBe(60_010);
    await market.markPrices();
    expect(tickers()).toBe(1);

    market.setNow(NOW + 2_000);
    bybit.publicGet.mockRejectedValueOnce(new Error('down'));
    expect((await market.markPrices()).get('BTCUSDT')).toBe(60_010);

    market.setNow(NOW + 31_000);
    bybit.publicGet.mockRejectedValueOnce(new Error('down'));
    expect((await market.markPrices()).size).toBe(0);
  });
```

- [ ] **Step 3: Прогнать — падают**

Run: `npx jest src/terminal/stream/terminal-stream.store.spec.ts src/terminal/terminal-market.service.spec.ts`
Expected: FAIL — нет стора, нет `markPrices`.

- [ ] **Step 4: Реализация**

`terminal-stream.store.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { StoredStream, StreamState } from './stream-state';
import type { StreamStore } from './terminal-stream.service';

/** Отмечать спрос не чаще: окно спроса у worker — 60 с, три отметки в него помещаются. */
const WANT_EVERY_MS = 20_000;
/** Выше — выметать старые отметки из памяти процесса. */
const SWEEP_ABOVE = 2_000;

/**
 * Строки `terminal_streams`. `api` пишет спрос и читает состояние, `worker` —
 * пишет состояние и пульс; колонки у них не пересекаются.
 */
@Injectable()
export class TerminalStreamStore implements StreamStore {
  private readonly logger = new Logger(TerminalStreamStore.name);
  /** Когда этот процесс последний раз отмечал спрос пользователя. */
  private readonly wantedAt = new Map<string, number>();

  constructor(private readonly prisma: PrismaService) {}

  /** Экран спрашивал счёт. Без ожидания: опрос не должен ждать записи. */
  want(userId: string): void {
    const now = Date.now();
    if (now - (this.wantedAt.get(userId) ?? 0) < WANT_EVERY_MS) return;
    this.wantedAt.set(userId, now);
    if (this.wantedAt.size > SWEEP_ABOVE) {
      for (const [id, at] of this.wantedAt) if (now - at >= WANT_EVERY_MS) this.wantedAt.delete(id);
    }
    const at = new Date(now);
    this.prisma.terminalStream
      .upsert({ where: { userId }, create: { userId, wantedAt: at }, update: { wantedAt: at } })
      .catch((e: Error) => {
        this.wantedAt.delete(userId);
        this.logger.warn(`спрос потока не записан: ${e.message}`);
      });
  }

  read(userId: string): Promise<StoredStream | null> {
    return this.prisma.terminalStream.findUnique({
      where: { userId },
      select: { keyHash: true, state: true, liveAt: true, eventAt: true },
    });
  }

  async wanted(since: Date): Promise<string[]> {
    const rows = await this.prisma.terminalStream.findMany({ where: { wantedAt: { gte: since } }, select: { userId: true } });
    return rows.map((r) => r.userId);
  }

  async save(userId: string, row: { keyHash: string; state: StreamState; eventAt: Date }): Promise<void> {
    await this.prisma.terminalStream.updateMany({
      where: { userId },
      data: { keyHash: row.keyHash, state: row.state as unknown as Prisma.InputJsonValue, eventAt: row.eventAt, liveAt: new Date() },
    });
  }

  async heartbeat(userIds: string[]): Promise<void> {
    if (userIds.length === 0) return;
    await this.prisma.terminalStream.updateMany({ where: { userId: { in: userIds } }, data: { liveAt: new Date() } });
  }

  async drop(userId: string): Promise<void> {
    await this.prisma.terminalStream.updateMany({ where: { userId }, data: { liveAt: null } });
  }
}
```

`terminal-market.service.ts` — константы рядом с прочими и метод:

```ts
/** Маркировка всех монет одним запросом — на всех пользователей процесса. */
const MARKS_TTL_MS = 2_000;
/** Столько после сбоя отдаётся прошлый ответ; дальше — пусто, и PnL берётся из событий. */
const MARKS_STALE_MS = 30_000;
```

```ts
  private marks: Cached<Map<string, number>> | null = null;
  private marksInflight: Promise<Map<string, number>> | null = null;

  /**
   * Цена маркировки всех USDT-перпов — для PnL позиций и депозита потока
   * счёта: изменение цены событий приватного потока не даёт.
   */
  async markPrices(): Promise<ReadonlyMap<string, number>> {
    const now = this.now();
    if (this.marks && now - this.marks.at < MARKS_TTL_MS) return this.marks.value;
    this.marksInflight ??= this.bybit
      .publicGet('/market/tickers', { category: 'linear' })
      .then((result) => {
        const value = new Map<string, number>();
        for (const t of result.list ?? []) {
          const mark = parseFloat(t.markPrice);
          if (mark > 0) value.set(String(t.symbol), mark);
        }
        this.marks = { at: this.now(), value };
        return value;
      })
      .finally(() => {
        this.marksInflight = null;
      });
    try {
      return await this.marksInflight;
    } catch {
      return this.marks && now - this.marks.at < MARKS_STALE_MS ? this.marks.value : new Map();
    }
  }
```

(Тип `Cached<T>` в файле уже есть — `{ at: number; value: T }`; если имя другое, взять существующее.)

- [ ] **Step 5: Прогнать — проходят**

Run: `npx jest src/terminal`
Expected: PASS.

---

### Task 5: Чтение счёта в `api` — поток или REST

**Files:**
- Modify: `backend/src/terminal/bybit-terminal.client.ts` — `lastWriteAt`
- Modify: `backend/src/terminal/terminal.service.ts` — `state`, `readState`, `wallet`, удалить `openOrders` и `ORDER_PAGES`
- Modify: `backend/src/terminal/terminal.service.spec.ts`

**Interfaces:**
- Consumes: `readAccount` (Task 3), `walletOf`, `balanceOf`, `project`, `usable`, `keyHash`, `StreamState` (Task 1), `TerminalStreamStore.want/read` (Task 4), `markPrices` (Task 4).
- Produces: `BybitTerminalClient.lastWriteAt(apiKey: string): number | null`; `TerminalService` — пятым параметром конструктора `TerminalStreamStore`.

- [ ] **Step 1: Тесты выбора пути**

В `terminal.service.spec.ts`:
- в `setup` добавить в `Setup` поле `stream?: unknown` (строка `terminal_streams`), в `bybit` — `lastWriteAt: jest.fn(() => lastWrite)` с `let lastWrite: number | null = null`, который `privatePost` ставит в `Date.now()`;
- в `market` — `markPrices: jest.fn(async () => new Map([['BTCUSDT', 61_000]]))`;
- `streams = { want: jest.fn(), read: jest.fn(async () => s.stream ?? null) }` пятым аргументом конструктора;
- вернуть `streams` из `setup`.

Новые тесты в `describe('state')`:

```ts
    const live = (extra: Record<string, unknown> = {}) => ({
      keyHash: keyHash('k'),
      liveAt: new Date(),
      eventAt: new Date(Date.now() - 10_000),
      state: {
        wallet: { walletBalance: 1000, equity: 1000, unrealisedPnl: 0, available: 900 },
        positions: { 'BTCUSDT:0': openRow('Buy', 0, { size: '0.1', updatedTime: '1' }) },
        orders: {},
      },
      ...extra,
    });

    it('живой поток своего ключа — счёт из него, без единого запроса к бирже', async () => {
      const { service, bybit, streams } = setup({ stream: live() });

      const state = await service.state('u1');

      expect(bybit.privateGet).not.toHaveBeenCalled();
      expect(streams.want).toHaveBeenCalledWith('u1');
      // лонг 0.1 от 60 000, маркировка 61 000 → +100 к кошельку 1000.
      expect(state.balance).toBeCloseTo(1100, 10);
      expect(state.positions[0]).toMatchObject({ symbol: 'BTCUSDT', unrealisedPnl: 100 });
    });

    it('старый пульс или чужой ключ — запасной путь REST', async () => {
      const stale = setup({ stream: live({ liveAt: new Date(Date.now() - 60_000) }) });
      await stale.service.state('u1');
      expect(stale.bybit.privateGet).toHaveBeenCalledTimes(3);

      const other = setup({ stream: live({ keyHash: keyHash('другой') }) });
      await other.service.state('u1');
      expect(other.bybit.privateGet).toHaveBeenCalledTimes(3);
    });

    it('сразу после своего ордера, пока поток его не увидел, — REST', async () => {
      const { service, bybit } = setup({ stream: live() });
      await service.placeOrders('u1', market());
      bybit.privateGet.mockClear();

      await service.state('u1');
      expect(bybit.privateGet).toHaveBeenCalledWith(expect.anything(), '/position/list', expect.anything());
    });

    it('упавшее чтение потока — тоже REST, а не ошибка экрана', async () => {
      const { service, bybit, streams } = setup();
      streams.read.mockRejectedValueOnce(new Error('db'));
      await service.state('u1');
      expect(bybit.privateGet).toHaveBeenCalledTimes(3);
    });
```

(Импорт `keyHash` из `./stream/stream-state`.)

- [ ] **Step 2: Прогнать — падают**

Run: `npx jest src/terminal/terminal.service.spec.ts`
Expected: FAIL — поток не читается, `privateGet` вызван.

- [ ] **Step 3: `lastWriteAt`**

`bybit-terminal.client.ts` — рядом с `writes`:

```ts
  /**
   * Когда ключ последний раз начал запись на биржу — время НАЧАЛА: событие
   * биржи о записи приходит после него, а ответ REST может прийти и позже
   * события. По нему `api` решает, видел ли поток счёта эту запись
   * (`stream-state.ts`, `usable`).
   */
  lastWriteAt(apiKey: string): number | null {
    return this.writeStarts.get(apiKey) ?? null;
  }

  private readonly writeStarts = new Map<string, number>();
```

и в `write()` первой строкой — `this.writeStarts.set(apiKey, Date.now());`.

- [ ] **Step 4: `TerminalService`**

Импорты: `TerminalStreamStore`, `readAccount`, `{ balanceOf, keyHash, project, usable, walletOf, type StreamState }`. Конструктор — пятым параметром `private readonly streams: TerminalStreamStore`. Удалить `ORDER_PAGES` и метод `openOrders`.

```ts
  /**
   * Всё, что экран показывает о счёте: баланс, позиции и висящие лимиты — одним
   * снимком. Обычно — из потока счёта (`worker` держит приватный WebSocket
   * Bybit, `terminal_streams`): это чтение строки из базы, а не три запроса к
   * бирже на каждый опрос. Нет годного потока — тот же снимок через REST.
   */
  async state(userId: string): Promise<TerminalState> {
    const creds = await this.creds(userId);
    this.streams.want(userId);
    const streamed = await this.fromStream(userId, creds).catch((e: Error) => {
      this.logger.warn(`user ${userId}: поток счёта не прочитан — ${e.message}`);
      return null;
    });
    if (streamed) return streamed;
    return this.states.get(userId, this.bybit.writeVersion(creds.apiKey), () => this.readState(creds));
  }

  private async fromStream(userId: string, creds: BybitCredentials): Promise<TerminalState | null> {
    const row = await this.streams.read(userId);
    const now = Date.now();
    if (!usable(row, keyHash(creds.apiKey), this.bybit.lastWriteAt(creds.apiKey), now)) return null;
    const marks = await this.market.markPrices();
    return { serverTime: new Date(now).toISOString(), ...project(row!.state as StreamState, marks) };
  }

  private async readState(creds: BybitCredentials): Promise<TerminalState> {
    const snap = await readAccount(this.bybit, creds);
    return {
      // Время снимка, а не ответа: из кэша он может уйти на пару секунд позже.
      serverTime: new Date().toISOString(),
      ...balanceOf(walletOf(snap.account)),
      positions: snap.positions.map(toPosition).filter((p): p is TerminalPosition => p != null),
      orders: snap.orders.map(toOrder).filter((o): o is TerminalOrder => o != null),
    };
  }
```

`wallet()` (им пользуется расчёт объёма перед ордером):

```ts
  private async wallet(creds: BybitCredentials): Promise<{ balance: number; available: number | null }> {
    const result = await this.bybit.privateGet(creds, '/account/wallet-balance', { accountType: 'UNIFIED' });
    return balanceOf(walletOf(result.list?.[0]));
  }
```

Комментарий над `wallet()` (про депозит — equity) оставить.

- [ ] **Step 5: Прогнать**

Run: `npx jest src/terminal`
Expected: PASS — новые тесты и прежние (снимок, equity, второй таб, после ордера).

**Контрольная точка ревью (A/B):** Task 4–5 одним пакетом. Фокус:
- выбор пути чтения и его отказоустойчивость;
- рефактор REST-пути: поведение не изменилось — депозит, ордера, кэш, `wallet()` для объёма;
- схема и стор: запись `api` и `worker` по разным колонкам, `updateMany` вместо `update` (строки может не быть);
- форма ответа — та же `TerminalState` для фронта.

---

### Task 6: Подключение, документация, сборка

**Files:**
- Modify: `backend/src/terminal/terminal.module.ts`
- Modify: `backend/src/role.ts` (список фоновых сервисов `worker`)
- Modify: `CLAUDE.md` — раздел терминала, список сервисов `worker`

- [ ] **Step 1: Модуль**

```ts
import { Module } from '@nestjs/common';
import { BybitModule } from '../bybit/bybit.module';
import { CredentialsModule } from '../credentials/credentials.module';
import { BybitTerminalClient } from './bybit-terminal.client';
import { TerminalStreamService, STREAM_STORE } from './stream/terminal-stream.service';
import { TerminalStreamStore } from './stream/terminal-stream.store';
import { TerminalController } from './terminal.controller';
import { TerminalMarketService } from './terminal-market.service';
import { TerminalService } from './terminal.service';

@Module({
  imports: [CredentialsModule, BybitModule],
  controllers: [TerminalController],
  providers: [
    BybitTerminalClient,
    TerminalMarketService,
    TerminalService,
    TerminalStreamStore,
    { provide: STREAM_STORE, useExisting: TerminalStreamStore },
    TerminalStreamService,
  ],
})
export class TerminalModule {}
```

(Комментарии модуля, если есть, сохранить.)

- [ ] **Step 2: Документация**

- `role.ts`: в список `worker` добавить `terminal-stream`.
- `CLAUDE.md`:
  - «одиннадцать фоновых сервисов» → «двенадцать», в перечень — `terminal-stream`;
  - в разделе терминала пункт «Своего исполнения нет… экран перечитывает счёт… кэшируется на сервере на 2,5 с» переписать: счёт — из потока (`worker`, приватный WebSocket, `terminal_streams`); REST со `StateCache` — запасной путь: поток поднимается, своя запись моложе 3 с, `worker` лежит. Добавить строку про маркировку и про то, что поток живым ключом не проверялся.

- [ ] **Step 3: Весь бэк и сборка**

Run (из `backend/`): `npx jest && npx tsc --noEmit -p tsconfig.build.json`
Expected: все зелёные, сборка чистая. Зависимость новая — по правилам проекта полная проверка обязательна.

---

### Живой прогон (в конце)

Живого ключа у исполнителя нет. Проверяемое без ключа:
- `ROLE=all` локально — процесс стартует, `TerminalStreamService` тикает без ошибок;
- `GET /api/terminal/state` пользователя без потока отвечает через REST, как раньше.

Живым ключом — владелец: открыть `/terminal`, через несколько секунд строка `terminal_streams` с `liveAt`; поставить и снять лимит — он появляется и пропадает на экране, а REST-запросов `/position/list` в логе опросов нет.
