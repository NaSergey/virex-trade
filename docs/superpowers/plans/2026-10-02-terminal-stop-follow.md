# Стоп за тейками на бирже — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** сетка фиксации в терминале биржи с флажком «переносить стоп за тейками» ведёт стоп на Bybit после каждого исполненного тейка — и при закрытой вкладке.

**Architecture:** `api` при сетке записывает план (`terminal_stop_follows`). `worker` держит приватный поток тем, у кого есть план (`StreamListener.pinned`), и на событии `Filled` тейка двигает стоп через `trading-stop` (`StopFollowService`). Правило цели — то же, что у бектеста. После обрыва пропущенное догоняется по истории ордеров.

**Tech Stack:** NestJS, Prisma/PostgreSQL, Jest; фронт — Next.js, vitest.

Спека: `docs/superpowers/specs/2026-10-02-terminal-stop-follow-design.md`.

## Global Constraints

- Правило цели: после 1-го исполненного тейка — вход позиции, после k-го — цена (k−1)-го исполненного. Цель не по свою сторону от цены исполнения (`stopOnRightSide`) и не теснее текущего стопа — не ставится.
- Цена уже за целью (лонг: маркировка ≤ цели, шорт: ≥) — остаток закрывается по рынку reduce-only (`TerminalService.closePosition`, `kind: 'market'`).
- `trading-stop`: `category: linear`, `tpslMode: 'Full'`, `positionIdx` из строки позиции, `stopLoss` по шагу цены. Текущий тейк позиции передаётся, если он есть. Код 34040 («уже такие») — не отказ.
- Неудача шага — повтор через 10 с, пока позиция открыта.
- План неактивен: позиции нет, или не осталось ни одного тейка, который ещё может исполниться, при уже поставленной цели.
- Одна строка плана на (`userId`, `symbol`, `direction`). Новая сетка — новый `id`: шаг по прежнему плану записи не делает (`updateMany` по `id`).
- Код не коммитить. Коммит — по решению владельца.

## Риски (гибрид)

- Task 1–3 — **A** (стоп на настоящем счёте, закрытие по рынку, конкурентность шагов). Контрольная точка — после Task 3.
- Task 4–5 — **B** (контракт бэк↔фронт, общий экран `Terminal`). Контрольная точка — после Task 5, вместе с документацией.

---

### Task 1: Правило цели, схема и стор планов

**Files:**
- Create: `backend/src/terminal/stream/follow-rule.ts`, `follow-rule.spec.ts`
- Create: `backend/src/terminal/stream/stop-follow.store.ts`
- Modify: `backend/prisma/schema.prisma` — `TerminalStopFollow`, связь в `User`

**Interfaces:**
- Produces:
  - `followTarget(direction: Direction, entryPrice: number, fills: readonly number[], currentStop: number | null): number | null`
  - `crossed(direction: Direction, mark: number, stop: number): boolean`
  - `interface FollowPlan { id; userId; symbol; direction: Direction; entryPrice; orderIds: string[]; prices: number[]; filled: string[]; fillPrices: number[]; cancelled: string[]; target: number | null; applied: boolean; active: boolean }`
  - `class StopFollowStore`:
    - `replace(userId, p: { symbol; direction; entryPrice; orderIds; prices }): Promise<void>`
    - `remove(userId, symbol, direction): Promise<void>`
    - `activeKeys(userId): Promise<Set<string>>` — ключи вида `символ:сторона`
    - `activeUsers(): Promise<string[]>`
    - `activeOf(userId): Promise<FollowPlan[]>`
    - `update(id, data): Promise<boolean>`

- [ ] **Step 1: Тест правила**

`follow-rule.spec.ts`:

```ts
import { crossed, followTarget } from './follow-rule';

describe('followTarget — правило бектеста', () => {
  it('первый тейк — стоп в безубыток, следующий — на предыдущий тейк', () => {
    expect(followTarget('long', 60_000, [61_000], 59_000)).toBe(60_000);
    expect(followTarget('long', 60_000, [61_000, 62_000], 60_000)).toBe(61_000);
    expect(followTarget('short', 60_000, [59_000], 61_000)).toBe(60_000);
    expect(followTarget('short', 60_000, [59_000, 58_000], 60_000)).toBe(59_000);
  });

  it('стопа нет — любая цель теснее', () => {
    expect(followTarget('long', 60_000, [61_000], null)).toBe(60_000);
    expect(followTarget('long', 60_000, [61_000], 0)).toBe(60_000);
  });

  it('не теснее ручного стопа — не ставится', () => {
    expect(followTarget('long', 60_000, [61_000], 60_500)).toBeNull();
    expect(followTarget('short', 60_000, [59_000], 59_500)).toBeNull();
  });

  it('тейки исполнились не по порядку: цель не по свою сторону от цены исполнения — не ставится', () => {
    // лонг: второй исполненный ниже первого — стоп 62 000 оказался бы над ценой 61 500.
    expect(followTarget('long', 60_000, [62_000, 61_500], 60_000)).toBeNull();
  });

  it('ничего не исполнено — цели нет', () => {
    expect(followTarget('long', 60_000, [], null)).toBeNull();
  });
});

describe('crossed', () => {
  it('лонг: цена на стопе или ниже; шорт: на стопе или выше', () => {
    expect(crossed('long', 60_000, 60_000)).toBe(true);
    expect(crossed('long', 60_001, 60_000)).toBe(false);
    expect(crossed('short', 60_000, 60_000)).toBe(true);
    expect(crossed('short', 59_999, 60_000)).toBe(false);
  });
});
```

- [ ] **Step 2: Прогнать — падает** (`npx jest src/terminal/stream/follow-rule.spec.ts` — модуля нет).

- [ ] **Step 3: Правило**

`follow-rule.ts`:

```ts
import { stopOnRightSide } from '../../backtest/backtest-math';
import type { Direction } from '../terminal-math';

/**
 * Цель стопа после исполненного тейка — то же правило, что у бектеста
 * (`BacktestService.followStop`): после первого — вход позиции, после каждого
 * следующего — цена предыдущего исполненного. `fills` — цены исполненных тейков
 * в порядке исполнения.
 *
 * null — не ставить. Цель не по свою сторону от цены только что исполненного
 * тейка (тейки исполнились не по порядку): стоп над ценой лонга закрыл бы
 * остаток сразу. Цель не теснее нынешнего стопа: стоп только подтягивается,
 * поставленный руками тесный не ослабляется.
 */
export function followTarget(
  direction: Direction,
  entryPrice: number,
  fills: readonly number[],
  currentStop: number | null,
): number | null {
  const n = fills.length;
  if (n === 0) return null;
  const target = n >= 2 ? fills[n - 2] : entryPrice;
  if (!stopOnRightSide(direction, fills[n - 1], target)) return null;
  if (currentStop != null && currentStop > 0) {
    const tighter = direction === 'long' ? target > currentStop : target < currentStop;
    if (!tighter) return null;
  }
  return target;
}

/** Цена уже за стопом — стоп сработал бы сразу. */
export const crossed = (direction: Direction, mark: number, stop: number): boolean =>
  direction === 'long' ? mark <= stop : mark >= stop;
```

- [ ] **Step 4: Схема**

```prisma
/// План стопа за тейками на бирже (спека 2026-10-02-terminal-stop-follow-design.md).
/// Создаёт api вместе с сеткой фиксации; ведёт worker по событиям приватного
/// потока. Новая сетка позиции — новая строка с новым id: шаг, начатый по
/// прежней, по id её уже не найдёт и ничего не запишет.
model TerminalStopFollow {
  id         String   @id @default(uuid())
  userId     String
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  symbol     String
  /// long | short
  direction  String
  /// Вход позиции на момент сетки — цель после первого тейка.
  entryPrice Float
  /// Тейки сетки по порядку и их цены.
  orderIds   String[]
  prices     Float[]
  /// Исполненные — в порядке исполнения, и их цены исполнения.
  filled     String[]
  fillPrices Float[]
  /// Снятые: исполниться они уже не могут.
  cancelled  String[]
  /// Стоп, который должен стоять, и стоит ли он уже на бирже.
  target     Float?
  applied    Boolean  @default(true)
  active     Boolean  @default(true)
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@unique([userId, symbol, direction])
  @@index([active, userId])
  @@map("terminal_stop_follows")
}
```

