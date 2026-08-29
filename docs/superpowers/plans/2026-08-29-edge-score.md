# Edge Score Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Показать пользователю единую 0–100 оценку качества торговой системы (Edge Score) в уже существующем своде периода на Обзоре — на основе признанной формулы SQN (Van Tharp), без новых эндпоинтов.

**Architecture:** Бэкенд считает сырой SQN внутри уже существующего `TradesService.stats()` через новую чистую функцию `computeSqn(pnls)` и отдаёт `sqn: number | null` в ответе `/api/trades/stats`. Фронтенд переводит SQN в 0–100 и в текстовый уровень («средняя», «отличная» и т.п.) через новый чистый модуль `edgeScore.ts`, показывает как десятую ячейку `SummaryStrip` с той же `GaugeBar`, что уже рисует Winrate/Profit factor.

**Tech Stack:** NestJS + Jest (бэкенд), Next.js + next-intl + Vitest (фронтенд) — те же, что у остальных фич сессии.

## Global Constraints

- Формула — `SQN = √N × mean(pnl) / stdev(pnl)`, выборочное стандартное отклонение (делитель `N-1`), порог значимости `N ≥ 30` (константа Van Tharp, не число Virex).
- Перевод в 0–100 — кусочно-линейная интерполяция по опорным точкам `(0,0), (1.6,25), (2.0,40), (2.5,55), (3.0,70), (5.0,88), (7.0,100)`, клампится по краям.
- `sqn: null` и при `N < 30`, и при вырожденном `stdev === 0` — оба случая обязаны быть покрыты тестом отдельно, не полагаться на «само не случится».
- Ярлык уровня (`sqnTier`) — только в `title`-подсказку ячейки, не как отдельный видимый текст рядом с числом: у Winrate/Profit factor в этой же строке тоже нет текстовых качественных подписей, только число и `GaugeBar`.
- Никакой сырой разметки для повторяющихся элементов, цвета — классами из `globals.css` (здесь не требуется: новых стилей эта фича не добавляет, переиспользует существующие `.mcell`/`.mg`).
- Спека: `docs/superpowers/specs/2026-08-29-edge-score-design.md`.

---

## Task 1: Бэкенд — `computeSqn` и поле `sqn` в `TradeStats`

**Files:**
- Modify: `backend/src/trades/trades.service.ts:6-19` (интерфейс `TradeStats`), новый блок после него, и метод `stats()` (сейчас строки ~742-804)
- Test: `backend/src/trades/trades.service.spec.ts` (новый файл — у `TradesService` сейчас нет тестов вообще)

**Interfaces:**
- Produces: `computeSqn(pnls: number[]): number | null` (экспортируемая чистая функция), `MIN_SQN_POSITIONS = 30` (экспортируемая константа), `TradeStats.sqn: number | null` — этими именами их использует Task 2 на фронте (копия типа, как и у остальных ответов в проекте — общего пакета типов бэкенд/фронт нет).

- [x] **Step 1: Написать падающий тест**

Создать `backend/src/trades/trades.service.spec.ts`:

```ts
import { computeSqn, MIN_SQN_POSITIONS } from './trades.service';

describe('computeSqn', () => {
  it('меньше MIN_SQN_POSITIONS сделок — null, независимо от значений', () => {
    const pnls = Array(MIN_SQN_POSITIONS - 1).fill(100);
    expect(computeSqn(pnls)).toBeNull();
  });

  it('вырожденный случай — все P&L периода одинаковы (нулевая дисперсия) — null', () => {
    const pnls = Array(MIN_SQN_POSITIONS).fill(42);
    expect(computeSqn(pnls)).toBeNull();
  });

  it('нулевое среднее — SQN 0, даже при ненулевой дисперсии', () => {
    const pnls = [...Array(15).fill(10), ...Array(15).fill(-10)];
    expect(computeSqn(pnls)).toBe(0);
  });

  it('считает по формуле Ван Тарпа на конкретном наборе', () => {
    // mean=2, stdev(N-1)≈1.017, sqn = sqrt(30)*2/1.017 ≈ 10.77 — посчитано отдельно,
    // не в уме: 15 сделок по +3, 15 сделок по +1.
    const pnls = [...Array(15).fill(3), ...Array(15).fill(1)];
    expect(computeSqn(pnls)).toBe(10.77);
  });

  it('ровно MIN_SQN_POSITIONS сделок — граница включительно, не null', () => {
    const pnls = [...Array(15).fill(3), ...Array(15).fill(1)];
    expect(pnls.length).toBe(MIN_SQN_POSITIONS);
    expect(computeSqn(pnls)).not.toBeNull();
  });
});
```

