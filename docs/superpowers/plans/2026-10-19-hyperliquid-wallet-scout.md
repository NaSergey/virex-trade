# Бот отбора кошельков Hyperliquid — план

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** фоновый бот находит кошельки Hyperliquid, стабильно торгующие в плюс, и показывает их владельцу на поддомене `admin.trade-play.com` вместе со страницей «Пользователи».

**Architecture:** `worker` раз в 6 часов берёт лидерборд Hyperliquid, отбирает кандидатов и непрерывно разбирает их перп-кривую PnL (`portfolio`) чистой функцией `analyzePortfolio`; итог — строки `hl_wallets`. `api` отдаёт таблицу, сохранённые и живые позиции сохранённых (`clearinghouseState`). Все запросы к `api.hyperliquid.xyz` — через весовой шлюз `hlInfo`. Фронт — тот же Next: `proxy.ts` по `Host: admin.*` переписывает адреса в `app/admin/*`.

**Tech Stack:** NestJS + Prisma (Postgres), jest; Next 16 App Router, react-query, next-intl, vitest.

Спека: `docs/superpowers/specs/2026-10-19-hyperliquid-wallet-scout-design.md`.

## Global Constraints

- Баланс кандидата — не меньше $10 000; кандидат: `allTime.pnl > 0`, `month.pnl > 0`, `month.vlm > 0`.
- Пороги: недель ≥ 8, недель с движением ≥ 8, доля прибыльных ≥ 60 %, лучшая неделя ≤ 35 % прибыли горизонта, просадка ≤ 40 %, PnL > 0 за 30 д / 90 д / горизонт / всё время; горизонт 26 недель.
- Прибыль — перповые окна (`perpAllTime`, `perpMonth`); баланс и база просадки/ROI — общие (`allTime`, `month` `accountValueHistory`).
- Шлюз: окно 60 с по весу; доля `worker` 700, `api` 200, `games` 0, `all` 900; 429 — пауза 60 с; `clearinghouseState` вес 2, `portfolio` 20.
- Живой: `volumeWeek > 0` или `openPositions > 0`.
- Отбор раз в 6 ч (по `max(seenAt)`), повторный разбор кошелька не чаще 90 мин.
- Ссылка на профиль: `https://hyperdash.info/trader/<адрес>`.
- Тексты — в `ru.json` и `en.json` одновременно (тест сверяет ключи). Повторяющиеся элементы — только `shared/ui`.
- Ответы и комментарии — по-русски, стиль комментариев — «почему», как в соседнем коде.

## Порядок и ревью (гибрид)

Код — инлайн, тесты — TDD на чистых функциях. Контрольные точки ревью (Sonnet):
**R1** после задач 1–3 (класс A: внешний лимит, фоновый сервис, транзакция отбора),
**R2** после задач 4–6 (класс A/B: гейт поддомена и вход, контракт бэк↔фронт). Задача 7 — механика, без ревью.
Финального Opus нет: точек две, стык бэк↔фронт входит в R2.

---

### Task 1: шлюз Hyperliquid

**Files:**
- Create: `backend/src/hyperliquid/hl-gate.ts`
- Test: `backend/src/hyperliquid/hl-gate.spec.ts`

**Interfaces:**
- Produces: `hlInfo<T>(body: { type: string; [k: string]: unknown }, weight: number): Promise<T>`, `hlPausedFor(): number`, `fetchLeaderboard(): Promise<unknown>`, `WEIGHT = { clearinghouseState: 2, portfolio: 20 }`, `class HlGate`, `BUDGET`, `WINDOW_MS`, `PAUSE_MS`, `HL_INFO`, `HL_LEADERBOARD`. Ошибки — `ServiceUnavailableException` с `code` `HL_BUSY` | `HL_PAUSED` | `HL_FAILED`.

- [ ] **Step 1: тест**

```ts
import { ServiceUnavailableException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { HlGate, PAUSE_MS, WINDOW_MS } from './hl-gate';

function makeGate(budget: number, maxWaitMs = 120_000, status = 200) {
  let t = 1_000_000;
  const send = jest.fn().mockImplementation(async () => new Response('{"ok":1}', { status }));
  const gate = new HlGate({
    budget,
    maxWaitMs,
    now: () => t,
    sleep: async (ms) => {
      t += ms;
    },
    fetch: send as never,
  });
  return { gate, send, advance: (ms: number) => (t += ms), now: () => t };
}

const codeOf = (e: unknown) => ((e as ServiceUnavailableException).getResponse() as { code: string }).code;

describe('HlGate — вес в окне', () => {
  it('в пределах бюджета уходит сразу и разбирает JSON', async () => {
    const { gate, send, now } = makeGate(40);
    const start = now();
    const res = await gate.info({ type: 'portfolio', user: '0x1' }, 20);
    await gate.info({ type: 'portfolio', user: '0x2' }, 20);
    expect(res).toEqual({ ok: 1 });
    expect(send).toHaveBeenCalledTimes(2);
    expect(now()).toBe(start);
  });

  it('сверх бюджета ждёт, пока вес старейшего не выйдет из окна', async () => {
    const { gate, now, advance } = makeGate(40);
    const start = now();
    await gate.info({ type: 'portfolio' }, 20);
    advance(10_000);
    await gate.info({ type: 'portfolio' }, 20);
    await gate.info({ type: 'clearinghouseState' }, 2);
    expect(now()).toBe(start + WINDOW_MS);
  });

  it('не дождался за свой срок — HL_BUSY без похода в сеть', async () => {
    const { gate, send } = makeGate(20, 1_000);
    await gate.info({ type: 'portfolio' }, 20);
    const err = await gate.info({ type: 'portfolio' }, 20).catch((e) => e);
    expect(codeOf(err)).toBe('HL_BUSY');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('без бюджета — отказ сразу', async () => {
    const { gate, send } = makeGate(0);
    expect(codeOf(await gate.info({ type: 'portfolio' }, 20).catch((e) => e))).toBe('HL_BUSY');
    expect(send).not.toHaveBeenCalled();
  });

  it('429 — пауза процесса: следующие запросы не уходят до её конца', async () => {
    const { gate, send, advance } = makeGate(1000, 120_000, 429);
    expect(codeOf(await gate.info({ type: 'portfolio' }, 20).catch((e) => e))).toBe('HL_PAUSED');
    expect(gate.pausedFor()).toBe(PAUSE_MS);
    expect(codeOf(await gate.info({ type: 'portfolio' }, 20).catch((e) => e))).toBe('HL_PAUSED');
    expect(send).toHaveBeenCalledTimes(1);
    advance(PAUSE_MS);
    expect(gate.pausedFor()).toBe(0);
  });

  it('прочий не-200 — HL_FAILED, без паузы', async () => {
    const { gate } = makeGate(1000, 120_000, 500);
    expect(codeOf(await gate.info({ type: 'portfolio' }, 20).catch((e) => e))).toBe('HL_FAILED');
    expect(gate.pausedFor()).toBe(0);
  });
});

describe('к Hyperliquid — только через шлюз', () => {
  const SRC = path.join(__dirname, '..');
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) walk(full);
      else if (full.endsWith('.ts') && !full.endsWith('.spec.ts')) files.push(full);
    }
  };
  walk(SRC);
  const rel = (f: string) => path.relative(SRC, f).replace(/\\/g, '/');

  it.each(['api.hyperliquid.xyz', 'stats-data.hyperliquid.xyz'])('адрес %s написан только в шлюзе', (host) => {
    const offenders = files
      .filter((f) => fs.readFileSync(f, 'utf8').includes(host))
      .map(rel)
      .filter((f) => f !== 'hyperliquid/hl-gate.ts');
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: прогнать — падает** (`cd backend && npx jest src/hyperliquid`): модуля нет.

- [ ] **Step 3: реализация**

```ts
import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { ROLE, type Role } from '../role';

/**
 * Адреса Hyperliquid — **единственное место в коде, где они написаны**
 * (`hl-gate.spec.ts` проверяет). Лимит считается на IP сервера, и запрос мимо
 * шлюза тратит общий бюджет так, что шлюз этого не видит.
 */
export const HL_INFO = 'https://api.hyperliquid.xyz/info';
/** Лидерборд — CDN статистики, не `info`: в вес лимита не входит. */
export const HL_LEADERBOARD = 'https://stats-data.hyperliquid.xyz/Mainnet/leaderboard';

/**
 * Лимит Hyperliquid: 1200 «веса» в минуту на IP на все REST-запросы
 * (https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/rate-limits-and-user-limits).
 * Вес — по документации: `clearinghouseState` 2, прочие `info` 20.
 */
export const WINDOW_MS = 60_000;
export const WEIGHT = { clearinghouseState: 2, portfolio: 20 } as const;

/**
 * Доля на процесс. В проде `api` и `worker` на одном IP, общего счётчика нет:
 * 700 + 200 < 1200 с запасом. `worker` — бот отбора, ему почти всё; `api` —
 * только позиции сохранённых кошельков владельца. `games` к Hyperliquid не ходит.
 */
export const BUDGET: Record<Role, number> = { api: 200, worker: 700, games: 0, all: 900 };
const MAX_WAIT_MS: Record<Role, number> = { api: 8_000, worker: 120_000, games: 0, all: 30_000 };

/** Срок паузы после 429: документация срока не называет, минута — одно окно. */
export const PAUSE_MS = 60_000;

const fail = (code: 'HL_BUSY' | 'HL_PAUSED' | 'HL_FAILED', message: string) =>
  new ServiceUnavailableException({ message, code });

export interface HlGateDeps {
  budget: number;
  maxWaitMs: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  fetch?: typeof fetch;
}

/**
 * Скользящее окно веса запросов процесса и пауза после 429. Тот же приём, что
 * `BybitGate`, только окно считает не запуски, а их вес. Класс — ради тестов;
 * в продукте он один на процесс (`hlInfo`).
 */
export class HlGate {
  private readonly logger = new Logger('HlGate');
  private readonly sent: { at: number; weight: number }[] = [];
  private pausedUntil = 0;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly send: typeof fetch;

  constructor(private readonly deps: HlGateDeps) {
    this.now = deps.now ?? Date.now;
    this.sleep = deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.send = deps.fetch ?? ((input, init) => fetch(input, init));
  }

  async info<T>(body: { type: string; [k: string]: unknown }, weight: number): Promise<T> {
    await this.acquire(weight);
    const res = await this.send(HL_INFO, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.status === 429) {
      this.trip();
      throw fail('HL_PAUSED', 'Hyperliquid ограничил запросы с сервера — пауза');
    }
    if (!res.ok) throw fail('HL_FAILED', `Hyperliquid ответил ${res.status} на ${body.type}`);
    return (await res.json()) as T;
  }

  /** Сколько миллисекунд ещё стоит пауза; 0 — не стоит. Бот по нему спит. */
  pausedFor(): number {
    return Math.max(0, this.pausedUntil - this.now());
  }

  private async acquire(weight: number): Promise<void> {
    // Вес больше бюджета не поместится никогда, а пустой бюджет не освободится.
    if (this.deps.budget <= 0 || weight > this.deps.budget) throw fail('HL_BUSY', 'Нет бюджета запросов к Hyperliquid');
    const deadline = this.now() + this.deps.maxWaitMs;
    for (;;) {
      const now = this.now();
      if (now < this.pausedUntil) throw fail('HL_PAUSED', 'Hyperliquid ограничил запросы с сервера — пауза');
      while (this.sent.length > 0 && this.sent[0].at <= now - WINDOW_MS) this.sent.shift();
      const used = this.sent.reduce((s, x) => s + x.weight, 0);
      if (used + weight <= this.deps.budget) {
        this.sent.push({ at: now, weight });
        return;
      }
      // Место освобождает выход старейшего запуска из окна; проснувшись,
      // проверяем заново — места может не хватить и после него.
      const wait = this.sent[0].at + WINDOW_MS - now;
      if (now + wait > deadline) throw fail('HL_BUSY', 'Слишком много запросов к Hyperliquid — повторите позже');
      await this.sleep(wait);
    }
  }

  private trip(): void {
    if (this.now() >= this.pausedUntil) {
      this.logger.warn(`Hyperliquid ответил 429 — запросы процесса остановлены на ${PAUSE_MS / 1000} с`);
    }
    this.pausedUntil = this.now() + PAUSE_MS;
  }
}