В `User` — `terminalStopFollows TerminalStopFollow[]`. Затем `npx prisma db push --skip-generate` и `npx prisma generate`. EPERM на DLL движка допустим, если `index.d.ts` обновлён: проверить `terminalStopFollow.count()` рантаймом.

- [ ] **Step 5: Стор**

`stop-follow.store.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { Direction } from '../terminal-math';

export interface FollowPlan {
  id: string;
  userId: string;
  symbol: string;
  direction: Direction;
  entryPrice: number;
  orderIds: string[];
  prices: number[];
  filled: string[];
  fillPrices: number[];
  cancelled: string[];
  target: number | null;
  applied: boolean;
  active: boolean;
}

export type FollowUpdate = Partial<Pick<FollowPlan, 'filled' | 'fillPrices' | 'cancelled' | 'target' | 'applied' | 'active'>>;

/** Планы стопа за тейками: `api` заводит и снимает, `worker` ведёт. */
@Injectable()
export class StopFollowStore {
  constructor(private readonly prisma: PrismaService) {}

  /** Сетка с флажком: прежний план позиции заменяется новым — с новым id. */
  async replace(
    userId: string,
    p: { symbol: string; direction: Direction; entryPrice: number; orderIds: string[]; prices: number[] },
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.terminalStopFollow.deleteMany({ where: { userId, symbol: p.symbol, direction: p.direction } }),
      this.prisma.terminalStopFollow.create({ data: { userId, ...p } }),
    ]);
  }

  /** Сетка без флажка: прежние тейки она и так сняла, и вести больше нечего. */
  async remove(userId: string, symbol: string, direction: Direction): Promise<void> {
    await this.prisma.terminalStopFollow.deleteMany({ where: { userId, symbol, direction } });
  }

  /** Позиции с активным планом — ключ `символ:сторона`, для флажка на экране. */
  async activeKeys(userId: string): Promise<Set<string>> {
    const rows = await this.prisma.terminalStopFollow.findMany({
      where: { userId, active: true },
      select: { symbol: true, direction: true },
    });
    return new Set(rows.map((r) => `${r.symbol}:${r.direction}`));
  }

  /** Кому поток держит соединение и без открытого экрана. */
  async activeUsers(): Promise<string[]> {
    const rows = await this.prisma.terminalStopFollow.findMany({
      where: { active: true },
      select: { userId: true },
      distinct: ['userId'],
    });
    return rows.map((r) => r.userId);
  }

  async activeOf(userId: string): Promise<FollowPlan[]> {
    const rows = await this.prisma.terminalStopFollow.findMany({ where: { userId, active: true } });
    return rows.map((r) => ({ ...r, direction: r.direction as Direction }));
  }

  /** Запись шага — только в тот же план: заменённый новой сеткой не трогается. false — плана уже нет. */
  async update(id: string, data: FollowUpdate): Promise<boolean> {
    const res = await this.prisma.terminalStopFollow.updateMany({ where: { id }, data });
    return res.count > 0;
  }
}
```

- [ ] **Step 6: Прогнать** — `npx jest src/terminal/stream/follow-rule.spec.ts`: PASS.

---

### Task 2: Шаги переноса в `worker` (`StopFollowService`)

**Files:**
- Create: `backend/src/terminal/stream/stop-follow.service.ts`, `stop-follow.service.spec.ts`

**Interfaces:**
- Consumes: `followTarget`, `crossed`, `StopFollowStore`, `FollowPlan` (Task 1); `StreamState` (stream-state.ts); `BybitTerminalClient.privateGet/privatePost`; `TerminalMarketService.requireInstrument/markPrices`; `TerminalService.closePosition`.
- Produces:
  - `interface StreamContext { creds: BybitCredentials; state(): StreamState | null }`
  - `interface StreamListener { pinned(): Promise<string[]>; onEvent(userId, msg: { topic: string; data: unknown[] }, ctx: StreamContext): void; onSnapshot(userId, ctx): void; onIdle(userId, ctx): void }`
  - `STREAM_LISTENER` — токен DI
  - `class StopFollowService implements StreamListener`

- [ ] **Step 1: Тесты**

`stop-follow.service.spec.ts`:

```ts
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
});
```