- [x] **Step 2: Запустить тест и убедиться, что он падает**

Run: `cd backend && npx jest trades.service.spec`
Expected: FAIL — `computeSqn`/`MIN_SQN_POSITIONS` не существуют, импорт падает.

- [x] **Step 3: Добавить `computeSqn`, `MIN_SQN_POSITIONS` и поле `sqn`**

В `backend/src/trades/trades.service.ts` заменить блок `export interface TradeStats { ... }` (строки 6-19) на:

```ts
export interface TradeStats {
  totalTrades: number;
  totalPnl: number;
  totalFees: number;
  wins: number;
  losses: number;
  winRate: number; // 0..100
  grossProfit: number;
  grossLoss: number;
  profitFactor: number; // grossProfit / |grossLoss|
  avgPnl: number;
  bestPnl: number;
  worstPnl: number;
  /**
   * System Quality Number (Van Tharp): √N × mean(P&L) / stdev(P&L) по сделкам
   * периода. null — меньше MIN_SQN_POSITIONS сделок или нулевая дисперсия
   * (все P&L периода одинаковы — SQN не определён).
   */
  sqn: number | null;
}

// Порог значимости самой SQN (Van Tharp) — не число, придуманное для Virex.
export const MIN_SQN_POSITIONS = 30;

/**
 * SQN на «сырых» P&L, без R-нормировки на риск сделки (официально равноценный
 * вариант формулы — не даёт делить на несуществующий у части сделок стоп-лосс).
 * Выборочное стандартное отклонение (делитель N-1).
 */
export function computeSqn(pnls: number[]): number | null {
  const n = pnls.length;
  if (n < MIN_SQN_POSITIONS) return null;
  const mean = pnls.reduce((a, b) => a + b, 0) / n;
  const variance = pnls.reduce((a, p) => a + (p - mean) ** 2, 0) / (n - 1);
  const stdev = Math.sqrt(variance);
  return stdev > 0 ? Number(((Math.sqrt(n) * mean) / stdev).toFixed(2)) : null;
}
```

- [x] **Step 4: Подставить `sqn` в возвращаемый объект `stats()`**

В методе `stats()` заменить

```ts
    const totalTrades = trades.length;
    const stats: TradeStats = {
      totalTrades,
      totalPnl: Number(totalPnl.toFixed(4)),
      totalFees: Number(totalFees.toFixed(4)),
      wins,
      losses,
      winRate: totalTrades ? Number(((wins / totalTrades) * 100).toFixed(2)) : 0,
      grossProfit: Number(grossProfit.toFixed(4)),
      grossLoss: Number(grossLoss.toFixed(4)),
      profitFactor: grossLoss !== 0 ? Number((grossProfit / Math.abs(grossLoss)).toFixed(2)) : 0,
      avgPnl: totalTrades ? Number((totalPnl / totalTrades).toFixed(4)) : 0,
      bestPnl: Number(bestPnl.toFixed(4)),
      worstPnl: Number(worstPnl.toFixed(4)),
    };
```

на

```ts
    const totalTrades = trades.length;
    const stats: TradeStats = {
      totalTrades,
      totalPnl: Number(totalPnl.toFixed(4)),
      totalFees: Number(totalFees.toFixed(4)),
      wins,
      losses,
      winRate: totalTrades ? Number(((wins / totalTrades) * 100).toFixed(2)) : 0,
      grossProfit: Number(grossProfit.toFixed(4)),
      grossLoss: Number(grossLoss.toFixed(4)),
      profitFactor: grossLoss !== 0 ? Number((grossProfit / Math.abs(grossLoss)).toFixed(2)) : 0,
      avgPnl: totalTrades ? Number((totalPnl / totalTrades).toFixed(4)) : 0,
      bestPnl: Number(bestPnl.toFixed(4)),
      worstPnl: Number(worstPnl.toFixed(4)),
      sqn: computeSqn(trades.map((t) => t.closedPnl)),
    };
```

- [x] **Step 5: Запустить тест и убедиться, что он проходит**

Run: `cd backend && npx jest trades.service.spec`
Expected: PASS — все 5 `it(...)` зелёные.

- [x] **Step 6: Прогнать полный набор тестов бэкенда**

