# Бектест: ручная прокрутка истории BTC — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Страница `/backtest`, где трейдер крутит случайный отрезок истории BTC свеча за свечой, входит в сделки со стопом и тейком, размечает их своими тегами и видит итог в R и USDT.

**Architecture:** Бэкенд — модуль `backtest` (NestJS + Prisma): сессии, сделки, связь с тегами, статистика; точку старта, масштаб цены, размер позиции, PnL и R считает сервер. Фронт — страница `views/backtest`: движок прокрутки в браузере (чистые функции в `lib/`, покрыты vitest) грузит минутки через существующий `/api/market-data/candles`, собирает из них свечи любого таймфрейма и проверяет срабатывание стопа и тейка.

**Tech Stack:** NestJS, Prisma (PostgreSQL), Jest; Next.js App Router, React Query, next-intl, Vitest. Новых зависимостей нет.

Спека: [`docs/superpowers/specs/2026-09-10-backtest-replay-design.md`](../specs/2026-09-10-backtest-replay-design.md)

## Global Constraints

- **Новых npm-зависимостей нет** ни в `backend/`, ни в `frontend/`.
- **Комментарии и сообщения об ошибках — по-русски.**
- **Комиссия — 0.00055 с каждой стороны** (константа `FEE_RATE`, та же, что `TAKER_FEE` в `backend/src/scripts/seed-demo.ts`).
- **Окно точки старта:** не раньше `начало дневной истории + 200 дней`, не раньше `начало минутной истории + 1 день`, не позже `конец минутной истории − 30 дней`.
- **Скрытая цена:** стартовая цена показывается случайным числом от **100 до 1000**; в базе цены хранятся настоящие.
- **Умолчания сессии:** депозит **10 000 USDT**, риск **1%**.
- **Формулы:** `риск_USDT = депозит × риск% / 100`; `размер = риск_USDT / |вход − стоп|`; `комиссия = (вход + выход) × размер × 0.00055`; `PnL = знак × (выход − вход) × размер − комиссия` (лонг +1, шорт −1); `R = PnL / риск_USDT`.
- **Правила срабатывания (по минуткам, в этом порядке):** гэп за стопом → по `open`; гэп за тейком → по тейку; касание стопа → по стопу; касание тейка → по тейку; стоп и тейк в одной минутке → стоп.
- **Бэкенд:** все эндпоинты под `JwtAuthGuard`, пользователь — `@CurrentUser('userId')`; ошибки — `new XxxException({ message, code })`; чужая сессия или сделка → **404**.
- **Бэкенд-тесты** — `*.spec.ts` рядом с кодом, сервисы собираются руками с заглушками (`as never`), запуск из `backend/`: `npm test`.
- **Фронт-тесты** — `src/**/*.test.ts`, vitest в среде `node`, запуск из `frontend/`: `npm test`.
- **Миграций в проекте нет:** схема применяется `npx prisma db push`. На Windows `prisma generate` падает с EPERM, пока запущен `npm run start:dev`, — backend перед генерацией остановить (спросив пользователя, если он запущен в его терминале).
- **Фронт:** код страницы — `frontend/src/views/backtest/`, в `widgets/` ничего не выносится. Повторяющиеся элементы — только `shared/ui`; цвета — CSS-переменными и классами (`.pos`, `.neg`, `.muted`), не инлайновым `style`. График — своё SVG с приёмом `u = W / boxW`.
- **Тексты** — пространство имён `backtest` в `ru.json` и `en.json`; пункт навигации — `nav.backtest`; коды ошибок — в `errors`.
- **Проверять фронт `npx next build`**, а не только `tsc` (правило из CLAUDE.md).
- Каждый коммит заканчивается строкой `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## Карта файлов

**Бэкенд**
- `backend/prisma/schema.prisma` — модели `BacktestSession`, `BacktestTrade`, `BacktestTradeTag` + обратные связи в `User` и `Tag`.
- `backend/src/backtest/backtest-math.ts` (+ `.spec.ts`) — чистая арифметика: размер, результат, окно старта, масштаб, итоги.
- `backend/src/backtest/backtest.service.ts` (+ `.spec.ts`) — сессии, сделки, теги, статистика.
- `backend/src/backtest/dto/backtest.dto.ts` — валидация входа.
- `backend/src/backtest/backtest.controller.ts`, `backtest.module.ts`; подключение в `backend/src/app.module.ts`.

**Фронт**
- `frontend/src/views/backtest/lib/candles.ts` (+ `.test.ts`) — свечи, корзины таймфреймов, сборка из минуток, номер дня.
- `frontend/src/views/backtest/lib/fills.ts` (+ `.test.ts`) — срабатывание стопа и тейка.
- `frontend/src/views/backtest/lib/money.ts` (+ `.test.ts`) — предпросмотр размера, нереализованный PnL, масштаб, формат R, проверка сторон уровней.
- `frontend/src/views/backtest/api/types.ts`, `api/hooks.ts` — типы ответов, запросы и мутации.
- `frontend/src/views/backtest/model/useReplay.ts` — состояние прокрутки.
- `frontend/src/views/backtest/components/` — `ReplayChart`, `OrderPanel`, `SessionTrades`, `SummaryCells`, `SessionSummary`, `SessionScreen`, `StartSession`, `SessionsList`, `StatsBlock`.
- `frontend/src/views/backtest/Page.tsx`, `frontend/src/app/(app)/backtest/page.tsx`.
- `frontend/src/widgets/top-nav/TopNav.tsx` — пункт меню.
- `frontend/src/shared/i18n/messages/ru.json`, `en.json` — тексты.
- `frontend/src/app/globals.css` — классы графика и панели.

## Подготовка

- Ветка `feat/backtest-replay` уже создана от `main`, спека в ней закоммичена.
- Для задачи 1 нужна живая база: `docker compose ps` должен показывать контейнер `db`. Если Docker Desktop не запущен (`failed to connect to the docker API`) — остановиться и попросить пользователя его запустить.

---

### Task 1: Модели в схеме

**Files:**
- Modify: `backend/prisma/schema.prisma` — `model User` (список связей, после строки `donations          Donation[]`), `model Tag` (после `positionTags PositionTag[]`), новые модели — сразу после `model TradeTag`.

**Interfaces:**
- Produces: клиент `prisma.backtestSession`, `prisma.backtestTrade`, `prisma.backtestTradeTag`; типы `BacktestSession`, `BacktestTrade`, `BacktestTradeTag` из `@prisma/client`. Имена полей — как в блоке ниже, дословно.

- [ ] **Step 1: Добавить обратные связи**

В `model User` после строки `  donations          Donation[]`:

```prisma
  backtestSessions   BacktestSession[]
```

В `model Tag` после строки `  positionTags PositionTag[]`:

```prisma
  backtestTradeTags BacktestTradeTag[]
```

- [ ] **Step 2: Добавить три модели после `model TradeTag`**

```prisma
/// Сессия бектеста: случайный отрезок истории BTC, который пользователь крутит
/// вручную. Тренировочные сделки живут отдельно от журнала (Trade) — иначе
/// диагностика живой торговли считала бы сделки, которых не было на бирже.
model BacktestSession {
  id             String    @id @default(uuid())
  userId         String
  user           User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  /// Точка старта; выбирает сервер, чтобы её нельзя было «перебросить» из браузера.
  startTime      DateTime
  /// Текущий момент сессии: время закрытия последней показанной минутки. Только растёт.
  cursorTime     DateTime
  startBalance   Float
  /// Текущий депозит сессии: стартовый плюс PnL закрытых сделок.
  balance        Float
  defaultRiskPct Float
  hideDate       Boolean
  hidePrice      Boolean
  /// Коэффициент показа цен; 1, если цена не скрыта. В базе цены настоящие.
  priceScale     Float
  status         String    @default("active") // 'active' | 'finished'
  createdAt      DateTime  @default(now())
  finishedAt     DateTime?

  trades BacktestTrade[]

  @@index([userId, status])
  @@map("backtest_sessions")
}

/// Сделка бектеста. Открытая — это сделка с пустым exitTime; отдельной
/// «позиции» нет. Цены настоящие, без масштаба показа.
model BacktestTrade {
  id         String          @id @default(uuid())
  sessionId  String
  session    BacktestSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  direction  String // 'long' | 'short'
  entryTime  DateTime
  entryPrice Float
  stopLoss   Float
  takeProfit Float?
  riskPct    Float
  riskUsdt   Float
  qty        Float
  exitTime   DateTime?
  exitPrice  Float?
  exitReason String? // 'stop' | 'take' | 'manual' | 'finish'
  fee        Float?
  pnl        Float?
  r          Float?

  tags BacktestTradeTag[]

  @@index([sessionId])
  @@map("backtest_trades")
}

/// Теги на сделках бектеста. Устроено как TradeTag, но отдельной таблицей:
/// тренировочные сделки не должны попасть в статистику тегов живой торговли.
model BacktestTradeTag {
  tradeId String
  tagId   String
  trade   BacktestTrade @relation(fields: [tradeId], references: [id], onDelete: Cascade)
  tag     Tag           @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@id([tradeId, tagId])
  @@map("backtest_trade_tags")
}
```

- [ ] **Step 3: Применить схему**

Убедиться, что backend не запущен на хосте:

```powershell
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*backend*' } | Select-Object ProcessId
```

Если процессы есть — спросить пользователя и остановить их. Затем из `backend/`:

```
npx prisma db push
npx prisma generate
```

Ожидается: `Your database is now in sync with your Prisma schema`, созданы три таблицы, ничего не удаляется. Если `db push` спрашивает про потерю данных — остановиться, ничего не подтверждать.

- [ ] **Step 4: Проверить таблицы**

```
docker compose exec -T db psql -U virex -d virex -c "\dt backtest_*"
```

Ожидается: `backtest_sessions`, `backtest_trades`, `backtest_trade_tags`.

- [ ] **Step 5: Коммит**

```bash
git add backend/prisma/schema.prisma
git commit -m "feat(backtest): модели сессии, сделки и тегов бектеста

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Арифметика бектеста

**Files:**
- Create: `backend/src/backtest/backtest-math.ts`
- Test: `backend/src/backtest/backtest-math.spec.ts`

**Interfaces:**
- Produces (все экспортируются из `backtest-math.ts`):
  - `FEE_RATE = 0.00055`, `MINUTE_MS`, `DAY_MS`, `HISTORY_BEFORE_MS`, `MINUTES_BEFORE_MS`, `FUTURE_AFTER_MS`, `SCALED_MIN = 100`, `SCALED_MAX = 1000`
  - `type Direction = 'long' | 'short'`, `type ExitReason = 'stop' | 'take' | 'manual' | 'finish'`
  - `positionSize(balance, riskPct, entry, stop): { riskUsdt: number; qty: number }`
  - `tradeResult({ direction, entryPrice, exitPrice, qty, riskUsdt }): { fee: number; pnl: number; r: number }`
  - `stopOnRightSide(direction, entry, stop): boolean`, `takeOnRightSide(direction, entry, take): boolean`
  - `interface CoverageSpan { from: Date | null; to: Date | null }`, `interface StartWindow { from: number; to: number }`
  - `startWindow(daily?: CoverageSpan, minute?: CoverageSpan): StartWindow | null`
  - `pickStart(win: StartWindow, rnd: () => number): number`
  - `pickPriceScale(startPrice: number, rnd: () => number): number`
  - `interface Summary { trades; wins; winRate; totalR; avgR; pnl }` (все `number`), `summarize(rows: { pnl: number; r: number }[]): Summary`
  - `maxDrawdownPct(startBalance: number, pnls: number[]): number`

- [ ] **Step 1: Написать падающий тест**

`backend/src/backtest/backtest-math.spec.ts`:

```ts
import {
  DAY_MS,
  maxDrawdownPct,
  pickPriceScale,
  pickStart,
  positionSize,
  startWindow,
  stopOnRightSide,
  summarize,
  takeOnRightSide,
  tradeResult,
} from './backtest-math';

const T0 = Date.UTC(2018, 0, 1);

describe('positionSize', () => {
  it('считает риск в USDT и размер от расстояния до стопа', () => {
    expect(positionSize(10_000, 1, 100, 98)).toEqual({ riskUsdt: 100, qty: 50 });
  });

  it('одинаков для лонга и шорта — важно только расстояние', () => {
    expect(positionSize(10_000, 1, 100, 102)).toEqual({ riskUsdt: 100, qty: 50 });
  });
});

describe('tradeResult', () => {
  it('лонг в плюс: PnL после комиссии и R', () => {
    const r = tradeResult({ direction: 'long', entryPrice: 100, exitPrice: 104, qty: 50, riskUsdt: 100 });
    expect(r.fee).toBeCloseTo(5.61, 6); // (100 + 104) × 50 × 0.00055
    expect(r.pnl).toBeCloseTo(194.39, 6);
    expect(r.r).toBeCloseTo(1.9439, 6);
  });

  it('шорт в плюс, когда цена падает', () => {
    const r = tradeResult({ direction: 'short', entryPrice: 100, exitPrice: 98, qty: 50, riskUsdt: 100 });
    expect(r.pnl).toBeCloseTo(94.555, 6);
  });

  // Комиссия — правда о торговле: полный стоп стоит чуть больше одного риска.
  it('стоп даёт чуть хуже −1R из-за комиссии', () => {
    const r = tradeResult({ direction: 'long', entryPrice: 100, exitPrice: 98, qty: 50, riskUsdt: 100 });
    expect(r.r).toBeCloseTo(-1.05445, 6);
    expect(r.r).toBeLessThan(-1);
  });
});

describe('стороны уровней', () => {
  it('стоп лонга ниже входа, шорта — выше', () => {
    expect(stopOnRightSide('long', 100, 98)).toBe(true);
    expect(stopOnRightSide('long', 100, 101)).toBe(false);
    expect(stopOnRightSide('short', 100, 102)).toBe(true);
    expect(stopOnRightSide('short', 100, 100)).toBe(false);
  });

  it('тейк лонга выше входа, шорта — ниже', () => {
    expect(takeOnRightSide('long', 100, 105)).toBe(true);
    expect(takeOnRightSide('short', 100, 105)).toBe(false);
    expect(takeOnRightSide('short', 100, 95)).toBe(true);
  });
});

describe('startWindow', () => {
  const span = (from: number, to: number) => ({ from: new Date(from), to: new Date(to) });

  it('берёт позднее из двух ограничений снизу и отступает 30 дней от конца минуток', () => {
    const win = startWindow(span(T0, T0 + 3000 * DAY_MS), span(T0, T0 + 3000 * DAY_MS));
    expect(win).toEqual({ from: T0 + 200 * DAY_MS, to: T0 + 2970 * DAY_MS });
  });

  it('если минутки начинаются позже дневок — от начала минуток плюс сутки', () => {
    const minuteFrom = T0 + 1000 * DAY_MS;
    const win = startWindow(span(T0, T0 + 3000 * DAY_MS), span(minuteFrom, T0 + 3000 * DAY_MS));
    expect(win?.from).toBe(minuteFrom + DAY_MS);
  });

  it('нет окна, если минутной истории мало', () => {
    expect(startWindow(span(T0, T0 + 3000 * DAY_MS), span(T0, T0 + 100 * DAY_MS))).toBeNull();
  });

  it('нет окна, если какой-то истории нет вовсе', () => {
    expect(startWindow(span(T0, T0 + DAY_MS), undefined)).toBeNull();
    expect(startWindow(undefined, span(T0, T0 + DAY_MS))).toBeNull();
    expect(startWindow({ from: null, to: null }, span(T0, T0 + 3000 * DAY_MS))).toBeNull();
  });
});

describe('pickStart', () => {
  const win = { from: T0 + 200 * DAY_MS, to: T0 + 2970 * DAY_MS };

  it('на нуле — начало окна', () => {
    expect(pickStart(win, () => 0)).toBe(win.from);
  });

  it('всегда в окне и выровнен на минуту', () => {
    const t = pickStart(win, () => 0.999999);
    expect(t).toBeLessThanOrEqual(win.to);
    expect(t).toBeGreaterThanOrEqual(win.from);
    expect(t % 60_000).toBe(0);
  });
});

describe('pickPriceScale', () => {
  it('переводит стартовую цену в диапазон 100–1000', () => {
    expect(pickPriceScale(50_000, () => 0) * 50_000).toBeCloseTo(100, 9);
    expect(pickPriceScale(50_000, () => 1) * 50_000).toBeCloseTo(1000, 9);
  });
});

describe('summarize', () => {
  it('ноль в PnL — не выигрыш', () => {
    const s = summarize([
      { pnl: 10, r: 1 },
      { pnl: -5, r: -0.5 },
      { pnl: 0, r: 0 },
    ]);
    expect(s.trades).toBe(3);
    expect(s.wins).toBe(1);
    expect(s.winRate).toBeCloseTo(33.3333, 3);
    expect(s.totalR).toBeCloseTo(0.5, 9);
    expect(s.avgR).toBeCloseTo(0.16667, 4);
    expect(s.pnl).toBe(5);
  });

  it('пустой список — нули, а не NaN', () => {
    expect(summarize([])).toEqual({ trades: 0, wins: 0, winRate: 0, totalR: 0, avgR: 0, pnl: 0 });
  });
});

describe('maxDrawdownPct', () => {
  it('считает просадку от пика, а не от старта', () => {
    // 1000 → 1100 (пик) → 880 (−20% от пика) → 930
    expect(maxDrawdownPct(1000, [100, -220, 50])).toBeCloseTo(20, 9);
  });

  it('без убытков — ноль', () => {
    expect(maxDrawdownPct(1000, [10, 20])).toBe(0);
  });
});
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Из `backend/`: `npm test -- backtest-math.spec.ts`
Ожидается: FAIL — `Cannot find module './backtest-math'`.

- [ ] **Step 3: Написать реализацию**

`backend/src/backtest/backtest-math.ts`:

```ts
/**
 * Арифметика бектеста без Nest и без базы: размер позиции, результат сделки,
 * окно точки старта, масштаб скрытой цены и итоги. Всё, что проверяется
 * числом, живёт здесь; сервис только достаёт данные и сохраняет.
 */

/** Ставка тейкера с каждой стороны — та же, что в демо (`scripts/seed-demo.ts`, TAKER_FEE). */
export const FEE_RATE = 0.00055;

export const MINUTE_MS = 60_000;
export const DAY_MS = 86_400_000;
/** Сколько дневной истории нужно до старта, чтобы на дневках было что анализировать. */
export const HISTORY_BEFORE_MS = 200 * DAY_MS;
/** Минутки нужны с начала суток старта: из них собирается недоформированная дневка. */
export const MINUTES_BEFORE_MS = DAY_MS;
/** Сколько истории должно остаться после старта, чтобы было куда крутить. */
export const FUTURE_AFTER_MS = 30 * DAY_MS;

/** Скрытая цена: стартовая цена показывается случайным числом из этого диапазона. */
export const SCALED_MIN = 100;
export const SCALED_MAX = 1000;

export type Direction = 'long' | 'short';
export type ExitReason = 'stop' | 'take' | 'manual' | 'finish';

export function positionSize(balance: number, riskPct: number, entry: number, stop: number) {
  const riskUsdt = (balance * riskPct) / 100;
  return { riskUsdt, qty: riskUsdt / Math.abs(entry - stop) };
}

export function tradeResult(t: {
  direction: Direction;
  entryPrice: number;
  exitPrice: number;
  qty: number;
  riskUsdt: number;
}) {
  const sign = t.direction === 'long' ? 1 : -1;
  const fee = (t.entryPrice + t.exitPrice) * t.qty * FEE_RATE;
  const pnl = sign * (t.exitPrice - t.entryPrice) * t.qty - fee;
  return { fee, pnl, r: pnl / t.riskUsdt };
}

export const stopOnRightSide = (d: Direction, entry: number, stop: number) =>
  d === 'long' ? stop < entry : stop > entry;

export const takeOnRightSide = (d: Direction, entry: number, take: number) =>
  d === 'long' ? take > entry : take < entry;

export interface CoverageSpan {
  from: Date | null;
  to: Date | null;
}

export interface StartWindow {
  from: number;
  to: number;
}

/**
 * Где можно ставить точку старта: после 200 дней дневной истории и суток
 * минутной, и не позже чем за 30 дней до конца минуток. null — такого окна нет
 * (минутки не докачаны), и сессию начинать не на чем.
 */
export function startWindow(daily?: CoverageSpan, minute?: CoverageSpan): StartWindow | null {
  if (!daily?.from || !minute?.from || !minute.to) return null;
  const from = Math.max(daily.from.getTime() + HISTORY_BEFORE_MS, minute.from.getTime() + MINUTES_BEFORE_MS);
  const to = minute.to.getTime() - FUTURE_AFTER_MS;
  return from <= to ? { from, to } : null;
}

/** Случайная точка в окне, выровненная на минуту: момент сессии — всегда граница минутки. */
export function pickStart(win: StartWindow, rnd: () => number): number {
  const t = Math.floor((win.from + rnd() * (win.to - win.from)) / MINUTE_MS) * MINUTE_MS;
  return Math.min(win.to, Math.max(win.from, t));
}

/** Коэффициент, при котором стартовая цена становится случайным числом от 100 до 1000. */
export function pickPriceScale(startPrice: number, rnd: () => number): number {
  return (SCALED_MIN + rnd() * (SCALED_MAX - SCALED_MIN)) / startPrice;
}