- [ ] **Step 2: Прогнать — падает** (модуля нет).

- [ ] **Step 3: Реализация**

`stop-follow.service.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import type { BybitCredentials } from '../../bybit/services/bybit-auth.service';
import { BybitTerminalClient } from '../bybit-terminal.client';
import { roundToTick, toPosition } from '../terminal-math';
import { TerminalMarketService } from '../terminal-market.service';
import { TerminalService } from '../terminal.service';
import { crossed, followTarget } from './follow-rule';
import { StopFollowStore, type FollowPlan, type FollowUpdate } from './stop-follow.store';
import type { StreamState } from './stream-state';

/** Bybit: «стоп и тейк уже такие» — не отказ. */
const LEVELS_NOT_MODIFIED = 34040;
/** Стоп не встал (шлюз занят, биржа отказала) — повтор через столько. */
const RETRY_MS = 10_000;
/** Ордер больше не висит: исполнен — шаг переноса; иначе исполниться уже не может. */
const DONE = new Set(['Filled', 'Cancelled', 'Rejected', 'Deactivated']);

/** Что поток знает о пользователе: ключ и живое состояние счёта (берётся в момент шага). */
export interface StreamContext {
  creds: BybitCredentials;
  state(): StreamState | null;
}

/** Слушатель потока счёта (`TerminalStreamService`). */
export interface StreamListener {
  /** Кому держать соединение и без открытого экрана. */
  pinned(): Promise<string[]>;
  /** Событие, уже применённое к состоянию. */
  onEvent(userId: string, msg: { topic: string; data: unknown[] }, ctx: StreamContext): void;
  /** Снимок: подключение или повторный. */
  onSnapshot(userId: string, ctx: StreamContext): void;
  /** Тик потока для живого соединения. */
  onIdle(userId: string, ctx: StreamContext): void;
}
export const STREAM_LISTENER = Symbol('STREAM_LISTENER');

const positive = (v: unknown): number | null => {
  const n = parseFloat(String(v ?? ''));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Строка позиции плана в состоянии потока, или null — позиции нет. */
function positionOf(state: StreamState | null, plan: FollowPlan): { row: any; stop: number | null } | null {
  for (const row of Object.values(state?.positions ?? {})) {
    const p = toPosition(row);
    if (p && p.symbol === plan.symbol && p.direction === plan.direction) return { row, stop: p.stopLoss };
  }
  return null;
}

/**
 * Стоп за тейками на бирже (спека `2026-10-02-terminal-stop-follow-design.md`),
 * роль `worker`. План заводит `api` вместе с сеткой фиксации; здесь — шаги:
 * исполнился тейк — стоп подтягивается по правилу бектеста (`followTarget`).
 *
 * Шаги одного пользователя идут очередью: два тейка, исполнившиеся подряд, не
 * считают стоп по одному и тому же прочитанному плану. План каждый раз
 * перечитывается из базы, а запись шага идёт по его `id` — заменённый новой
 * сеткой план шаг не тронет.
 */
@Injectable()
export class StopFollowService implements StreamListener {
  private readonly logger = new Logger(StopFollowService.name);
  /** Пользователи с активным планом — по последнему `pinned()`. */
  private planned = new Set<string>();
  /** Когда сверить план пользователя: новый план или не вставший стоп. */
  private readonly due = new Map<string, number>();
  private readonly queues = new Map<string, Promise<void>>();

  constructor(
    private readonly plans: StopFollowStore,
    private readonly bybit: BybitTerminalClient,
    private readonly market: TerminalMarketService,
    private readonly terminal: TerminalService,
  ) {}

  async pinned(): Promise<string[]> {
    const users = await this.plans.activeUsers();
    const next = new Set(users);
    // План, о котором поток узнал только сейчас, сверяется сразу: тейк мог
    // исполниться между сеткой и этим тиком.
    for (const id of next) if (!this.planned.has(id)) this.due.set(id, 0);
    this.planned = next;
    return users;
  }

  onEvent(userId: string, msg: { topic: string; data: unknown[] }, ctx: StreamContext): void {
    if (!this.planned.has(userId)) return;
    if (msg.topic === 'order.linear') {
      const done = (msg.data as any[]).filter((o) => DONE.has(o?.orderStatus));
      if (done.length > 0) this.enqueue(userId, () => this.onOrders(userId, done, ctx));
    } else if (msg.topic === 'position.linear') {
      this.enqueue(userId, () => this.closeGone(userId, ctx));
    }
  }

  onSnapshot(userId: string, ctx: StreamContext): void {
    if (!this.planned.has(userId)) return;
    this.enqueue(userId, () => this.reconcile(userId, ctx));
  }

  onIdle(userId: string, ctx: StreamContext): void {
    const at = this.due.get(userId);
    if (at == null || Date.now() < at) return;
    this.due.delete(userId);
    this.enqueue(userId, () => this.reconcile(userId, ctx));
  }

  private enqueue(userId: string, op: () => Promise<void>): void {
    const next = (this.queues.get(userId) ?? Promise.resolve())
      .then(op)
      .catch((e: Error) => this.logger.error(`user ${userId}: шаг стопа за тейками упал — ${e.message}`));
    this.queues.set(userId, next);
    void next.then(() => {
      if (this.queues.get(userId) === next) this.queues.delete(userId);
    });
  }

  private async onOrders(userId: string, rows: any[], ctx: StreamContext): Promise<void> {
    for (const plan of await this.plans.activeOf(userId)) {
      const mine = rows.filter((r) => plan.orderIds.includes(String(r.orderId)));
      if (mine.length > 0) await this.advance(plan, mine, ctx);
    }
  }

  /** Исполненные и снятые тейки плана → новая цель → стоп на бирже. */
  private async advance(plan: FollowPlan, rows: any[], ctx: StreamContext): Promise<void> {
    const p = { ...plan };
    let moved = false;
    for (const row of rows) {
      const id = String(row.orderId);
      if (p.filled.includes(id) || p.cancelled.includes(id)) continue;
      if (row.orderStatus !== 'Filled') {
        p.cancelled = [...p.cancelled, id];
        continue;
      }
      const price = positive(row.avgPrice) ?? p.prices[p.orderIds.indexOf(id)];
      p.filled = [...p.filled, id];
      p.fillPrices = [...p.fillPrices, price];
      const current = positionOf(ctx.state(), p)?.stop ?? null;
      // Свою прежнюю цель считаем стоящей, даже если событие о ней ещё в пути.
      const tightest = p.target != null && (current == null || (p.direction === 'long' ? p.target > current : p.target < current)) ? p.target : current;
      const target = followTarget(p.direction, p.entryPrice, p.fillPrices, tightest);
      if (target != null) {
        p.target = target;
        p.applied = false;
        moved = true;
      }
    }
    const saved = await this.save(p, {
      filled: p.filled,
      fillPrices: p.fillPrices,
      cancelled: p.cancelled,
      target: p.target,
      applied: p.applied,
    });
    if (!saved) return;
    if (moved) await this.place(p, ctx);
    await this.finishIfDone(p, ctx);
  }

  /** Поставить цель на бирже — или закрыть остаток, если цена уже за ней. */
  private async place(p: FollowPlan, ctx: StreamContext): Promise<void> {
    const position = positionOf(ctx.state(), p);
    if (!position || p.target == null) return;
    try {
      const mark = (await this.market.markPrices()).get(p.symbol);
      if (mark != null && crossed(p.direction, mark, p.target)) {
        await this.terminal.closePosition(p.userId, { symbol: p.symbol, direction: p.direction, kind: 'market' });
        this.logger.log(`user ${p.userId}: ${p.symbol} ${p.direction} — цена за стопом ${p.target}, остаток закрыт по рынку`);
        p.applied = true;
        p.active = false;
        await this.save(p, { applied: true, active: false });
        return;
      }
      const inst = await this.market.requireInstrument(p.symbol);
      const body: Record<string, string | number | boolean> = {
        category: 'linear',
        symbol: p.symbol,
        positionIdx: Number(position.row.positionIdx) || 0,
        tpslMode: 'Full',
        stopLoss: roundToTick(p.target, inst.tickSize),
      };
      // Что делает пропущенный тейк, Bybit не пишет (`0` его снимает) — передаём
      // нынешний: снять человеку тейк переносом стопа нельзя.
      const take = positive(position.row.takeProfit);
      if (take != null) body.takeProfit = roundToTick(take, inst.tickSize);
      await this.bybit.privatePost(ctx.creds, '/position/trading-stop', body, [LEVELS_NOT_MODIFIED]);
      p.applied = true;
      await this.save(p, { applied: true });
      this.logger.log(`user ${p.userId}: ${p.symbol} ${p.direction} — стоп за тейками на ${p.target}`);
    } catch (e) {
      this.logger.warn(`user ${p.userId}: стоп за тейками не встал — ${(e as Error).message}`);
      this.due.set(p.userId, Date.now() + RETRY_MS);
    }
  }

  /**
   * Сверка: после обрыва (событий за него биржа не пришлёт), для нового плана и
   * для не вставшего стопа. Тейк, пропавший из открытых и ещё не учтённый,
   * читается из истории ордеров.
   */
  private async reconcile(userId: string, ctx: StreamContext): Promise<void> {
    const state = ctx.state();
    if (!state) return;
    for (const plan of await this.plans.activeOf(userId)) {
      if (!positionOf(state, plan)) {
        await this.save(plan, { active: false });
        continue;
      }
      const missing = plan.orderIds.filter(
        (id) => !plan.filled.includes(id) && !plan.cancelled.includes(id) && !(id in state.orders),
      );
      const rows: any[] = [];
      for (const orderId of missing) {
        const res = await this.bybit.privateGet(ctx.creds, '/order/history', { category: 'linear', orderId });
        const row = res.list?.[0];
        if (row && DONE.has(row.orderStatus)) rows.push(row);
      }
      rows.sort((a, b) => Number(a.updatedTime) - Number(b.updatedTime));
      if (rows.length > 0) {
        await this.advance(plan, rows, ctx);
      } else {
        if (!plan.applied) await this.place(plan, ctx);
        await this.finishIfDone(plan, ctx);
      }
    }
  }

  private async closeGone(userId: string, ctx: StreamContext): Promise<void> {
    for (const plan of await this.plans.activeOf(userId)) {
      if (!positionOf(ctx.state(), plan)) await this.save(plan, { active: false });
    }
  }

  /** Позиции нет — или ни один тейк уже не исполнится, а цель стоит. */
  private async finishIfDone(p: FollowPlan, ctx: StreamContext): Promise<void> {
    if (!p.active) return;
    const live = p.orderIds.some((id) => !p.filled.includes(id) && !p.cancelled.includes(id));
    if (!positionOf(ctx.state(), p) || (!live && p.applied)) await this.save(p, { active: false });
  }

  private async save(p: FollowPlan, data: FollowUpdate): Promise<boolean> {
    Object.assign(p, data);
    return this.plans.update(p.id, data);
  }
}
```