Run: `cd backend && npx jest`
Expected: PASS, число тестов выросло на 5 относительно текущего (153 → 158).

- [x] **Step 7: Commit**

```bash
git add backend/src/trades/trades.service.ts backend/src/trades/trades.service.spec.ts
git commit -m "feat(stats): SQN (Edge Score) в /api/trades/stats"
```

---

## Task 2: Фронтенд — `edgeScore.ts`, тип, переводы, `SummaryStrip`

**Files:**
- Modify: `frontend/src/entities/trade/api/types.ts:105-118` (`TradeStats`)
- Create: `frontend/src/shared/lib/utils/edgeScore.ts`
- Test: `frontend/src/shared/lib/utils/edgeScore.test.ts`
- Modify: `frontend/src/shared/i18n/messages/ru.json`, `frontend/src/shared/i18n/messages/en.json`
- Modify: `frontend/src/views/overview/components/SummaryStrip.tsx`

**Interfaces:**
- Consumes: `TradeStats.sqn: number | null` из Task 1.
- Produces: `sqnToScore(sqn: number): number`, `sqnTier(sqn: number): SqnTier`, `type SqnTier` из `@/shared/lib/utils/edgeScore` — используются только внутри `SummaryStrip.tsx`, наружу из `views/overview` не отдаются.

- [ ] **Step 1: Добавить `sqn` в тип `TradeStats`**

В `frontend/src/entities/trade/api/types.ts` заменить

```ts
export interface TradeStats {
  totalTrades: number;
  totalPnl: number;
  totalFees: number;
  wins: number;
  losses: number;
  winRate: number;
  grossProfit: number;
  grossLoss: number;
  profitFactor: number;
  avgPnl: number;
  bestPnl: number;
  worstPnl: number;
}
```

на

```ts
export interface TradeStats {
  totalTrades: number;
  totalPnl: number;
  totalFees: number;
  wins: number;
  losses: number;
  winRate: number;
  grossProfit: number;
  grossLoss: number;
  profitFactor: number;
  avgPnl: number;
  bestPnl: number;
  worstPnl: number;
  /** System Quality Number (Van Tharp). null — меньше 30 сделок или нулевая дисперсия P&L. */
  sqn: number | null;
}
```

- [ ] **Step 2: Написать падающий тест**

Создать `frontend/src/shared/lib/utils/edgeScore.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { sqnToScore, sqnTier } from './edgeScore';

describe('sqnToScore', () => {
  it('опорные точки шкалы Тарпа переводятся ровно', () => {
    expect(sqnToScore(0)).toBe(0);
    expect(sqnToScore(1.6)).toBe(25);
    expect(sqnToScore(2.0)).toBe(40);
    expect(sqnToScore(2.5)).toBe(55);
    expect(sqnToScore(3.0)).toBe(70);
    expect(sqnToScore(5.0)).toBe(88);
    expect(sqnToScore(7.0)).toBe(100);
  });

  it('между опорными точками — линейная интерполяция', () => {
    expect(sqnToScore(2.25)).toBe(48); // середина 2.0(40)–2.5(55)
    expect(sqnToScore(1.8)).toBe(33); // середина 1.6(25)–2.0(40)
  });

  it('клампится по краям', () => {
    expect(sqnToScore(-3)).toBe(0);
    expect(sqnToScore(10)).toBe(100);
  });
});

describe('sqnTier', () => {
  it('границы уровней — нижняя включена в верхний, не в нижний', () => {
    expect(sqnTier(1.59)).toBe('poor');
    expect(sqnTier(1.6)).toBe('belowAverage');
    expect(sqnTier(1.99)).toBe('belowAverage');
    expect(sqnTier(2.0)).toBe('average');
    expect(sqnTier(2.49)).toBe('average');
    expect(sqnTier(2.5)).toBe('good');
    expect(sqnTier(2.99)).toBe('good');
    expect(sqnTier(3.0)).toBe('excellent');
    expect(sqnTier(4.99)).toBe('excellent');
    expect(sqnTier(5.0)).toBe('superb');
    expect(sqnTier(6.99)).toBe('superb');
    expect(sqnTier(7.0)).toBe('holyGrail');
  });
});
```

- [ ] **Step 3: Запустить тест и убедиться, что он падает**

Run: `cd frontend && npx vitest run src/shared/lib/utils/edgeScore.test.ts`
Expected: FAIL — `Cannot find module './edgeScore'`.

- [ ] **Step 4: Написать `edgeScore.ts`**