const gate = new HlGate({ budget: BUDGET[ROLE], maxWaitMs: MAX_WAIT_MS[ROLE] });

/** Любой запрос к `info` Hyperliquid — только так. */
export const hlInfo = <T>(body: { type: string; [k: string]: unknown }, weight: number): Promise<T> =>
  gate.info<T>(body, weight);

export const hlPausedFor = (): number => gate.pausedFor();

/**
 * Лидерборд целиком: ~47 тыс. строк, ~39 МБ. Разбор держит ~140 МБ памяти,
 * пока идёт (лимит `worker` — 768 МБ), — поэтому раз в 6 часов, а не чаще.
 */
export async function fetchLeaderboard(): Promise<unknown> {
  const res = await fetch(HL_LEADERBOARD, { signal: AbortSignal.timeout(180_000) });
  if (!res.ok) throw fail('HL_FAILED', `лидерборд Hyperliquid ответил ${res.status}`);
  return res.json();
}
```

- [ ] **Step 4: прогнать — зелёные** (`npx jest src/hyperliquid`).

---

### Task 2: чистая логика отбора

**Files:**
- Create: `backend/src/hl-scout/hl-types.ts`, `criteria.ts`, `candidates.ts`, `stability.ts`, `positions.ts`
- Test: `backend/src/hl-scout/candidates.spec.ts`, `stability.spec.ts`, `positions.spec.ts`

**Interfaces:**
- Produces:
  - `type Point = [number, string]`; `interface PortfolioWindow { accountValueHistory: Point[]; pnlHistory: Point[]; vlm: string }`; `type Portfolio = [string, PortfolioWindow][]`; `interface LeaderboardRow`; `interface ClearinghouseState`.
  - `pickCandidates(rows: LeaderboardRow[]): Candidate[]` (`Candidate = { address: string; volumeWeek: number }`), `volumesOf(rows): Map<string, number>`.
  - `analyzePortfolio(pf: Portfolio, now: number): { stats: WalletStats; reason: RejectReason | null }`; `WalletStats = { accountValue, pnlWeek, pnlMonth, pnl90, pnlAllTime, roiMonth: number | null, weeks, weeksMoving, weeksUp, bestWeekShare: number | null, maxDrawdown }`; `RejectReason = 'noData' | 'history' | 'trading' | 'pnlAllTime' | 'pnlHorizon' | 'pnl90' | 'pnlMonth' | 'weeksUp' | 'oneSpike' | 'drawdown'`; helpers `toSeries`, `valueAt`, `stitch`.
  - `positionsOf(address: string, state: ClearinghouseState): HlPosition[]`, `HlPosition = { address, coin, side: 'long' | 'short', size, notional, entryPx: number | null, markPx: number | null, unrealizedPnl, leverage, liquidationPx: number | null }`.

- [ ] **Step 1: типы и пороги**

`hl-types.ts`:

```ts
/** Ответы Hyperliquid — ровно те поля, что читает бот (проверены живыми запросами 2026-10-19). */
export type Point = [number, string];

export interface PortfolioWindow {
  accountValueHistory: Point[];
  pnlHistory: Point[];
  vlm: string;
}

/** `type: portfolio` — пары [окно, данные]: day, week, month, allTime и их perp*. */
export type Portfolio = [string, PortfolioWindow][];

export interface LeaderboardRow {
  ethAddress: string;
  accountValue: string;
  windowPerformances: [string, { pnl: string; roi: string; vlm: string }][];
  displayName: string | null;
}

export interface ClearinghouseState {
  assetPositions: {
    position: {
      coin: string;
      szi: string;
      entryPx: string | null;
      positionValue: string;
      unrealizedPnl: string;
      leverage: { type: string; value: number };
      liquidationPx: string | null;
    };
  }[];
}
```

`criteria.ts`:

```ts
/**
 * Пороги отбора — одно место. Подобраны на 60 случайных кандидатах лидерборда
 * 2026-10-19: проходит ~7 %, то есть ~200–250 кошельков из ~3,7 тыс.
 * Спека — docs/superpowers/specs/2026-10-19-hyperliquid-wallet-scout-design.md.
 */
export const MIN_ACCOUNT_VALUE = 10_000;
/** Горизонт разбора кривой — полгода; старше — уже другой рынок. */
export const HORIZON_WEEKS = 26;
export const MIN_WEEKS = 8;
/** Недель, где кривая сдвинулась: без торговли «стабильность» ничего не значит. */
export const MIN_MOVING_WEEKS = 8;
export const MIN_UP_SHARE = 0.6;
/** Лучшая неделя — не больше этой доли прибыли за горизонт: иначе это один рывок. */
export const MAX_BEST_WEEK_SHARE = 0.35;
/** Падение кривой от пика к балансу на пике. */
export const MAX_DRAWDOWN = 0.4;
/** Отбор кандидатов из лидерборда. */
export const DISCOVER_EVERY_MS = 6 * 3600_000;
/** Повторный разбор кошелька. */
export const REANALYZE_MS = 90 * 60_000;
```

- [ ] **Step 2: тесты `candidates.spec.ts`**

```ts
import { pickCandidates, volumesOf } from './candidates';
import type { LeaderboardRow } from './hl-types';

const row = (o: { addr?: string; av?: number; all?: number; month?: number; mvlm?: number; wvlm?: number }): LeaderboardRow => ({
  ethAddress: o.addr ?? '0xAbC0000000000000000000000000000000000001',
  accountValue: String(o.av ?? 50_000),
  displayName: null,
  windowPerformances: [
    ['day', { pnl: '0', roi: '0', vlm: '0' }],
    ['week', { pnl: '0', roi: '0', vlm: String(o.wvlm ?? 1000) }],
    ['month', { pnl: String(o.month ?? 100), roi: '0', vlm: String(o.mvlm ?? 5000) }],
    ['allTime', { pnl: String(o.all ?? 1000), roi: '0', vlm: '1' }],
  ],
});

describe('pickCandidates', () => {
  it('берёт кошелёк в плюсе за месяц и всё время, с оборотом и балансом от $10k; адрес — в нижнем регистре', () => {
    expect(pickCandidates([row({})])).toEqual([
      { address: '0xabc0000000000000000000000000000000000001', volumeWeek: 1000 },
    ]);
  });

  it.each([
    ['баланс меньше $10k', { av: 9_999 }],
    ['минус за всё время', { all: -1 }],
    ['минус за месяц', { month: 0 }],
    ['без оборота за месяц', { mvlm: 0 }],
    ['не адрес', { addr: 'vault' }],
  ])('отбрасывает: %s', (_, o) => {
    expect(pickCandidates([row(o)])).toEqual([]);
  });

  it('volumesOf — оборот за 7 дней по адресу у всех строк, не только у кандидатов', () => {
    const m = volumesOf([row({ av: 1, wvlm: 77 })]);
    expect(m.get('0xabc0000000000000000000000000000000000001')).toBe(77);
  });
});
```

- [ ] **Step 3: `candidates.ts`**

```ts
import { MIN_ACCOUNT_VALUE } from './criteria';
import type { LeaderboardRow } from './hl-types';

export interface Candidate {
  address: string;
  volumeWeek: number;
}

const ADDRESS = /^0x[0-9a-f]{40}$/;

function windowOf(row: LeaderboardRow, name: string) {
  const w = row.windowPerformances.find(([k]) => k === name)?.[1];
  return { pnl: Number(w?.pnl ?? 0), vlm: Number(w?.vlm ?? 0) };
}

/**
 * Первый, дешёвый отбор — по числам самого лидерборда: в плюсе за всё время и
 * за месяц, торговал в этом месяце, баланс от $10k. Глубже смотрит
 * `analyzePortfolio` — на кошелёк он тратит запрос, на лидерборд — нет.
 */
export function pickCandidates(rows: LeaderboardRow[]): Candidate[] {
  const out: Candidate[] = [];
  for (const row of rows) {
    const address = String(row.ethAddress).toLowerCase();
    if (!ADDRESS.test(address)) continue;
    if (!(Number(row.accountValue) >= MIN_ACCOUNT_VALUE)) continue;
    const month = windowOf(row, 'month');
    if (!(windowOf(row, 'allTime').pnl > 0) || !(month.pnl > 0) || !(month.vlm > 0)) continue;
    out.push({ address, volumeWeek: windowOf(row, 'week').vlm });
  }
  return out;
}

/** Оборот за 7 дней по адресу — сохранённым, выпавшим из кандидатов, тоже нужен «живой». */
export function volumesOf(rows: LeaderboardRow[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const row of rows) m.set(String(row.ethAddress).toLowerCase(), windowOf(row, 'week').vlm);
  return m;
}
```

- [ ] **Step 4: тесты `stability.spec.ts`**

```ts
import { analyzePortfolio, stitch, toSeries, valueAt } from './stability';
import type { Point, Portfolio, PortfolioWindow } from './hl-types';

const DAY = 86_400_000;
const WEEK = 7 * DAY;
const NOW = Date.UTC(2026, 9, 19, 12);

/**
 * Портфель, как его отдаёт Hyperliquid: perpAllTime — редкие точки (шаг `stepAll`
 * дней) за всю историю от 0, perpMonth — каждые 8 ч за 30 дней от 0. Общие
 * окна (allTime, month) несут баланс; их pnl — шум спота, который бот обязан
 * не читать.
 */
function makePortfolio(opts: { days: number; pnl: (t: number) => number; av?: (t: number) => number; stepAll?: number }): Portfolio {
  const av = opts.av ?? (() => 100_000);
  const start = NOW - opts.days * DAY;
  const all: number[] = [];
  for (let t = start; t < NOW; t += (opts.stepAll ?? 2) * DAY) all.push(t);
  all.push(NOW);
  const mStart = Math.max(start, NOW - 30 * DAY);
  const month: number[] = [];
  for (let t = mStart; t < NOW; t += DAY / 3) month.push(t);
  month.push(NOW);
  const base = opts.pnl(start);
  const mBase = opts.pnl(mStart);
  const pts = (ts: number[], f: (t: number) => number): Point[] => ts.map((t) => [t, String(f(t))]);
  const win = (ts: number[], pnl: (t: number) => number): PortfolioWindow => ({
    accountValueHistory: pts(ts, av),
    pnlHistory: pts(ts, pnl),
    vlm: '0',
  });
  const spotNoise = (t: number) => -1e9 * Math.sin(t);
  return [
    ['allTime', win(all, spotNoise)],
    ['month', win(month, spotNoise)],
    ['perpAllTime', win(all, (t) => opts.pnl(t) - base)],
    ['perpMonth', win(month, (t) => opts.pnl(t) - mBase)],
  ];
}

/** Кривая по неделям: `weekly[k]` — прибыль недели, k = 0 — самая старая. */
const byWeeks = (days: number, weekly: (k: number) => number) => (t: number) => {
  const start = NOW - days * DAY;
  const k = Math.floor((t - start) / WEEK);
  let v = 0;
  for (let i = 0; i < k; i++) v += weekly(i);
  return v + weekly(k) * (((t - start) % WEEK) / WEEK);
};

describe('ряды', () => {
  it('valueAt — ступенькой: последняя точка не позже t', () => {
    const s = toSeries([[10, '1'], [20, '5']]);
    expect(valueAt(s, 9)).toBeNull();
    expect(valueAt(s, 15)).toBe(1);
    expect(valueAt(s, 20)).toBe(5);
  });

  it('stitch — свежий ряд встаёт на уровень старого в точке стыка', () => {
    const all = toSeries([[0, '0'], [100, '50'], [200, '80']]);
    const recent = toSeries([[150, '0'], [200, '30']]);
    expect(stitch(all, recent, true)).toEqual([[0, 0], [100, 50], [150, 50], [200, 80]]);
    expect(stitch(all, recent, false)).toEqual([[0, 0], [100, 50], [150, 0], [200, 30]]);
  });
});