- [ ] **Step 4: Прогнать** — `npx jest src/terminal/stream/stop-follow.service.spec.ts`: PASS.

**Контрольная точка ревью (A):** Task 1–3 одним пакетом, после Task 3.

---

### Task 3: Поток держит соединение тем, у кого план, и кормит слушателя

**Files:**
- Modify: `backend/src/terminal/stream/terminal-stream.service.ts`
- Modify: `backend/src/terminal/stream/terminal-stream.service.spec.ts`

**Interfaces:**
- Consumes: `StreamListener`, `STREAM_LISTENER`, `StreamContext` (Task 2).

- [ ] **Step 1: Тесты** (в `terminal-stream.service.spec.ts`):
  - в `setup` — необязательный `listener` пятым аргументом конструктора;
  - тест: пользователь из `pinned()` получает соединение без спроса экрана;
  - тест: после снимка `onSnapshot`, на событии живого — `onEvent`, на тике живого — `onIdle`; `ctx.state()` — живое состояние потока;
  - тест: упавший `pinned()` не роняет тик (соединения по спросу экрана есть).

```ts
  it('план стопа держит соединение без открытого экрана и получает события', async () => {
    const listener = {
      pinned: jest.fn(async () => ['u9']),
      onEvent: jest.fn(),
      onSnapshot: jest.fn(),
      onIdle: jest.fn(),
    };
    const t = setup({ wanted: [], listener });
    await t.service.tick();
    expect(t.opened).toHaveLength(1);

    t.opened[0].h.onReady();
    await settle();
    expect(listener.onSnapshot).toHaveBeenCalledWith('u9', expect.anything());
    const ctx = listener.onSnapshot.mock.calls[0][1];
    expect(ctx.state().wallet.walletBalance).toBe(1000);

    t.opened[0].h.onTopic({ topic: 'order.linear', data: [] });
    expect(listener.onEvent).toHaveBeenCalledWith('u9', { topic: 'order.linear', data: [] }, expect.anything());

    await t.service.tick();
    expect(listener.onIdle).toHaveBeenCalledWith('u9', expect.anything());
  });

  it('упавший список планов не роняет тик', async () => {
    const listener = { pinned: jest.fn(async () => { throw new Error('db'); }), onEvent: jest.fn(), onSnapshot: jest.fn(), onIdle: jest.fn() };
    const t = setup({ wanted: ['u1'], listener });
    await t.service.tick();
    expect(t.opened).toHaveLength(1);
  });
```