Создать `frontend/src/shared/lib/utils/edgeScore.ts`:

```ts
/**
 * Опорные точки широко цитируемой шкалы Van Tharp (SQN). Несколько независимых
 * источников по-разному проводят стык «средняя/хорошая» (2.0–2.5 против
 * 2.5–2.9) — здесь взята чаще встречающаяся версия, это не дословная цитата
 * из его книги: прямого доступа к первоисточнику нет.
 */
const POINTS: Array<[sqn: number, score: number]> = [
  [0, 0],
  [1.6, 25],
  [2.0, 40],
  [2.5, 55],
  [3.0, 70],
  [5.0, 88],
  [7.0, 100],
];

/** SQN → 0..100 кусочно-линейной интерполяцией по шкале Тарпа. Клампится по краям. */
export function sqnToScore(sqn: number): number {
  if (sqn <= 0) return 0;
  if (sqn >= 7) return 100;
  for (let i = 1; i < POINTS.length; i++) {
    const [x1, y1] = POINTS[i - 1];
    const [x2, y2] = POINTS[i];
    if (sqn <= x2) return Math.round(y1 + ((sqn - x1) / (x2 - x1)) * (y2 - y1));
  }
  return 100; // недостижимо при упорядоченных POINTS — успокаивает TS
}

export type SqnTier = 'poor' | 'belowAverage' | 'average' | 'good' | 'excellent' | 'superb' | 'holyGrail';

/** Ярлык уровня по границам той же шкалы — для тултипа, не для основной цифры. */
export function sqnTier(sqn: number): SqnTier {
  if (sqn < 1.6) return 'poor';
  if (sqn < 2.0) return 'belowAverage';
  if (sqn < 2.5) return 'average';
  if (sqn < 3.0) return 'good';
  if (sqn < 5.0) return 'excellent';
  if (sqn < 7.0) return 'superb';
  return 'holyGrail';
}
```

- [ ] **Step 5: Запустить тест и убедиться, что он проходит**

Run: `cd frontend && npx vitest run src/shared/lib/utils/edgeScore.test.ts`
Expected: PASS — все `it(...)` зелёные.

- [ ] **Step 6: Добавить переводы уровней в оба каталога**

В `frontend/src/shared/i18n/messages/ru.json`, внутри `"overview"`, последняя строка сейчас `"habitsLikely": "похоже на закономерность"` — заменить на неё же с запятой в конце плюс новый блок перед закрывающей `}`:

```json
    "habitsLikely": "похоже на закономерность",
    "edgeScoreTierPoor": "Плохая",
    "edgeScoreTierBelowAverage": "Ниже среднего",
    "edgeScoreTierAverage": "Средняя",
    "edgeScoreTierGood": "Хорошая",
    "edgeScoreTierExcellent": "Отличная",
    "edgeScoreTierSuperb": "Превосходная",
    "edgeScoreTierHolyGrail": "Грааль"
```

В `frontend/src/shared/i18n/messages/en.json`, тем же способом, последняя строка сейчас `"habitsLikely": "looks like a pattern"`:

```json
    "habitsLikely": "looks like a pattern",
    "edgeScoreTierPoor": "Poor",
    "edgeScoreTierBelowAverage": "Below average",
    "edgeScoreTierAverage": "Average",
    "edgeScoreTierGood": "Good",
    "edgeScoreTierExcellent": "Excellent",
    "edgeScoreTierSuperb": "Superb",
    "edgeScoreTierHolyGrail": "Holy grail"
```

- [ ] **Step 7: Подключить Edge Score в `SummaryStrip`**

В `frontend/src/views/overview/components/SummaryStrip.tsx`:

Заменить импорт

```ts
import { formatMoney, formatProfitFactor, moneyClass } from '@/shared/lib/utils/format';
```

на

```ts
import { formatMoney, formatProfitFactor, moneyClass } from '@/shared/lib/utils/format';
import { sqnToScore, sqnTier, type SqnTier } from '@/shared/lib/utils/edgeScore';
```

Заменить интерфейс `Metric`

```ts
interface Metric {
  label: string;
  value: ReactNode;
  tone?: 'pos' | 'neg';
  gauge?: Gauge;
}
```

на

```ts
interface Metric {
  label: string;
  value: ReactNode;
  tone?: 'pos' | 'neg';
  gauge?: Gauge;
  /** Всплывающая подсказка на ячейке — сейчас только у Edge Score (уровень по SQN). */
  title?: string;
}
```