describe('analyzePortfolio', () => {
  it('ровный рост проходит; спотовый шум общих окон не читается', () => {
    const { stats, reason } = analyzePortfolio(makePortfolio({ days: 210, pnl: byWeeks(210, () => 1000) }), NOW);
    expect(reason).toBeNull();
    expect(stats.weeks).toBe(26);
    expect(stats.weeksUp).toBe(26);
    expect(stats.weeksMoving).toBe(26);
    // Старые точки — через 2 дня, границы недель между ними: неделя вбирает
    // 6 или 8 дней роста, поэтому доля лучшей — около 1/26, а не ровно.
    expect(stats.bestWeekShare).toBeLessThan(0.06);
    expect(stats.maxDrawdown).toBe(0);
    expect(stats.pnlMonth).toBeCloseTo((1000 * 30) / 7, 0);
    expect(stats.pnlAllTime).toBeCloseTo(30_000, 0);
    expect(stats.roiMonth).toBeCloseTo((1000 * 30) / 7 / 100_000, 3);
    expect(stats.accountValue).toBe(100_000);
  });

  it('короткая история — «мало истории»', () => {
    expect(analyzePortfolio(makePortfolio({ days: 40, pnl: byWeeks(40, () => 1000) }), NOW).reason).toBe('history');
  });

  it('кривая стоит — «мало торговли»', () => {
    const pnl = byWeeks(210, (k) => (k % 5 === 0 ? 1000 : 0));
    expect(analyzePortfolio(makePortfolio({ days: 210, pnl }), NOW).reason).toBe('trading');
  });

  it('половина недель в минус — отказ по доле прибыльных', () => {
    const pnl = byWeeks(210, (k) => (k % 2 ? 300 : -100));
    expect(analyzePortfolio(makePortfolio({ days: 210, pnl }), NOW).reason).toBe('weeksUp');
  });

  it('прибыль из одного рывка — «oneSpike»', () => {
    const pnl = byWeeks(210, (k) => (k === 15 ? 20_000 : k % 4 === 0 ? -50 : 100));
    expect(analyzePortfolio(makePortfolio({ days: 210, pnl }), NOW).reason).toBe('oneSpike');
  });

  it('глубокая просадка от пика — «drawdown»', () => {
    const pnl = byWeeks(210, (k) => (k === 8 ? -45_000 : 5000));
    const { stats, reason } = analyzePortfolio(makePortfolio({ days: 210, pnl }), NOW);
    expect(reason).toBe('drawdown');
    // Дно меряется по точкам через 2 дня: −45 000 + рост следующего дня.
    expect(stats.maxDrawdown).toBeGreaterThan(0.43);
    expect(stats.maxDrawdown).toBeLessThan(0.46);
  });

  it('минус за последний месяц — «pnlMonth»', () => {
    const pnl = byWeeks(210, (k) => (k >= 26 ? -2000 : 3000));
    expect(analyzePortfolio(makePortfolio({ days: 210, pnl }), NOW).reason).toBe('pnlMonth');
  });

  it('пустой портфель — «noData»', () => {
    expect(analyzePortfolio([], NOW).reason).toBe('noData');
  });
});
```

- [ ] **Step 5: прогнать — падают** (`npx jest src/hl-scout`).

- [ ] **Step 6: `stability.ts`**

```ts
import {
  HORIZON_WEEKS,
  MAX_BEST_WEEK_SHARE,
  MAX_DRAWDOWN,
  MIN_MOVING_WEEKS,
  MIN_UP_SHARE,
  MIN_WEEKS,
} from './criteria';
import type { Point, Portfolio } from './hl-types';

const DAY = 86_400_000;
const WEEK = 7 * DAY;
/** Неделя «сдвинулась», если кривая ушла больше чем на цент. */
const EPS = 0.01;

export type Series = [number, number][];

export type RejectReason =
  | 'noData'
  | 'history'
  | 'trading'
  | 'pnlAllTime'
  | 'pnlHorizon'
  | 'pnl90'
  | 'pnlMonth'
  | 'weeksUp'
  | 'oneSpike'
  | 'drawdown';

export interface WalletStats {
  accountValue: number;
  pnlWeek: number;
  pnlMonth: number;
  pnl90: number;
  pnlAllTime: number;
  roiMonth: number | null;
  weeks: number;
  weeksMoving: number;
  weeksUp: number;
  bestWeekShare: number | null;
  maxDrawdown: number;
}

export function toSeries(points: Point[] | undefined): Series {
  return (points ?? [])
    .map(([t, v]) => [Number(t), Number(v)] as [number, number])
    .filter(([t, v]) => Number.isFinite(t) && Number.isFinite(v))
    .sort((a, b) => a[0] - b[0]);
}

/**
 * Значение в момент t — последняя точка не позже t. Ступенькой, без
 * интерполяции: у старой истории Hyperliquid шаг до ~10 дней, и прямая между
 * точками раскрасила бы недели без единой точки ровным ростом — стабильность
 * вышла бы выдуманной.
 */
export function valueAt(s: Series, t: number): number | null {
  let lo = 0;
  let hi = s.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (s[mid][0] <= t) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found < 0 ? null : s[found][1];
}

/**
 * Старая история редкая, последний месяц — с шагом ~8 ч: берём точки всей
 * истории до начала месяца и месяц целиком. Окна PnL у Hyperliquid начинаются
 * с нуля, поэтому месяц встаёт на уровень всей истории в точке стыка
 * (`offset`); баланс — абсолютная величина, его не сдвигают.
 */
export function stitch(all: Series, recent: Series, offset: boolean): Series {
  if (recent.length === 0) return all;
  const [t0, v0] = recent[0];
  const shift = offset ? (valueAt(all, t0) ?? v0) - v0 : 0;
  return [...all.filter(([t]) => t < t0), ...recent.map(([t, v]) => [t, v + shift] as [number, number])];
}

function windowsOf(pf: Portfolio) {
  return new Map(Array.isArray(pf) ? pf : []);
}

/**
 * Стабилен ли кошелёк — по кривой перп-PnL, а не по сделкам (решение владельца:
 * смотрим на прибыль и убыток). Перповые окна, потому что общие включают
 * переоценку спотовых монет: держатель HYPE уходит на сотни миллионов в минус и
 * обратно, не торгуя. Баланс — общий: перп-счёт у многих почти пуст.
 */
export function analyzePortfolio(pf: Portfolio, now: number): { stats: WalletStats; reason: RejectReason | null } {
  const w = windowsOf(pf);
  const pnl = stitch(toSeries(w.get('perpAllTime')?.pnlHistory), toSeries(w.get('perpMonth')?.pnlHistory), true);
  const av = stitch(
    toSeries(w.get('allTime')?.accountValueHistory),
    toSeries(w.get('month')?.accountValueHistory),
    false,
  );

  const empty: WalletStats = {
    accountValue: av.length ? av[av.length - 1][1] : 0,
    pnlWeek: 0,
    pnlMonth: 0,
    pnl90: 0,
    pnlAllTime: 0,
    roiMonth: null,
    weeks: 0,
    weeksMoving: 0,
    weeksUp: 0,
    bestWeekShare: null,
    maxDrawdown: 0,
  };
  if (pnl.length < 2) return { stats: empty, reason: 'noData' };

  const first = pnl[0][0];
  const startValue = pnl[0][1];
  const last = pnl[pnl.length - 1][1];
  /** Прибыль от момента `from` до конца; история короче окна — вся история. */
  const since = (from: number) => last - (valueAt(pnl, from) ?? startValue);

  const weekly: number[] = [];
  for (let k = 0; k < HORIZON_WEEKS; k++) {
    const end = now - k * WEEK;
    const begin = end - WEEK;
    if (begin < first) break;
    weekly.push((valueAt(pnl, end) ?? startValue) - (valueAt(pnl, begin) ?? startValue));
  }
  const moving = weekly.filter((x) => Math.abs(x) > EPS);
  const weeksUp = moving.filter((x) => x > EPS).length;
  const horizonPnl = weekly.reduce((s, x) => s + x, 0);
  const bestWeekShare = horizonPnl > 0 ? Math.max(0, ...weekly) / horizonPnl : null;

  // Просадка — от пика кривой к балансу в момент пика: пик на маленьком
  // балансе и падение после депозита считаются от того, что было на кону тогда.
  const h0 = weekly.length ? now - weekly.length * WEEK : first;
  let peak = valueAt(pnl, h0) ?? startValue;
  let peakAv = valueAt(av, h0) ?? (av[0]?.[1] ?? 0);
  let maxDrawdown = 0;
  for (const [t, v] of pnl) {
    if (t < h0) continue;
    if (v > peak) {
      peak = v;
      peakAv = valueAt(av, t) ?? peakAv;
    } else if (peakAv > 0) {
      maxDrawdown = Math.max(maxDrawdown, (peak - v) / peakAv);
    }
  }

  // ROI — к среднему балансу за месяц, а не к балансу на начало: депозит
  // посреди месяца не делает ROI тысячей процентов.
  const monthAgo = now - 30 * DAY;
  const monthAv = av.filter(([t]) => t >= monthAgo).map(([, v]) => v);
  const avgAv = monthAv.length ? monthAv.reduce((s, v) => s + v, 0) / monthAv.length : (valueAt(av, now) ?? 0);
  const pnlMonth = since(monthAgo);

  const stats: WalletStats = {
    accountValue: empty.accountValue,
    pnlWeek: since(now - 7 * DAY),
    pnlMonth,
    pnl90: since(now - 90 * DAY),
    pnlAllTime: last - startValue,
    roiMonth: avgAv > 0 ? pnlMonth / avgAv : null,
    weeks: weekly.length,
    weeksMoving: moving.length,
    weeksUp,
    bestWeekShare,
    maxDrawdown,
  };

  const reason: RejectReason | null =
    stats.weeks < MIN_WEEKS
      ? 'history'
      : stats.weeksMoving < MIN_MOVING_WEEKS
        ? 'trading'
        : stats.pnlAllTime <= 0
          ? 'pnlAllTime'
          : horizonPnl <= 0
            ? 'pnlHorizon'
            : stats.pnl90 <= 0
              ? 'pnl90'
              : stats.pnlMonth <= 0
                ? 'pnlMonth'
                : weeksUp / moving.length < MIN_UP_SHARE
                  ? 'weeksUp'
                  : (bestWeekShare ?? 1) > MAX_BEST_WEEK_SHARE
                    ? 'oneSpike'
                    : maxDrawdown > MAX_DRAWDOWN
                      ? 'drawdown'
                      : null;
  return { stats, reason };
}
```

- [ ] **Step 7: тест и реализация `positions.ts`**

```ts
// positions.spec.ts
import { positionsOf } from './positions';

describe('positionsOf', () => {
  it('сторона по знаку размера, цена — стоимость позиции на размер; нулевые пропускаются', () => {
    const out = positionsOf('0xa', {
      assetPositions: [
        { position: { coin: 'BTC', szi: '-0.5', entryPx: '60000', positionValue: '31000', unrealizedPnl: '-1000', leverage: { type: 'cross', value: 10 }, liquidationPx: '80000' } },
        { position: { coin: 'ETH', szi: '0', entryPx: null, positionValue: '0', unrealizedPnl: '0', leverage: { type: 'cross', value: 5 }, liquidationPx: null } },
      ],
    });
    expect(out).toEqual([
      { address: '0xa', coin: 'BTC', side: 'short', size: 0.5, notional: 31000, entryPx: 60000, markPx: 62000, unrealizedPnl: -1000, leverage: 10, liquidationPx: 80000 },
    ]);
  });
});
```

```ts
// positions.ts
import type { ClearinghouseState } from './hl-types';

export interface HlPosition {
  address: string;
  coin: string;
  side: 'long' | 'short';
  size: number;
  notional: number;
  entryPx: number | null;
  /** Своей цены маркировки в ответе нет — стоимость позиции на её размер. */
  markPx: number | null;
  unrealizedPnl: number;
  leverage: number;
  liquidationPx: number | null;
}

const num = (v: string | null | undefined) => (v == null || v === '' ? null : Number(v));