- [ ] **Step 2: Реализация**
  - Конструктор — пятым параметром `@Optional() @Inject(STREAM_LISTENER) private readonly listener?: StreamListener`.
  - `tick()`:
    - `const pinned = await this.listener?.pinned().catch((e) => { log; return []; }) ?? []`;
    - `wanted` = спрос экрана ∪ `pinned`;
    - после цикла `ensure` — `onIdle(userId, ctx)` каждому живому потоку.
  - `snapshot()` — после записи состояния `this.listener?.onSnapshot(s.userId, this.context(s))`.
  - `onTopic()` — когда событие применено и поток живой: `this.listener?.onEvent(s.userId, msg, this.context(s))`.
  - `private context(s: Stream): StreamContext { return { creds: s.creds, state: () => s.state }; }`
  - Вызовы слушателя — в `try/catch`: слушатель не должен ронять поток.

- [ ] **Step 3: Прогнать** — `npx jest src/terminal/stream`: PASS.

---

### Task 4: `api` — план в сетке фиксации и флажок в счёте

**Files:**
- Modify: `backend/src/terminal/dto/terminal.dto.ts` — `CloseGridDto.follow?: boolean`
- Modify: `backend/src/terminal/terminal-errors.ts` — `followNotSaved()`
- Modify: `backend/src/terminal/terminal-math.ts` — `TerminalPosition.follow?: boolean`
- Modify: `backend/src/terminal/terminal.service.ts` — `closeGrid`, `state`, конструктор (седьмой параметр `StopFollowStore`)
- Modify: `backend/src/terminal/terminal.module.ts` — `StopFollowStore`, `StopFollowService`, `{ provide: STREAM_LISTENER, useExisting: StopFollowService }`
- Modify: `backend/src/terminal/terminal.service.spec.ts`
- Modify: `frontend/src/shared/i18n/messages/{ru,en}.json` — `TERMINAL_FOLLOW_NOT_SAVED` рядом с `TERMINAL_GRID_PARTIAL`