export interface Summary {
  trades: number;
  wins: number;
  winRate: number; // 0..100
  totalR: number;
  avgR: number;
  pnl: number;
}

export function summarize(rows: { pnl: number; r: number }[]): Summary {
  const trades = rows.length;
  const wins = rows.filter((x) => x.pnl > 0).length;
  const totalR = rows.reduce((s, x) => s + x.r, 0);
  const pnl = rows.reduce((s, x) => s + x.pnl, 0);
  return {
    trades,
    wins,
    winRate: trades ? (wins / trades) * 100 : 0,
    totalR,
    avgR: trades ? totalR / trades : 0,
    pnl,
  };
}

/** Наибольшая просадка депозита от пика, в процентах; pnls — в порядке закрытия сделок. */
export function maxDrawdownPct(startBalance: number, pnls: number[]): number {
  let balance = startBalance;
  let peak = startBalance;
  let dd = 0;
  for (const p of pnls) {
    balance += p;
    peak = Math.max(peak, balance);
    dd = Math.max(dd, ((peak - balance) / peak) * 100);
  }
  return dd;
}
```

- [ ] **Step 4: Запустить и убедиться, что проходит**

`npm test -- backtest-math.spec.ts` → PASS, 18 тестов.

- [ ] **Step 5: Коммит**

```bash
git add backend/src/backtest/backtest-math.ts backend/src/backtest/backtest-math.spec.ts
git commit -m "feat(backtest): арифметика размера, результата сделки и окна старта

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Сервис — сессии

**Files:**
- Create: `backend/src/backtest/backtest.service.ts`
- Test: `backend/src/backtest/backtest.service.spec.ts`

**Interfaces:**
- Consumes: `startWindow`, `pickStart`, `pickPriceScale`, `summarize`, `maxDrawdownPct`, `MINUTE_MS` из Task 2; `prisma.backtestSession`, `prisma.backtestTrade` из Task 1; `MarketDataService.getCoverage(): Promise<{ timeframe: number; from: Date | null; to: Date | null }[]>` и `MarketDataService.getCandles({ timeframe, to, limit }): Promise<{ time: Date; open; high; low; close; volume }[]>` из `backend/src/market-data/market-data.service.ts`.
- Produces (класс `BacktestService`, экспорт из `backtest.service.ts`):
  - `interface CreateSessionInput { startBalance: number; defaultRiskPct: number; hideDate: boolean; hidePrice: boolean }`
  - `createSession(userId, input): Promise<{ session }>`
  - `listSessions(userId): Promise<{ sessions: (BacktestSession & { summary: Summary })[] }>`
  - `getSession(userId, id): Promise<{ session; trades: TradeView[]; summary: Summary & { maxDrawdownPct: number } }>`
  - `advance(userId, id, cursorTime: Date): Promise<{ cursorTime: Date }>`
  - `finish(userId, id): Promise<{ session }>`
  - `tradeView(t)` — экспортируемая функция: сделка с тегами плоским списком `{ id, name, color, type }[]`
  - `TAGS` — экспортируемая константа `{ tags: { include: { tag: true } } }` для `include`
  - защищённые (`protected`) `ownedSession`, `bumpCursor` — ими пользуется Task 4; поле `protected rnd: () => number`
  - экспортируемые `closedNumbers(t)` и `sessionFinished()` — ими пользуются Tasks 4–5
- Коды ошибок: `BACKTEST_NO_HISTORY` (409), `BACKTEST_SESSION_NOT_FOUND` (404), `BACKTEST_SESSION_FINISHED` (409), `BACKTEST_OPEN_TRADE` (409).

- [ ] **Step 1: Написать падающий тест**

`backend/src/backtest/backtest.service.spec.ts` (вспомогательные функции сверху — ими пользуются и задачи 4–5, которые допишут свои `describe` в конец этого файла):

```ts
import { ConflictException, NotFoundException } from '@nestjs/common';
import { BacktestService } from './backtest.service';

const DAY = 86_400_000;
const T0 = Date.UTC(2020, 0, 1);

/**
 * Сервис собирается руками с заглушками: тест про то, что уходит в базу и
 * какие отказы получает пользователь, а не про Nest.
 */
function makeService() {
  const prisma: any = {
    backtestSession: {
      create: jest.fn(({ data }) => ({ id: 's1', ...data })),
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(({ data }) => ({ id: 's1', ...data })),
      count: jest.fn().mockResolvedValue(0),
    },
    backtestTrade: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      create: jest.fn(({ data }) => ({ id: 't1', tags: [], ...data })),
      update: jest.fn(({ data }) => ({ id: 't1', tags: [], ...data })),
    },
    backtestTradeTag: { deleteMany: jest.fn(), createMany: jest.fn() },
    tag: { count: jest.fn() },
    $executeRaw: jest.fn().mockResolvedValue(1),
    $transaction: jest.fn(),
  };
  // Интерактивная транзакция получает тот же объект; пакетная — просто выполняется.
  prisma.$transaction.mockImplementation((arg: unknown) =>
    typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(prisma) : Promise.all(arg as unknown[]),
  );
  const marketData = {
    getCoverage: jest.fn().mockResolvedValue([
      { timeframe: 1440, from: new Date(T0), to: new Date(T0 + 1000 * DAY) },
      { timeframe: 1, from: new Date(T0), to: new Date(T0 + 1000 * DAY) },
    ]),
    getCandles: jest
      .fn()
      .mockResolvedValue([{ time: new Date(T0), open: 1, high: 1, low: 1, close: 50_000, volume: 1 }]),
  };
  const service = new BacktestService(prisma as never, marketData as never);
  (service as unknown as { rnd: () => number }).rnd = () => 0;
  return { service, prisma, marketData };
}

/** Отказ сервиса как значение: проверяем и класс исключения, и код для фронта. */
async function rejection(p: Promise<unknown>): Promise<any> {
  return p.then(
    () => {
      throw new Error('ожидался отказ');
    },
    (e) => e,
  );
}

const SESSION = {
  id: 's1',
  userId: 'u1',
  status: 'active',
  startTime: new Date(T0),
  cursorTime: new Date(T0),
  startBalance: 10_000,
  balance: 10_000,
  defaultRiskPct: 1,
  hideDate: true,
  hidePrice: false,
  priceScale: 1,
};

const INPUT = { startBalance: 10_000, defaultRiskPct: 1, hideDate: true, hidePrice: false };

describe('BacktestService — сессии', () => {
  it('ставит старт в начало окна и момент сессии туда же', async () => {
    const { service, prisma, marketData } = makeService();

    await service.createSession('u1', INPUT);

    const start = T0 + 200 * DAY; // rnd = 0 → начало окна
    expect(marketData.getCandles).toHaveBeenCalledWith({ timeframe: 1, to: new Date(start - 60_000), limit: 1 });
    expect(prisma.backtestSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'u1',
        startTime: new Date(start),
        cursorTime: new Date(start),
        startBalance: 10_000,
        balance: 10_000,
        priceScale: 1,
        status: 'active',
      }),
    });
  });

  it('при скрытой цене считает масштаб от цены в точке старта', async () => {
    const { service, prisma } = makeService();

    await service.createSession('u1', { ...INPUT, hidePrice: true });

    const data = prisma.backtestSession.create.mock.calls[0][0].data;
    expect(data.priceScale).toBeCloseTo(100 / 50_000, 12);
  });

  it('без минутной истории сессию не создаёт', async () => {
    const { service, marketData, prisma } = makeService();
    marketData.getCoverage.mockResolvedValue([{ timeframe: 1440, from: new Date(T0), to: new Date(T0 + 1000 * DAY) }]);

    const err = await rejection(service.createSession('u1', INPUT));

    expect(err).toBeInstanceOf(ConflictException);
    expect(err.getResponse()).toMatchObject({ code: 'BACKTEST_NO_HISTORY' });
    expect(prisma.backtestSession.create).not.toHaveBeenCalled();
  });

  it('если минутки есть, но окна не набирается — тоже отказ', async () => {
    const { service, marketData } = makeService();
    marketData.getCoverage.mockResolvedValue([
      { timeframe: 1440, from: new Date(T0), to: new Date(T0 + 1000 * DAY) },
      { timeframe: 1, from: new Date(T0), to: new Date(T0 + 100 * DAY) },
    ]);

    const err = await rejection(service.createSession('u1', INPUT));

    expect(err.getResponse()).toMatchObject({ code: 'BACKTEST_NO_HISTORY' });
  });

  it('если в точке старта нет минутки — отказ, а не сессия без цены', async () => {
    const { service, marketData } = makeService();
    marketData.getCandles.mockResolvedValue([]);

    const err = await rejection(service.createSession('u1', INPUT));

    expect(err.getResponse()).toMatchObject({ code: 'BACKTEST_NO_HISTORY' });
  });

  it('чужая сессия отвечает 404', async () => {
    const { service, prisma } = makeService();
    prisma.backtestSession.findUnique.mockResolvedValue({ ...SESSION, userId: 'u2' });

    const err = await rejection(service.getSession('u1', 's1'));

    expect(err).toBeInstanceOf(NotFoundException);
    expect(err.getResponse()).toMatchObject({ code: 'BACKTEST_SESSION_NOT_FOUND' });
  });

  it('отдаёт сессию со сделками, итогом и просадкой по закрытым', async () => {
    const { service, prisma } = makeService();
    prisma.backtestSession.findUnique.mockResolvedValue({ ...SESSION, startBalance: 1000 });
    prisma.backtestTrade.findMany.mockResolvedValue([
      { id: 'a', entryTime: new Date(T0), exitTime: new Date(T0 + DAY), pnl: 100, r: 1, tags: [] },
      { id: 'b', entryTime: new Date(T0 + 2 * DAY), exitTime: new Date(T0 + 3 * DAY), pnl: -220, r: -1, tags: [] },
      { id: 'c', entryTime: new Date(T0 + 4 * DAY), exitTime: null, pnl: null, r: null, tags: [] },
    ]);

    const res = await service.getSession('u1', 's1');

    expect(res.trades).toHaveLength(3);
    expect(res.summary.trades).toBe(2);
    expect(res.summary.maxDrawdownPct).toBeCloseTo(20, 9); // 1000 → 1100 → 880
  });

  it('двигает момент только вперёд — самим UPDATE, а не сравнением в коде', async () => {
    const { service, prisma } = makeService();
    prisma.backtestSession.findUnique.mockResolvedValue({ ...SESSION, cursorTime: new Date(T0 + 5 * DAY) });

    const res = await service.advance('u1', 's1', new Date(T0 + DAY));

    const sql = (prisma.$executeRaw.mock.calls[0][0] as string[]).join('?');
    expect(sql).toContain('GREATEST');
    expect(res.cursorTime).toEqual(new Date(T0 + 5 * DAY));
  });

  it('не двигает чужую сессию', async () => {
    const { service, prisma } = makeService();
    prisma.backtestSession.findUnique.mockResolvedValue({ ...SESSION, userId: 'u2' });

    await rejection(service.advance('u1', 's1', new Date(T0 + DAY)));

    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it('не завершает сессию с открытой сделкой', async () => {
    const { service, prisma } = makeService();
    prisma.backtestSession.findUnique.mockResolvedValue(SESSION);
    prisma.backtestTrade.count.mockResolvedValue(1);

    const err = await rejection(service.finish('u1', 's1'));

    expect(err.getResponse()).toMatchObject({ code: 'BACKTEST_OPEN_TRADE' });
  });

  it('не завершает уже завершённую', async () => {
    const { service, prisma } = makeService();
    prisma.backtestSession.findUnique.mockResolvedValue({ ...SESSION, status: 'finished' });

    const err = await rejection(service.finish('u1', 's1'));

    expect(err.getResponse()).toMatchObject({ code: 'BACKTEST_SESSION_FINISHED' });
  });

  it('завершает: статус и время завершения', async () => {
    const { service, prisma } = makeService();
    prisma.backtestSession.findUnique.mockResolvedValue(SESSION);

    await service.finish('u1', 's1');

    expect(prisma.backtestSession.update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { status: 'finished', finishedAt: expect.any(Date) },
    });
  });
});
```

- [ ] **Step 2: Запустить и убедиться, что падает**

`npm test -- backtest.service.spec.ts` → FAIL, `Cannot find module './backtest.service'`.

- [ ] **Step 3: Написать реализацию**

`backend/src/backtest/backtest.service.ts`:

```ts
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { BacktestTrade, Prisma, Tag } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MarketDataService } from '../market-data/market-data.service';
import { MINUTE_MS, maxDrawdownPct, pickPriceScale, pickStart, startWindow, summarize } from './backtest-math';

export interface CreateSessionInput {
  startBalance: number;
  defaultRiskPct: number;
  hideDate: boolean;
  hidePrice: boolean;
}

/** Что подтягивать к сделке, чтобы отдать её с тегами. */
export const TAGS = { tags: { include: { tag: true } } } as const;

type TradeWithTags = BacktestTrade & { tags: { tag: Tag }[] };

/** Сделка наружу: теги плоским списком — так их рисует фронт. */
export function tradeView(t: TradeWithTags) {
  const { tags, ...rest } = t;
  return { ...rest, tags: tags.map(({ tag }) => ({ id: tag.id, name: tag.name, color: tag.color, type: tag.type })) };
}

/** Числа закрытой сделки для итогов; у закрытой pnl и r всегда есть. */
export const closedNumbers = (t: { pnl: number | null; r: number | null }) => ({ pnl: t.pnl ?? 0, r: t.r ?? 0 });

const noHistory = () =>
  new ConflictException({ message: 'История минуток ещё не загружена — сессию не на чем начать', code: 'BACKTEST_NO_HISTORY' });

export const sessionFinished = () =>
  new ConflictException({ message: 'Сессия уже завершена', code: 'BACKTEST_SESSION_FINISHED' });

@Injectable()
export class BacktestService {
  constructor(
    protected readonly prisma: PrismaService,
    protected readonly marketData: MarketDataService,
  ) {}

  /** Вынесено полем, чтобы тесты задавали случай. */
  protected rnd: () => number = Math.random;

  async createSession(userId: string, input: CreateSessionInput) {
    const coverage = await this.marketData.getCoverage();
    const win = startWindow(
      coverage.find((c) => c.timeframe === 1440),
      coverage.find((c) => c.timeframe === 1),
    );
    if (!win) throw noHistory();

    // Точку старта и масштаб выбирает сервер: иначе создание сессии можно было
    // бы перезапускать из браузера, пока не выпадет узнаваемый отрезок.
    const start = pickStart(win, this.rnd);
    // Цена в точке старта — закрытие минутки, которая кончается в момент старта.
    const [last] = await this.marketData.getCandles({ timeframe: 1, to: new Date(start - MINUTE_MS), limit: 1 });
    if (!last) throw noHistory();

    const session = await this.prisma.backtestSession.create({
      data: {
        userId,
        startTime: new Date(start),
        cursorTime: new Date(start),
        startBalance: input.startBalance,
        balance: input.startBalance,
        defaultRiskPct: input.defaultRiskPct,
        hideDate: input.hideDate,
        hidePrice: input.hidePrice,
        priceScale: input.hidePrice ? pickPriceScale(last.close, this.rnd) : 1,
        status: 'active',
      },
    });
    return { session };
  }

  async listSessions(userId: string) {
    const rows = await this.prisma.backtestSession.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { trades: { where: { exitTime: { not: null } }, select: { pnl: true, r: true } } },
    });
    return {
      sessions: rows.map(({ trades, ...s }) => ({ ...s, summary: summarize(trades.map(closedNumbers)) })),
    };
  }

  async getSession(userId: string, id: string) {
    const session = await this.ownedSession(userId, id);
    const trades = await this.prisma.backtestTrade.findMany({
      where: { sessionId: id },
      orderBy: { entryTime: 'asc' },
      include: TAGS,
    });
    const closed = trades
      .filter((t) => t.exitTime != null)
      .sort((a, b) => a.exitTime!.getTime() - b.exitTime!.getTime());
    return {
      session,
      trades: trades.map(tradeView),
      summary: {
        ...summarize(closed.map(closedNumbers)),
        maxDrawdownPct: maxDrawdownPct(session.startBalance, closed.map((t) => t.pnl ?? 0)),
      },
    };
  }

  async advance(userId: string, id: string, cursorTime: Date) {
    await this.ownedSession(userId, id);
    await this.bumpCursor(this.prisma, id, cursorTime);
    const s = await this.prisma.backtestSession.findUnique({ where: { id }, select: { cursorTime: true } });
    return { cursorTime: s!.cursorTime };
  }

  async finish(userId: string, id: string) {
    const s = await this.ownedSession(userId, id);
    if (s.status !== 'active') throw sessionFinished();
    // Позицию закрывает браузер (он знает цену момента), сервер только проверяет.
    const open = await this.prisma.backtestTrade.count({ where: { sessionId: id, exitTime: null } });
    if (open > 0) throw new ConflictException({ message: 'Сначала закройте открытую сделку', code: 'BACKTEST_OPEN_TRADE' });
    const session = await this.prisma.backtestSession.update({
      where: { id },
      data: { status: 'finished', finishedAt: new Date() },
    });
    return { session };
  }

  protected async ownedSession(userId: string, id: string) {
    const s = await this.prisma.backtestSession.findUnique({ where: { id } });
    // 404, а не 403: чужая сессия не должна подтверждать, что она существует.
    if (!s || s.userId !== userId) {
      throw new NotFoundException({ message: 'Сессия не найдена', code: 'BACKTEST_SESSION_NOT_FOUND' });
    }
    return s;
  }

  /**
   * Двигает момент сессии вперёд — и только вперёд: GREATEST в самом UPDATE, а
   * не сравнение в коде. Браузер сохраняет момент с задержкой, и запоздавшее
   * сохранение иначе отмотало бы назад момент, который уже продвинул вход в
   * сделку.
   *
   * В транзакциях входа и выхода этот же UPDATE — замок строки сессии: вход из
   * второй вкладки ждёт здесь, пока первый не закоммитится, и дальше видит уже
   * открытую сделку. `::timestamp(3)` — колонки Prisma хранят UTC без зоны.
   */
  protected bumpCursor(db: Prisma.TransactionClient, id: string, t: Date) {
    return db.$executeRaw`UPDATE "backtest_sessions" SET "cursorTime" = GREATEST("cursorTime", ${t}::timestamp(3)) WHERE "id" = ${id} AND "status" = 'active'`;
  }
}
```

- [ ] **Step 4: Запустить и убедиться, что проходит**

`npm test -- backtest.service.spec.ts` → PASS, 12 тестов.

- [ ] **Step 5: Коммит**