export function positionsOf(address: string, state: ClearinghouseState): HlPosition[] {
  const out: HlPosition[] = [];
  for (const { position: p } of state.assetPositions ?? []) {
    const szi = Number(p.szi);
    if (!szi) continue;
    const notional = Number(p.positionValue);
    out.push({
      address,
      coin: p.coin,
      side: szi > 0 ? 'long' : 'short',
      size: Math.abs(szi),
      notional,
      entryPx: num(p.entryPx),
      markPx: notional ? notional / Math.abs(szi) : null,
      unrealizedPnl: Number(p.unrealizedPnl),
      leverage: p.leverage?.value ?? 0,
      liquidationPx: num(p.liquidationPx),
    });
  }
  return out;
}
```

- [ ] **Step 8: прогнать `npx jest src/hl-scout` — зелёные.**

---

### Task 3: модель, фоновый бот, модуль

**Files:**
- Modify: `backend/prisma/schema.prisma` (модель в конец), `backend/src/app.module.ts`, `backend/src/role.ts` (список сервисов в комментарии)
- Create: `backend/src/hl-scout/hl-scout.service.ts`, `backend/src/hl-scout/hl-scout.module.ts`
- Test: `backend/src/hl-scout/hl-scout.service.spec.ts`

**Interfaces:**
- Consumes: `hlInfo`, `hlPausedFor`, `fetchLeaderboard`, `WEIGHT` (Task 1); `pickCandidates`, `volumesOf`, `analyzePortfolio`, `DISCOVER_EVERY_MS`, `REANALYZE_MS` (Task 2).
- Produces: модель `HlWallet` (`hl_wallets`); `HlScoutService.discoverIfDue(now)`, `.analyzeNext(now): Promise<boolean>`, `.store(candidates, volumes, now)`.

- [ ] **Step 1: модель**

```prisma
/// Кошелёк Hyperliquid в отборе бота (backend/src/hl-scout; спека
/// docs/superpowers/specs/2026-10-19-hyperliquid-wallet-scout-design.md).
/// Владелец один, поэтому «сохранён» — поле кошелька, а не связь с пользователем.
model HlWallet {
  /// Адрес в нижнем регистре.
  address       String    @id
  /// Прошёл последний отбор лидерборда.
  candidate     Boolean   @default(false)
  /// Последний отбор, в котором кошелёк был кандидатом; max — время отбора.
  seenAt        DateTime?
  /// Оборот за 7 дней по лидерборду — признак «живого».
  volumeWeek    Float     @default(0)
  analyzedAt    DateTime?
  qualified     Boolean   @default(false)
  /// Код причины отказа (`RejectReason` в stability.ts); текст — на фронте.
  rejectReason  String?
  accountValue  Float?
  openPositions Int?
  pnlWeek       Float?
  pnlMonth      Float?
  pnl90         Float?
  pnlAllTime    Float?
  roiMonth      Float?
  weeks         Int?
  weeksMoving   Int?
  weeksUp       Int?
  bestWeekShare Float?
  maxDrawdown   Float?
  savedAt       DateTime?
  note          String?

  @@index([candidate, qualified])
  @@index([analyzedAt])
  @@map("hl_wallets")
}
```

Затем `cd backend && npx prisma generate` (если падает EPERM — остановить nest watch, см. память) и `npx prisma db push` на локальную базу.

- [ ] **Step 2: тест сервиса (Prisma и сеть подменены)**

```ts
import { HlScoutService } from './hl-scout.service';
import * as gate from '../hyperliquid/hl-gate';

jest.mock('../hyperliquid/hl-gate', () => ({
  hlInfo: jest.fn(),
  hlPausedFor: jest.fn(() => 0),
  fetchLeaderboard: jest.fn(),
  WEIGHT: { clearinghouseState: 2, portfolio: 20 },
}));

const NOW = Date.UTC(2026, 9, 19, 12);

function makePrisma(over: Record<string, unknown> = {}) {
  return {
    hlWallet: {
      aggregate: jest.fn().mockResolvedValue({ _max: { seenAt: null } }),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      update: jest.fn(),
      ...over,
    },
    $executeRaw: jest.fn().mockResolvedValue(0),
    $transaction: jest.fn().mockImplementation(async (ops: unknown[]) => Promise.all(ops)),
  };
}

const lbRow = (addr: string) => ({
  ethAddress: addr,
  accountValue: '50000',
  displayName: null,
  windowPerformances: [
    ['week', { pnl: '1', roi: '0', vlm: '10' }],
    ['month', { pnl: '1', roi: '0', vlm: '10' }],
    ['allTime', { pnl: '1', roi: '0', vlm: '10' }],
  ],
});

describe('HlScoutService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('отбор не идёт, если прошлый был меньше 6 часов назад', async () => {
    const prisma = makePrisma({ aggregate: jest.fn().mockResolvedValue({ _max: { seenAt: new Date(NOW - 3600_000) } }) });
    await new HlScoutService(prisma as never).discoverIfDue(NOW);
    expect(gate.fetchLeaderboard).not.toHaveBeenCalled();
  });

  it('подозрительно короткий лидерборд не стирает отбор', async () => {
    (gate.fetchLeaderboard as jest.Mock).mockResolvedValue({ leaderboardRows: [lbRow('0x' + '1'.repeat(40))] });
    const prisma = makePrisma();
    await new HlScoutService(prisma as never).discoverIfDue(NOW);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('полный лидерборд — одна транзакция: снять, вставить, удалить лишних', async () => {
    const rows = Array.from({ length: 1500 }, (_, i) => lbRow('0x' + i.toString(16).padStart(40, '0')));
    (gate.fetchLeaderboard as jest.Mock).mockResolvedValue({ leaderboardRows: rows });
    const prisma = makePrisma();
    await new HlScoutService(prisma as never).discoverIfDue(NOW);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.hlWallet.updateMany).toHaveBeenCalledWith({ where: { candidate: true }, data: { candidate: false } });
    expect(prisma.hlWallet.deleteMany).toHaveBeenCalledWith({ where: { candidate: false, savedAt: null } });
  });

  it('разбор пишет вердикт и сдвигает analyzedAt; сбой Hyperliquid тоже сдвигает', async () => {
    const prisma = makePrisma({ findFirst: jest.fn().mockResolvedValue({ address: '0xa' }) });
    (gate.hlInfo as jest.Mock).mockRejectedValueOnce(new Error('boom'));
    const svc = new HlScoutService(prisma as never);
    expect(await svc.analyzeNext(NOW)).toBe(true);
    expect(prisma.hlWallet.updateMany).toHaveBeenCalledWith({ where: { address: '0xa' }, data: { analyzedAt: new Date(NOW) } });
  });

  it('разбирать некого — false', async () => {
    expect(await new HlScoutService(makePrisma() as never).analyzeNext(NOW)).toBe(false);
  });
});
```

- [ ] **Step 3: `hl-scout.service.ts`**

```ts
import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { runsBackgroundJobs } from '../role';
import { fetchLeaderboard, hlInfo, hlPausedFor, WEIGHT } from '../hyperliquid/hl-gate';
import { pickCandidates, volumesOf, type Candidate } from './candidates';
import { analyzePortfolio } from './stability';
import { DISCOVER_EVERY_MS, REANALYZE_MS } from './criteria';
import type { ClearinghouseState, LeaderboardRow, Portfolio } from './hl-types';

const CHECK_EVERY_MS = 10 * 60_000;
const IDLE_MS = 60_000;
/** Лидерборд короче — сбой источника, а не рынок: стирать по нему отбор нельзя. */
const MIN_LEADERBOARD_ROWS = 1000;

/**
 * Бот отбора кошельков Hyperliquid — фоновый сервис `worker`. Спека —
 * docs/superpowers/specs/2026-10-19-hyperliquid-wallet-scout-design.md.
 *
 * Два цикла: отбор кандидатов из лидерборда раз в 6 часов (срок выводится из
 * `max(seenAt)`, а не из памяти: перезапуск не перекачивает 39 МБ) и разбор
 * кривой кошельков по одному, самый давний первым. Темп разбора держит шлюз
 * (`hlInfo`) — свой таймер ему не нужен.
 */
@Injectable()
export class HlScoutService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(HlScoutService.name);
  private stopped = false;

  constructor(private readonly prisma: PrismaService) {}

  onApplicationBootstrap() {
    if (!runsBackgroundJobs()) return;
    void this.loop('отбор', CHECK_EVERY_MS, async () => {
      await this.discoverIfDue(Date.now());
      return false;
    });
    void this.loop('разбор', IDLE_MS, () => this.analyzeNext(Date.now()));
  }

  onModuleDestroy() {
    this.stopped = true;
  }

  /** `step` вернул true — работа есть, сразу следующий шаг; иначе сон `idleMs`. */
  private async loop(name: string, idleMs: number, step: () => Promise<boolean>) {
    while (!this.stopped) {
      let busy = false;
      try {
        const paused = hlPausedFor();
        if (paused > 0) {
          await this.sleep(paused);
          continue;
        }
        busy = await step();
      } catch (e) {
        this.logger.error(`${name} кошельков Hyperliquid упал: ${(e as Error).message}`);
      }
      if (!busy) await this.sleep(idleMs);
    }
  }

  private sleep(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms).unref());
  }

  async discoverIfDue(now: number): Promise<void> {
    const last = await this.prisma.hlWallet.aggregate({ _max: { seenAt: true } });
    const at = last._max.seenAt?.getTime();
    if (at != null && now - at < DISCOVER_EVERY_MS) return;

    const body = (await fetchLeaderboard()) as { leaderboardRows?: LeaderboardRow[] };
    const rows = body?.leaderboardRows ?? [];
    if (rows.length < MIN_LEADERBOARD_ROWS) {
      this.logger.warn(`лидерборд Hyperliquid подозрительно короткий (${rows.length}) — отбор пропущен`);
      return;
    }
    const candidates = pickCandidates(rows);
    await this.store(candidates, volumesOf(rows), now);
    this.logger.log(`отбор Hyperliquid: ${candidates.length} кандидатов из ${rows.length}`);
  }

  /**
   * Одной транзакцией: снять отметку со всех, вставить/обновить кандидатов,
   * удалить не-кандидатов без сохранения. Иначе между шагами таблица владельца
   * на миг показала бы пустоту или вчерашних.
   */
  async store(candidates: Candidate[], volumes: Map<string, number>, now: number): Promise<void> {
    const at = new Date(now);
    const addrs = candidates.map((c) => c.address);
    const vols = candidates.map((c) => c.volumeWeek);
    await this.prisma.$transaction([
      this.prisma.hlWallet.updateMany({ where: { candidate: true }, data: { candidate: false } }),
      this.prisma.$executeRaw`
        INSERT INTO "hl_wallets" ("address", "candidate", "seenAt", "volumeWeek")
        SELECT a, true, ${at}, v FROM unnest(${addrs}::text[], ${vols}::float8[]) AS x(a, v)
        ON CONFLICT ("address") DO UPDATE SET
          "candidate" = true, "seenAt" = EXCLUDED."seenAt", "volumeWeek" = EXCLUDED."volumeWeek"`,
      this.prisma.hlWallet.deleteMany({ where: { candidate: false, savedAt: null } }),
    ]);
    // Сохранённые, выпавшие из кандидатов, — оборот из того же лидерборда:
    // «живой» у них считается так же, как у остальных.
    const saved = await this.prisma.hlWallet.findMany({
      where: { candidate: false, savedAt: { not: null } },
      select: { address: true },
    });
    for (const { address } of saved) {
      await this.prisma.hlWallet.updateMany({ where: { address }, data: { volumeWeek: volumes.get(address) ?? 0 } });
    }
  }

  /** Разобрать самый давний кошелёк. false — разбирать некого. */
  async analyzeNext(now: number): Promise<boolean> {
    const wallet = await this.prisma.hlWallet.findFirst({
      where: {
        OR: [{ candidate: true }, { savedAt: { not: null } }],
        AND: [{ OR: [{ analyzedAt: null }, { analyzedAt: { lt: new Date(now - REANALYZE_MS) } }] }],
      },
      orderBy: { analyzedAt: { sort: 'asc', nulls: 'first' } },
      select: { address: true },
    });
    if (!wallet) return false;
    const { address } = wallet;
    try {
      const [pf, state] = await Promise.all([
        hlInfo<Portfolio>({ type: 'portfolio', user: address }, WEIGHT.portfolio),
        hlInfo<ClearinghouseState>({ type: 'clearinghouseState', user: address }, WEIGHT.clearinghouseState),
      ]);
      const { stats, reason } = analyzePortfolio(pf, now);
      // updateMany, а не update: отбор мог удалить строку, пока шёл запрос.
      await this.prisma.hlWallet.updateMany({
        where: { address },
        data: {
          ...stats,
          analyzedAt: new Date(now),
          qualified: reason == null,
          rejectReason: reason,
          openPositions: (state.assetPositions ?? []).filter((p) => Number(p.position.szi) !== 0).length,
        },
      });
    } catch (e) {
      // Сдвигаем и при сбое: иначе этот кошелёк стоял бы первым в очереди всегда.
      this.logger.warn(`разбор ${address} не удался: ${(e as Error).message}`);
      await this.prisma.hlWallet.updateMany({ where: { address }, data: { analyzedAt: new Date(now) } });
    }
    return true;
  }
}