- [ ] **Step 1: Тесты** (`terminal.service.spec.ts`, `describe('closeGrid')` и `describe('state')`):
  - в `setup`: `follows = { replace: jest.fn(), remove: jest.fn(), activeKeys: jest.fn(async () => new Set(s.follow ?? [])) }`, седьмым аргументом; `privatePost` на `/order/create` возвращает `{ orderId: 'o-N' }`, как сейчас;
  - сетка с `follow: true` → `replace('u1', { symbol, direction, entryPrice: 60000, orderIds: [...], prices: [...] })`;
  - без флажка → `remove('u1', 'BTCUSDT', 'long')`;
  - частичная сетка с флажком → `replace` с выставленными, затем `TERMINAL_GRID_PARTIAL`;
  - `replace` упал → `TERMINAL_FOLLOW_NOT_SAVED`;
  - `state`: у позиции с активным планом `follow: true`, без — `false`; пустой список позиций в базу не ходит.

- [ ] **Step 2: Реализация**

`terminal.dto.ts`, в `CloseGridDto`:

```ts
  // Стоп за тейками: после первого тейка — в безубыток, дальше — на предыдущий (ведёт worker).
  @IsOptional()
  @IsBoolean()
  follow?: boolean;
```

`terminal-errors.ts`:

```ts
/** Сетка встала, а план переноса стопа не записан: человек должен знать, что стоп сам не поедет. */
export const followNotSaved = () =>
  new ServiceUnavailableException({
    message: 'Сетка выставлена, но перенос стопа за тейками не включился. Откройте окно сетки ещё раз.',
    code: 'TERMINAL_FOLLOW_NOT_SAVED',
  });
```