```bash
git add backend/src/backtest/backtest.service.ts backend/src/backtest/backtest.service.spec.ts
git commit -m "feat(backtest): сервис сессий — старт, список, момент, завершение

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Сервис — сделки и теги

**Files:**
- Modify: `backend/src/backtest/backtest.service.ts` — новые методы и импорты
- Test: `backend/src/backtest/backtest.service.spec.ts` — новый `describe` в конец файла

**Interfaces:**
- Consumes: `positionSize`, `tradeResult`, `stopOnRightSide`, `takeOnRightSide`, `Direction`, `ExitReason` из Task 2; `ownedSession`, `bumpCursor`, `tradeView`, `TAGS`, `sessionFinished` из Task 3; хелперы теста `makeService`, `rejection`, `SESSION`, `T0`, `DAY` из Task 3.
- Produces (методы `BacktestService`):
  - `interface OpenTradeInput { direction: Direction; entryTime: Date; entryPrice: number; stopLoss: number; takeProfit?: number; riskPct: number }`
  - `interface ModifyTradeInput { stopLoss?: number; takeProfit?: number | null }`
  - `interface CloseTradeInput { exitTime: Date; exitPrice: number; reason: ExitReason }`
  - `openTrade(userId, sessionId, input): Promise<{ trade: TradeView }>`
  - `modifyTrade(userId, tradeId, input): Promise<{ trade: TradeView }>`
  - `closeTrade(userId, tradeId, input): Promise<{ trade: TradeView; balance: number }>`
  - `setTradeTags(userId, tradeId, tagIds: string[]): Promise<{ success: true }>`
- Коды ошибок: `BACKTEST_STOP_SIDE`, `BACKTEST_TAKE_SIDE`, `BACKTEST_TIME_INVALID` (400); `BACKTEST_OPEN_TRADE`, `BACKTEST_TRADE_CLOSED`, `BACKTEST_SESSION_FINISHED` (409); `BACKTEST_TRADE_NOT_FOUND` (404); `TAGS_NOT_FOUND` (400, тот же код, что у тегов журнала).

- [ ] **Step 1: Дописать падающие тесты**

В конец `backend/src/backtest/backtest.service.spec.ts`; в строку импорта сверху добавить `BadRequestException`:

```ts
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
```

```ts
describe('BacktestService — сделки', () => {
  const OPEN = {
    direction: 'long' as const,
    entryTime: new Date(T0 + DAY),
    entryPrice: 100,
    stopLoss: 98,
    riskPct: 1,
  };

  const TRADE = {
    id: 't1',
    sessionId: 's1',
    direction: 'long',
    entryTime: new Date(T0),
    entryPrice: 100,
    stopLoss: 98,
    takeProfit: null,
    qty: 50,
    riskUsdt: 100,
    exitTime: null,
    exitPrice: null,
    session: SESSION,
  };

  it('открывает сделку: размер от депозита сессии, момент двигается под замком', async () => {
    const { service, prisma } = makeService();
    prisma.backtestSession.findUnique.mockResolvedValue(SESSION);

    await service.openTrade('u1', 's1', OPEN);

    expect(prisma.$executeRaw).toHaveBeenCalled();
    expect(prisma.backtestTrade.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sessionId: 's1', direction: 'long', riskUsdt: 100, qty: 50, takeProfit: null }),
      }),
    );
  });

  it('не открывает вторую сделку, пока есть открытая', async () => {
    const { service, prisma } = makeService();
    prisma.backtestSession.findUnique.mockResolvedValue(SESSION);
    prisma.backtestTrade.count.mockResolvedValue(1);

    const err = await rejection(service.openTrade('u1', 's1', OPEN));

    expect(err).toBeInstanceOf(ConflictException);
    expect(err.getResponse()).toMatchObject({ code: 'BACKTEST_OPEN_TRADE' });
    expect(prisma.backtestTrade.create).not.toHaveBeenCalled();
  });

  it('стоп лонга выше входа — отказ', async () => {
    const { service, prisma } = makeService();
    prisma.backtestSession.findUnique.mockResolvedValue(SESSION);

    const err = await rejection(service.openTrade('u1', 's1', { ...OPEN, stopLoss: 101 }));

    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.getResponse()).toMatchObject({ code: 'BACKTEST_STOP_SIDE' });
  });

  it('тейк шорта выше входа — отказ', async () => {
    const { service, prisma } = makeService();
    prisma.backtestSession.findUnique.mockResolvedValue(SESSION);

    const err = await rejection(
      service.openTrade('u1', 's1', { ...OPEN, direction: 'short', stopLoss: 102, takeProfit: 105 }),
    );

    expect(err.getResponse()).toMatchObject({ code: 'BACKTEST_TAKE_SIDE' });
  });

  it('вход раньше старта сессии — отказ', async () => {
    const { service, prisma } = makeService();
    prisma.backtestSession.findUnique.mockResolvedValue(SESSION);

    const err = await rejection(service.openTrade('u1', 's1', { ...OPEN, entryTime: new Date(T0 - DAY) }));

    expect(err.getResponse()).toMatchObject({ code: 'BACKTEST_TIME_INVALID' });
  });

  it('в завершённой сессии сделку не открыть', async () => {
    const { service, prisma } = makeService();
    prisma.backtestSession.findUnique.mockResolvedValue({ ...SESSION, status: 'finished' });

    const err = await rejection(service.openTrade('u1', 's1', OPEN));

    expect(err.getResponse()).toMatchObject({ code: 'BACKTEST_SESSION_FINISHED' });
  });

  it('закрывает: PnL, R и комиссию считает сервер, депозит растёт на PnL', async () => {
    const { service, prisma } = makeService();
    prisma.backtestTrade.findUnique.mockResolvedValue(TRADE);

    await service.closeTrade('u1', 't1', { exitTime: new Date(T0 + DAY), exitPrice: 104, reason: 'take' });

    const data = prisma.backtestTrade.update.mock.calls[0][0].data;
    expect(data.pnl).toBeCloseTo(194.39, 6);
    expect(data.r).toBeCloseTo(1.9439, 6);
    expect(data.fee).toBeCloseTo(5.61, 6);
    expect(data.exitReason).toBe('take');
    const inc = prisma.backtestSession.update.mock.calls[0][0].data.balance.increment;
    expect(inc).toBeCloseTo(194.39, 6);
  });

  it('выход не позже входа — отказ', async () => {
    const { service, prisma } = makeService();
    prisma.backtestTrade.findUnique.mockResolvedValue(TRADE);

    const err = await rejection(service.closeTrade('u1', 't1', { exitTime: new Date(T0), exitPrice: 104, reason: 'manual' }));

    expect(err.getResponse()).toMatchObject({ code: 'BACKTEST_TIME_INVALID' });
  });

  // Ответ на первое закрытие потерялся в сети, браузер отправил то же ещё раз.
  it('повтор того же закрытия — не ошибка и не второе начисление', async () => {
    const { service, prisma } = makeService();
    const closed = { ...TRADE, exitTime: new Date(T0 + DAY), exitPrice: 104 };
    prisma.backtestTrade.findUnique.mockResolvedValue({ ...closed, tags: [] });

    await service.closeTrade('u1', 't1', { exitTime: new Date(T0 + DAY), exitPrice: 104, reason: 'take' });

    expect(prisma.backtestTrade.update).not.toHaveBeenCalled();
    expect(prisma.backtestSession.update).not.toHaveBeenCalled();
  });

  it('закрыть уже закрытую другими данными — отказ', async () => {
    const { service, prisma } = makeService();
    prisma.backtestTrade.findUnique.mockResolvedValue({ ...TRADE, exitTime: new Date(T0 + DAY), exitPrice: 104 });

    const err = await rejection(service.closeTrade('u1', 't1', { exitTime: new Date(T0 + 2 * DAY), exitPrice: 90, reason: 'stop' }));

    expect(err.getResponse()).toMatchObject({ code: 'BACKTEST_TRADE_CLOSED' });
  });

  it('чужая сделка отвечает 404', async () => {
    const { service, prisma } = makeService();
    prisma.backtestTrade.findUnique.mockResolvedValue({ ...TRADE, session: { ...SESSION, userId: 'u2' } });

    const err = await rejection(service.modifyTrade('u1', 't1', { stopLoss: 99 }));

    expect(err).toBeInstanceOf(NotFoundException);
    expect(err.getResponse()).toMatchObject({ code: 'BACKTEST_TRADE_NOT_FOUND' });
  });

  it('тейк можно убрать, передав null', async () => {
    const { service, prisma } = makeService();
    prisma.backtestTrade.findUnique.mockResolvedValue({ ...TRADE, takeProfit: 105 });

    await service.modifyTrade('u1', 't1', { takeProfit: null });

    expect(prisma.backtestTrade.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 't1' }, data: { takeProfit: null } }),
    );
  });

  it('закрытую сделку не двигают', async () => {
    const { service, prisma } = makeService();
    prisma.backtestTrade.findUnique.mockResolvedValue({ ...TRADE, exitTime: new Date(T0 + DAY) });

    const err = await rejection(service.modifyTrade('u1', 't1', { stopLoss: 99 }));

    expect(err.getResponse()).toMatchObject({ code: 'BACKTEST_TRADE_CLOSED' });
  });

  it('теги — только свои', async () => {
    const { service, prisma } = makeService();
    prisma.backtestTrade.findUnique.mockResolvedValue(TRADE);
    prisma.tag.count.mockResolvedValue(1);

    const err = await rejection(service.setTradeTags('u1', 't1', ['g1', 'g2']));

    expect(err.getResponse()).toMatchObject({ code: 'TAGS_NOT_FOUND' });
    expect(prisma.backtestTradeTag.deleteMany).not.toHaveBeenCalled();
  });

  it('заменяет набор тегов целиком', async () => {
    const { service, prisma } = makeService();
    prisma.backtestTrade.findUnique.mockResolvedValue(TRADE);
    prisma.tag.count.mockResolvedValue(2);

    await service.setTradeTags('u1', 't1', ['g1', 'g2', 'g1']);

    expect(prisma.backtestTradeTag.deleteMany).toHaveBeenCalledWith({ where: { tradeId: 't1' } });
    expect(prisma.backtestTradeTag.createMany).toHaveBeenCalledWith({
      data: [
        { tradeId: 't1', tagId: 'g1' },
        { tradeId: 't1', tagId: 'g2' },
      ],
    });
  });
});
```

- [ ] **Step 2: Запустить и убедиться, что новые тесты падают**

`npm test -- backtest.service.spec.ts` → FAIL: `service.openTrade is not a function` и соседние.

- [ ] **Step 3: Дописать сервис**

Импорты в `backtest.service.ts` заменить на:

```ts
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { BacktestTrade, Prisma, Tag } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MarketDataService } from '../market-data/market-data.service';
import {
  MINUTE_MS,
  maxDrawdownPct,
  pickPriceScale,
  pickStart,
  positionSize,
  startWindow,
  stopOnRightSide,
  summarize,
  takeOnRightSide,
  tradeResult,
  type Direction,
  type ExitReason,
} from './backtest-math';
```

После `CreateSessionInput` добавить:

```ts
export interface OpenTradeInput {
  direction: Direction;
  entryTime: Date;
  entryPrice: number;
  stopLoss: number;
  takeProfit?: number;
  riskPct: number;
}

export interface ModifyTradeInput {
  stopLoss?: number;
  /** null — убрать тейк. */
  takeProfit?: number | null;
}

export interface CloseTradeInput {
  exitTime: Date;
  exitPrice: number;
  reason: ExitReason;
}

const timeInvalid = () =>
  new BadRequestException({ message: 'Время сделки вне сессии или раньше входа', code: 'BACKTEST_TIME_INVALID' });

const tradeClosed = () => new ConflictException({ message: 'Сделка уже закрыта', code: 'BACKTEST_TRADE_CLOSED' });
```

Внутрь класса, перед `ownedSession`, добавить методы:

```ts
  async openTrade(userId: string, sessionId: string, input: OpenTradeInput) {
    const s = await this.ownedSession(userId, sessionId);
    if (s.status !== 'active') throw sessionFinished();
    if (input.entryTime.getTime() < s.startTime.getTime()) throw timeInvalid();
    // Сторона — только при входе: дальше стоп можно тянуть в безубыток и в
    // прибыль, а текущей цены сервер не знает (её проверяет браузер).
    if (!stopOnRightSide(input.direction, input.entryPrice, input.stopLoss)) {
      throw new BadRequestException({ message: 'Стоп стоит не по ту сторону от входа', code: 'BACKTEST_STOP_SIDE' });
    }
    if (input.takeProfit != null && !takeOnRightSide(input.direction, input.entryPrice, input.takeProfit)) {
      throw new BadRequestException({ message: 'Тейк стоит не по ту сторону от входа', code: 'BACKTEST_TAKE_SIDE' });
    }

    return this.prisma.$transaction(async (tx) => {
      // Первым делом — строка сессии: она двигает момент и держит замок (см. bumpCursor).
      await this.bumpCursor(tx, sessionId, input.entryTime);
      const open = await tx.backtestTrade.count({ where: { sessionId, exitTime: null } });
      if (open > 0) throw new ConflictException({ message: 'Открытая сделка уже есть', code: 'BACKTEST_OPEN_TRADE' });
      // Депозит — под замком: закрытие прошлой сделки могло поменять его после чтения выше.
      const fresh = await tx.backtestSession.findUnique({ where: { id: sessionId }, select: { balance: true } });
      const { riskUsdt, qty } = positionSize(fresh!.balance, input.riskPct, input.entryPrice, input.stopLoss);
      const trade = await tx.backtestTrade.create({
        data: {
          sessionId,
          direction: input.direction,
          entryTime: input.entryTime,
          entryPrice: input.entryPrice,
          stopLoss: input.stopLoss,
          takeProfit: input.takeProfit ?? null,
          riskPct: input.riskPct,
          riskUsdt,
          qty,
        },
        include: TAGS,
      });
      return { trade: tradeView(trade) };
    });
  }

  async modifyTrade(userId: string, tradeId: string, input: ModifyTradeInput) {
    const trade = await this.ownedTrade(userId, tradeId);
    if (trade.exitTime) throw tradeClosed();
    if (trade.session.status !== 'active') throw sessionFinished();
    const data: { stopLoss?: number; takeProfit?: number | null } = {};
    if (input.stopLoss !== undefined) data.stopLoss = input.stopLoss;
    if (input.takeProfit !== undefined) data.takeProfit = input.takeProfit;
    const updated = await this.prisma.backtestTrade.update({ where: { id: tradeId }, data, include: TAGS });
    return { trade: tradeView(updated) };
  }

  async closeTrade(userId: string, tradeId: string, input: CloseTradeInput) {
    const trade = await this.ownedTrade(userId, tradeId);
    if (trade.exitTime) {
      // Повтор того же закрытия (ответ потерялся, браузер отправил снова) — не ошибка.
      if (trade.exitTime.getTime() === input.exitTime.getTime() && trade.exitPrice === input.exitPrice) {
        const same = await this.prisma.backtestTrade.findUnique({ where: { id: tradeId }, include: TAGS });
        return { trade: tradeView(same!), balance: trade.session.balance };
      }
      throw tradeClosed();
    }
    if (input.exitTime.getTime() <= trade.entryTime.getTime()) throw timeInvalid();

    // Какая цена и когда исполнилась — решил браузер; сколько это в деньгах —
    // сервер, одной формулой для всей статистики.
    const { fee, pnl, r } = tradeResult({
      direction: trade.direction as Direction,
      entryPrice: trade.entryPrice,
      exitPrice: input.exitPrice,
      qty: trade.qty,
      riskUsdt: trade.riskUsdt,
    });

    return this.prisma.$transaction(async (tx) => {
      await this.bumpCursor(tx, trade.sessionId, input.exitTime);
      const updated = await tx.backtestTrade.update({
        where: { id: tradeId },
        data: { exitTime: input.exitTime, exitPrice: input.exitPrice, exitReason: input.reason, fee, pnl, r },
        include: TAGS,
      });
      const session = await tx.backtestSession.update({
        where: { id: trade.sessionId },
        data: { balance: { increment: pnl } },
      });
      return { trade: tradeView(updated), balance: session.balance };
    });
  }

  async setTradeTags(userId: string, tradeId: string, tagIds: string[]) {
    await this.ownedTrade(userId, tradeId);
    const unique = [...new Set(tagIds)];
    if (unique.length > 0) {
      const owned = await this.prisma.tag.count({ where: { userId, id: { in: unique } } });
      if (owned !== unique.length) {
        throw new BadRequestException({ message: 'Некоторые теги не найдены', code: 'TAGS_NOT_FOUND' });
      }
    }
    await this.prisma.$transaction([
      this.prisma.backtestTradeTag.deleteMany({ where: { tradeId } }),
      ...(unique.length > 0
        ? [this.prisma.backtestTradeTag.createMany({ data: unique.map((tagId) => ({ tradeId, tagId })) })]
        : []),
    ]);
    return { success: true as const };
  }

  protected async ownedTrade(userId: string, id: string) {
    const trade = await this.prisma.backtestTrade.findUnique({ where: { id }, include: { session: true } });
    if (!trade || trade.session.userId !== userId) {
      throw new NotFoundException({ message: 'Сделка не найдена', code: 'BACKTEST_TRADE_NOT_FOUND' });
    }
    return trade;
  }
```

- [ ] **Step 4: Запустить и убедиться, что проходит**

`npm test -- backtest.service.spec.ts` → PASS, 27 тестов (12 из Task 3 + 15 новых).

- [ ] **Step 5: Коммит**

```bash
git add backend/src/backtest/backtest.service.ts backend/src/backtest/backtest.service.spec.ts
git commit -m "feat(backtest): сделки бектеста — вход, правка уровней, закрытие, теги

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Сервис — статистика по всем сессиям

**Files:**
- Modify: `backend/src/backtest/backtest.service.ts` — метод `stats`
- Test: `backend/src/backtest/backtest.service.spec.ts` — новый `describe` в конец

**Interfaces:**
- Consumes: `summarize` из Task 2; `TAGS`, `closedNumbers` из Task 3; хелперы теста из Task 3.
- Produces: `stats(userId): Promise<{ overall: Summary & { sessions: number }; byTag: ({ tag: { id; name; color; type } } & Summary)[] }>` — `byTag` отсортирован по числу сделок по убыванию, при равенстве — по имени.

- [ ] **Step 1: Дописать падающие тесты**

В конец `backend/src/backtest/backtest.service.spec.ts`:

```ts
describe('BacktestService — статистика', () => {
  const tag = (id: string, name: string) => ({ tag: { id, name, color: '#111111', type: 'setup' } });

  // Как в журнале (statsByTag): сделка не делится между тегами, а целиком идёт каждому.
  it('сделка засчитывается каждому своему тегу, общий итог — по одному разу', async () => {
    const { service, prisma } = makeService();
    prisma.backtestSession.count.mockResolvedValue(2);
    prisma.backtestTrade.findMany.mockResolvedValue([
      { id: 'a', pnl: 10, r: 1, tags: [tag('x', 'Пробой'), tag('y', 'Ретест')] },
      { id: 'b', pnl: -5, r: -0.5, tags: [tag('x', 'Пробой')] },
    ]);

    const res = await service.stats('u1');

    expect(res.overall).toMatchObject({ sessions: 2, trades: 2, pnl: 5 });
    expect(res.byTag.map((b) => [b.tag.id, b.trades])).toEqual([
      ['x', 2],
      ['y', 1],
    ]);
    expect(res.byTag[0].totalR).toBeCloseTo(0.5, 9);
  });

  it('берёт только закрытые сделки своих сессий', async () => {
    const { service, prisma } = makeService();

    await service.stats('u1');

    expect(prisma.backtestTrade.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { session: { userId: 'u1' }, exitTime: { not: null } } }),
    );
  });
});
```

- [ ] **Step 2: Запустить и убедиться, что падает**

`npm test -- backtest.service.spec.ts` → FAIL: `service.stats is not a function`.

- [ ] **Step 3: Дописать метод**

В класс `BacktestService`, после `setTradeTags`:

```ts
  async stats(userId: string) {
    const [sessions, trades] = await Promise.all([
      this.prisma.backtestSession.count({ where: { userId } }),
      this.prisma.backtestTrade.findMany({
        where: { session: { userId }, exitTime: { not: null } },
        include: TAGS,
      }),
    ]);

    type TagRef = { id: string; name: string; color: string; type: string };
    const buckets = new Map<string, { tag: TagRef; rows: { pnl: number; r: number }[] }>();
    for (const t of trades) {
      // Сделка засчитывается целиком каждому своему тегу, как в журнале
      // (statsByTag): деление поровну обессмыслило бы число. Поэтому строки по
      // тегам пересекаются и в общий итог не складываются.
      for (const { tag } of t.tags) {
        const bucket = buckets.get(tag.id) ?? {
          tag: { id: tag.id, name: tag.name, color: tag.color, type: tag.type },
          rows: [],
        };
        bucket.rows.push(closedNumbers(t));
        buckets.set(tag.id, bucket);
      }
    }

    return {
      overall: { sessions, ...summarize(trades.map(closedNumbers)) },
      byTag: [...buckets.values()]
        .map(({ tag, rows }) => ({ tag, ...summarize(rows) }))
        .sort((a, b) => b.trades - a.trades || a.tag.name.localeCompare(b.tag.name)),
    };
  }
```

- [ ] **Step 4: Запустить и убедиться, что проходит**

`npm test -- backtest.service.spec.ts` → PASS, 29 тестов.

- [ ] **Step 5: Коммит**

```bash
git add backend/src/backtest/backtest.service.ts backend/src/backtest/backtest.service.spec.ts
git commit -m "feat(backtest): статистика бектеста по всем сессиям и по тегам

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: DTO, контроллер, модуль

**Files:**
- Create: `backend/src/backtest/dto/backtest.dto.ts`
- Create: `backend/src/backtest/backtest.controller.ts`
- Create: `backend/src/backtest/backtest.module.ts`
- Modify: `backend/src/app.module.ts` — импорт и запись `BacktestModule` после `MarketEventsModule`

**Interfaces:**
- Consumes: все методы `BacktestService` из Tasks 3–5; `MarketDataModule` из `backend/src/market-data/market-data.module.ts` (экспортирует `MarketDataService`); `JwtAuthGuard` из `../auth/guards/jwt-auth.guard`; `CurrentUser` из `../auth/decorators/current-user.decorator`.
- Produces — HTTP API (все под `JwtAuthGuard`), тела — JSON, времена — ISO-строки:

| Метод | Путь | Тело | Ответ |
|---|---|---|---|
| POST | `/api/backtest/sessions` | `{ startBalance, defaultRiskPct, hideDate, hidePrice }` | `{ session }` |
| GET | `/api/backtest/sessions` | — | `{ sessions: (session & { summary })[] }` |
| GET | `/api/backtest/sessions/:id` | — | `{ session, trades, summary }` |
| PATCH | `/api/backtest/sessions/:id` | `{ cursorTime }` | `{ cursorTime }` |
| POST | `/api/backtest/sessions/:id/finish` | — | `{ session }` |
| POST | `/api/backtest/sessions/:id/trades` | `{ direction, entryTime, entryPrice, stopLoss, takeProfit?, riskPct }` | `{ trade }` |
| PATCH | `/api/backtest/trades/:id` | `{ stopLoss?, takeProfit?: number \| null }` | `{ trade }` |
| POST | `/api/backtest/trades/:id/close` | `{ exitTime, exitPrice, reason }` | `{ trade, balance }` |
| PUT | `/api/backtest/trades/:id/tags` | `{ tagIds }` | `{ success: true }` |
| GET | `/api/backtest/stats` | — | `{ overall, byTag }` |

- [ ] **Step 1: DTO**

`backend/src/backtest/dto/backtest.dto.ts`:

```ts
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  Min,
} from 'class-validator';
import type { Direction, ExitReason } from '../backtest-math';