export type { Prisma };
```

(Последняя строка не нужна — удалить при реализации, если `Prisma` не используется.)

- [ ] **Step 4: модуль и регистрация**

`hl-scout.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { HlScoutService } from './hl-scout.service';

/** Бот отбора кошельков Hyperliquid; страница владельца — `HlWalletsController` (Task 4). */
@Module({ providers: [HlScoutService] })
export class HlScoutModule {}
```

В `app.module.ts` — `HlScoutModule` после `BackupModule`. В `role.ts` — `hl-scout` в список фоновых сервисов `worker`.

- [ ] **Step 5: `npx jest src/hl-scout src/hyperliquid` — зелёные; `npx tsc --noEmit -p .`**

**→ Контрольная точка R1** (задачи 1–3).

---

### Task 4: API владельца

**Files:**
- Create: `backend/src/hl-scout/hl-wallets.service.ts`, `hl-wallets.controller.ts`, `dto/save-wallet.dto.ts`
- Modify: `backend/src/hl-scout/hl-scout.module.ts`
- Test: `backend/src/hl-scout/hl-wallets.service.spec.ts`

**Interfaces:**
- Produces (JSON):
  - `GET /api/admin/hl/wallets` → `{ status: { discoveredAt: string | null; candidates: number; analyzed: number; qualified: number }, rows: HlWalletRow[] }`
  - `GET /api/admin/hl/saved` → `{ rows: HlWalletRow[] }`
  - `PUT /api/admin/hl/saved/:address` `{ note?: string }` → `HlWalletRow`; `DELETE` → `{ ok: true }`
  - `GET /api/admin/hl/saved/positions` → `{ asOf: string; positions: HlPosition[]; failed: string[] }`
  - `HlWalletRow = { address, accountValue, pnlWeek, pnlMonth, pnl90, pnlAllTime, roiMonth, weeks, weeksMoving, weeksUp, bestWeekShare, maxDrawdown, volumeWeek, openPositions, analyzedAt, qualified, rejectReason, alive, savedAt, note }` (числа могут быть `null` у неразобранного).

- [ ] **Step 1: тест**

```ts
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { HlWalletsService } from './hl-wallets.service';
import * as gate from '../hyperliquid/hl-gate';

jest.mock('../hyperliquid/hl-gate', () => ({ hlInfo: jest.fn(), WEIGHT: { clearinghouseState: 2, portfolio: 20 } }));

const ADDR = '0x' + 'a'.repeat(40);

function makePrisma(wallet: Record<string, unknown> | null = { address: ADDR, savedAt: null }) {
  return {
    hlWallet: {
      findUnique: jest.fn().mockResolvedValue(wallet),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockImplementation(async ({ data }) => ({ ...wallet, ...data, volumeWeek: 0, openPositions: 0 })),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      count: jest.fn().mockResolvedValue(0),
      aggregate: jest.fn().mockResolvedValue({ _max: { seenAt: null } }),
    },
  };
}