`closeGrid`: собирать `placed: { id: string; price: number }[]` из ответов `/order/create` (`String(result.orderId)`), и перед `gridPartial` и перед успешным `return` — `await this.recordFollow(userId, dto, row, placed)`:

```ts
  /**
   * План переноса стопа — после того, как тейки встали: в нём их `orderId`. Сетка
   * без флажка план снимает. Не записался — сетка уже на бирже, поэтому отказ
   * говорит именно это, а не «ошибка сетки».
   */
  private async recordFollow(userId: string, dto: CloseGridDto, row: any, placed: { id: string; price: number }[]) {
    try {
      if (dto.follow && placed.length > 0) {
        await this.follows.replace(userId, {
          symbol: dto.symbol,
          direction: dto.direction,
          entryPrice: parseFloat(row.avgPrice),
          orderIds: placed.map((o) => o.id),
          prices: placed.map((o) => o.price),
        });
      } else {
        await this.follows.remove(userId, dto.symbol, dto.direction);
      }
    } catch (e) {
      this.logger.error(`user ${userId}: план стопа за тейками не записан — ${(e as Error).message}`);
      if (dto.follow) throw followNotSaved();
    }
  }
```

`state`:

```ts
    const base = streamed ?? (await this.states.get(userId, this.bybit.writeVersion(creds.apiKey), () => this.readState(creds)));
    return this.withFollow(userId, base);
```

```ts
  /** Флажок «стоп за тейками» у позиций с активным планом — по нему окно сетки открывается с ним. */
  private async withFollow(userId: string, state: TerminalState): Promise<TerminalState> {
    if (state.positions.length === 0) return state;
    const keys = await this.follows.activeKeys(userId).catch(() => null);
    if (!keys) return state;
    return { ...state, positions: state.positions.map((p) => ({ ...p, follow: keys.has(`${p.symbol}:${p.direction}`) })) };
  }
```

- [ ] **Step 3: Прогнать** — `npx jest src/terminal`: PASS.

---

### Task 5: Фронт и документация

**Files:**
- Modify: `frontend/src/views/terminal/api/types.ts` — `TerminalPosition.follow?: boolean`
- Modify: `frontend/src/views/terminal/lib/adapt.ts` — `stopFollow: p.follow ?? false`
- Modify: `frontend/src/views/terminal/model/useExchangeActions.ts` — `closeGrid` шлёт `follow: v.stopFollow`
- Modify: `frontend/src/views/terminal/components/TerminalScreen.tsx` — убрать `canFollow={false}`
- Modify: `frontend/src/widgets/backtest-session/components/SessionScreen.tsx`, `CloseGridModal.tsx` — убрать проп `canFollow` (флажок есть всегда)
- Modify: `frontend/src/shared/i18n/messages/{ru,en}.json` — убрать `closeGridNoFollow`
- Modify: `CLAUDE.md` — пункты про `canFollow={false}` и «сетка фиксации… без стопа за тейками»

- [ ] **Step 1:** правки по списку.
- [ ] **Step 2:** `npx tsc --noEmit`, `npx eslint` по изменённым, `npx vitest run src/views/terminal src/widgets/backtest-session` (из `frontend/`), `npx next build`.
- [ ] **Step 3:** бэк целиком — `npx jest` и `npx tsc --noEmit -p tsconfig.build.json`.

**Контрольная точка ревью (B):** Task 4–5 одним пакетом. Фокус — контракт `follow` бэк↔фронт, окно сетки в трёх терминалах, документация.

---

### Живой прогон

Живым ключом — владелец. Лонг минимальным размером, сетка из двух тейков рядом с ценой и с флажком. Закрыть вкладку. Когда исполнится первый тейк, стоп должен встать в безубыток: видно на бирже и при следующем открытии терминала.