export class CreateSessionDto {
  @IsNumber()
  @Min(100)
  @Max(10_000_000)
  startBalance: number;

  @IsNumber()
  @Min(0.01)
  @Max(100)
  defaultRiskPct: number;

  @IsBoolean()
  hideDate: boolean;

  @IsBoolean()
  hidePrice: boolean;
}

export class AdvanceDto {
  @IsISO8601()
  cursorTime: string;
}

export class OpenTradeDto {
  @IsIn(['long', 'short'])
  direction: Direction;

  @IsISO8601()
  entryTime: string;

  @IsPositive()
  entryPrice: number;

  /** Обязателен: сделка без стопа в бектесте не принимается. */
  @IsPositive()
  stopLoss: number;

  @IsOptional()
  @IsPositive()
  takeProfit?: number;

  @IsNumber()
  @Min(0.01)
  @Max(100)
  riskPct: number;
}

export class ModifyTradeDto {
  @IsOptional()
  @IsPositive()
  stopLoss?: number;

  /** null — убрать тейк; IsOptional пропускает и null, и отсутствие поля. */
  @IsOptional()
  @IsPositive()
  takeProfit?: number | null;
}

export class CloseTradeDto {
  @IsISO8601()
  exitTime: string;

  @IsPositive()
  exitPrice: number;

  @IsIn(['stop', 'take', 'manual', 'finish'])
  reason: ExitReason;
}

export class SetBacktestTagsDto {
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  tagIds: string[];
}
```

- [ ] **Step 2: Контроллер**

`backend/src/backtest/backtest.controller.ts`:

```ts
import { Body, Controller, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { BacktestService } from './backtest.service';
import {
  AdvanceDto,
  CloseTradeDto,
  CreateSessionDto,
  ModifyTradeDto,
  OpenTradeDto,
  SetBacktestTagsDto,
} from './dto/backtest.dto';

@UseGuards(JwtAuthGuard)
@Controller('api/backtest')
export class BacktestController {
  constructor(private readonly backtest: BacktestService) {}

  @Post('sessions')
  create(@CurrentUser('userId') userId: string, @Body() dto: CreateSessionDto) {
    return this.backtest.createSession(userId, dto);
  }

  @Get('sessions')
  list(@CurrentUser('userId') userId: string) {
    return this.backtest.listSessions(userId);
  }

  @Get('sessions/:id')
  get(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.backtest.getSession(userId, id);
  }

  // Момент сессии браузер сохраняет с задержкой; сервер двигает его только вперёд.
  @Patch('sessions/:id')
  advance(@CurrentUser('userId') userId: string, @Param('id') id: string, @Body() dto: AdvanceDto) {
    return this.backtest.advance(userId, id, new Date(dto.cursorTime));
  }

  @Post('sessions/:id/finish')
  finish(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.backtest.finish(userId, id);
  }

  @Post('sessions/:id/trades')
  open(@CurrentUser('userId') userId: string, @Param('id') id: string, @Body() dto: OpenTradeDto) {
    return this.backtest.openTrade(userId, id, { ...dto, entryTime: new Date(dto.entryTime) });
  }

  @Patch('trades/:id')
  modify(@CurrentUser('userId') userId: string, @Param('id') id: string, @Body() dto: ModifyTradeDto) {
    return this.backtest.modifyTrade(userId, id, dto);
  }

  @Post('trades/:id/close')
  close(@CurrentUser('userId') userId: string, @Param('id') id: string, @Body() dto: CloseTradeDto) {
    return this.backtest.closeTrade(userId, id, { ...dto, exitTime: new Date(dto.exitTime) });
  }

  @Put('trades/:id/tags')
  tags(@CurrentUser('userId') userId: string, @Param('id') id: string, @Body() dto: SetBacktestTagsDto) {
    return this.backtest.setTradeTags(userId, id, dto.tagIds);
  }

  @Get('stats')
  stats(@CurrentUser('userId') userId: string) {
    return this.backtest.stats(userId);
  }
}
```

- [ ] **Step 3: Модуль и подключение**

`backend/src/backtest/backtest.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { MarketDataModule } from '../market-data/market-data.module';
import { BacktestController } from './backtest.controller';
import { BacktestService } from './backtest.service';

@Module({
  imports: [MarketDataModule],
  controllers: [BacktestController],
  providers: [BacktestService],
})
export class BacktestModule {}
```

В `backend/src/app.module.ts` — импорт рядом с `MarketEventsModule`:

```ts
import { BacktestModule } from './backtest/backtest.module';
```

и запись в `imports` строкой ниже `MarketEventsModule`:

```ts
    MarketEventsModule,
    BacktestModule,
```

- [ ] **Step 4: Проверить весь бэкенд**

Из `backend/`:

```
npm test
npx tsc --noEmit -p tsconfig.json
npm run build
```

Ожидается: все тесты зелёные (до задачи было 361, плюс 18 + 29 новых), типы и сборка без ошибок.

Если backend запущен (`npm run start:dev` на хосте), маршрут должен отвечать 401 без куки, а не 404:

```
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8091/api/backtest/sessions
```

- [ ] **Step 5: Коммит**

```bash
git add backend/src/backtest/dto/backtest.dto.ts backend/src/backtest/backtest.controller.ts backend/src/backtest/backtest.module.ts backend/src/app.module.ts
git commit -m "feat(backtest): эндпоинты бектеста и подключение модуля

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Движок — свечи и часы сессии

**Files:**
- Create: `frontend/src/views/backtest/lib/candles.ts`
- Test: `frontend/src/views/backtest/lib/candles.test.ts`

**Interfaces:**
- Produces (экспорт из `candles.ts`):
  - `interface Candle { t: number; o: number; h: number; l: number; c: number }` — `t` = время открытия, мс
  - `interface ApiCandle { time: string; open: number; high: number; low: number; close: number; volume: number }`
  - `MINUTE = 60_000`, `DAY = 86_400_000`, `TIMEFRAMES = [1, 5, 15, 60, 240, 1440] as const`
  - `fromApi(c: ApiCandle): Candle`, `tfMs(tf): number`, `bucketStart(t, tf): number`
  - `currentBucket(cursor, tf): number`, `nextStop(cursor, tf): number`
  - `aggregate(minutes: Candle[], tf: number, from: number, to: number): Candle[]`
  - `visibleCandles({ closed, anchor, minutes, tf, cursor }): Candle[]`
  - `lastPrice(minutes, cursor): number | null`, `loadedUntil(minutes): number | null`
  - `dayNumber(t, start): number`

Смысл «момента сессии» (`cursor`) во всех функциях: время **закрытия** последней показанной минутки. Минутка с открытием `t` показана, если `t < cursor`.

- [ ] **Step 1: Написать падающий тест**

`frontend/src/views/backtest/lib/candles.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  MINUTE,
  aggregate,
  currentBucket,
  dayNumber,
  lastPrice,
  loadedUntil,
  nextStop,
  visibleCandles,
  type Candle,
} from './candles';

const H = 60 * MINUTE;
const at = (h: number, m = 0) => Date.UTC(2024, 2, 5, h, m);

/** n минуток подряд от from; цены растут на единицу, чтобы порядок был виден. */
const mins = (from: number, n: number, base = 100): Candle[] =>
  Array.from({ length: n }, (_, i) => ({
    t: from + i * MINUTE,
    o: base + i,
    h: base + i + 0.5,
    l: base + i - 0.5,
    c: base + i + 0.25,
  }));

describe('корзины и шаг', () => {
  // Ровно на границе часа последняя показанная минутка — 11:59, и текущая
  // часовая свеча — 11:00, уже целиком закрытая.
  it('на границе текущая корзина — предыдущая', () => {
    expect(currentBucket(at(12), 60)).toBe(at(11));
    expect(currentBucket(at(12, 30), 60)).toBe(at(12));
  });

  it('шаг доводит недоформированную свечу до закрытия', () => {
    expect(nextStop(at(12, 30), 60)).toBe(at(13));
    expect(nextStop(at(13, 10), 240)).toBe(at(16));
  });

  it('шаг от закрытой свечи — до закрытия следующей', () => {
    expect(nextStop(at(12), 60)).toBe(at(13));
  });
});

describe('aggregate', () => {
  it('сворачивает минутки в часовку: open первой, close последней, крайние high и low', () => {
    const [c] = aggregate(mins(at(12), 60), 60, at(12), at(13));
    expect(c).toEqual({ t: at(12), o: 100, h: 159.5, l: 99.5, c: 159.25 });
  });

  it('берёт только минутки из [from, to)', () => {
    const out = aggregate(mins(at(11), 180), 60, at(12), at(13));
    expect(out.map((x) => x.t)).toEqual([at(12)]);
  });
});

describe('visibleCandles', () => {
  const closed: Candle[] = [
    { t: at(10), o: 1, h: 2, l: 0.5, c: 1.5 },
    { t: at(11), o: 1.5, h: 2.5, l: 1, c: 2 },
    // Лишняя: история из API обязана кончаться до anchor, и такая свеча отбрасывается.
    { t: at(12), o: 9, h: 9, l: 9, c: 9 },
  ];

  it('история до anchor, дальше — из минуток, последняя недоформирована', () => {
    const out = visibleCandles({ closed, anchor: at(12), minutes: mins(at(12), 120), tf: 60, cursor: at(13, 30) });
    expect(out.map((x) => x.t)).toEqual([at(10), at(11), at(12), at(13)]);
    expect(out[2].o).toBe(100); // собрана из минуток, а не взята из API
    expect(out[3].c).toBe(100 + 89 + 0.25); // последняя показанная минутка — 13:29
  });

  it('минутки после момента сессии не видны', () => {
    const out = visibleCandles({ closed: [], anchor: at(12), minutes: mins(at(12), 120), tf: 1, cursor: at(12, 5) });
    expect(out).toHaveLength(5);
  });
});

describe('lastPrice и loadedUntil', () => {
  it('цена — закрытие последней минутки до момента', () => {
    expect(lastPrice(mins(at(12), 10), at(12, 3))).toBe(102.25);
  });

  it('нет минуток до момента — null', () => {
    expect(lastPrice(mins(at(12), 10), at(12))).toBeNull();
  });

  it('загружено до закрытия последней минутки', () => {
    expect(loadedUntil(mins(at(12), 10))).toBe(at(12, 10));
    expect(loadedUntil([])).toBeNull();
  });
});

describe('dayNumber', () => {
  // Местное время, чтобы тест не зависел от часового пояса машины.
  it('день старта — первый, следующая полночь — второй', () => {
    const start = new Date(2024, 2, 5, 10, 0).getTime();
    expect(dayNumber(new Date(2024, 2, 5, 23, 0).getTime(), start)).toBe(1);
    expect(dayNumber(new Date(2024, 2, 6, 0, 30).getTime(), start)).toBe(2);
    expect(dayNumber(new Date(2024, 2, 12, 9, 0).getTime(), start)).toBe(8);
  });
});
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Из `frontend/`: `npm test -- candles` → FAIL, модуль не найден.

- [ ] **Step 3: Написать реализацию**

`frontend/src/views/backtest/lib/candles.ts`:

```ts
/**
 * Свечи движка прокрутки. Время сессии идёт по минуткам, а свеча любого
 * таймфрейма — это корзина минуток: так на старшем таймфрейме последняя свеча
 * выглядит ровно такой, какой была в текущую минуту, и будущее не видно ни на
 * одном таймфрейме.
 *
 * «Момент сессии» (cursor) здесь везде — время ЗАКРЫТИЯ последней показанной
 * минутки: минутка с открытием t показана, если t < cursor.
 */

/** Свеча во внутреннем виде. `t` — время ОТКРЫТИЯ, мс. */
export interface Candle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
}

/** Свеча, как её отдаёт `/api/market-data/candles`: время открытия ISO-строкой. */
export interface ApiCandle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export const MINUTE = 60_000;
export const DAY = 86_400_000;
export const TIMEFRAMES = [1, 5, 15, 60, 240, 1440] as const;

export const fromApi = (c: ApiCandle): Candle => ({ t: Date.parse(c.time), o: c.open, h: c.high, l: c.low, c: c.close });

export const tfMs = (tf: number) => tf * MINUTE;

/** Начало корзины таймфрейма, куда попадает момент t. Корзины выровнены по UTC — как у биржи. */
export const bucketStart = (t: number, tf: number) => Math.floor(t / tfMs(tf)) * tfMs(tf);

/**
 * Корзина, которой принадлежит последняя показанная минутка. Ищем по моменту
 * минус минута: ровно на границе часа последняя показанная минутка — 11:59, и
 * текущая часовая свеча — 11:00, уже целиком закрытая.
 */
export const currentBucket = (cursor: number, tf: number) => bucketStart(cursor - MINUTE, tf);

/** Куда ведёт «Шаг»: до закрытия текущей свечи таймфрейма, а если она уже закрыта — следующей. */
export const nextStop = (cursor: number, tf: number) => bucketStart(cursor, tf) + tfMs(tf);