describe('HlWalletsService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('сохранение: адрес в нижний регистр, savedAt ставится, заметка обрезается', async () => {
    const prisma = makePrisma();
    await new HlWalletsService(prisma as never).save(ADDR.toUpperCase().replace('0X', '0x'), '  смотреть  ');
    const { data } = prisma.hlWallet.update.mock.calls[0][0];
    expect(prisma.hlWallet.update.mock.calls[0][0].where).toEqual({ address: ADDR });
    expect(data.savedAt).toBeInstanceOf(Date);
    expect(data.note).toBe('смотреть');
  });

  it('смена заметки не двигает время сохранения', async () => {
    const savedAt = new Date(1);
    const prisma = makePrisma({ address: ADDR, savedAt });
    await new HlWalletsService(prisma as never).save(ADDR, '');
    expect(prisma.hlWallet.update.mock.calls[0][0].data).toEqual({ savedAt, note: null });
  });

  it('неизвестный кошелёк — 404, не адрес — 400', async () => {
    await expect(new HlWalletsService(makePrisma(null) as never).save(ADDR, undefined)).rejects.toBeInstanceOf(NotFoundException);
    await expect(new HlWalletsService(makePrisma() as never).save('vault', undefined)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('позиции: сбой одного кошелька не роняет остальные; ответ кэшируется', async () => {
    const prisma = makePrisma();
    prisma.hlWallet.findMany.mockResolvedValue([{ address: '0xa' }, { address: '0xb' }]);
    (gate.hlInfo as jest.Mock)
      .mockResolvedValueOnce({ assetPositions: [{ position: { coin: 'BTC', szi: '1', entryPx: '1', positionValue: '2', unrealizedPnl: '1', leverage: { type: 'cross', value: 3 }, liquidationPx: null } }] })
      .mockRejectedValueOnce(new Error('boom'));
    const svc = new HlWalletsService(prisma as never);
    const res = await svc.positions(1000);
    expect(res.positions).toHaveLength(1);
    expect(res.failed).toEqual(['0xb']);
    await svc.positions(2000);
    expect(gate.hlInfo).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: `hl-wallets.service.ts`**

```ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { HlWallet } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { hlInfo, WEIGHT } from '../hyperliquid/hl-gate';
import { positionsOf, type HlPosition } from './positions';
import type { ClearinghouseState } from './hl-types';

const ADDRESS = /^0x[0-9a-f]{40}$/;
/** Позиции сохранённых — вживую, но не чаще раза в 15 с на всех: вес 2 на кошелёк. */
const POSITIONS_TTL_MS = 15_000;

/** Живой — торговал за неделю или держит позицию. */
const ALIVE = { OR: [{ volumeWeek: { gt: 0 } }, { openPositions: { gt: 0 } }] };

function rowOf(w: HlWallet) {
  return {
    address: w.address,
    accountValue: w.accountValue,
    pnlWeek: w.pnlWeek,
    pnlMonth: w.pnlMonth,
    pnl90: w.pnl90,
    pnlAllTime: w.pnlAllTime,
    roiMonth: w.roiMonth,
    weeks: w.weeks,
    weeksMoving: w.weeksMoving,
    weeksUp: w.weeksUp,
    bestWeekShare: w.bestWeekShare,
    maxDrawdown: w.maxDrawdown,
    volumeWeek: w.volumeWeek,
    openPositions: w.openPositions,
    analyzedAt: w.analyzedAt,
    qualified: w.qualified,
    rejectReason: w.rejectReason,
    alive: w.volumeWeek > 0 || (w.openPositions ?? 0) > 0,
    savedAt: w.savedAt,
    note: w.note,
  };
}

function addressOf(raw: string): string {
  const address = String(raw).toLowerCase();
  if (!ADDRESS.test(address)) throw new BadRequestException({ message: 'Не адрес кошелька', code: 'HL_BAD_ADDRESS' });
  return address;
}

/** Страница владельца: таблица отбора, сохранённые и их позиции. */
@Injectable()
export class HlWalletsService {
  private cache: { at: number; value: { asOf: string; positions: HlPosition[]; failed: string[] } } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const [rows, last, candidates, analyzed] = await Promise.all([
      this.prisma.hlWallet.findMany({
        where: { candidate: true, qualified: true, ...ALIVE },
        orderBy: { pnlMonth: 'desc' },
      }),
      this.prisma.hlWallet.aggregate({ where: { candidate: true }, _max: { seenAt: true } }),
      this.prisma.hlWallet.count({ where: { candidate: true } }),
      this.prisma.hlWallet.count({ where: { candidate: true, analyzedAt: { not: null } } }),
    ]);
    return {
      status: { discoveredAt: last._max.seenAt, candidates, analyzed, qualified: rows.length },
      rows: rows.map(rowOf),
    };
  }

  async saved() {
    const rows = await this.prisma.hlWallet.findMany({ where: { savedAt: { not: null } }, orderBy: { savedAt: 'desc' } });
    return { rows: rows.map(rowOf) };
  }

  /** Сохранить или сменить заметку. Повторное сохранение время не двигает. */
  async save(raw: string, note: string | undefined) {
    const address = addressOf(raw);
    const w = await this.prisma.hlWallet.findUnique({ where: { address } });
    if (!w) throw new NotFoundException({ message: 'Кошелька нет в отборе', code: 'HL_WALLET_NOT_FOUND' });
    const updated = await this.prisma.hlWallet.update({
      where: { address },
      data: {
        savedAt: w.savedAt ?? new Date(),
        ...(note !== undefined ? { note: note.trim() || null } : {}),
      },
    });
    this.cache = null;
    return rowOf(updated);
  }

  /** Убрать. Не-кандидата следующий отбор удалит сам. */
  async unsave(raw: string) {
    await this.prisma.hlWallet.updateMany({ where: { address: addressOf(raw) }, data: { savedAt: null, note: null } });
    this.cache = null;
    return { ok: true };
  }

  async positions(now: number = Date.now()) {
    if (this.cache && now - this.cache.at < POSITIONS_TTL_MS) return this.cache.value;
    const saved = await this.prisma.hlWallet.findMany({ where: { savedAt: { not: null } }, select: { address: true } });
    const positions: HlPosition[] = [];
    const failed: string[] = [];
    const states = await Promise.allSettled(
      saved.map(({ address }) =>
        hlInfo<ClearinghouseState>({ type: 'clearinghouseState', user: address }, WEIGHT.clearinghouseState),
      ),
    );
    states.forEach((s, i) => {
      const { address } = saved[i];
      if (s.status === 'fulfilled') positions.push(...positionsOf(address, s.value));
      else failed.push(address);
    });
    const value = { asOf: new Date(now).toISOString(), positions, failed };
    this.cache = { at: now, value };
    return value;
  }
}
```

- [ ] **Step 3: DTO и контроллер**

```ts
// dto/save-wallet.dto.ts
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SaveWalletDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
```

```ts
// hl-wallets.controller.ts
import { Body, Controller, Delete, Get, Param, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../admin/guards/admin.guard';
import { HlWalletsService } from './hl-wallets.service';
import { SaveWalletDto } from './dto/save-wallet.dto';

/**
 * Кошельки Hyperliquid — раздел владельца на `admin.*`. Под тем же двойным
 * guard'ом, что аналитика пользователей; префикс `/api/admin` держит запросы
 * вне учёта посещений.
 */
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('api/admin/hl')
export class HlWalletsController {
  constructor(private readonly wallets: HlWalletsService) {}

  @Get('wallets')
  list() {
    return this.wallets.list();
  }

  @Get('saved')
  saved() {
    return this.wallets.saved();
  }

  // Раньше `saved/:address`: иначе слово `positions` ушло бы адресом.
  @Get('saved/positions')
  positions() {
    return this.wallets.positions();
  }

  @Put('saved/:address')
  save(@Param('address') address: string, @Body() dto: SaveWalletDto) {
    return this.wallets.save(address, dto.note);
  }

  @Delete('saved/:address')
  unsave(@Param('address') address: string) {
    return this.wallets.unsave(address);
  }
}
```

Модуль: `controllers: [HlWalletsController]`, `providers: [HlScoutService, HlWalletsService, AdminGuard]`.

- [ ] **Step 4: `npx jest src/hl-scout` и `npx tsc --noEmit -p .` — зелёные.**

---

### Task 5: поддомен админки на фронте

**Files:**
- Create: `frontend/src/shared/lib/utils/admin-host.ts` (+ `admin-host.test.ts`), `frontend/src/app/(internal)/AdminChrome.tsx`, `frontend/src/views/admin-login/Page.tsx`, `frontend/src/app/admin/login/page.tsx`, `frontend/src/app/admin/(in)/layout.tsx`, `frontend/src/app/admin/(in)/users/page.tsx`
- Delete: `frontend/src/app/(app)/admin/page.tsx`
- Modify: `frontend/src/proxy.ts`, `frontend/next.config.ts`, `frontend/src/features/auth/ui/AuthForm.tsx`, `frontend/src/features/auth/ui/AuthGuard.tsx`, `frontend/src/widgets/top-nav/TopNav.tsx`, `ru.json`/`en.json`, `globals.css`

**Interfaces:**
- Produces: `isAdminHost(host)`, `adminPath(pathname)`, `adminOrigin(protocol, host)`; `AuthForm` проп `loginOnly?: boolean`; `safeNext(raw, fallback = HOME)`; `AuthGuard` проп `loginUrl?: (pathname: string) => string`; `AdminChrome`.

- [ ] **Step 1: тест `admin-host.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { adminOrigin, adminPath, isAdminHost } from './admin-host';

describe('admin-host', () => {
  it('поддомен админки — по префиксу admin.', () => {
    expect(isAdminHost('admin.trade-play.com')).toBe(true);
    expect(isAdminHost('admin.localhost:8090')).toBe(true);
    expect(isAdminHost('trade-play.com')).toBe(false);
    expect(isAdminHost('administrator.com')).toBe(false);
    expect(isAdminHost(null)).toBe(false);
  });

  it('adminPath снимает внутренний префикс /admin', () => {
    expect(adminPath('/admin')).toBe('/');
    expect(adminPath('/admin/users')).toBe('/users');
    expect(adminPath('/saved')).toBe('/saved');
    expect(adminPath('/administrator')).toBe('/administrator');
  });

  it('adminOrigin — тот же протокол и порт', () => {
    expect(adminOrigin('https:', 'trade-play.com')).toBe('https://admin.trade-play.com');
    expect(adminOrigin('http:', 'localhost:8090')).toBe('http://admin.localhost:8090');
  });
});
```

- [ ] **Step 2: `admin-host.ts`**

```ts
/**
 * Админка живёт на поддомене `admin.*` того же Next (спека
 * 2026-10-19-hyperliquid-wallet-scout-design.md): развилка — по заголовку Host
 * в `proxy.ts`, внутри адреса переписываются в `app/admin/*`.
 */
export function isAdminHost(host: string | null | undefined): boolean {
  return !!host && /^admin\./i.test(host);
}

/** Видимый адрес страницы админки — без внутреннего префикса `/admin`. */
export function adminPath(pathname: string): string {
  return pathname.replace(/^\/admin(?=\/|$)/, '') || '/';
}

/** Origin админки рядом с текущим: `protocol` — как у `location` («https:»), `host` — с портом. */
export function adminOrigin(protocol: string, host: string): string {
  return `${protocol}//admin.${host}`;
}
```

- [ ] **Step 3: `proxy.ts`** — развилка по хосту первой; `/login` и `/profile/` на основном хосте — пропуск в коде; matcher без них.

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { adminPath, isAdminHost } from '@/shared/lib/utils/admin-host';

const REFRESH_COOKIE = 'refresh_token';

export function proxy(request: NextRequest) {
  const authed = request.cookies.has(REFRESH_COOKIE);
  const { pathname } = request.nextUrl;
  const host = request.headers.get('host');

  /*
   * Поддомен админки — свой набор страниц (`app/admin/*`) под теми же адресами
   * без префикса. Кука сессии ставится без Domain, поэтому вход здесь — свой:
   * без куки любая страница ведёт на `/login` поддомена.
   */
  if (isAdminHost(host)) {
    // Страница входа — всегда сама форма: решать «уже вошёл» по одной куке
    // нельзя — протухшая кука и AuthGuard уводили бы друг на друга по кругу.
    if (pathname === '/login') return NextResponse.rewrite(new URL(`/admin/login${request.nextUrl.search}`, request.url));
    if (!authed) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      url.search = `next=${encodeURIComponent(pathname)}`;
      return NextResponse.redirect(url);
    }
    return NextResponse.rewrite(new URL(`/admin${pathname === '/' ? '' : pathname}${request.nextUrl.search}`, request.url));
  }

  // Старые закладки `/admin` — на поддомен; на основном хосте этих страниц нет.
  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    const proto = request.headers.get('x-forwarded-proto') ?? request.nextUrl.protocol.replace(':', '');
    return NextResponse.redirect(`${proto}://admin.${host}${adminPath(pathname)}`);
  }

  // `/login` только пересылает старые ссылки, `/profile/<id>` открыт гостю
  // (см. ниже). Из matcher они ушли: на поддомене обязаны пройти развилку.
  if (pathname === '/login' || pathname.startsWith('/profile/')) return NextResponse.next();

  if (pathname === '/') {
    if (!authed) return NextResponse.next();
    const url = request.nextUrl.clone();
    url.pathname = '/terminal';
    url.search = '';
    return NextResponse.redirect(url);
  }

  if (authed) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = '/';
  url.search = `auth=login&next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|assets/|favicon.ico|api/|auth/).*)'],
};
```

(Существующие комментарии файла сохраняются и переносятся к своим веткам; про `profile/` и `assets/` — как были.)

- [ ] **Step 4: `next.config.ts`** — `allowedDevOrigins: ['admin.localhost']` с комментарием (dev-сервер Next отклоняет запросы ресурсов разработки с чужого origin; админка локально — `admin.localhost:<порт>`).

- [ ] **Step 5: `AuthForm` и `AuthGuard`**

`AuthForm`: `safeNext(raw, fallback = HOME)`; проп `loginOnly?: boolean` — режим всегда `login`, блок «или / демо» и переключатель режима не рисуются.

`AuthGuard`:

```tsx
export function AuthGuard({
  children,
  loginUrl = (path) => `/?auth=login&next=${encodeURIComponent(path)}`,
}: {
  children: ReactNode;
  /** Куда уводить потерявшего сессию; у админки — свой `/login` поддомена. */
  loginUrl?: (pathname: string) => string;
}) {
  ...
  useEffect(() => {
    if (!loading && !user) router.replace(loginUrl(pathname));
  }, [loading, user, pathname, router, loginUrl]);
```

- [ ] **Step 6: `AdminChrome` и маршруты**

```tsx
// app/(internal)/AdminChrome.tsx
'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AuthGuard, useAuth } from '@/features/auth';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Wrap } from '@/shared/ui/Wrap';
import { adminPath } from '@/shared/lib/utils/admin-host';

const ITEMS = [
  { href: '/', key: 'wallets' },
  { href: '/saved', key: 'saved' },
  { href: '/users', key: 'users' },
] as const;

const toLogin = (path: string) => `/login?next=${encodeURIComponent(adminPath(path))}`;

/**
 * Обвязка админки на поддомене: знак, три раздела, почта и выход. Рейки
 * продукта, баланса и Battle Pass здесь нет — это инструмент владельца, а не
 * продукт. Право проверяет бэкенд на каждом запросе (AdminGuard); здесь — только
 * чтобы не рисовать пустые таблицы не владельцу.
 */
export function AdminChrome({ children }: { children: ReactNode }) {
  const t = useTranslations('adminShell');
  const { user, loading, logout } = useAuth();
  // На поддомене адрес переписан в /admin/*; что вернёт usePathname — видимый
  // или переписанный, — не важно: префикс снимается.
  const path = adminPath(usePathname());

  return (
    <>
      <header className="adm-top">
        <span className="adm-brand">{t('brand')}</span>
        <nav className="adm-nav">
          {ITEMS.map((i) => (
            <Link key={i.href} href={i.href} aria-current={path === i.href ? 'page' : undefined}>
              {t(i.key)}
            </Link>
          ))}
        </nav>
        <span className="adm-user muted">{user?.email}</span>
        <Button variant="bare" onClick={() => void logout()}>
          {t('logout')}
        </Button>
      </header>
      <AuthGuard loginUrl={toLogin}>
        {!loading && user && !user.isAdmin ? (
          <Wrap page>
            <EmptyState title={t('deniedTitle')}>{t('deniedBody')}</EmptyState>
          </Wrap>
        ) : (
          children
        )}
      </AuthGuard>
    </>
  );
}
```

`app/admin/(in)/layout.tsx`:

```tsx
import type { ReactNode } from 'react';
import { AdminChrome } from '../../(internal)/AdminChrome';

/** Страницы админки за входом; сам вход (`/login`) — вне этой группы. */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminChrome>{children}</AdminChrome>;
}
```

`app/admin/(in)/users/page.tsx`:

```tsx
/** Пользователи — admin.<домен>/users (переехало с /admin основного хоста). */
export { AdminPage as default } from '@/views/admin/Page';
```

`views/admin-login/Page.tsx`:

```tsx
'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AuthForm, safeNext, useAuth } from '@/features/auth';
import { Wrap } from '@/shared/ui/Wrap';
import { PageHead } from '@/shared/ui/PageHead';

/** Вход на поддомене админки: только вход, без регистрации и демо. */
export function AdminLoginPage() {
  const t = useTranslations('adminShell');
  const { user, loading } = useAuth();
  const router = useRouter();
  const next = safeNext(useSearchParams().get('next'), '/');

  // Сессия жива — форма не нужна. Решает ответ /auth/refresh, а не кука в proxy.
  useEffect(() => {
    if (!loading && user) router.replace(next);
  }, [loading, user, next, router]);

  return (
    <Wrap page>
      <div className="adm-login">
        <PageHead title={t('loginTitle')} />
        <AuthForm initialMode="login" loginOnly next={next} />
      </div>
    </Wrap>
  );
}
```

`app/admin/login/page.tsx`:

```tsx
import { Suspense } from 'react';
import { AdminLoginPage } from '@/views/admin-login/Page';

/** admin.<домен>/login — proxy.ts переписывает сюда. useSearchParams просит Suspense. */
export default function Page() {
  return (
    <Suspense>
      <AdminLoginPage />
    </Suspense>
  );
}
```

Удалить `app/(app)/admin/page.tsx` (и пустой каталог).

- [ ] **Step 7: TopNav** — пункт «Админка» ведёт на поддомен:

```tsx
{user?.isAdmin && (
  // Меню рисуется только после клика, на клиенте: location здесь уже есть.
  <a className="acct-item" href={adminOrigin(window.location.protocol, window.location.host)} onClick={closeMenu}>
    {t('admin')}
  </a>
)}
```

`nav.admin` (ключ `t('admin')` TopNav): ru «Админка», en «Admin». Комментарий в TopNav про `/admin` в рейке — убрать `/admin` из списка.

- [ ] **Step 8: тексты `adminShell`** (ru / en):

```json
"adminShell": {
  "brand": "Trade Play · админка",
  "wallets": "Кошельки",
  "saved": "Сохранённые",
  "users": "Пользователи",
  "logout": "Выйти",
  "loginTitle": "Вход в админку",
  "deniedTitle": "Нет доступа",
  "deniedBody": "Админка открыта только владельцу сервиса."
}
```

```json
"adminShell": {
  "brand": "Trade Play · admin",
  "wallets": "Wallets",
  "saved": "Saved",
  "users": "Users",
  "logout": "Log out",
  "loginTitle": "Admin sign-in",
  "deniedTitle": "No access",
  "deniedBody": "The admin area is open to the service owner only."
}
```

- [ ] **Step 9: стили** (`globals.css`, в `@layer components`): `.adm-top` — строка шапки (flex, gap `--s4`, нижняя линейка `--hair`, высота как у `.top`), `.adm-brand` моно-капитель, `.adm-nav a[aria-current=page]` подчёркнут, `.adm-user` прижат вправо (`margin-left: auto`), `.adm-login` — колонка 360 px по центру.

- [ ] **Step 10: `npx vitest run src/shared/lib/utils/admin-host.test.ts src/shared/i18n` — зелёные.**

---

### Task 6: страницы «Кошельки» и «Сохранённые»

**Files:**
- Create: `frontend/src/views/hl-wallets/api/hooks.ts`, `model/sort.ts` (+ `sort.test.ts`), `model/format.ts` (+ `format.test.ts`), `components/WalletCell.tsx`, `components/walletColumns.tsx`, `components/PositionsTable.tsx`, `components/NoteField.tsx`, `Page.tsx`, `SavedPage.tsx`; `frontend/src/app/admin/(in)/page.tsx`, `frontend/src/app/admin/(in)/saved/page.tsx`
- Modify: `frontend/src/shared/ui/Money.tsx` (проп `digits`), `ru.json`/`en.json` (`hlWallets`)

**Interfaces:**
- Consumes: JSON Task 4.
- Produces: `HlWalletsPage`, `HlSavedPage`.

- [ ] **Step 1: тесты `sort.test.ts`, `format.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { sortRows } from './sort';

describe('sortRows', () => {
  const rows = [
    { address: 'a', pnlMonth: 10 },
    { address: 'b', pnlMonth: null },
    { address: 'c', pnlMonth: 30 },
  ];
  it('по убыванию, пустые — в конце при любом направлении', () => {
    expect(sortRows(rows, 'pnlMonth', -1).map((r) => r.address)).toEqual(['c', 'a', 'b']);
    expect(sortRows(rows, 'pnlMonth', 1).map((r) => r.address)).toEqual(['a', 'c', 'b']);
  });
  it('не мутирует вход', () => {
    sortRows(rows, 'pnlMonth', 1);
    expect(rows[0].address).toBe('a');
  });
});
```

```ts
import { describe, expect, it } from 'vitest';
import { pct, profileUrl, shortAddress, usd } from './format';

describe('format', () => {
  it('shortAddress', () => expect(shortAddress('0x399965e15d4e61ec3529cc98b7f7ebb93b733336')).toBe('0x3999…3336'));
  it('profileUrl — HyperDash', () =>
    expect(profileUrl('0xab')).toBe('https://hyperdash.info/trader/0xab'));
  it('pct — доля в проценты без знака', () => {
    expect(pct(0.1234)).toBe('12 %');
    expect(pct(null)).toBe('—');
  });
  it('usd — компактно', () => {
    expect(usd(1_234_567)).toBe('1.23M');
    expect(usd(45_600)).toBe('45.6K');
    expect(usd(950)).toBe('950');
    expect(usd(null)).toBe('—');
  });
});
```

- [ ] **Step 2: `model/sort.ts`, `model/format.ts`**

```ts
// sort.ts
/** Сортировка на клиенте: строк — сотни, приходят все. Пустые (не разобран) — всегда в конце. */
export function sortRows<T>(rows: T[], key: keyof T, dir: 1 | -1): T[] {
  return [...rows].sort((a, b) => {
    const x = a[key] as unknown as number | null;
    const y = b[key] as unknown as number | null;
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    return (x - y) * dir;
  });
}
```

```ts
// format.ts
/** Профиль трейдера — HyperDash: кривая, позиции и сделки адреса. Поменять — здесь. */
export const profileUrl = (address: string) => `https://hyperdash.info/trader/${address}`;

export const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** Доля → «12 %»: проценты здесь — свойства кривой, без знака. */
export const pct = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)} %`);

/** Баланс и оборот — компактно: в таблице на 13 колонок полные разряды не помещаются. */
export function usd(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a >= 1e9) return `${+(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${+(v / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${+(v / 1e3).toFixed(1)}K`;
  return String(Math.round(v));
}
```

- [ ] **Step 3: `api/hooks.ts`**

```ts
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiJson } from '@/shared/api/http';

export type RejectReason =
  | 'noData' | 'history' | 'trading' | 'pnlAllTime' | 'pnlHorizon' | 'pnl90' | 'pnlMonth' | 'weeksUp' | 'oneSpike' | 'drawdown';

export interface HlWalletRow {
  address: string;
  accountValue: number | null;
  pnlWeek: number | null;
  pnlMonth: number | null;
  pnl90: number | null;
  pnlAllTime: number | null;
  roiMonth: number | null;
  weeks: number | null;
  weeksMoving: number | null;
  weeksUp: number | null;
  bestWeekShare: number | null;
  maxDrawdown: number | null;
  volumeWeek: number;
  openPositions: number | null;
  analyzedAt: string | null;
  qualified: boolean;
  rejectReason: RejectReason | null;
  alive: boolean;
  savedAt: string | null;
  note: string | null;
}

export interface HlWalletsResponse {
  status: { discoveredAt: string | null; candidates: number; analyzed: number; qualified: number };
  rows: HlWalletRow[];
}

export interface HlPosition {
  address: string;
  coin: string;
  side: 'long' | 'short';
  size: number;
  notional: number;
  entryPx: number | null;
  markPx: number | null;
  unrealizedPnl: number;
  leverage: number;
  liquidationPx: number | null;
}

const BASE = '/api/admin/hl';
/** Бот пересчитывает кошелёк раз в ~2 часа — чаще минуты таблицу перечитывать незачем. */
const STALE_MS = 60_000;

export const useHlWallets = (enabled: boolean) =>
  useQuery({ queryKey: ['hlWallets'], queryFn: () => apiJson<HlWalletsResponse>(`${BASE}/wallets`), enabled, staleTime: STALE_MS });

export const useHlSaved = (enabled: boolean) =>
  useQuery({ queryKey: ['hlSaved'], queryFn: () => apiJson<{ rows: HlWalletRow[] }>(`${BASE}/saved`), enabled, staleTime: STALE_MS });

export const useHlPositions = (enabled: boolean) =>
  useQuery({
    queryKey: ['hlPositions'],
    queryFn: () => apiJson<{ asOf: string; positions: HlPosition[]; failed: string[] }>(`${BASE}/saved/positions`),
    enabled,
    // Позиции — то, ради чего кошелёк сохранён: перечитываются, пока страница открыта.
    refetchInterval: 30_000,
  });

/** Сохранить / сменить заметку / убрать — и перечитать всё, где кошелёк виден. */
export function useSaveWallet() {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['hlWallets'] });
    void qc.invalidateQueries({ queryKey: ['hlSaved'] });
    void qc.invalidateQueries({ queryKey: ['hlPositions'] });
  };
  const save = useMutation({
    mutationFn: ({ address, note }: { address: string; note?: string }) =>
      apiJson<HlWalletRow>(`${BASE}/saved/${address}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(note === undefined ? {} : { note }),
      }),
    onSuccess: refresh,
  });
  const unsave = useMutation({
    mutationFn: (address: string) => apiJson<{ ok: true }>(`${BASE}/saved/${address}`, { method: 'DELETE' }),
    onSuccess: refresh,
  });
  return { save, unsave };
}
```

- [ ] **Step 4: `Money` — проп `digits`** (по умолчанию 2, уходит в `formatMoney(value, digits)`); PnL в таблице кошельков — без копеек.

- [ ] **Step 5: `WalletCell.tsx`**

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { profileUrl, shortAddress } from '../model/format';

/** Адрес коротко (полный — в подсказке) и ссылка на профиль трейдера. */
export function WalletCell({ address }: { address: string }) {
  const t = useTranslations('hlWallets');
  return (
    <>
      <span className="n" title={address}>
        {shortAddress(address)}
      </span>{' '}
      <a className="muted" href={profileUrl(address)} target="_blank" rel="noreferrer noopener">
        {t('profile')} ↗
      </a>
    </>
  );
}
```