Заменить шапку компонента и начало массива `metrics`

```ts
export function SummaryStrip({ stats }: { stats: TradeStats }) {
  const t = useTranslations('overview');
  const profitFactor = formatProfitFactor(stats.profitFactor, stats.wins, stats.losses);
  const metrics: Metric[] = [
    { label: 'Net P&L · USDT', value: formatMoney(stats.totalPnl), tone: moneyClass(stats.totalPnl) },
    { label: t('trades'), value: String(stats.totalTrades) },
```

на

```ts
export function SummaryStrip({ stats }: { stats: TradeStats }) {
  const t = useTranslations('overview');
  const profitFactor = formatProfitFactor(stats.profitFactor, stats.wins, stats.losses);
  const tierLabels: Record<SqnTier, string> = {
    poor: t('edgeScoreTierPoor'),
    belowAverage: t('edgeScoreTierBelowAverage'),
    average: t('edgeScoreTierAverage'),
    good: t('edgeScoreTierGood'),
    excellent: t('edgeScoreTierExcellent'),
    superb: t('edgeScoreTierSuperb'),
    holyGrail: t('edgeScoreTierHolyGrail'),
  };
  const metrics: Metric[] = [
    { label: 'Net P&L · USDT', value: formatMoney(stats.totalPnl), tone: moneyClass(stats.totalPnl) },
    {
      label: 'Edge Score',
      value: stats.sqn == null ? '—' : String(sqnToScore(stats.sqn)),
      gauge: stats.sqn == null ? undefined : { fill: sqnToScore(stats.sqn), threshold: 40 },
      title: stats.sqn == null ? undefined : tierLabels[sqnTier(stats.sqn)],
    },
    { label: t('trades'), value: String(stats.totalTrades) },
```

Заменить строку рендера ячейки

```tsx
        <div className="mcell" key={m.label}>
```

на

```tsx
        <div className="mcell" key={m.label} title={m.title}>
```

Заменить скелет — сейчас девять слотов, после добавления Edge Score их десять:

```tsx
/** Скелет свода: те же девять слотов, чтобы шапка не прыгала при загрузке. */
export function SummaryStripSkeleton() {
  return (
    <div className="metrics" aria-hidden>
      {Array.from({ length: 9 }, (_, i) => (
```

на

```tsx
/** Скелет свода: те же десять слотов, чтобы шапка не прыгала при загрузке. */
export function SummaryStripSkeleton() {
  return (
    <div className="metrics" aria-hidden>
      {Array.from({ length: 10 }, (_, i) => (
```

И поправить комментарий над самим компонентом (сейчас «девять величин одной строкой»):

```ts
/**
 * Свод периода — девять величин одной строкой, без карточек.
```

на

```ts
/**
 * Свод периода — десять величин одной строкой, без карточек.
```

- [ ] **Step 8: Проверка типов фронтенда**

Run: `cd frontend && npx tsc --noEmit`
Expected: без ошибок.

- [ ] **Step 9: Полный прогон тестов фронтенда**

Run: `cd frontend && npx vitest run`
Expected: PASS, включая `messages.test.ts` (en/ru в паре) и новый `edgeScore.test.ts`.

- [ ] **Step 10: Полная сборка фронтенда**

Run: `cd frontend && npx next build`
Expected: PASS, без ошибок и предупреждений.

- [ ] **Step 11: Контрольный прогон бэкенда**

Run: `cd backend && npx jest && npx nest build`
Expected: PASS (это уже проверялось в Task 1, здесь — финальная гарантия, что фронтовые правки ничего не задели на бэкенде).

- [ ] **Step 12: Commit**

```bash
git add frontend/src/entities/trade/api/types.ts frontend/src/shared/lib/utils/edgeScore.ts \
  frontend/src/shared/lib/utils/edgeScore.test.ts frontend/src/shared/i18n/messages/ru.json \
  frontend/src/shared/i18n/messages/en.json frontend/src/views/overview/components/SummaryStrip.tsx
git commit -m "feat(overview): Edge Score в своде периода"
```

---

## Итог

После Task 2 в `SummaryStrip` на Обзоре — десятая ячейка «Edge Score»: 0–100 по признанной формуле SQN, с той же `GaugeBar`, что у Winrate/Profit factor, и уровнем по шкале Тарпа во всплывающей подсказке. Меньше 30 сделок в выбранном периоде — «—», без вводящего в заблуждение числа на маленькой выборке.