/** Сворачивает отсортированные минутки с from ≤ t < to в свечи таймфрейма. */
export function aggregate(minutes: Candle[], tf: number, from: number, to: number): Candle[] {
  const out: Candle[] = [];
  let cur: Candle | null = null;
  for (const m of minutes) {
    if (m.t < from) continue;
    if (m.t >= to) break;
    const b = bucketStart(m.t, tf);
    if (!cur || cur.t !== b) {
      if (cur) out.push(cur);
      cur = { t: b, o: m.o, h: m.h, l: m.l, c: m.c };
    } else {
      cur.h = Math.max(cur.h, m.h);
      cur.l = Math.min(cur.l, m.l);
      cur.c = m.c;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/**
 * Что видно на графике в момент cursor: закрытые свечи таймфрейма из API (все
 * раньше anchor — момента, до которого их загрузили) и дальше свечи, собранные
 * из минуток до cursor; последняя из них — недоформированная.
 */
export function visibleCandles(p: { closed: Candle[]; anchor: number; minutes: Candle[]; tf: number; cursor: number }): Candle[] {
  const past = p.closed.filter((c) => c.t < p.anchor);
  return [...past, ...aggregate(p.minutes, p.tf, p.anchor, p.cursor)];
}

/** Цена последней показанной минутки — по ней входят и закрываются вручную. */
export function lastPrice(minutes: Candle[], cursor: number): number | null {
  for (let i = minutes.length - 1; i >= 0; i--) {
    if (minutes[i].t < cursor) return minutes[i].c;
  }
  return null;
}

/** Время закрытия последней загруженной минутки. */
export const loadedUntil = (minutes: Candle[]) => (minutes.length ? minutes[minutes.length - 1].t + MINUTE : null);

/** Номер дня от старта по местному календарю: день старта — первый. Для скрытой даты. */
export function dayNumber(t: number, start: number): number {
  const a = new Date(start);
  a.setHours(0, 0, 0, 0);
  const b = new Date(t);
  b.setHours(0, 0, 0, 0);
  // round, а не floor: переход на летнее время делает сутки на час короче или длиннее.
  return Math.round((b.getTime() - a.getTime()) / DAY) + 1;
}
```

- [ ] **Step 4: Запустить и убедиться, что проходит**

`npm test -- candles` → PASS, 11 тестов.

- [ ] **Step 5: Коммит**

```bash
git add frontend/src/views/backtest/lib/candles.ts frontend/src/views/backtest/lib/candles.test.ts
git commit -m "feat(backtest): свечи прокрутки — корзины таймфреймов и сборка из минуток

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Движок — срабатывание и деньги

**Files:**
- Create: `frontend/src/views/backtest/lib/fills.ts`, `frontend/src/views/backtest/lib/money.ts`
- Test: `frontend/src/views/backtest/lib/fills.test.ts`, `frontend/src/views/backtest/lib/money.test.ts`

**Interfaces:**
- Consumes: `MINUTE`, `Candle` из Task 7.
- Produces:
  - `fills.ts`: `type Direction = 'long' | 'short'`; `interface Position { direction: Direction; stopLoss: number; takeProfit: number | null }`; `interface Exit { reason: 'stop' | 'take'; price: number; time: number }` (`time` — закрытие сработавшей минутки); `checkMinute(p, m): Exit | null`; `findExit(p, minutes, from, to): Exit | null`.
  - `money.ts`: `FEE_RATE = 0.00055`; `previewSize(balance, riskPct, entry, stop): { riskUsdt; qty; notional; leverage } | null`; `unrealizedPnl(direction, entry, price, qty): number`; `toScreen(price, scale)`, `fromScreen(price, scale)`; `formatR(r): string`; `toInput(v): string`; `type LevelError = 'stopRequired' | 'stopSide' | 'takeSide'`; `checkLevels(direction, price, stop, take | null): LevelError | null`.

- [ ] **Step 1: Написать падающие тесты**

`frontend/src/views/backtest/lib/fills.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { MINUTE, type Candle } from './candles';
import { checkMinute, findExit, type Position } from './fills';

const T = Date.UTC(2024, 2, 5, 12, 0);
const m = (o: number, h: number, l: number, c: number, t = T): Candle => ({ t, o, h, l, c });
const LONG: Position = { direction: 'long', stopLoss: 98, takeProfit: 105 };
const SHORT: Position = { direction: 'short', stopLoss: 102, takeProfit: 95 };

describe('checkMinute', () => {
  it('касание стопа лонга — по стопу, в закрытие минутки', () => {
    expect(checkMinute(LONG, m(100, 101, 97.5, 99))).toEqual({ reason: 'stop', price: 98, time: T + MINUTE });
  });

  it('стоп ровно на минимуме — сработал', () => {
    expect(checkMinute(LONG, m(100, 101, 98, 99))?.reason).toBe('stop');
  });

  // Как на бирже: при гэпе стоп исполняется хуже заявленного.
  it('гэп за стопом — по цене открытия', () => {
    expect(checkMinute(LONG, m(97, 97.5, 96, 96.5))).toMatchObject({ reason: 'stop', price: 97 });
  });

  // Лучше заявленного тейк не исполняется — иначе гэп работал бы в пользу трейдера.
  it('гэп за тейком — по тейку, а не по открытию', () => {
    expect(checkMinute(LONG, m(106, 107, 105.5, 106.5))).toMatchObject({ reason: 'take', price: 105 });
  });

  it('касание тейка — по тейку', () => {
    expect(checkMinute(LONG, m(104, 105.2, 103, 105))).toMatchObject({ reason: 'take', price: 105 });
  });

  it('стоп и тейк в одной минутке — стоп', () => {
    expect(checkMinute(LONG, m(100, 106, 97, 101))?.reason).toBe('stop');
  });

  it('шорт зеркально: стоп сверху, тейк снизу', () => {
    expect(checkMinute(SHORT, m(100, 102.5, 99, 101))).toMatchObject({ reason: 'stop', price: 102 });
    expect(checkMinute(SHORT, m(96, 97, 94, 95.5))).toMatchObject({ reason: 'take', price: 95 });
  });

  it('без тейка проверяется только стоп', () => {
    expect(checkMinute({ ...LONG, takeProfit: null }, m(104, 200, 103, 150))).toBeNull();
  });
});

describe('findExit', () => {
  const series = [m(100, 101, 99, 100, T), m(100, 101, 97, 98, T + MINUTE), m(98, 110, 90, 100, T + 2 * MINUTE)];

  it('первая сработавшая минутка в окне', () => {
    expect(findExit(LONG, series, T, T + 3 * MINUTE)).toMatchObject({ reason: 'stop', time: T + 2 * MINUTE });
  });

  it('минутки раньше from не проверяются', () => {
    expect(findExit(LONG, series, T + 2 * MINUTE, T + 3 * MINUTE)).toMatchObject({ time: T + 3 * MINUTE });
  });

  it('минутка, которая закрывается после to, не проверяется', () => {
    expect(findExit(LONG, series, T, T + MINUTE)).toBeNull();
  });
});
```

`frontend/src/views/backtest/lib/money.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { checkLevels, formatR, fromScreen, previewSize, toInput, toScreen, unrealizedPnl } from './money';

describe('previewSize', () => {
  it('риск, размер, номинал и плечо', () => {
    expect(previewSize(10_000, 1, 100, 98)).toEqual({ riskUsdt: 100, qty: 50, notional: 5000, leverage: 0.5 });
  });

  it('стоп на цене входа — размера нет', () => {
    expect(previewSize(10_000, 1, 100, 100)).toBeNull();
  });
});

describe('unrealizedPnl', () => {
  it('с обеими комиссиями, как посчитает сервер при закрытии', () => {
    expect(unrealizedPnl('long', 100, 104, 50)).toBeCloseTo(194.39, 6);
    expect(unrealizedPnl('short', 100, 98, 50)).toBeCloseTo(94.555, 6);
  });
});

describe('масштаб скрытой цены', () => {
  it('туда и обратно без потери точности', () => {
    const scale = 523.7 / 63_512.37;
    for (const p of [63_512.37, 17_234.5, 3_101.01]) {
      expect(Math.abs(fromScreen(toScreen(p, scale), scale) - p) / p).toBeLessThanOrEqual(1e-9);
    }
  });
});

describe('formatR и toInput', () => {
  it('R со знаком', () => {
    expect(formatR(1.9439)).toBe('+1.94R');
    expect(formatR(-1.05445)).toBe('−1.05R');
  });

  it('поле ввода без хвоста из пятнадцати знаков', () => {
    expect(toInput(0.1 + 0.2)).toBe('0.3');
    expect(toInput(523.456789123)).toBe('523.45679');
  });
});

describe('checkLevels', () => {
  it('стоп обязателен', () => {
    expect(checkLevels('long', 100, NaN, null)).toBe('stopRequired');
  });

  it('стоп лонга ниже цены, тейк выше', () => {
    expect(checkLevels('long', 100, 98, 105)).toBeNull();
    expect(checkLevels('long', 100, 100, null)).toBe('stopSide');
    expect(checkLevels('long', 100, 98, 99)).toBe('takeSide');
  });

  it('шорт зеркально', () => {
    expect(checkLevels('short', 100, 102, 95)).toBeNull();
    expect(checkLevels('short', 100, 99, null)).toBe('stopSide');
  });
});
```

- [ ] **Step 2: Запустить и убедиться, что падают**

`npm test -- fills money` → FAIL, модули не найдены.

- [ ] **Step 3: Написать реализацию**

`frontend/src/views/backtest/lib/fills.ts`:

```ts
import { MINUTE, type Candle } from './candles';

/**
 * Срабатывание стопа и тейка. Проверяется по минуткам, какой бы таймфрейм ни
 * был на экране: иначе нельзя сказать, что сработало первым, если оба уровня
 * попали в одну свечу часовика.
 *
 * Логика живёт только здесь: сервер получает готовые время, цену и причину и
 * лишь пересчитывает по ним деньги. Вторая реализация на бэкенде однажды
 * разошлась бы с этой — и молча.
 */

export type Direction = 'long' | 'short';

export interface Position {
  direction: Direction;
  stopLoss: number;
  takeProfit: number | null;
}

export interface Exit {
  reason: 'stop' | 'take';
  price: number;
  /** Закрытие минутки, в которой сработало. */
  time: number;
}

/** Правила в порядке спеки; первое совпавшее решает. */
export function checkMinute(p: Position, m: Candle): Exit | null {
  const long = p.direction === 'long';
  const s = p.stopLoss;
  const tp = p.takeProfit;
  const time = m.t + MINUTE;

  // 1. Гэп за стопом — по открытию, то есть хуже стопа, как на бирже.
  if (long ? m.o <= s : m.o >= s) return { reason: 'stop', price: m.o, time };
  // 2. Гэп за тейком — по тейку: лучше заявленного тейк не исполняется.
  if (tp != null && (long ? m.o >= tp : m.o <= tp)) return { reason: 'take', price: tp, time };
  // 3 и 5. Касание стопа — стоп, даже если в той же минутке задет и тейк:
  // порядок внутри минутки не восстановить, честнее предполагать худшее.
  if (long ? m.l <= s : m.h >= s) return { reason: 'stop', price: s, time };
  // 4. Касание тейка.
  if (tp != null && (long ? m.h >= tp : m.l <= tp)) return { reason: 'take', price: tp, time };
  return null;
}

/** Первая сработавшая минутка среди открытых не раньше from и закрытых не позже to. */
export function findExit(p: Position, minutes: Candle[], from: number, to: number): Exit | null {
  for (const m of minutes) {
    if (m.t < from) continue;
    if (m.t + MINUTE > to) break;
    const exit = checkMinute(p, m);
    if (exit) return exit;
  }
  return null;
}
```

`frontend/src/views/backtest/lib/money.ts`:

```ts
import type { Direction } from './fills';

/**
 * Деньги на экране прокрутки — предпросмотр. Окончательные размер, PnL и R
 * считает сервер (`backend/src/backtest/backtest-math.ts`); здесь те же формулы,
 * чтобы число до отправки не расходилось с тем, что вернётся.
 */

/** Та же ставка, что на сервере (`FEE_RATE` в backtest-math.ts). */
export const FEE_RATE = 0.00055;

export function previewSize(balance: number, riskPct: number, entry: number, stop: number) {
  const dist = Math.abs(entry - stop);
  if (!(dist > 0) || !(balance > 0) || !(riskPct > 0)) return null;
  const riskUsdt = (balance * riskPct) / 100;
  const qty = riskUsdt / dist;
  const notional = qty * entry;
  // Плечо справочное: маржа и ликвидация в бектесте не моделируются.
  return { riskUsdt, qty, notional, leverage: notional / balance };
}

/** Результат, если закрыть сейчас: с комиссией входа и выхода. */
export function unrealizedPnl(direction: Direction, entry: number, price: number, qty: number): number {
  const sign = direction === 'long' ? 1 : -1;
  return sign * (price - entry) * qty - (entry + price) * qty * FEE_RATE;
}

/**
 * Скрытая цена — только способ показа. В базе цены настоящие; на экран они
 * идут умноженными на масштаб сессии, а введённое пользователем делится обратно.
 * На R и PnL масштаб не влияет: размер — риск / |вход − стоп|, и он сокращается.
 */
export const toScreen = (price: number, scale: number) => price * scale;
export const fromScreen = (price: number, scale: number) => price / scale;

export const formatR = (r: number) => `${r >= 0 ? '+' : '−'}${Math.abs(r).toFixed(2)}R`;

/** Число для поля ввода: после умножения на масштаб без хвоста из пятнадцати знаков. */
export const toInput = (v: number) => String(Number(v.toPrecision(8)));

export type LevelError = 'stopRequired' | 'stopSide' | 'takeSide';

/**
 * Уровни относительно текущей цены (в одних единицах — экранных или
 * настоящих). Проверка браузера: при правке открытой сделки сервер сторону не
 * проверяет, потому что текущей цены не знает.
 */
export function checkLevels(direction: Direction, price: number, stop: number, take: number | null): LevelError | null {
  if (!(stop > 0)) return 'stopRequired';
  if (direction === 'long' ? stop >= price : stop <= price) return 'stopSide';
  if (take != null && (direction === 'long' ? take <= price : take >= price)) return 'takeSide';
  return null;
}
```

- [ ] **Step 4: Запустить и убедиться, что проходят**

`npm test -- fills money` → PASS: fills 11, money 9.

- [ ] **Step 5: Коммит**

```bash
git add frontend/src/views/backtest/lib/fills.ts frontend/src/views/backtest/lib/fills.test.ts frontend/src/views/backtest/lib/money.ts frontend/src/views/backtest/lib/money.test.ts
git commit -m "feat(backtest): срабатывание стопа и тейка по минуткам, предпросмотр денег

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: Типы и запросы к API

**Files:**
- Create: `frontend/src/views/backtest/api/types.ts`
- Create: `frontend/src/views/backtest/api/hooks.ts`

**Interfaces:**
- Consumes: `apiJson`, `qs` из `@/shared/api/http`; `TagItem` из `@/entities/tag`; `Candle`, `ApiCandle`, `fromApi` из Task 7; `Direction` из Task 8.
- Produces:
  - типы `BacktestSession`, `BacktestTrade`, `ExitReason`, `Summary`, `SessionDetail`, `SessionListItem`, `TagSummary`, `BacktestStats`, реэкспорт `Direction`;
  - хуки `useBacktestSessions()`, `useBacktestStats()`, `useBacktestSession(id)`, `useCreateSession()`, `useFinishSession(id)`, `useOpenTrade(id)`, `useModifyTrade(id)`, `useCloseTrade(id)`, `useSetBacktestTags(id)`;
  - функции `saveCursor(id, cursor, keepalive?)`, `fetchCandles(tf, { from?, to?, limit })`.
  - Сигнатуры мутаций (аргумент `mutate`): `useCreateSession` — `{ startBalance, defaultRiskPct, hideDate, hidePrice }`; `useOpenTrade` — `{ direction, entryTime: string, entryPrice, stopLoss, takeProfit?, riskPct }`; `useModifyTrade` — `{ tradeId, stopLoss?, takeProfit?: number | null }`; `useCloseTrade` — `{ tradeId, exitTime: string, exitPrice, reason: ExitReason }`; `useSetBacktestTags` — `{ tradeId, tagIds }`; `useFinishSession` — без аргумента.

- [ ] **Step 1: Типы**

`frontend/src/views/backtest/api/types.ts`:

```ts
import type { TagItem } from '@/entities/tag';
import type { Direction } from '../lib/fills';

export type { Direction };
export type ExitReason = 'stop' | 'take' | 'manual' | 'finish';

/** Как её отдаёт `/api/backtest/sessions*`. Цены везде настоящие, без масштаба показа. */
export interface BacktestSession {
  id: string;
  startTime: string;
  cursorTime: string;
  startBalance: number;
  balance: number;
  defaultRiskPct: number;
  hideDate: boolean;
  hidePrice: boolean;
  priceScale: number;
  status: 'active' | 'finished';
  createdAt: string;
  finishedAt: string | null;
}

export interface BacktestTrade {
  id: string;
  sessionId: string;
  direction: Direction;
  entryTime: string;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number | null;
  riskPct: number;
  riskUsdt: number;
  qty: number;
  exitTime: string | null;
  exitPrice: number | null;
  exitReason: ExitReason | null;
  fee: number | null;
  pnl: number | null;
  r: number | null;
  tags: TagItem[];
}

export interface Summary {
  trades: number;
  wins: number;
  winRate: number;
  totalR: number;
  avgR: number;
  pnl: number;
}

export interface SessionDetail {
  session: BacktestSession;
  trades: BacktestTrade[];
  summary: Summary & { maxDrawdownPct: number };
}

export interface SessionListItem extends BacktestSession {
  summary: Summary;
}

export interface TagSummary extends Summary {
  tag: TagItem;
}

export interface BacktestStats {
  overall: Summary & { sessions: number };
  byTag: TagSummary[];
}
```

- [ ] **Step 2: Хуки и запросы**

`frontend/src/views/backtest/api/hooks.ts`:

```ts
'use client';

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { apiJson, qs } from '@/shared/api/http';
import { fromApi, type ApiCandle, type Candle } from '../lib/candles';
import type {
  BacktestSession,
  BacktestStats,
  BacktestTrade,
  Direction,
  ExitReason,
  SessionDetail,
  SessionListItem,
} from './types';

const sessionKey = (id: string) => ['backtest', 'session', id] as const;

export const useBacktestSessions = () =>
  useQuery({
    queryKey: ['backtest', 'sessions'],
    queryFn: () => apiJson<{ sessions: SessionListItem[] }>('/api/backtest/sessions'),
  });

export const useBacktestStats = () =>
  useQuery({
    queryKey: ['backtest', 'stats'],
    queryFn: () => apiJson<BacktestStats>('/api/backtest/stats'),
  });

export const useBacktestSession = (id: string) =>
  useQuery({
    queryKey: sessionKey(id),
    queryFn: () => apiJson<SessionDetail>(`/api/backtest/sessions/${id}`),
  });

/**
 * После любой правки: сама сессия, список и общая статистика. И после отказа
 * тоже — сервер мог отказать потому, что состояние уже другое (вторая вкладка),
 * и экран обязан показать то, что есть на самом деле.
 */
function refresh(qc: QueryClient, id?: string) {
  if (id) void qc.invalidateQueries({ queryKey: sessionKey(id) });
  void qc.invalidateQueries({ queryKey: ['backtest', 'sessions'] });
  void qc.invalidateQueries({ queryKey: ['backtest', 'stats'] });
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const useCreateSession = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { startBalance: number; defaultRiskPct: number; hideDate: boolean; hidePrice: boolean }) =>
      apiJson<{ session: BacktestSession }>('/api/backtest/sessions', json('POST', input)),
    onSettled: () => refresh(qc),
  });
};

export const useFinishSession = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiJson<{ session: BacktestSession }>(`/api/backtest/sessions/${id}/finish`, json('POST')),
    onSettled: () => refresh(qc, id),
  });
};

export const useOpenTrade = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      direction: Direction;
      entryTime: string;
      entryPrice: number;
      stopLoss: number;
      takeProfit?: number;
      riskPct: number;
    }) => apiJson<{ trade: BacktestTrade }>(`/api/backtest/sessions/${id}/trades`, json('POST', input)),
    onSettled: () => refresh(qc, id),
  });
};

export const useModifyTrade = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tradeId, ...body }: { tradeId: string; stopLoss?: number; takeProfit?: number | null }) =>
      apiJson<{ trade: BacktestTrade }>(`/api/backtest/trades/${tradeId}`, json('PATCH', body)),
    onSettled: () => refresh(qc, id),
  });
};

export const useCloseTrade = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tradeId, ...body }: { tradeId: string; exitTime: string; exitPrice: number; reason: ExitReason }) =>
      apiJson<{ trade: BacktestTrade; balance: number }>(`/api/backtest/trades/${tradeId}/close`, json('POST', body)),
    // Закрытие нельзя терять: повторы с паузой. Сервер принимает повтор того же
    // закрытия как успех, так что потерянный ответ не превращается в ошибку.
    retry: 3,
    retryDelay: (attempt) => 1000 * 2 ** attempt,
    onSettled: () => refresh(qc, id),
  });
};

export const useSetBacktestTags = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tradeId, tagIds }: { tradeId: string; tagIds: string[] }) =>
      apiJson<{ success: boolean }>(`/api/backtest/trades/${tradeId}/tags`, json('PUT', { tagIds })),
    onSettled: () => refresh(qc, id),
  });
};

/**
 * Сохранить момент сессии. keepalive — для ухода со страницы: такой запрос
 * браузер доводит до конца, даже когда вкладку уже закрывают.
 */
export const saveCursor = (id: string, cursor: number, keepalive = false) =>
  apiJson<{ cursorTime: string }>(`/api/backtest/sessions/${id}`, {
    ...json('PATCH', { cursorTime: new Date(cursor).toISOString() }),
    keepalive,
  });

/** Свечи хранилища. Без from и с limit — последние limit свечей до to, по возрастанию. */
export async function fetchCandles(tf: number, range: { from?: number; to?: number; limit: number }): Promise<Candle[]> {
  const rows = await apiJson<ApiCandle[]>(
    `/api/market-data/candles${qs({ tf, from: range.from, to: range.to, limit: range.limit })}`,
  );
  return rows.map(fromApi);
}
```

- [ ] **Step 3: Проверить типы**

Из `frontend/`: `npx tsc --noEmit -p tsconfig.json` → без ошибок.

- [ ] **Step 4: Коммит**

```bash
git add frontend/src/views/backtest/api/types.ts frontend/src/views/backtest/api/hooks.ts
git commit -m "feat(backtest): типы и запросы бектеста на фронте

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 10: Тексты интерфейса и стили

Тексты идут раньше компонентов намеренно: компоненты в задачах 11–14 берут ключи **только** из этого списка.

**Files:**
- Modify: `frontend/src/shared/i18n/messages/ru.json`, `frontend/src/shared/i18n/messages/en.json`
- Modify: `frontend/src/app/globals.css` — блок после строки `.asym > .set { max-width: none; }`

**Interfaces:**
- Produces: пространство `backtest` (ключи ниже, в обоих языках одинаковые), `nav.backtest`, коды ошибок `BACKTEST_*` в `errors`; CSS-классы `.replay-chart`, `.lvl-hit`, `.replay-controls`, `.order-panel`.

- [ ] **Step 1: `ru.json`**

В объект `nav` добавить `"backtest": "Бектест"` после `"market"`.

В объект `errors` добавить:

```json
    "BACKTEST_NO_HISTORY": "История минуток ещё не загружена — сессию не на чем начать",
    "BACKTEST_SESSION_NOT_FOUND": "Сессия не найдена",
    "BACKTEST_SESSION_FINISHED": "Сессия уже завершена",
    "BACKTEST_OPEN_TRADE": "Сначала закройте открытую сделку",
    "BACKTEST_TRADE_NOT_FOUND": "Сделка не найдена",
    "BACKTEST_TRADE_CLOSED": "Сделка уже закрыта",
    "BACKTEST_STOP_SIDE": "Стоп стоит не по ту сторону от входа",
    "BACKTEST_TAKE_SIDE": "Тейк стоит не по ту сторону от входа",
    "BACKTEST_TIME_INVALID": "Время сделки вне сессии или раньше входа"
```

Новый объект верхнего уровня `backtest` сразу после объекта `market`:

```json
  "backtest": {
    "startTitle": "Новая сессия",
    "startLead": "Случайный отрезок истории BTC. Будущее скрыто: свечи открываются по одной, в сделку вы входите и выходите сами.",
    "deposit": "Депозит, USDT",
    "riskDefault": "Риск на сделку, %",
    "date": "Дата",
    "price": "Цена",
    "show": "Показывать",
    "hide": "Скрыть",
    "start": "Начать",
    "starting": "Выбираем отрезок…",
    "startFailed": "Не удалось начать сессию",
    "sessionsTitle": "Сессии",
    "noSessions": "Сессий пока нет",
    "noSessionsHint": "Начните первую — выводы появятся, когда сделок наберутся десятки.",
    "colStarted": "Начата",
    "colStatus": "Статус",
    "colTrades": "Сделок",
    "colWinRate": "Винрейт",
    "colTotalR": "Итог, R",
    "colPnl": "PnL",
    "colBlind": "Вслепую",
    "blindDate": "дата",
    "blindPrice": "цена",
    "status": { "active": "идёт", "finished": "завершена" },
    "continue": "Продолжить",
    "open": "Открыть",
    "statsTitle": "Все сессии",
    "statSessions": "Сессий",
    "statTrades": "Сделок",
    "statWinRate": "Винрейт",
    "statTotalR": "Итог",
    "statAvgR": "Средняя сделка",
    "statPnl": "PnL",
    "statMaxDd": "Макс. просадка",
    "byTagTitle": "По тегам",
    "colTag": "Тег",
    "colAvgR": "Средняя, R",
    "tagsOverlap": "Сделка с несколькими тегами засчитана каждому из них — строки пересекаются и в общий итог не складываются.",
    "noTagStats": "Размеченных сделок пока нет",
    "loadFailed": "Не удалось загрузить сессию",
    "timeframe": "Таймфрейм",
    "tf": { "1": "1м", "5": "5м", "15": "15м", "60": "1ч", "240": "4ч", "1440": "1д" },
    "step": "Шаг",
    "speed": "Автопрокрутка",
    "pause": "Пауза",
    "backToList": "К списку",
    "historyEnded": "История кончилась — сессия завершается.",
    "dayN": "день {n}",
    "level": { "entry": "вход", "stop": "стоп", "take": "тейк" },
    "balance": "Депозит",
    "risk": "Риск, %",
    "stop": "Стоп",
    "take": "Тейк (по желанию)",
    "preview": "Номинал {notional} USDT · плечо {leverage}× · риск {risk} USDT",
    "long": "Лонг",
    "short": "Шорт",
    "direction": { "long": "Лонг", "short": "Шорт" },
    "entry": "вход",
    "apply": "Применить уровни",
    "closeMarket": "Закрыть по рынку",
    "finish": "Завершить сессию",
    "unrealized": "Сейчас",
    "rHint": "R — во сколько рисков обошлась или сколько рисков принесла сделка. −1R — полный стоп, +2R — прибыль в два риска.",
    "stopRequired": "Поставьте стоп — без него сделка не открывается.",
    "riskInvalid": "Риск — от 0.01 до 100 %.",
    "stopSide": "Стоп стоит не по ту сторону от цены.",
    "takeSide": "Тейк стоит не по ту сторону от цены.",
    "tradesTitle": "Сделки сессии",
    "noTrades": "Сделок пока нет",
    "colDir": "Сторона",
    "colEntry": "Вход",
    "colExit": "Выход",
    "colReason": "Выход по",
    "colR": "R",
    "colTags": "Теги",
    "reason": { "stop": "стопу", "take": "тейку", "manual": "рынку", "finish": "завершению", "open": "открыта" },
    "closeFailed": "Закрытие сделки не сохранилось.",
    "retryClose": "Повторить",
    "actionFailed": "Не удалось выполнить действие",
    "finishTitle": "Завершить сессию?",
    "finishSubtitle": "Продолжить её будет нельзя.",
    "finishOpenTrade": "Открытая сделка закроется по рынку.",
    "finishReveal": "Откроются настоящие даты и цены отрезка.",
    "finishWord": "ЗАВЕРШИТЬ",
    "summaryTitle": "Итог сессии",
    "revealed": "Отрезок: {from} — {to}",
    "balanceFromTo": "Депозит: {from} → {to} USDT"
  },
```

- [ ] **Step 2: `en.json`**

`nav`: `"backtest": "Backtest"` после `"market"`.

`errors`:

```json
    "BACKTEST_NO_HISTORY": "Minute history isn't loaded yet — there's nothing to start a session on",
    "BACKTEST_SESSION_NOT_FOUND": "Session not found",
    "BACKTEST_SESSION_FINISHED": "The session is already finished",
    "BACKTEST_OPEN_TRADE": "Close the open trade first",
    "BACKTEST_TRADE_NOT_FOUND": "Trade not found",
    "BACKTEST_TRADE_CLOSED": "The trade is already closed",
    "BACKTEST_STOP_SIDE": "The stop is on the wrong side of the entry",
    "BACKTEST_TAKE_SIDE": "The take-profit is on the wrong side of the entry",
    "BACKTEST_TIME_INVALID": "The trade time is outside the session or before the entry"
```

`backtest` после `market`:

```json
  "backtest": {
    "startTitle": "New session",
    "startLead": "A random stretch of BTC history. The future is hidden: candles open one by one, and you enter and exit trades yourself.",
    "deposit": "Deposit, USDT",
    "riskDefault": "Risk per trade, %",
    "date": "Date",
    "price": "Price",
    "show": "Show",
    "hide": "Hide",
    "start": "Start",
    "starting": "Picking a stretch…",
    "startFailed": "Couldn't start the session",
    "sessionsTitle": "Sessions",
    "noSessions": "No sessions yet",
    "noSessionsHint": "Start the first one — conclusions appear once trades number in the dozens.",
    "colStarted": "Started",
    "colStatus": "Status",
    "colTrades": "Trades",
    "colWinRate": "Win rate",
    "colTotalR": "Total, R",
    "colPnl": "PnL",
    "colBlind": "Blind",
    "blindDate": "date",
    "blindPrice": "price",
    "status": { "active": "running", "finished": "finished" },
    "continue": "Continue",
    "open": "Open",
    "statsTitle": "All sessions",
    "statSessions": "Sessions",
    "statTrades": "Trades",
    "statWinRate": "Win rate",
    "statTotalR": "Total",
    "statAvgR": "Average trade",
    "statPnl": "PnL",
    "statMaxDd": "Max drawdown",
    "byTagTitle": "By tag",
    "colTag": "Tag",
    "colAvgR": "Average, R",
    "tagsOverlap": "A trade with several tags counts fully toward each of them — rows overlap and don't add up to the total.",
    "noTagStats": "No tagged trades yet",
    "loadFailed": "Couldn't load the session",
    "timeframe": "Timeframe",
    "tf": { "1": "1m", "5": "5m", "15": "15m", "60": "1h", "240": "4h", "1440": "1d" },
    "step": "Step",
    "speed": "Autoplay",
    "pause": "Pause",
    "backToList": "Back to list",
    "historyEnded": "History has run out — finishing the session.",
    "dayN": "day {n}",
    "level": { "entry": "entry", "stop": "stop", "take": "take" },
    "balance": "Deposit",
    "risk": "Risk, %",
    "stop": "Stop",
    "take": "Take-profit (optional)",
    "preview": "Notional {notional} USDT · leverage {leverage}× · risk {risk} USDT",
    "long": "Long",
    "short": "Short",
    "direction": { "long": "Long", "short": "Short" },
    "entry": "entry",
    "apply": "Apply levels",
    "closeMarket": "Close at market",
    "finish": "Finish session",
    "unrealized": "Now",
    "rHint": "R is how many risks a trade cost or earned. −1R is a full stop, +2R is a profit of two risks.",
    "stopRequired": "Set a stop — a trade won't open without one.",
    "riskInvalid": "Risk must be between 0.01 and 100 %.",
    "stopSide": "The stop is on the wrong side of the price.",
    "takeSide": "The take-profit is on the wrong side of the price.",
    "tradesTitle": "Session trades",
    "noTrades": "No trades yet",
    "colDir": "Side",
    "colEntry": "Entry",
    "colExit": "Exit",
    "colReason": "Exit by",
    "colR": "R",
    "colTags": "Tags",
    "reason": { "stop": "stop", "take": "take-profit", "manual": "market", "finish": "finish", "open": "open" },
    "closeFailed": "The trade close wasn't saved.",
    "retryClose": "Retry",
    "actionFailed": "The action failed",
    "finishTitle": "Finish the session?",
    "finishSubtitle": "You won't be able to continue it.",
    "finishOpenTrade": "The open trade will be closed at market.",
    "finishReveal": "The real dates and prices of the stretch will be revealed.",
    "finishWord": "FINISH",
    "summaryTitle": "Session summary",
    "revealed": "Stretch: {from} — {to}",
    "balanceFromTo": "Deposit: {from} → {to} USDT"
  },
```

- [ ] **Step 3: Стили**

В `frontend/src/app/globals.css` сразу после строки `  .asym > .set { max-width: none; }`:

```css

  /* ═══════════════ БЕКТЕСТ ═══════════════ */
  /* touch-action: none — иначе на телефоне перетаскивание стопа прокручивало бы страницу. */
  .replay-chart { display: block; width: 100%; height: auto; touch-action: none; user-select: none; }
  .replay-chart .lvl-hit { cursor: ns-resize; }
  .replay-controls { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s3); margin-top: var(--s3); }
  .order-panel { display: grid; gap: var(--s3); align-content: start; }
```

- [ ] **Step 4: Проверить, что JSON цел и ключи языков совпадают**

Из `frontend/`:

```
node -e "const ru=require('./src/shared/i18n/messages/ru.json'),en=require('./src/shared/i18n/messages/en.json');const keys=(o,p='')=>Object.entries(o).flatMap(([k,v])=>v&&typeof v==='object'?keys(v,p+k+'.'):[p+k]);const a=new Set(keys(ru.backtest)),b=new Set(keys(en.backtest));const diff=[...a].filter(k=>!b.has(k)).concat([...b].filter(k=>!a.has(k)));console.log('keys:',a.size,'diff:',diff);if(!ru.nav.backtest||!en.nav.backtest||!ru.errors.BACKTEST_NO_HISTORY||!en.errors.BACKTEST_NO_HISTORY)process.exit(1);if(diff.length)process.exit(1)"
```

Ожидается: `keys: 100 diff: []`, код выхода 0.

- [ ] **Step 5: Коммит**

```bash
git add frontend/src/shared/i18n/messages/ru.json frontend/src/shared/i18n/messages/en.json frontend/src/app/globals.css
git commit -m "feat(backtest): тексты и стили страницы бектеста

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 11: График прокрутки

**Files:**
- Create: `frontend/src/views/backtest/components/ReplayChart.tsx`

**Interfaces:**
- Consumes: `Candle` из Task 7; `formatPriceGrouped` из `@/shared/lib/utils/format`; классы `.replay-chart`, `.lvl-hit` из Task 10.
- Produces:
  - `type LevelKind = 'entry' | 'stop' | 'take'`, `interface Level { kind: LevelKind; price: number; draggable: boolean }`
  - `ReplayChart({ candles, levels, labelFor, levelLabel, onDragLevel? })` — все цены **в экранных единицах** (масштаб применяет вызывающий); `onDragLevel(kind, price, done)` зовётся на каждом движении с `done = false` и один раз при отпускании с `done = true`.

- [ ] **Step 1: Компонент**

`frontend/src/views/backtest/components/ReplayChart.tsx`:

```tsx
'use client';

import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { formatPriceGrouped } from '@/shared/lib/utils/format';
import type { Candle } from '../lib/candles';

const W = 720;
const H = 380;
const PR = 72; // полоса цен справа
const PT = 14;
const PB = 24;
const PW = W - PR;
/** Столько свечей помещается на холст; если их меньше, они прижаты вправо — к «сейчас». */
const SLOTS = 120;
const TICKS = 5;

export type LevelKind = 'entry' | 'stop' | 'take';

export interface Level {
  kind: LevelKind;
  price: number;
  draggable: boolean;
}