- [ ] **Step 6: `walletColumns.tsx`** — колонки, общие у обеих страниц; `lead` — колонка-действие в начале, `extra` — в конце.

```tsx
'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Money } from '@/shared/ui/Money';
import type { LedgerColumn } from '@/shared/ui/LedgerTable';
import { fmtPctSigned } from '@/shared/lib/utils/format';
import type { HlWalletRow } from '../api/hooks';
import { pct, usd } from '../model/format';
import { WalletCell } from './WalletCell';

type T = ReturnType<typeof useTranslations<'hlWallets'>>;

const money = (v: number | null) => (v == null ? <span className="muted">—</span> : <Money value={v} digits={0} />);

export function walletColumns(t: T, lead: LedgerColumn<HlWalletRow>[], extra: LedgerColumn<HlWalletRow>[] = []) {
  const num = (key: keyof HlWalletRow, header: string, render: (r: HlWalletRow) => ReactNode): LedgerColumn<HlWalletRow> => ({
    key,
    header,
    align: 'right',
    cellClassName: 'n',
    sortKey: key,
    render,
  });
  return [
    ...lead,
    { key: 'address', header: t('colWallet'), render: (r) => <WalletCell address={r.address} /> },
    num('accountValue', t('colBalance'), (r) => usd(r.accountValue)),
    num('pnlWeek', t('colPnlWeek'), (r) => money(r.pnlWeek)),
    num('pnlMonth', t('colPnlMonth'), (r) => money(r.pnlMonth)),
    num('pnl90', t('colPnl90'), (r) => money(r.pnl90)),
    num('pnlAllTime', t('colPnlAll'), (r) => money(r.pnlAllTime)),
    num('roiMonth', t('colRoi'), (r) =>
      r.roiMonth == null ? '—' : <span className={r.roiMonth >= 0 ? 'pos' : 'neg'}>{fmtPctSigned(r.roiMonth * 100, 1)}</span>,
    ),
    num('weeksUp', t('colWeeksUp'), (r) => (r.weeksUp == null ? '—' : `${r.weeksUp} / ${r.weeksMoving}`)),
    num('bestWeekShare', t('colBestWeek'), (r) => pct(r.bestWeekShare)),
    num('maxDrawdown', t('colDrawdown'), (r) => pct(r.maxDrawdown)),
    num('volumeWeek', t('colVolume'), (r) => usd(r.volumeWeek)),
    ...extra,
  ] satisfies LedgerColumn<HlWalletRow>[];
}
```

- [ ] **Step 7: `Page.tsx` (Кошельки)**

```tsx
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/features/auth';
import { Wrap } from '@/shared/ui/Wrap';
import { PageHead } from '@/shared/ui/PageHead';
import { Button } from '@/shared/ui/Button';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { LedgerTable, type LedgerColumn } from '@/shared/ui/LedgerTable';
import { Pagination } from '@/shared/ui/Pagination';
import { useHlWallets, useSaveWallet, type HlWalletRow } from './api/hooks';
import { sortRows } from './model/sort';
import { walletColumns } from './components/walletColumns';

const PAGE = 50;

/**
 * Кошельки Hyperliquid, которые бот счёл стабильными и живыми. Решает «брать в
 * работу» владелец — кнопкой «Сохранить»; боты и маркет-мейкеры здесь законно
 * (решение владельца 2026-10-19).
 */
export function HlWalletsPage() {
  const t = useTranslations('hlWallets');
  const { user } = useAuth();
  const enabled = !!user?.isAdmin;
  const { data, isLoading, error } = useHlWallets(enabled);
  const { save, unsave } = useSaveWallet();
  const [sort, setSort] = useState<{ key: keyof HlWalletRow; dir: 1 | -1 }>({ key: 'pnlMonth', dir: -1 });
  const [page, setPage] = useState(1);

  const star: LedgerColumn<HlWalletRow> = {
    key: 'save',
    noSkeleton: true,
    width: 110,
    render: (r) =>
      r.savedAt ? (
        <Button variant="bare" tight onClick={() => unsave.mutate(r.address)} disabled={unsave.isPending}>
          {t('saved')}
        </Button>
      ) : (
        <Button variant="bare" tight onClick={() => save.mutate({ address: r.address })} disabled={save.isPending}>
          {t('save')}
        </Button>
      ),
  };

  const rows = sortRows(data?.rows ?? [], sort.key, sort.dir);
  const status = data?.status;

  return (
    <Wrap page>
      <PageHead
        title={t('title')}
        lede={
          status
            ? t('status', {
                qualified: status.qualified,
                analyzed: status.analyzed,
                candidates: status.candidates,
                at: status.discoveredAt ? new Date(status.discoveredAt).toLocaleString() : '—',
              })
            : t('lede')
        }
      />
      <ErrorNote error={error ?? save.error ?? unsave.error} fallback={t('loadFailed')} />
      <LedgerTable
        columns={walletColumns(t, [star])}
        rows={rows.slice((page - 1) * PAGE, page * PAGE)}
        rowKey={(r) => r.address}
        minWidth={1280}
        isLoading={isLoading}
        skeletonRows={10}
        empty={t('empty')}
        sort={{ key: String(sort.key), dir: sort.dir }}
        onSort={(key) => {
          setPage(1);
          setSort((s) => (s.key === key ? { key: s.key, dir: (s.dir * -1) as 1 | -1 } : { key: key as keyof HlWalletRow, dir: -1 }));
        }}
      />
      <Pagination
        page={page}
        pageSize={PAGE}
        total={rows.length}
        onPrev={() => setPage((p) => Math.max(1, p - 1))}
        onNext={() => setPage((p) => p + 1)}
      />
      <p className="muted" style={{ marginTop: 'var(--s5)' }}>
        {t('rules')}
      </p>
    </Wrap>
  );
}
```

`toLocaleString` вне рендера терминала — допустимо (правило про `Intl` касается графика); если есть `dateFormat` из `shared/lib/utils/intl.ts` — взять его.

- [ ] **Step 8: `NoteField.tsx`, `PositionsTable.tsx`, `SavedPage.tsx`**

```tsx
// NoteField.tsx
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Input } from '@/shared/ui/Field';
import { useSaveWallet } from '../api/hooks';

/** Заметка к сохранённому кошельку: пишется по Enter и при уходе из поля, если изменилась. */
export function NoteField({ address, note }: { address: string; note: string | null }) {
  const t = useTranslations('hlWallets');
  const { save } = useSaveWallet();
  const [value, setValue] = useState(note ?? '');
  const commit = () => {
    if (value.trim() !== (note ?? '')) save.mutate({ address, note: value });
  };
  return (
    <Input
      full
      maxLength={500}
      placeholder={t('notePlaceholder')}
      aria-label={t('noteAria')}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
      }}
    />
  );
}
```

```tsx
// PositionsTable.tsx
'use client';

import { useTranslations } from 'next-intl';
import { LedgerTable, type LedgerColumn } from '@/shared/ui/LedgerTable';
import { Money } from '@/shared/ui/Money';
import { formatPrice } from '@/shared/lib/utils/format';
import type { HlPosition } from '../api/hooks';
import { usd } from '../model/format';
import { WalletCell } from './WalletCell';

export function PositionsTable({ rows, isLoading }: { rows: HlPosition[]; isLoading: boolean }) {
  const t = useTranslations('hlWallets');
  const price = (v: number | null) => (v == null ? '—' : formatPrice(v));
  const columns: LedgerColumn<HlPosition>[] = [
    { key: 'address', header: t('colWallet'), render: (p) => <WalletCell address={p.address} /> },
    { key: 'coin', header: t('colCoin'), render: (p) => p.coin },
    { key: 'side', header: t('colSide'), render: (p) => <span className={p.side === 'long' ? 'pos' : 'neg'}>{t(p.side)}</span> },
    { key: 'notional', header: t('colSize'), align: 'right', cellClassName: 'n', render: (p) => usd(p.notional) },
    { key: 'entry', header: t('colEntry'), align: 'right', cellClassName: 'n', render: (p) => price(p.entryPx) },
    { key: 'mark', header: t('colMark'), align: 'right', cellClassName: 'n', render: (p) => price(p.markPx) },
    { key: 'pnl', header: t('colUpnl'), align: 'right', cellClassName: 'n', render: (p) => <Money value={p.unrealizedPnl} digits={0} /> },
    { key: 'lev', header: t('colLeverage'), align: 'right', cellClassName: 'n', render: (p) => `${p.leverage}×` },
    { key: 'liq', header: t('colLiq'), align: 'right', cellClassName: 'n', render: (p) => price(p.liquidationPx) },
  ];
  return (
    <LedgerTable
      columns={columns}
      rows={rows}
      rowKey={(p) => `${p.address}:${p.coin}`}
      minWidth={980}
      isLoading={isLoading}
      empty={t('noPositions')}
    />
  );
}
```

```tsx
// SavedPage.tsx
'use client';

import { useTranslations } from 'next-intl';
import { useAuth } from '@/features/auth';
import { Wrap } from '@/shared/ui/Wrap';
import { PageHead } from '@/shared/ui/PageHead';
import { SectionHead } from '@/shared/ui/SectionHead';
import { Button } from '@/shared/ui/Button';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { LedgerTable, type LedgerColumn } from '@/shared/ui/LedgerTable';
import { useHlPositions, useHlSaved, useSaveWallet, type HlWalletRow } from './api/hooks';
import { pct } from './model/format';
import { walletColumns } from './components/walletColumns';
import { NoteField } from './components/NoteField';
import { PositionsTable } from './components/PositionsTable';

/**
 * Кошельки, которые владелец взял в работу: та же статистика, заметка, и что
 * они держат прямо сейчас. Выпавший из отбора кошелёк остаётся здесь с причиной.
 */
export function HlSavedPage() {
  const t = useTranslations('hlWallets');
  const { user } = useAuth();
  const enabled = !!user?.isAdmin;
  const saved = useHlSaved(enabled);
  const positions = useHlPositions(enabled);
  const { unsave } = useSaveWallet();

  const reasonOf = (r: HlWalletRow) => {
    if (!r.analyzedAt) return t('pending');
    if (!r.alive) return t('dead');
    if (r.qualified) return t('inSelection');
    switch (r.rejectReason) {
      case 'weeksUp':
        return t('reason.weeksUp', { share: pct(r.weeksMoving ? (r.weeksUp ?? 0) / r.weeksMoving : 0) });
      case 'oneSpike':
        return t('reason.oneSpike', { share: pct(r.bestWeekShare) });
      case 'drawdown':
        return t('reason.drawdown', { share: pct(r.maxDrawdown) });
      default:
        return t(`reason.${r.rejectReason ?? 'noData'}`);
    }
  };

  const status: LedgerColumn<HlWalletRow> = {
    key: 'status',
    header: t('colStatus'),
    render: (r) => <span className={r.qualified && r.alive ? undefined : 'muted'}>{reasonOf(r)}</span>,
  };
  const remove: LedgerColumn<HlWalletRow> = {
    key: 'remove',
    noSkeleton: true,
    render: (r) => (
      <Button variant="bare" tight onClick={() => unsave.mutate(r.address)} disabled={unsave.isPending}>
        {t('remove')}
      </Button>
    ),
  };

  return (
    <Wrap page>
      <PageHead title={t('savedTitle')} lede={t('savedLede')} />
      <ErrorNote error={saved.error ?? unsave.error} fallback={t('loadFailed')} />
      <LedgerTable
        columns={walletColumns(t, [], [status, remove])}
        rows={saved.data?.rows ?? []}
        rowKey={(r) => r.address}
        minWidth={1400}
        isLoading={saved.isLoading}
        empty={t('savedEmpty')}
        renderExpanded={(r) => <NoteField address={r.address} note={r.note} />}
      />

      <SectionHead title={t('positions')} style={{ marginTop: 'var(--s5)' }}>
        {positions.data ? (
          <span className="lbl">{t('asOf', { at: new Date(positions.data.asOf).toLocaleTimeString() })}</span>
        ) : null}
      </SectionHead>
      <ErrorNote error={positions.error} fallback={t('loadFailed')} />
      {positions.data?.failed.length ? <p className="warn">{t('positionsFailed', { n: positions.data.failed.length })}</p> : null}
      <PositionsTable rows={positions.data?.positions ?? []} isLoading={positions.isLoading} />
    </Wrap>
  );
}
```

`app/admin/(in)/page.tsx`: `export { HlWalletsPage as default } from '@/views/hl-wallets/Page';`
`app/admin/(in)/saved/page.tsx`: `export { HlSavedPage as default } from '@/views/hl-wallets/SavedPage';`

- [ ] **Step 9: тексты `hlWallets`** (ru; en — тем же набором ключей)

```json
"hlWallets": {
  "title": "Кошельки Hyperliquid",
  "lede": "Кошельки, стабильно торгующие в плюс. Бот обновляет их круглосуточно.",
  "status": "{qualified} в отборе · проверено {analyzed} из {candidates} кандидатов · лидерборд {at}",
  "rules": "В отборе — кошелёк от $10 000, в плюсе за 30 дней, 90 дней и всё время; не меньше 8 недель торговли, 60 % недель в плюсе, лучшая неделя — не больше 35 % прибыли за полгода, просадка — не больше 40 % баланса; торговал за 7 дней или держит позицию. PnL — по фьючерсам (перпам), без переоценки спотовых монет.",
  "empty": "Бот ещё не нашёл ни одного кошелька — первый проход идёт около двух часов.",
  "loadFailed": "Не удалось загрузить кошельки",
  "profile": "профиль",
  "save": "Сохранить",
  "saved": "Сохранён ✓",
  "remove": "Убрать",
  "colWallet": "Кошелёк",
  "colBalance": "Баланс, $",
  "colPnlWeek": "PnL 7д",
  "colPnlMonth": "PnL 30д",
  "colPnl90": "PnL 90д",
  "colPnlAll": "PnL всё время",
  "colRoi": "ROI 30д",
  "colWeeksUp": "Недель в плюсе",
  "colBestWeek": "Лучшая неделя",
  "colDrawdown": "Просадка",
  "colVolume": "Оборот 7д, $",
  "colStatus": "Отбор",
  "savedTitle": "Сохранённые кошельки",
  "savedLede": "Кошельки, взятые в работу. Строка раскрывается заметкой.",
  "savedEmpty": "Ничего не сохранено — кнопка «Сохранить» в таблице кошельков.",
  "notePlaceholder": "Заметка",
  "noteAria": "Заметка к кошельку",
  "pending": "ещё не проверен",
  "dead": "не торгует неделю",
  "inSelection": "в отборе",
  "reason": {
    "noData": "нет данных",
    "history": "мало истории",
    "trading": "мало торговли",
    "pnlAllTime": "минус за всё время",
    "pnlHorizon": "минус за полгода",
    "pnl90": "минус за 90 дней",
    "pnlMonth": "минус за 30 дней",
    "weeksUp": "недель в плюсе {share}",
    "oneSpike": "прибыль из одного рывка ({share})",
    "drawdown": "просадка {share}"
  },
  "positions": "Открытые позиции",
  "asOf": "на {at}",
  "positionsFailed": "У {n} кошельков позиции не загрузились — повтор через 30 с.",
  "noPositions": "У сохранённых кошельков открытых позиций нет.",
  "colCoin": "Монета",
  "colSide": "Сторона",
  "colSize": "Размер, $",
  "colEntry": "Вход",
  "colMark": "Цена",
  "colUpnl": "Нереализ. P&L",
  "colLeverage": "Плечо",
  "colLiq": "Ликвидация",
  "long": "Лонг",
  "short": "Шорт"
}
```

- [ ] **Step 10: `npx vitest run src/views/hl-wallets src/shared/i18n`, `npx tsc --noEmit`, `npx eslint src/views/hl-wallets src/app/admin src/proxy.ts`.**

**→ Контрольная точка R2** (задачи 4–6).

---

### Task 7: документация и прод-конфиг

- [ ] `CLAUDE.md`: в «Стек и структура» — модуль `hl-scout` в список, тринадцатый сервис `worker` (`hl-scout`); новый раздел «Бот отбора кошельков Hyperliquid и админка на поддомене» — ключевые решения спеки (перповая кривая, пороги в `criteria.ts`, шлюз `hlInfo`, поддомен через `proxy.ts`, вход на поддомене свой).
- [ ] `deploy/nginx-virex.conf.example`: комментарий — админка тем же server-блоком (`server_name <домен> admin.<домен>`) или вторым таким же; `certbot --nginx -d admin.<домен>`.

### Task 8: проверка

- [ ] `cd backend && npx jest` — все зелёные; `npx tsc --noEmit -p .`.
- [ ] `cd frontend && npx vitest run`, `npx next build` (новые маршруты, правка `next.config`, `proxy.ts`).
- [ ] Живой прогон локально (`ROLE=all`): в логе — «отбор Hyperliquid: N кандидатов», через несколько минут строки с `analyzedAt`; `curl -H "Host: admin.localhost:8090" http://localhost:8090/` → 307 на `/login?next=%2F`; с кукой — 200 страница кошельков; `curl http://localhost:8090/admin` → редирект на `admin.localhost`.
- [ ] Деплой — только с подтверждения владельца: коммит, `git push origin main`, на VPS server-блок nginx и `certbot --nginx -d admin.trade-play.com`.