const LEVEL_COLOR: Record<LevelKind, string> = {
  entry: 'var(--color-fg)',
  stop: 'var(--loss)',
  take: 'var(--profit)',
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * График прокрутки: свечи до текущего момента и уровни сделки.
 *
 * Своё SVG, как все графики продукта (см. RangeCheckChart): библиотеке
 * пришлось бы переопределять цвета, шрифты и рамки по одному свойству. Холст
 * масштабируется целиком, поэтому пиксельные мерки переводятся в единицы
 * холста через u = W / boxW — иначе на телефоне подписи выходили бы в четыре
 * пикселя.
 *
 * Стоп и тейк перетаскиваются. Пока уровень тянут, шкала цен заморожена: иначе
 * уровень, уходящий за край, растягивал бы шкалу, и линия уезжала бы из-под
 * курсора.
 */
export function ReplayChart({
  candles,
  levels,
  labelFor,
  levelLabel,
  onDragLevel,
}: {
  candles: Candle[];
  levels: Level[];
  labelFor: (t: number) => string;
  levelLabel: (kind: LevelKind) => string;
  onDragLevel?: (kind: LevelKind, price: number, done: boolean) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [boxW, setBoxW] = useState(0);
  const [drag, setDrag] = useState<LevelKind | null>(null);
  const frozen = useRef<{ lo: number; hi: number } | null>(null);
  const lastDrag = useRef<number | null>(null);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    setBoxW(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(([entry]) => setBoxW(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const u = boxW > 0 ? W / boxW : 1;
  const px = (n: number) => n * u;

  const shown = candles.slice(-SLOTS);
  let lo: number;
  let hi: number;
  if (drag && frozen.current) {
    ({ lo, hi } = frozen.current);
  } else {
    const values = [...shown.flatMap((c) => [c.h, c.l]), ...levels.map((l) => l.price)];
    lo = values.length ? Math.min(...values) : 0;
    hi = values.length ? Math.max(...values) : 1;
    const pad = (hi - lo) * 0.06 || Math.abs(hi) * 0.01 || 1;
    lo -= pad;
    hi += pad;
  }

  const plotH = H - PT - PB;
  const y = (p: number) => PT + ((hi - p) / (hi - lo)) * plotH;
  const priceAt = (yy: number) => clamp(hi - ((yy - PT) / plotH) * (hi - lo), lo, hi);
  const slot = PW / SLOTS;
  const offset = SLOTS - shown.length;
  const cx = (i: number) => (offset + i) * slot + slot / 2;
  const bodyW = Math.max(px(1), slot * 0.66);

  const svgY = (clientY: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    return ((clientY - r.top) / r.height) * H;
  };

  const startDrag = (kind: LevelKind) => (e: PointerEvent<SVGRectElement>) => {
    svgRef.current?.setPointerCapture(e.pointerId);
    frozen.current = { lo, hi };
    setDrag(kind);
  };

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    if (!drag || !onDragLevel) return;
    const p = priceAt(svgY(e.clientY));
    lastDrag.current = p;
    onDragLevel(drag, p, false);
  };

  const endDrag = () => {
    if (drag && onDragLevel && lastDrag.current != null) onDragLevel(drag, lastDrag.current, true);
    setDrag(null);
    frozen.current = null;
    lastDrag.current = null;
  };

  const ticks = Array.from({ length: TICKS }, (_, i) => lo + ((i + 0.5) / TICKS) * (hi - lo));
  const timeIdx = shown.length ? [...new Set([0.15, 0.5, 0.85].map((f) => Math.floor(f * (shown.length - 1))))] : [];

  return (
    <svg
      ref={svgRef}
      className="replay-chart"
      viewBox={`0 0 ${W} ${H}`}
      onPointerMove={onMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {ticks.map((p) => (
        <g key={p}>
          <line x1={0} x2={PW} y1={y(p)} y2={y(p)} stroke="var(--color-line)" strokeWidth={px(1)} />
          <text x={PW + px(6)} y={y(p) + px(3.5)} fill="var(--color-muted)" fontSize={px(10)} fontFamily="var(--font-mono)">
            {formatPriceGrouped(p)}
          </text>
        </g>
      ))}

      {shown.map((c, i) => {
        const color = c.c >= c.o ? 'var(--profit)' : 'var(--loss)';
        const top = y(Math.max(c.o, c.c));
        const bottom = y(Math.min(c.o, c.c));
        return (
          <g key={c.t}>
            <line x1={cx(i)} x2={cx(i)} y1={y(c.h)} y2={y(c.l)} stroke={color} strokeWidth={px(1)} />
            <rect x={cx(i) - bodyW / 2} y={top} width={bodyW} height={Math.max(px(1), bottom - top)} fill={color} />
          </g>
        );
      })}

      {timeIdx.map((i) => (
        <text key={i} x={cx(i)} y={H - px(7)} fill="var(--color-muted)" fontSize={px(10)} textAnchor="middle">
          {labelFor(shown[i].t)}
        </text>
      ))}

      {levels.map((l) => (
        <g key={l.kind}>
          <line
            x1={0}
            x2={PW}
            y1={y(l.price)}
            y2={y(l.price)}
            stroke={LEVEL_COLOR[l.kind]}
            strokeWidth={px(1.25)}
            strokeDasharray={l.kind === 'entry' ? undefined : `${px(5)} ${px(4)}`}
          />
          <text x={px(4)} y={y(l.price) - px(4)} fill={LEVEL_COLOR[l.kind]} fontSize={px(10)} fontFamily="var(--font-mono)">
            {levelLabel(l.kind)} {formatPriceGrouped(l.price)}
          </text>
          {l.draggable && onDragLevel && (
            <rect
              className="lvl-hit"
              x={0}
              y={y(l.price) - px(8)}
              width={PW}
              height={px(16)}
              fill="transparent"
              onPointerDown={startDrag(l.kind)}
            />
          )}
        </g>
      ))}
    </svg>
  );
}
```

- [ ] **Step 2: Проверить типы**

Из `frontend/`: `npx tsc --noEmit -p tsconfig.json` → без ошибок.

- [ ] **Step 3: Коммит**

```bash
git add frontend/src/views/backtest/components/ReplayChart.tsx
git commit -m "feat(backtest): график прокрутки с перетаскиваемыми стопом и тейком

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 12: Состояние прокрутки — `useReplay`

Хук — клей между чистыми функциями движка (Tasks 7–8, покрыты тестами) и экраном. Своих расчётов в нём нет: только загрузка, шаг, таймер и сохранение. Отдельного теста у него нет — в проекте нет среды для React-тестов, а вся проверяемая логика уже живёт в `lib/`.

**Files:**
- Create: `frontend/src/views/backtest/model/useReplay.ts`

**Interfaces:**
- Consumes: `fetchCandles`, `saveCursor` из Task 9; `BacktestTrade`, `SessionDetail` из Task 9; `DAY`, `MINUTE`, `bucketStart`, `currentBucket`, `lastPrice`, `loadedUntil`, `nextStop`, `visibleCandles`, `Candle` из Task 7; `findExit`, `Exit` из Task 8.
- Produces:
  - `SPEEDS = [1, 4, 16] as const` — шагов в секунду;
  - `useReplay(detail: SessionDetail, onExit: (trade: BacktestTrade, exit: Exit) => void): Replay`;
  - `interface Replay { cursor: number; tf: number; setTf(tf: number): void; candles: Candle[]; price: number | null; ready: boolean; step(): Promise<void>; speed: number | null; setSpeed(s: number | null): void; ended: boolean; error: unknown; flush(): Promise<void> }` — `candles` и `price` в **настоящих** ценах; масштаб показа применяет экран.

- [ ] **Step 1: Хук**

`frontend/src/views/backtest/model/useReplay.ts`:

```ts
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchCandles, saveCursor } from '../api/hooks';
import type { BacktestTrade, SessionDetail } from '../api/types';
import {
  DAY,
  MINUTE,
  bucketStart,
  currentBucket,
  lastPrice,
  loadedUntil,
  nextStop,
  visibleCandles,
  type Candle,
} from '../lib/candles';
import { findExit, type Exit } from '../lib/fills';

/** Сколько минуток держать загруженными впереди момента сессии. */
const LOOKAHEAD_MS = 3 * DAY;
/** Потолок `/api/market-data/candles` на один запрос. */
const CHUNK = 5000;
/** Сколько закрытых свечей таймфрейма брать в прошлое. */
const CLOSED_LIMIT = 300;
/** Сколько свечей отдавать графику. */
const VISIBLE = 120;
/** Момент сохраняется на сервер не чаще, чем раз в столько. */
const SAVE_DELAY_MS = 3000;
/** Скорости автопрокрутки — шагов в секунду. */
export const SPEEDS = [1, 4, 16] as const;

interface ClosedSet {
  /** До какого момента загружена история этого таймфрейма; дальше свечи собираются из минуток. */
  anchor: number;
  candles: Candle[];
}

export interface Replay {
  cursor: number;
  tf: number;
  setTf: (tf: number) => void;
  /** В настоящих ценах. */
  candles: Candle[];
  /** Цена последней показанной минутки, настоящая. */
  price: number | null;
  ready: boolean;
  step: () => Promise<void>;
  speed: number | null;
  setSpeed: (speed: number | null) => void;
  /** Минутки кончились — дальше крутить нечего. */
  ended: boolean;
  error: unknown;
  /** Сохранить момент сейчас, не дожидаясь задержки. */
  flush: () => Promise<void>;
}

/**
 * Прокрутка сессии: минутки грузятся кусками с начала суток текущего момента
 * (из них собирается недоформированная свеча даже дневного таймфрейма) и
 * заранее на три дня вперёд; «Шаг» доводит время до закрытия свечи выбранного
 * таймфрейма и по дороге проверяет стоп и тейк открытой сделки.
 *
 * Проверяются уровни, сохранённые на сервере, а не черновик в полях: пока
 * правка не применена, она не действует — так же, как неотправленный ордер.
 */
export function useReplay(detail: SessionDetail, onExit: (trade: BacktestTrade, exit: Exit) => void): Replay {
  const sessionId = detail.session.id;
  const [cursor, setCursor] = useState(() => Date.parse(detail.session.cursorTime));
  const [tf, setTf] = useState(60);
  const [minutes, setMinutes] = useState<Candle[]>([]);
  const [closed, setClosed] = useState<Record<number, ClosedSet>>({});
  const [speed, setSpeed] = useState<number | null>(null);
  const [ended, setEnded] = useState(false);
  const [error, setError] = useState<unknown>(null);

  // Шаг асинхронный и зовётся из таймера: он читает рефы, а не значения,
  // захваченные при создании колбэка.
  const cursorRef = useRef(cursor);
  const tfRef = useRef(tf);
  tfRef.current = tf;
  const minutesRef = useRef<Candle[]>([]);
  const minutesFrom = useRef(bucketStart(cursor - MINUTE, 1440));
  const exhausted = useRef(false);
  const loading = useRef<Promise<void> | null>(null);
  const busy = useRef(false);
  const endedRef = useRef(false);
  /** Сделки, чьё закрытие уже отправлено: пока сессия не перечитана, второй раз их не закрываем. */
  const closing = useRef(new Set<string>());
  const openRef = useRef<BacktestTrade | null>(null);
  openRef.current = detail.trades.find((x) => x.exitTime == null) ?? null;
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;

  /** Догружает минутки, пока загруженное не дойдёт до until или история не кончится. */
  const ensureMinutes = useCallback(async (until: number) => {
    while (!exhausted.current && (loadedUntil(minutesRef.current) ?? minutesFrom.current) < until) {
      if (!loading.current) {
        loading.current = (async () => {
          const from = loadedUntil(minutesRef.current) ?? minutesFrom.current;
          const chunk = await fetchCandles(1, { from, limit: CHUNK });
          if (chunk.length < CHUNK) exhausted.current = true;
          if (chunk.length > 0) {
            minutesRef.current = [...minutesRef.current, ...chunk];
            setMinutes(minutesRef.current);
          }
        })().finally(() => {
          loading.current = null;
        });
      }
      await loading.current;
    }
  }, []);

  useEffect(() => {
    ensureMinutes(cursorRef.current + LOOKAHEAD_MS).catch(setError);
  }, [ensureMinutes]);

  // Прошлое выбранного таймфрейма — один раз на таймфрейм; всё, что после
  // anchor, собирается из минуток, поэтому перегружать при шаге не нужно.
  useEffect(() => {
    if (closed[tf]) return;
    const anchor = currentBucket(cursorRef.current, tf);
    let cancelled = false;
    fetchCandles(tf, { to: anchor - 1, limit: CLOSED_LIMIT })
      .then((candles) => {
        if (!cancelled) setClosed((prev) => ({ ...prev, [tf]: { anchor, candles } }));
      })
      .catch(setError);
    return () => {
      cancelled = true;
    };
  }, [tf, closed]);

  const candles = useMemo(() => {
    const set = closed[tf];
    if (!set) return [];
    return visibleCandles({ closed: set.candles, anchor: set.anchor, minutes, tf, cursor }).slice(-VISIBLE);
  }, [closed, tf, minutes, cursor]);

  const price = useMemo(() => lastPrice(minutes, cursor), [minutes, cursor]);

  const step = useCallback(async () => {
    if (busy.current || endedRef.current) return;
    busy.current = true;
    setError(null);
    try {
      const from = cursorRef.current;
      const target = nextStop(from, tfRef.current);
      await ensureMinutes(target + LOOKAHEAD_MS);
      const reach = Math.min(target, loadedUntil(minutesRef.current) ?? from);
      if (reach > from) {
        const open = openRef.current;
        if (open && !closing.current.has(open.id)) {
          const exit = findExit(open, minutesRef.current, Math.max(Date.parse(open.entryTime), from), reach);
          if (exit) {
            closing.current.add(open.id);
            // Сработал уровень — автопрокрутка встаёт, чтобы исход не проскочил мимо глаз.
            setSpeed(null);
            onExitRef.current(open, exit);
          }
        }
        cursorRef.current = reach;
        setCursor(reach);
      }
      // Шаг не дошёл до цели — минутки кончились, дальше крутить нечего.
      if (reach < target) {
        endedRef.current = true;
        setEnded(true);
        setSpeed(null);
      }
    } catch (e) {
      setError(e);
      setSpeed(null);
    } finally {
      busy.current = false;
    }
  }, [ensureMinutes]);

  const stepRef = useRef(step);
  stepRef.current = step;
  useEffect(() => {
    if (!speed) return;
    const h = setInterval(() => void stepRef.current(), 1000 / speed);
    return () => clearInterval(h);
  }, [speed]);

  // Момент сохраняется с задержкой, а не на каждый шаг: автопрокрутка на ×16
  // дала бы шестнадцать запросов в секунду. Сервер двигает момент только вперёд,
  // так что опоздавшее сохранение ничего не отмотает.
  const saved = useRef(cursor);
  const flush = useCallback(async () => {
    const c = cursorRef.current;
    if (c === saved.current) return;
    await saveCursor(sessionId, c);
    saved.current = c;
  }, [sessionId]);

  useEffect(() => {
    const h = setTimeout(() => void flush().catch(() => undefined), SAVE_DELAY_MS);
    return () => clearTimeout(h);
  }, [cursor, flush]);

  useEffect(
    () => () => {
      const c = cursorRef.current;
      if (c !== saved.current) void saveCursor(sessionId, c, true).catch(() => undefined);
    },
    [sessionId],
  );

  return {
    cursor,
    tf,
    setTf,
    candles,
    price,
    ready: closed[tf] != null && price != null,
    step,
    speed,
    setSpeed,
    ended,
    error,
    flush,
  };
}
```

- [ ] **Step 2: Проверить типы**

Из `frontend/`: `npx tsc --noEmit -p tsconfig.json` → без ошибок.

- [ ] **Step 3: Коммит**

```bash
git add frontend/src/views/backtest/model/useReplay.ts
git commit -m "feat(backtest): состояние прокрутки — подгрузка минуток, шаг, автоскорость

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 13: Части экрана сессии

Презентационные компоненты: получают данные и колбэки пропсами, сами на сервер ходят только `SessionSummary` (теги завершённой сессии).

**Files:**
- Create: `frontend/src/views/backtest/components/SummaryCells.tsx`
- Create: `frontend/src/views/backtest/components/OrderPanel.tsx`
- Create: `frontend/src/views/backtest/components/SessionTrades.tsx`
- Create: `frontend/src/views/backtest/components/SessionSummary.tsx`

**Interfaces:**
- Consumes: `MetricCell`, `Money`, `Button`, `Field`, `Input`, `Tooltip`, `LedgerTable`, `SectionHead` из `@/shared/ui/*`; `TagPicker`, `TagItem`, `useTags` из `@/entities/tag`; `useLocaleControl` из `@/shared/i18n`; `formatPriceGrouped` из `@/shared/lib/utils/format`; типы и `useSetBacktestTags` из Task 9; `formatR`, `fromScreen`, `previewSize`, `toScreen`, `unrealizedPnl` из Task 8; ключи `backtest.*` из Task 10.
- Produces:
  - `SummaryCells({ summary?, maxDrawdownPct?, sessions?, loading? })`
  - `interface Draft { risk: string; stop: string; take: string }` — строки полей в **экранных** ценах; `OrderPanel({ draft, onDraft, openTrade, scale, price, balance, disabled, canClose, hint, onOpen, onApply, onClose, onFinish })`, где `price` — настоящая цена, `hint` — текст ошибки проверки или `null`;
  - `SessionTrades({ trades, scale, labelFor, tags, onSetTags })`
  - `SessionSummary({ detail, onLeave })`

- [ ] **Step 1: Итоговые плитки**

`frontend/src/views/backtest/components/SummaryCells.tsx`:

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { MetricCell } from '@/shared/ui/MetricCell';
import { Money } from '@/shared/ui/Money';
import type { Summary } from '../api/types';
import { formatR } from '../lib/money';

/** Итог набора сделок — один и тот же для сессии и для всех сессий сразу. */
export function SummaryCells({
  summary,
  maxDrawdownPct,
  sessions,
  loading,
}: {
  summary?: Summary;
  /** Только у одной сессии: у разных сессий разные депозиты, общей кривой нет. */
  maxDrawdownPct?: number;
  sessions?: number;
  loading?: boolean;
}) {
  const t = useTranslations('backtest');
  const totalR = summary?.totalR ?? 0;
  const avgR = summary?.avgR ?? 0;
  return (
    <div className="metrics metrics-3">
      {sessions != null && <MetricCell label={t('statSessions')} value={sessions} loading={loading} />}
      <MetricCell label={t('statTrades')} value={summary?.trades ?? 0} loading={loading} />
      <MetricCell label={t('statWinRate')} value={`${(summary?.winRate ?? 0).toFixed(0)} %`} loading={loading} />
      <MetricCell
        label={t('statTotalR')}
        hint={t('rHint')}
        value={formatR(totalR)}
        tone={totalR >= 0 ? 'pos' : 'neg'}
        loading={loading}
      />
      <MetricCell label={t('statAvgR')} value={formatR(avgR)} tone={avgR >= 0 ? 'pos' : 'neg'} loading={loading} />
      <MetricCell label={t('statPnl')} value={<Money value={summary?.pnl ?? 0} unit="USDT" />} loading={loading} />
      {maxDrawdownPct != null && (
        <MetricCell label={t('statMaxDd')} value={`${maxDrawdownPct.toFixed(1)} %`} loading={loading} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Панель позиции**

`frontend/src/views/backtest/components/OrderPanel.tsx`:

```tsx
'use client';

import type { ChangeEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/shared/ui/Button';
import { Field, Input } from '@/shared/ui/Field';
import { Money } from '@/shared/ui/Money';
import { Tooltip } from '@/shared/ui/Tooltip';
import { formatPriceGrouped } from '@/shared/lib/utils/format';
import type { BacktestTrade, Direction } from '../api/types';
import { formatR, fromScreen, previewSize, toScreen, unrealizedPnl } from '../lib/money';

/** Поля панели — строками, как их набирает человек, и в экранных ценах. */
export interface Draft {
  risk: string;
  stop: string;
  take: string;
}

/**
 * Вход, уровни и выход. Размер позиции показывается номиналом в USDT и плечом,
 * а не в монетах: при скрытой цене число монет вместе с расстоянием до стопа
 * выдало бы настоящий уровень цены.
 */
export function OrderPanel({
  draft,
  onDraft,
  openTrade,
  scale,
  price,
  balance,
  disabled,
  canClose,
  hint,
  onOpen,
  onApply,
  onClose,
  onFinish,
}: {
  draft: Draft;
  onDraft: (d: Draft) => void;
  openTrade: BacktestTrade | null;
  scale: number;
  /** Настоящая цена последней показанной минутки. */
  price: number | null;
  balance: number;
  disabled: boolean;
  canClose: boolean;
  hint: string | null;
  onOpen: (direction: Direction) => void;
  onApply: () => void;
  onClose: () => void;
  onFinish: () => void;
}) {
  const t = useTranslations('backtest');
  const set = (key: keyof Draft) => (e: ChangeEvent<HTMLInputElement>) => onDraft({ ...draft, [key]: e.target.value });

  const stop = Number(draft.stop);
  const preview =
    !openTrade && price != null && stop > 0 ? previewSize(balance, Number(draft.risk), price, fromScreen(stop, scale)) : null;
  const pnl = openTrade && price != null ? unrealizedPnl(openTrade.direction, openTrade.entryPrice, price, openTrade.qty) : null;

  return (
    <div className="order-panel">
      <p className="muted">
        {t('balance')}: {formatPriceGrouped(balance)} USDT
      </p>

      {openTrade ? (
        <>
          <p>
            {t(`direction.${openTrade.direction}`)} · {t('entry')} {formatPriceGrouped(toScreen(openTrade.entryPrice, scale))}
          </p>
          {pnl != null && (
            <p>
              {t('unrealized')}: <Money value={pnl} unit="USDT" />{' '}
              <Tooltip text={t('rHint')}>
                <span className={pnl >= 0 ? 'pos' : 'neg'}>{formatR(pnl / openTrade.riskUsdt)}</span>
              </Tooltip>
            </p>
          )}
        </>
      ) : (
        <Field label={t('risk')}>
          {(id) => <Input id={id} full inputMode="decimal" value={draft.risk} onChange={set('risk')} />}
        </Field>
      )}

      <Field label={t('stop')}>
        {(id) => <Input id={id} full inputMode="decimal" value={draft.stop} onChange={set('stop')} />}
      </Field>
      <Field label={t('take')}>
        {(id) => <Input id={id} full inputMode="decimal" value={draft.take} onChange={set('take')} />}
      </Field>

      {hint && <p className="neg">{hint}</p>}

      {openTrade ? (
        <>
          <Button onClick={onApply} disabled={disabled}>
            {t('apply')}
          </Button>
          <Button onClick={onClose} disabled={disabled || !canClose}>
            {t('closeMarket')}
          </Button>
        </>
      ) : (
        <>
          {preview && (
            <p className="muted">
              {t('preview', {
                notional: formatPriceGrouped(preview.notional),
                leverage: preview.leverage.toFixed(1),
                risk: formatPriceGrouped(preview.riskUsdt),
              })}
            </p>
          )}
          <Button variant="solid" onClick={() => onOpen('long')} disabled={disabled}>
            {t('long')}
          </Button>
          <Button onClick={() => onOpen('short')} disabled={disabled}>
            {t('short')}
          </Button>
        </>
      )}

      <Button variant="risk" onClick={onFinish}>
        {t('finish')}
      </Button>
    </div>
  );
}
```

- [ ] **Step 3: Таблица сделок сессии**

`frontend/src/views/backtest/components/SessionTrades.tsx`:

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { TagPicker, type TagItem } from '@/entities/tag';
import { LedgerTable, type LedgerColumn } from '@/shared/ui/LedgerTable';
import { Money } from '@/shared/ui/Money';
import { SectionHead } from '@/shared/ui/SectionHead';
import { formatPriceGrouped } from '@/shared/lib/utils/format';
import type { BacktestTrade } from '../api/types';
import { formatR, toScreen } from '../lib/money';

/**
 * Сделки сессии, свежие сверху. Строка раскрывается выбором тегов — тем же
 * TagPicker, что в журнале: теги пользователя одни, сделки разные.
 */
export function SessionTrades({
  trades,
  scale,
  labelFor,
  tags,
  onSetTags,
}: {
  trades: BacktestTrade[];
  /** Масштаб показа; у завершённой сессии — 1, цены раскрыты. */
  scale: number;
  labelFor: (t: number) => string;
  tags: TagItem[];
  onSetTags: (tradeId: string, tagIds: string[]) => void;
}) {
  const t = useTranslations('backtest');
  const price = (p: number) => formatPriceGrouped(toScreen(p, scale));

  const columns: LedgerColumn<BacktestTrade>[] = [
    { key: 'dir', header: t('colDir'), render: (x) => t(`direction.${x.direction}`) },
    {
      key: 'entry',
      header: t('colEntry'),
      cellClassName: 'n',
      render: (x) => `${labelFor(Date.parse(x.entryTime))} · ${price(x.entryPrice)}`,
    },
    {
      key: 'exit',
      header: t('colExit'),
      cellClassName: 'n',
      render: (x) => (x.exitTime && x.exitPrice != null ? `${labelFor(Date.parse(x.exitTime))} · ${price(x.exitPrice)}` : '—'),
    },
    { key: 'reason', header: t('colReason'), render: (x) => t(`reason.${x.exitReason ?? 'open'}`) },
    {
      key: 'r',
      header: t('colR'),
      align: 'right',
      cellClassName: 'n',
      render: (x) => (x.r != null ? <span className={x.r >= 0 ? 'pos' : 'neg'}>{formatR(x.r)}</span> : '—'),
    },
    {
      key: 'pnl',
      header: t('colPnl'),
      align: 'right',
      cellClassName: 'n',
      render: (x) => (x.pnl != null ? <Money value={x.pnl} /> : '—'),
    },
    {
      key: 'tags',
      header: t('colTags'),
      cellClassName: 'cell-tags',
      render: (x) => (x.tags.length ? x.tags.map((g) => g.name).join(', ') : <span className="muted">—</span>),
    },
  ];

  return (
    <section>
      <SectionHead title={t('tradesTitle')} />
      <LedgerTable
        columns={columns}
        rows={[...trades].reverse()}
        rowKey={(x) => x.id}
        empty={t('noTrades')}
        renderExpanded={(x) => {
          const selected = new Set(x.tags.map((g) => g.id));
          return (
            <TagPicker
              tags={tags}
              selected={selected}
              onToggle={(id) => {
                const next = new Set(selected);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                onSetTags(x.id, [...next]);
              }}
            />
          );
        }}
      />
    </section>
  );
}
```

- [ ] **Step 4: Итог завершённой сессии**

`frontend/src/views/backtest/components/SessionSummary.tsx`:

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { useTags } from '@/entities/tag';
import { useLocaleControl } from '@/shared/i18n';
import { Button } from '@/shared/ui/Button';
import { SectionHead } from '@/shared/ui/SectionHead';
import { formatPriceGrouped } from '@/shared/lib/utils/format';
import { useSetBacktestTags } from '../api/hooks';
import type { SessionDetail } from '../api/types';
import { SessionTrades } from './SessionTrades';
import { SummaryCells } from './SummaryCells';

/**
 * После завершения скрытое раскрывается: настоящие даты отрезка и настоящие
 * цены сделок. Теги ставить можно и здесь — разметка не обязана успеть к концу
 * сессии.
 */
export function SessionSummary({ detail, onLeave }: { detail: SessionDetail; onLeave: () => void }) {
  const t = useTranslations('backtest');
  const { locale } = useLocaleControl();
  const intl = locale === 'en' ? 'en-US' : 'ru-RU';
  const { session, trades, summary } = detail;
  const { data: tagsData } = useTags();
  const setTags = useSetBacktestTags(session.id);

  const full = (ms: number) =>
    new Date(ms).toLocaleString(intl, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const short = (ms: number) =>
    new Date(ms).toLocaleString(intl, { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' });

  return (
    <>
      <SectionHead title={t('summaryTitle')}>
        <Button tight onClick={onLeave}>
          {t('backToList')}
        </Button>
      </SectionHead>
      <p>{t('revealed', { from: full(Date.parse(session.startTime)), to: full(Date.parse(session.cursorTime)) })}</p>
      <p className="muted">
        {t('balanceFromTo', { from: formatPriceGrouped(session.startBalance), to: formatPriceGrouped(session.balance) })}
      </p>
      <SummaryCells summary={summary} maxDrawdownPct={summary.maxDrawdownPct} />
      <SessionTrades
        trades={trades}
        scale={1}
        labelFor={short}
        tags={tagsData?.tags ?? []}
        onSetTags={(tradeId, tagIds) => setTags.mutate({ tradeId, tagIds })}
      />
    </>
  );
}
```

- [ ] **Step 5: Проверить типы**

Из `frontend/`: `npx tsc --noEmit -p tsconfig.json` → без ошибок.

- [ ] **Step 6: Коммит**

```bash
git add frontend/src/views/backtest/components/SummaryCells.tsx frontend/src/views/backtest/components/OrderPanel.tsx frontend/src/views/backtest/components/SessionTrades.tsx frontend/src/views/backtest/components/SessionSummary.tsx
git commit -m "feat(backtest): панель позиции, сделки сессии и итог

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 14: Экран сессии

**Files:**
- Create: `frontend/src/views/backtest/components/SessionScreen.tsx`

**Interfaces:**
- Consumes: всё из Tasks 9, 11, 12, 13; `TIMEFRAMES`, `dayNumber` из Task 7; `checkLevels`, `fromScreen`, `toInput`, `toScreen` из Task 8; `ConfirmDialog`, `ConfirmRequest` из `@/shared/ui/ConfirmDialog` (`request: { title, subtitle, consequences: string[], word, onConfirm }`, `onClose`); `Seg`, `SegOption`, `Skeleton`, `ErrorNote`, `Button`, `SectionHead` из `@/shared/ui/*`.
- Produces: `SessionScreen({ id, onLeave })` — сам загружает сессию; активную показывает прокруткой, завершённую — итогом.

- [ ] **Step 1: Компонент**

`frontend/src/views/backtest/components/SessionScreen.tsx`:

```tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useTags } from '@/entities/tag';
import { useLocaleControl } from '@/shared/i18n';
import { Button } from '@/shared/ui/Button';
import { ConfirmDialog, type ConfirmRequest } from '@/shared/ui/ConfirmDialog';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { SectionHead } from '@/shared/ui/SectionHead';
import { Seg, type SegOption } from '@/shared/ui/Seg';
import { Skeleton } from '@/shared/ui/Skeleton';
import {
  useBacktestSession,
  useCloseTrade,
  useFinishSession,
  useModifyTrade,
  useOpenTrade,
  useSetBacktestTags,
} from '../api/hooks';
import type { BacktestTrade, Direction, ExitReason, SessionDetail } from '../api/types';
import { TIMEFRAMES, dayNumber } from '../lib/candles';
import { checkLevels, fromScreen, toInput, toScreen } from '../lib/money';
import { SPEEDS, useReplay } from '../model/useReplay';
import { OrderPanel, type Draft } from './OrderPanel';
import { ReplayChart, type Level, type LevelKind } from './ReplayChart';
import { SessionSummary } from './SessionSummary';
import { SessionTrades } from './SessionTrades';

/** Сессия целиком: загрузка, прокрутка активной или итог завершённой. */
export function SessionScreen({ id, onLeave }: { id: string; onLeave: () => void }) {
  const t = useTranslations('backtest');
  const { data, error } = useBacktestSession(id);
  if (error) return <ErrorNote error={error} fallback={t('loadFailed')} />;
  if (!data) return <Skeleton height={380} />;
  if (data.session.status === 'finished') return <SessionSummary detail={data} onLeave={onLeave} />;
  return <ActiveSession detail={data} onLeave={onLeave} />;
}

function ActiveSession({ detail, onLeave }: { detail: SessionDetail; onLeave: () => void }) {
  const t = useTranslations('backtest');
  const { locale } = useLocaleControl();
  const intl = locale === 'en' ? 'en-US' : 'ru-RU';
  const { session, trades } = detail;
  const scale = session.priceScale;
  const startMs = Date.parse(session.startTime);
  const openTrade = trades.find((x) => x.exitTime == null) ?? null;

  const { data: tagsData } = useTags();
  const openM = useOpenTrade(session.id);
  const modifyM = useModifyTrade(session.id);
  const closeM = useCloseTrade(session.id);
  const finishM = useFinishSession(session.id);
  const tagsM = useSetBacktestTags(session.id);

  const closeTrade = (trade: BacktestTrade, time: number, price: number, reason: ExitReason) =>
    closeM.mutateAsync({ tradeId: trade.id, exitTime: new Date(time).toISOString(), exitPrice: price, reason });

  const replay = useReplay(detail, (trade, exit) => {
    void closeTrade(trade, exit.time, exit.price, exit.reason).catch(() => undefined);
  });

  const [draft, setDraft] = useState<Draft>({ risk: String(session.defaultRiskPct), stop: '', take: '' });
  const [hint, setHint] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);

  // Уровни открытой сделки приезжают в поля, когда сделка появляется или правка
  // сохранилась; закрылась — поля очищаются. Не на каждый рендер: иначе
  // набранное в полях стиралось бы.
  const openId = openTrade?.id;
  const openStop = openTrade?.stopLoss;
  const openTake = openTrade?.takeProfit;
  useEffect(() => {
    setDraft((d) =>
      openId == null || openStop == null
        ? { ...d, stop: '', take: '' }
        : {
            ...d,
            stop: toInput(toScreen(openStop, scale)),
            take: openTake != null ? toInput(toScreen(openTake, scale)) : '',
          },
    );
  }, [openId, openStop, openTake, scale]);

  const screenPrice = replay.price != null ? toScreen(replay.price, scale) : null;
  const stopN = Number(draft.stop);
  const takeN = draft.take.trim() ? Number(draft.take) : null;

  const screenCandles = useMemo(
    () =>
      scale === 1
        ? replay.candles
        : replay.candles.map((c) => ({ t: c.t, o: c.o * scale, h: c.h * scale, l: c.l * scale, c: c.c * scale })),
    [replay.candles, scale],
  );

  const levels: Level[] = [];
  if (openTrade) levels.push({ kind: 'entry', price: toScreen(openTrade.entryPrice, scale), draggable: false });
  if (stopN > 0) levels.push({ kind: 'stop', price: stopN, draggable: true });
  if (takeN != null && takeN > 0) levels.push({ kind: 'take', price: takeN, draggable: true });

  // Скрытая дата: день недели и время суток видны (биржевые сессии, выходные),
  // год и число — нет; вместо даты — номер дня от старта.
  const labelFor = (ms: number) => {
    const d = new Date(ms);
    const time = d.toLocaleTimeString(intl, { hour: '2-digit', minute: '2-digit' });
    return session.hideDate
      ? `${d.toLocaleDateString(intl, { weekday: 'short' })} ${time} · ${t('dayN', { n: dayNumber(ms, startMs) })}`
      : `${d.toLocaleDateString(intl, { day: 'numeric', month: 'short', year: '2-digit' })} ${time}`;
  };

  const busy = openM.isPending || modifyM.isPending || closeM.isPending || finishM.isPending;
  // Пока закрытие не сохранено, новую сделку не открыть: сервер увидел бы две открытые.
  const closePending = closeM.isPending || closeM.isError;
  const canClose = openTrade != null && replay.cursor > Date.parse(openTrade.entryTime);

  const open = (direction: Direction) => {
    if (replay.price == null || screenPrice == null) return;
    const risk = Number(draft.risk);
    if (!(risk >= 0.01 && risk <= 100)) {
      setHint(t('riskInvalid'));
      return;
    }
    const err = checkLevels(direction, screenPrice, stopN, takeN);
    setHint(err ? t(err) : null);
    if (err) return;
    openM.mutate({
      direction,
      entryTime: new Date(replay.cursor).toISOString(),
      // Настоящая цена минутки, а не обратный пересчёт экранной: без округлений.
      entryPrice: replay.price,
      stopLoss: fromScreen(stopN, scale),
      takeProfit: takeN != null ? fromScreen(takeN, scale) : undefined,
      riskPct: risk,
    });
  };

  const applyLevels = (stop: number, take: number | null) => {
    if (!openTrade || screenPrice == null) return;
    const err = checkLevels(openTrade.direction, screenPrice, stop, take);
    setHint(err ? t(err) : null);
    if (err) return;
    modifyM.mutate({
      tradeId: openTrade.id,
      stopLoss: fromScreen(stop, scale),
      takeProfit: take != null ? fromScreen(take, scale) : null,
    });
  };

  const onDragLevel = (kind: LevelKind, price: number, done: boolean) => {
    if (kind === 'entry') return;
    setDraft((d) => ({ ...d, [kind]: toInput(price) }));
    // На сервер — только отпускание: сохранять каждое движение мыши незачем.
    if (done && openTrade) applyLevels(kind === 'stop' ? price : stopN, kind === 'take' ? price : takeN);
  };

  const closeManual = () => {
    if (!openTrade || replay.price == null || !canClose) return;
    void closeTrade(openTrade, replay.cursor, replay.price, 'manual').catch(() => undefined);
  };

  const finishing = useRef(false);
  const finishNow = async () => {
    if (finishing.current) return;
    finishing.current = true;
    replay.setSpeed(null);
    try {
      // Позицию закрывает браузер — он знает цену момента; сервер лишь проверяет, что открытых нет.
      if (openTrade && replay.price != null && canClose) {
        await closeTrade(openTrade, replay.cursor, replay.price, 'finish');
      }
      await replay.flush();
      await finishM.mutateAsync();
    } catch {
      finishing.current = false;
    }
  };

  // Минутки кончились — сессия завершается сама тем же путём.
  const finishRef = useRef(finishNow);
  finishRef.current = finishNow;
  useEffect(() => {
    if (replay.ended) void finishRef.current();
  }, [replay.ended]);

  const askFinish = () =>
    setConfirm({
      title: t('finishTitle'),
      subtitle: t('finishSubtitle'),
      consequences: [...(openTrade ? [t('finishOpenTrade')] : []), t('finishReveal')],
      word: t('finishWord'),
      onConfirm: () => void finishNow(),
    });

  const leave = async () => {
    replay.setSpeed(null);
    await replay.flush().catch(() => undefined);
    onLeave();
  };

  const tfOptions: SegOption<number>[] = TIMEFRAMES.map((tf) => ({ value: tf, label: t(`tf.${tf}`) }));
  const speedOptions: SegOption<number>[] = [
    { value: 0, label: t('pause') },
    ...SPEEDS.map((s) => ({ value: s, label: `×${s}` })),
  ];

  return (
    <>
      <SectionHead title={t('timeframe')}>
        <Seg options={tfOptions} value={replay.tf} onChange={replay.setTf} ariaLabel={t('timeframe')} />
      </SectionHead>

      <div className="asym">
        <div>
          {replay.ready ? (
            <ReplayChart
              candles={screenCandles}
              levels={levels}
              labelFor={labelFor}
              levelLabel={(k) => t(`level.${k}`)}
              onDragLevel={onDragLevel}
            />
          ) : (
            <Skeleton height={380} />
          )}
          <div className="replay-controls">
            <Button variant="solid" onClick={() => void replay.step()} disabled={!replay.ready || replay.ended}>
              {t('step')} ▶
            </Button>
            <Seg
              options={speedOptions}
              value={replay.speed ?? 0}
              onChange={(v) => replay.setSpeed(v || null)}
              ariaLabel={t('speed')}
            />
            <Button tight onClick={() => void leave()}>
              {t('backToList')}
            </Button>
          </div>
          {replay.ended && <p className="muted">{t('historyEnded')}</p>}
          <ErrorNote error={replay.error} fallback={t('loadFailed')} />
        </div>

        <div className="marg">
          <OrderPanel
            draft={draft}
            onDraft={setDraft}
            openTrade={openTrade}
            scale={scale}
            price={replay.price}
            balance={session.balance}
            disabled={busy || closePending || !replay.ready}
            canClose={canClose}
            hint={hint}
            onOpen={open}
            onApply={() => applyLevels(stopN, takeN)}
            onClose={closeManual}
            onFinish={askFinish}
          />
          <ErrorNote error={openM.error ?? modifyM.error ?? finishM.error} fallback={t('actionFailed')} />
          {closeM.isError && (
            <p className="neg">
              {t('closeFailed')}{' '}
              <Button tight onClick={() => closeM.variables && closeM.mutate(closeM.variables)}>
                {t('retryClose')}
              </Button>
            </p>
          )}
        </div>
      </div>

      <SessionTrades
        trades={trades}
        scale={scale}
        labelFor={labelFor}
        tags={tagsData?.tags ?? []}
        onSetTags={(tradeId, tagIds) => tagsM.mutate({ tradeId, tagIds })}
      />

      {confirm && <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />}
    </>
  );
}
```

- [ ] **Step 2: Проверить типы**

Из `frontend/`: `npx tsc --noEmit -p tsconfig.json` → без ошибок.

- [ ] **Step 3: Коммит**

```bash
git add frontend/src/views/backtest/components/SessionScreen.tsx
git commit -m "feat(backtest): экран сессии — прокрутка, вход, уровни, завершение

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 15: Стартовая страница, маршрут и навигация

**Files:**
- Create: `frontend/src/views/backtest/components/StartSession.tsx`
- Create: `frontend/src/views/backtest/components/SessionsList.tsx`
- Create: `frontend/src/views/backtest/components/StatsBlock.tsx`
- Create: `frontend/src/views/backtest/Page.tsx`
- Create: `frontend/src/app/(app)/backtest/page.tsx`
- Modify: `frontend/src/widgets/top-nav/TopNav.tsx` — пункт `backtest` после `market` в массиве пунктов (строки ~23–31)

**Interfaces:**
- Consumes: хуки и типы из Task 9; `SummaryCells` из Task 13; `SessionScreen` из Task 14; `formatR` из Task 8; `Wrap`, `Button`, `Field`, `FieldGroup`, `Input`, `Seg`, `SegOption`, `SectionHead`, `ErrorNote`, `LedgerTable`, `LedgerColumn`, `Money`, `EmptyState` из `@/shared/ui/*`; `useLocaleControl` из `@/shared/i18n`.
- Produces: `BacktestPage` (экспорт из `views/backtest/Page.tsx`), маршрут `/backtest`, пункт «Бектест» в навигации.

- [ ] **Step 1: Новая сессия**

`frontend/src/views/backtest/components/StartSession.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/shared/ui/Button';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { Field, FieldGroup, Input } from '@/shared/ui/Field';
import { SectionHead } from '@/shared/ui/SectionHead';
import { Seg, type SegOption } from '@/shared/ui/Seg';
import { useCreateSession } from '../api/hooks';

type Visibility = 'show' | 'hide';

/**
 * Параметры новой сессии. Дата по умолчанию скрыта: «это март 2020» — и трейдер
 * уже помнит, куда пошла цена. Цена по умолчанию видна: условная шкала от 100
 * до 1000 непривычна, и включать её — осознанный выбор.
 */
export function StartSession({ onStarted }: { onStarted: (id: string) => void }) {
  const t = useTranslations('backtest');
  const [deposit, setDeposit] = useState('10000');
  const [risk, setRisk] = useState('1');
  const [date, setDate] = useState<Visibility>('hide');
  const [price, setPrice] = useState<Visibility>('show');
  const create = useCreateSession();

  const depositN = Number(deposit);
  const riskN = Number(risk);
  const valid = depositN >= 100 && depositN <= 10_000_000 && riskN >= 0.01 && riskN <= 100;
  const visibility: SegOption<Visibility>[] = [
    { value: 'show', label: t('show') },
    { value: 'hide', label: t('hide') },
  ];

  return (
    <section>
      <SectionHead title={t('startTitle')} />
      <p className="muted">{t('startLead')}</p>
      <Field label={t('deposit')}>
        {(id) => <Input id={id} full inputMode="decimal" value={deposit} onChange={(e) => setDeposit(e.target.value)} />}
      </Field>
      <Field label={t('riskDefault')}>
        {(id) => <Input id={id} full inputMode="decimal" value={risk} onChange={(e) => setRisk(e.target.value)} />}
      </Field>
      <FieldGroup label={t('date')}>
        <Seg options={visibility} value={date} onChange={setDate} ariaLabel={t('date')} />
      </FieldGroup>
      <FieldGroup label={t('price')}>
        <Seg options={visibility} value={price} onChange={setPrice} ariaLabel={t('price')} />
      </FieldGroup>
      <Button
        variant="solid"
        disabled={!valid || create.isPending}
        onClick={() =>
          create.mutate(
            { startBalance: depositN, defaultRiskPct: riskN, hideDate: date === 'hide', hidePrice: price === 'hide' },
            { onSuccess: (r) => onStarted(r.session.id) },
          )
        }
      >
        {create.isPending ? t('starting') : t('start')}
      </Button>
      <ErrorNote error={create.error} fallback={t('startFailed')} />
    </section>
  );
}
```

- [ ] **Step 2: Список сессий**

`frontend/src/views/backtest/components/SessionsList.tsx`:

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { useLocaleControl } from '@/shared/i18n';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { LedgerTable, type LedgerColumn } from '@/shared/ui/LedgerTable';
import { Money } from '@/shared/ui/Money';
import { SectionHead } from '@/shared/ui/SectionHead';
import type { SessionListItem } from '../api/types';
import { formatR } from '../lib/money';

/**
 * Сессии, свежие сверху. Дата в первой колонке — когда сессия создана, а не
 * какой отрезок в ней: отрезок раскрывается только в итоге завершённой.
 */
export function SessionsList({
  sessions,
  isLoading,
  onOpen,
}: {
  sessions: SessionListItem[];
  isLoading: boolean;
  onOpen: (id: string) => void;
}) {
  const t = useTranslations('backtest');
  const { locale } = useLocaleControl();
  const intl = locale === 'en' ? 'en-US' : 'ru-RU';

  const columns: LedgerColumn<SessionListItem>[] = [
    {
      key: 'started',
      header: t('colStarted'),
      render: (s) => new Date(s.createdAt).toLocaleDateString(intl, { day: 'numeric', month: 'short', year: 'numeric' }),
    },
    { key: 'status', header: t('colStatus'), render: (s) => t(`status.${s.status}`) },
    { key: 'trades', header: t('colTrades'), align: 'right', cellClassName: 'n', render: (s) => s.summary.trades },
    {
      key: 'win',
      header: t('colWinRate'),
      align: 'right',
      cellClassName: 'n',
      render: (s) => (s.summary.trades ? `${s.summary.winRate.toFixed(0)} %` : '—'),
    },
    {
      key: 'r',
      header: t('colTotalR'),
      align: 'right',
      cellClassName: 'n',
      render: (s) => <span className={s.summary.totalR >= 0 ? 'pos' : 'neg'}>{formatR(s.summary.totalR)}</span>,
    },
    { key: 'pnl', header: t('colPnl'), align: 'right', cellClassName: 'n', render: (s) => <Money value={s.summary.pnl} /> },
    {
      key: 'blind',
      header: t('colBlind'),
      render: (s) =>
        [s.hideDate && t('blindDate'), s.hidePrice && t('blindPrice')].filter(Boolean).join(', ') || (
          <span className="muted">—</span>
        ),
    },
    {
      key: 'action',
      noSkeleton: true,
      render: (s) => (
        <Button tight onClick={() => onOpen(s.id)}>
          {s.status === 'active' ? t('continue') : t('open')}
        </Button>
      ),
    },
  ];

  return (
    <section>
      <SectionHead title={t('sessionsTitle')} />
      <LedgerTable
        columns={columns}
        rows={sessions}
        rowKey={(s) => s.id}
        isLoading={isLoading}
        empty={<EmptyState title={t('noSessions')}>{t('noSessionsHint')}</EmptyState>}
      />
    </section>
  );
}
```

- [ ] **Step 3: Общая статистика**

`frontend/src/views/backtest/components/StatsBlock.tsx`:

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { LedgerTable, type LedgerColumn } from '@/shared/ui/LedgerTable';
import { Money } from '@/shared/ui/Money';
import { SectionHead } from '@/shared/ui/SectionHead';
import type { BacktestStats, TagSummary } from '../api/types';
import { formatR } from '../lib/money';
import { SummaryCells } from './SummaryCells';

/**
 * Итог по всем сессиям и по тегам. Подпись под таблицей тегов обязательна: как
 * и в журнале, сделка идёт целиком каждому своему тегу, и колонка не суммируется.
 */
export function StatsBlock({ stats, isLoading }: { stats?: BacktestStats; isLoading: boolean }) {
  const t = useTranslations('backtest');

  const columns: LedgerColumn<TagSummary>[] = [
    { key: 'tag', header: t('colTag'), render: (x) => x.tag.name },
    { key: 'trades', header: t('colTrades'), align: 'right', cellClassName: 'n', render: (x) => x.trades },
    { key: 'win', header: t('colWinRate'), align: 'right', cellClassName: 'n', render: (x) => `${x.winRate.toFixed(0)} %` },
    {
      key: 'r',
      header: t('colTotalR'),
      align: 'right',
      cellClassName: 'n',
      render: (x) => <span className={x.totalR >= 0 ? 'pos' : 'neg'}>{formatR(x.totalR)}</span>,
    },
    { key: 'avg', header: t('colAvgR'), align: 'right', cellClassName: 'n', render: (x) => formatR(x.avgR) },
    { key: 'pnl', header: t('colPnl'), align: 'right', cellClassName: 'n', render: (x) => <Money value={x.pnl} /> },
  ];

  return (
    <section>
      <SectionHead title={t('statsTitle')} />
      <SummaryCells summary={stats?.overall} sessions={stats?.overall.sessions ?? 0} loading={isLoading} />
      <SectionHead title={t('byTagTitle')} />
      <LedgerTable
        columns={columns}
        rows={stats?.byTag ?? []}
        rowKey={(x) => x.tag.id}
        isLoading={isLoading}
        empty={t('noTagStats')}
      />
      <p className="muted">{t('tagsOverlap')}</p>
    </section>
  );
}
```

- [ ] **Step 4: Страница и маршрут**

`frontend/src/views/backtest/Page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { Wrap } from '@/shared/ui/Wrap';
import { useBacktestSessions, useBacktestStats } from './api/hooks';
import { SessionScreen } from './components/SessionScreen';
import { SessionsList } from './components/SessionsList';
import { StartSession } from './components/StartSession';
import { StatsBlock } from './components/StatsBlock';

/**
 * Бектест — ручная прокрутка случайного отрезка истории BTC.
 *
 * Без открытой сессии: слева сессии и общая статистика, справа — новая сессия.
 * С открытой — экран прокрутки. Какая сессия открыта — состояние страницы, а
 * не адрес: useSearchParams потребовал бы Suspense-границу ради одной
 * переменной, а делиться ссылкой на тренировочную сессию незачем.
 */
export function BacktestPage() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const sessions = useBacktestSessions();
  const stats = useBacktestStats();

  if (sessionId) {
    return (
      <Wrap page>
        <SessionScreen id={sessionId} onLeave={() => setSessionId(null)} />
      </Wrap>
    );
  }

  return (
    <Wrap page>
      <div className="asym">
        <div>
          <SessionsList sessions={sessions.data?.sessions ?? []} isLoading={sessions.isLoading} onOpen={setSessionId} />
          <StatsBlock stats={stats.data} isLoading={stats.isLoading} />
        </div>
        <div className="marg">
          <StartSession onStarted={setSessionId} />
        </div>
      </div>
    </Wrap>
  );
}
```

`frontend/src/app/(app)/backtest/page.tsx`:

```tsx
/**
 * Бектест — /backtest
 *
 * Файл роута — только объявление адреса. Сама страница живёт в слое `views`
 * (`src/views`, не `src/pages`: `src/pages` — служебный каталог Pages Router,
 * и Next пытался бы собрать каждый файл оттуда как отдельный роут).
 */
export { BacktestPage as default } from '@/views/backtest/Page';
```

- [ ] **Step 5: Пункт навигации**

В `frontend/src/widgets/top-nav/TopNav.tsx`, в массиве пунктов после строки `  { id: 'market', labelKey: 'market' },`:

```ts
  { id: 'backtest', labelKey: 'backtest' },
```

Подпись берётся из `nav.backtest` (Task 10), маршрут строится как `/${item.id}`.

- [ ] **Step 6: Проверить фронт целиком**

Из `frontend/`:

```
npm test
npx tsc --noEmit -p tsconfig.json
npx next build
```

Ожидается: все тесты зелёные (включая 11 + 11 + 9 новых из Tasks 7–8), типы чистые, `next build` проходит и в списке маршрутов есть `/backtest`. Проверять именно `next build`: dev-сервер, eslint и vitest бывают зелёными там, где сборка падает (CLAUDE.md).

- [ ] **Step 7: Коммит**

```bash
git add frontend/src/views/backtest/components/StartSession.tsx frontend/src/views/backtest/components/SessionsList.tsx frontend/src/views/backtest/components/StatsBlock.tsx frontend/src/views/backtest/Page.tsx "frontend/src/app/(app)/backtest/page.tsx" frontend/src/widgets/top-nav/TopNav.tsx
git commit -m "feat(backtest): страница бектеста — сессии, статистика, новая сессия

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 16: Живая проверка всей цепочки

Выполняет контроллер сам, не субагент: нужны запущенные Docker, backend и frontend, и решения по ходу.

**Предусловия:**
- Docker Desktop запущен, `docker compose ps` показывает `db`.
- Минутная история залита хотя бы на ~8 месяцев от начала: окно старта требует `начало дневной истории + 200 дней ≤ конец минутной истории − 30 дней`. Проверка:
  ```
  docker compose exec -T db psql -U virex -d virex -c "SELECT timeframe, count(*), min(time), max(time) FROM price_candles GROUP BY timeframe ORDER BY timeframe;"
  ```
  Если `timeframe = 1` нет или его `max` раньше середины 2018 года — поднять backend и дождаться бэкфилла; без этого сессия честно откажет с `BACKTEST_NO_HISTORY`, и это само по себе — проверка ошибки.
- backend: `npm run start:dev` из `backend/`; frontend: `npm run dev` из `frontend/` (порт 8090).

- [ ] **Step 1: Сессия со скрытыми датой и ценой**

Войти, открыть «Бектест», начать сессию со скрытой датой и скрытой ценой. Проверить: шкала цен в диапазоне сотен, на оси — день недели, время и «день N», года нет.

- [ ] **Step 2: Прокрутка и таймфреймы**

«Шаг» на 1ч, переключение на 4ч и 1д: последняя свеча недоформирована, будущего нет. Автопрокрутка ×4 и пауза.

- [ ] **Step 3: Сделка до стопа**

Лонг со стопом ниже цены, без тейка. Перетащить стоп мышью. Автопрокрутка до срабатывания: прокрутка встаёт, сделка закрыта по стопу, R чуть хуже −1 (комиссия), депозит уменьшился. Поставить сделке тег из раскрытой строки.

- [ ] **Step 4: Момент сохраняется**

«К списку» → «Продолжить»: сессия открывается на том же моменте. В базе:
```
docker compose exec -T db psql -U virex -d virex -c "SELECT \"cursorTime\", balance, status FROM backtest_sessions ORDER BY \"createdAt\" DESC LIMIT 1;"
```
Если `cursorTime` не сдвинулся — проверить приведение `::timestamp(3)` в `bumpCursor`.

- [ ] **Step 5: Завершение**

Открыть сделку, «Завершить сессию», набрать слово подтверждения. Итог: раскрыты настоящие даты отрезка, цены в таблице настоящие, открытая сделка закрыта с причиной «завершению». На стартовой странице сессия в списке, статистика и строка тега обновились.

- [ ] **Step 6: Отказы**

- Вторая вкладка с той же сессией: открыть сделку в обеих — вторая получает «Сначала закройте открытую сделку», экран перечитывается.
- Стоп лонга выше цены — подсказка «Стоп стоит не по ту сторону от цены», запрос не уходит.

---

## Что план сознательно не делает

- **Живой режим** — отдельная спека и отдельный план.
- **Лимитные входы, несколько позиций, маржа и ликвидация, проскальзывание кроме гэпа на стопе** — вне первой версии (спека, «Что осознанно не делается»).
- **Масштаб и прокрутку графика колесом** — график показывает последние 120 свечей; этого хватает для решения о входе, а управление видом — отдельная работа.
- **Тест React-хука `useReplay`** — в проекте нет среды для React-тестов; вся проверяемая логика вынесена в `lib/` и покрыта vitest.
- **Деплой** — хранилища свечей на проде ещё нет, деплой отложен владельцем.
