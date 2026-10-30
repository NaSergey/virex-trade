# Стратегия в админке — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** раздел `admin.<домен>/strategy` — интрадей Smart Money из видео SanchoDT на истории BTC: формализованные правила, готовый отчёт бектеста с вариантами, проверка цифр автора, обучение на ошибках с проверкой вперёд и выключаемая теория «Трейдинг = математика».

**Architecture:** движок — чистые функции в `backend/src/strategy/` (ряды → события → сетапы → исполнение → отчёт); `worker` раз в сутки собирает отчёт и пишет JSON в `strategy_reports`, `api` отдаёт его владельцу. Фронт — изолированный вью `frontend/src/views/strategy/`, графики своим SVG.

**Tech Stack:** NestJS + Prisma + PostgreSQL (jest), Next.js App Router + react-query (vitest).

**Спека:** `docs/superpowers/specs/2026-10-30-strategy-lab-design.md`.

## Global Constraints

- Раздел изолирован: код только `backend/src/strategy/`, `frontend/src/views/strategy/`, маршрут `frontend/src/app/admin/(in)/strategy/`, блок схемы `═══ strategy ═══`; точки подключения перечислены в README раздела.
- Только закрытые свечи; детекция на свече `i` не использует свечи после `i` (тест сверяет с обрезанным рядом).
- Свинг — пятисвечный фрактал, строгие неравенства; ATR(14) по Уайлдеру; окно после свипа `W = 10`; ордерблок — не дальше 5 свечей; лимит живёт 48 свечей; срок сделки 3 суток; мейкер 0,02 %, тейкер 0,055 %.
- Обучение: с 2020-Q1, кварталами UTC; обучающие сделки — закрытые до начала квартала; правило: ≥ 20 сделок, средний R < 0, верхняя граница одностороннего 95 % интервала < 0; не больше 3 правил; минимум 60 обучающих сделок.
- Цифры автора: BTC 1H, барьер ±1 ATR от закрытия, 24 свечи, обе границы в одной свече — «не решилось».
- Отчёт считает только `worker` (`runsBackgroundJobs()` первой строкой `onApplicationBootstrap`); `api` его только отдаёт под `JwtAuthGuard` + `AdminGuard`.
- `STRATEGY_VERSION` поднимается при любой правке правил, обучения или формы отчёта.
- Тексты страницы — по-русски внутри вью; в i18n только `adminShell.strategy`.
- Компоненты — из `shared/ui`; графики — своё SVG; без свечений и градиентов.
- Бэкенд не strict (`strictNullChecks: false`), фронт strict. Форматирование бэка — prettier (`singleQuote`, `trailingComma: all`).

## Разметка риска и контрольные точки (гибрид)

| Задачи | Класс | Почему |
|---|---|---|
| 1–8 движок | A | корректность расчёта и отсутствие заглядывания в будущее — ошибка молча обесценивает весь отчёт |
| 9 сервис и API | B | стык `worker` ↔ база ↔ `api` |
| 10–11 фронт | B | контракт отчёта бэк ↔ фронт |
| 12 документация | C | — |

Контрольная точка 1 — после задачи 8 (движок целиком). Контрольная точка 2 — после задачи 12 (сервис, фронт, стык). Финальное ревью Opus не нужно: точек две, стык во второй.

## Файлы

**Бэкенд `backend/src/strategy/`:**
- `report.types.ts` — форма отчёта (без импортов; копия на фронте).
- `stats.ts` — Вильсон, t-квантиль, интервалы, сводка, просадка, серия, ГПСЧ.
- `series.ts` — ряд в типизированных массивах, ATR, свинги, структура, выравнивание старшего ТФ.
- `fixtures.ts` — построители рядов для тестов (сценарий сетапа, случайное блуждание, агрегация).
- `events.ts` — пулы ликвидности, свипы, пробои, ближайшие уровни, FVG, подтверждение.
- `setups.ts` — варианты, сборка сетапа, признаки.
- `simulate.ts` — исполнение сделки, разбор спорных свечей минутками.
- `author-check.ts` — барьерный тест, базовая частота, строки «цифр автора».
- `learning.ts` — кварталы, правила, проверка вперёд, вердикт, типичные ошибки.
- `theory.ts` — блок теории.
- `report.ts` — сборка отчёта, система «одна позиция».
- `strategy-report.service.ts`, `strategy.controller.ts`, `strategy.module.ts`.

**Фронт `frontend/src/views/strategy/`:** `Page.tsx`, `strategy.css`, `README.md`, `api/types.ts`, `api/hooks.ts`, `model/format.ts`, `model/format.test.ts`, `model/rules.ts`, `components/LineChart.tsx`, `components/RulesSection.tsx`, `components/BacktestSection.tsx`, `components/TradeChart.tsx`, `components/AuthorSection.tsx`, `components/LearningSection.tsx`, `components/TheorySection.tsx`.

**Правки:** `backend/prisma/schema.prisma`, `backend/src/app.module.ts`, `frontend/src/app/(internal)/AdminChrome.tsx`, `frontend/src/shared/i18n/messages/{ru,en}.json`, `frontend/src/app/admin/(in)/strategy/page.tsx` (новый), `CLAUDE.md`.

Команды тестов: бэк — `cd backend && npx jest src/strategy/<file>.spec.ts`; фронт — `cd frontend && npx vitest run src/views/strategy`.

---

### Task 1: Типы отчёта, статистика, ряды свечей

**Files:**
- Create: `backend/src/strategy/report.types.ts`, `backend/src/strategy/stats.ts`, `backend/src/strategy/series.ts`, `backend/src/strategy/fixtures.ts`
- Test: `backend/src/strategy/stats.spec.ts`, `backend/src/strategy/series.spec.ts`

**Interfaces:**
- Produces: типы `Dir, Outcome, FeatureKey, Features, Summary, Point, VariantRow, TradeRow, YearRow, Share, AuthorRow, Rule, QuarterRow, Effect, Mistake, SystemBlock, LearningBlock, TheoryBlock, StrategyReport, ReportResponse`; `wilson(k, n, z?) → [lo, hi]`, `tQuantile(z, df)`, `meanCi(xs) → {mean, lo, hi}`, `upper95(xs)`, `summarize(rs) → Summary`, `maxDrawdown(rs, risk)`, `maxLossStreak(rs)`, `mulberry32(seed) → () => number`; `Series {tf, n, t, o, h, l, c}`, `CandleRow`, `toSeries(tf, rows)`, `closeMs(s, i)`, `atr(s, period?)`, `Swing {i, price, known}`, `swings(s) → {highs, lows}`, `structure(s, sw?) → Int8Array`, `alignToClose(s, htf, values) → Int8Array`, `lowerBound(arr, x)`; фикстуры `bars(rows, tf?, start?)`, `mirror(s)`, `flat(n, p?)`, `SCENARIO`, `walk(n, seed?, start?)`, `aggregate(s, tf)`.

- [ ] **Step 1: Write `report.types.ts`** (типы без логики — тестами не покрываются)

```ts
/**
 * Форма отчёта стратегии — то, что лежит в `strategy_reports.data` и уходит
 * странице. Файл самодостаточен (без импортов): фронт держит его копию в
 * `frontend/src/views/strategy/api/types.ts`, правятся вместе.
 */

export type Dir = 1 | -1;
export type Outcome = 'target' | 'stop' | 'time';

export type FeatureKey =
  | 'session'
  | 'weekend'
  | 'daily'
  | 'vol'
  | 'stopAtr'
  | 'plannedR'
  | 'pierce'
  | 'deep';
export type Features = Record<FeatureKey, string>;

export interface Summary {
  n: number;
  wins: number;
  /** Доля сделок с R > 0. */
  winrate: number;
  /** Средняя прибыль и средний убыток (модулем), в R. */
  avgWin: number;
  avgLoss: number;
  /** Мат ожидание — средний R сделки. */
  expectancy: number;
  /** Профит-фактор; null — убыточных сделок нет. */
  pf: number | null;
  sumR: number;
  /** Винрейт, при котором эти avgWin/avgLoss дают ноль. */
  breakeven: number;
}

export interface Point {
  ms: number;
  r: number;
}

export interface VariantRow {
  id: string;
  label: string;
  setups: number;
  filled: number;
  missed: number;
  expired: number;
  /** Сводка по сделкам системы (одна позиция за раз), R после комиссии. */
  summary: Summary;
  grossExpectancy: number;
  /** Макс. просадка при риске 1 % на сделку, доля. */
  maxDd1: number;
}

export interface TradeRow {
  id: string;
  dir: Dir;
  tf: number;
  sweepMs: number;
  obMs: number;
  fvgMs: number | null;
  bosMs: number | null;
  /** Закрытие свечи подтверждения — момент, когда выставлен лимит. */
  confirmMs: number;
  level: number;
  entry: number;
  stop: number;
  target: number;
  plannedR: number;
  fillMs: number;
  fill: number;
  exitMs: number;
  exit: number;
  outcome: Outcome;
  rGross: number;
  rNet: number;
  features: Features;
}

export interface YearRow {
  year: number;
  summary: Summary;
}

export interface Share {
  n: number;
  /** Доля успехов среди решившихся; null — решившихся нет. */
  share: number | null;
  lo: number | null;
  hi: number | null;
  /** Чего ждать от самого рынка на этих же сторонах. */
  base: number | null;
  unresolved: number;
}

export interface AuthorRow {
  key: string;
  label: string;
  /** Цифра автора, доля. */
  author: number;
  fromEvent: Share;
  /** От свечи, на которой выполнилось условие; null у строк без условия. */
  fromConfirm: Share | null;
}

export interface Rule {
  feature: FeatureKey;
  value: string;
}

export interface QuarterRow {
  key: string;
  rules: Rule[];
  added: Rule[];
  removed: Rule[];
  trainN: number;
  /** Сетапов квартала (исполненных) и сколько из них правила отсекли. */
  trades: number;
  excluded: number;
}

export interface Effect {
  n: number;
  mean: number | null;
  lo: number | null;
  hi: number | null;
  verdict: 'helped' | 'hurt' | 'unproven';
}

export interface Mistake {
  feature: FeatureKey;
  value: string;
  n: number;
  mean: number;
  lo: number;
  hi: number;
}

export interface SystemBlock {
  summary: Summary;
  maxDd1: number;
  equity: Point[];
}

export interface LearningBlock {
  fromMs: number;
  quarters: QuarterRow[];
  base: SystemBlock;
  learned: SystemBlock;
  effect: Effect;
  mistakes: Mistake[];
  next: { key: string; rules: Rule[] };
}

export interface TheoryBlock {
  expectancy: {
    winrate: number;
    avgWin: number;
    avgLoss: number;
    gross: number;
    net: number;
  };
  breakeven: {
    table: { r: number; winrate: number }[];
    avgWin: number;
    winrate: number;
    needed: number;
  };
  running: { n: number; mean: number }[];
  variance: {
    paths: { label: string; points: number[] }[];
    maxStreak: number;
    pStreak: number;
    sims: number;
  };
  sizing: {
    account: number;
    riskPct: number;
    riskUsd: number;
    /** Медианный стоп сделок, доля цены входа. */
    stopPct: number;
    position: number;
    streak20: { risk: number; loss: number }[];
  };
  ruin: { trades: number; sims: number; rows: { risk: number; p: number }[] };
  asymmetry: {
    table: { loss: number; need: number }[];
    maxDd1: number;
    need: number | null;
  };
}

export interface StrategyReport {
  version: number;
  computedAt: string;
  dataFrom: number;
  dataTo: number;
  variants: VariantRow[];
  main: {
    variant: VariantRow;
    equity: Point[];
    byYear: YearRow[];
    trades: TradeRow[];
  };
  author: AuthorRow[];
  learning: LearningBlock;
  theory: TheoryBlock;
}

export interface ReportResponse {
  status: 'ready' | 'pending';
  computedAt: string | null;
  report: StrategyReport | null;
}
```

- [ ] **Step 2: Write the failing tests `stats.spec.ts`**

```ts
import {
  maxDrawdown,
  maxLossStreak,
  meanCi,
  mulberry32,
  summarize,
  tQuantile,
  upper95,
  wilson,
} from './stats';

describe('stats', () => {
  it('wilson — известный интервал 5 из 10', () => {
    const [lo, hi] = wilson(5, 10);
    expect(lo).toBeCloseTo(0.2366, 3);
    expect(hi).toBeCloseTo(0.7634, 3);
  });

  it('wilson — пустая выборка даёт NaN', () => {
    expect(wilson(0, 0).every(Number.isNaN)).toBe(true);
  });

  it('tQuantile — к нормальному при большом df и t(0,95; 19) ≈ 1,729', () => {
    expect(tQuantile(1.959964, 1e9)).toBeCloseTo(1.959964, 5);
    expect(tQuantile(1.6448536, 19)).toBeCloseTo(1.729, 2);
  });

  it('summarize — пример видео: цель 8R, винрейт 15 % → +0,35R', () => {
    const rs = [...Array(15).fill(8), ...Array(85).fill(-1)];
    const s = summarize(rs);
    expect(s.n).toBe(100);
    expect(s.winrate).toBeCloseTo(0.15);
    expect(s.expectancy).toBeCloseTo(0.35);
    expect(s.avgWin).toBe(8);
    expect(s.avgLoss).toBe(1);
    expect(s.breakeven).toBeCloseTo(1 / 9);
    expect(s.pf).toBeCloseTo(120 / 85);
  });

  it('summarize — без убытков pf = null', () => {
    expect(summarize([1, 2]).pf).toBeNull();
  });

  it('meanCi и upper95', () => {
    const xs = [-1, -1, -1, -1, 1, -1, -1, -1, -1, -1];
    const ci = meanCi(xs);
    expect(ci.mean).toBeCloseTo(-0.8);
    expect(ci.lo).toBeLessThan(ci.mean);
    expect(ci.hi).toBeGreaterThan(ci.mean);
    expect(upper95(xs)).toBeLessThan(ci.hi);
    expect(upper95(xs)).toBeLessThan(0);
  });

  it('maxDrawdown — сложный процент', () => {
    expect(maxDrawdown([-1, -1], 0.5)).toBeCloseTo(0.75);
    expect(maxDrawdown([1, -1], 0.1)).toBeCloseTo(0.1);
  });

  it('maxLossStreak', () => {
    expect(maxLossStreak([1, -1, -1, 0, 2, -1])).toBe(3);
  });

  it('mulberry32 воспроизводим', () => {
    const a = mulberry32(7);
    const b = mulberry32(7);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});
```

- [ ] **Step 3: Run — FAIL** (`Cannot find module './stats'`)

Run: `cd backend && npx jest src/strategy/stats.spec.ts`

- [ ] **Step 4: Write `stats.ts`**

```ts
import type { Summary } from './report.types';

const Z95 = 1.6448536269514722;
const Z975 = 1.959963984540054;

/** Интервал Вильсона для доли k из n (по умолчанию 95 %). */
export function wilson(k: number, n: number, z = Z975): [number, number] {
  if (n === 0) return [NaN, NaN];
  const p = k / n;
  const den = 1 + (z * z) / n;
  const mid = (p + (z * z) / (2 * n)) / den;
  const half =
    (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / den;
  return [Math.max(0, mid - half), Math.min(1, mid + half)];
}

/**
 * Квантиль t-распределения поправкой Корниша — Фишера к нормальному: при
 * df ≥ 5 точность — третий знак, таблицы не нужны.
 */
export function tQuantile(z: number, df: number): number {
  return (
    z +
    (z ** 3 + z) / (4 * df) +
    (5 * z ** 5 + 16 * z ** 3 + 3 * z) / (96 * df * df)
  );
}

function meanSd(xs: number[]): [number, number] {
  const n = xs.length;
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const v = n > 1 ? xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1) : 0;
  return [mean, Math.sqrt(v)];
}

/** Двусторонний 95 % интервал среднего. */
export function meanCi(xs: number[]): { mean: number; lo: number; hi: number } {
  if (xs.length < 2) {
    return { mean: xs.length ? xs[0] : NaN, lo: NaN, hi: NaN };
  }
  const [mean, sd] = meanSd(xs);
  const half = (tQuantile(Z975, xs.length - 1) * sd) / Math.sqrt(xs.length);
  return { mean, lo: mean - half, hi: mean + half };
}

/** Верхняя граница одностороннего 95 % интервала среднего. */
export function upper95(xs: number[]): number {
  if (xs.length < 2) return NaN;
  const [mean, sd] = meanSd(xs);
  return mean + (tQuantile(Z95, xs.length - 1) * sd) / Math.sqrt(xs.length);
}

/** Сводка по R сделок; сделка с R ≤ 0 — убыточная. */
export function summarize(rs: number[]): Summary {
  let wins = 0;
  let losses = 0;
  let sumWin = 0;
  let sumLoss = 0;
  let sum = 0;
  for (const r of rs) {
    sum += r;
    if (r > 0) {
      wins++;
      sumWin += r;
    } else {
      losses++;
      sumLoss -= r;
    }
  }
  const n = rs.length;
  const avgWin = wins ? sumWin / wins : 0;
  const avgLoss = losses ? sumLoss / losses : 0;
  return {
    n,
    wins,
    winrate: n ? wins / n : 0,
    avgWin,
    avgLoss,
    expectancy: n ? sum / n : 0,
    pf: sumLoss > 0 ? sumWin / sumLoss : null,
    sumR: sum,
    breakeven: avgWin + avgLoss > 0 ? avgLoss / (avgWin + avgLoss) : 0,
  };
}

/** Макс. просадка счёта от максимума при риске `risk` (доля) на сделку, со сложным процентом. */
export function maxDrawdown(rs: number[], risk: number): number {
  let eq = 1;
  let peak = 1;
  let dd = 0;
  for (const r of rs) {
    eq *= 1 + risk * r;
    if (eq > peak) peak = eq;
    dd = Math.max(dd, 1 - eq / peak);
  }
  return dd;
}

/** Самая длинная серия сделок с R ≤ 0. */
export function maxLossStreak(rs: number[]): number {
  let best = 0;
  let cur = 0;
  for (const r of rs) {
    cur = r > 0 ? 0 : cur + 1;
    best = Math.max(best, cur);
  }
  return best;
}

/** ГПСЧ с зерном: перестановки в отчёте одинаковы от пересчёта к пересчёту. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

- [ ] **Step 5: Run — PASS**

Run: `cd backend && npx jest src/strategy/stats.spec.ts`

- [ ] **Step 6: Write the failing tests `series.spec.ts`** (и фикстуры, которыми они пользуются)

`fixtures.ts`:

```ts
import { mulberry32 } from './stats';
import { Series, toSeries } from './series';

export type Ohlc = [number, number, number, number];

/** Ряд из [open, high, low, close] с шагом tf минут от `start` (мс). */
export function bars(rows: Ohlc[], tf = 15, start = 0): Series {
  return toSeries(
    tf,
    rows.map(([open, high, low, close], i) => ({
      time: start + i * tf * 60_000,
      open,
      high,
      low,
      close,
    })),
  );
}

/** Зеркало ряда: шорт зеркального ряда — тот же лонг. */
export function mirror(s: Series): Series {
  return {
    ...s,
    o: s.o.map((x) => -x),
    h: s.l.map((x) => -x),
    l: s.h.map((x) => -x),
    c: s.c.map((x) => -x),
  };
}

/** Ровные свечи вокруг цены p — разгон ATR без свингов. */
export const flat = (n: number, p = 100): Ohlc[] =>
  Array.from({ length: n }, (): Ohlc => [p, p + 1, p - 1, p]);

/**
 * Сценарий A+ сетапа (лонг): свинг-хай 106 (свеча 16), свинг-лоу 97 (19),
 * внутренний свинг-хай 102 (22), свип 97 медвежьей свечой 25, FVG на 27,
 * закрытие выше 102 на 28.
 */
export const SCENARIO: Ohlc[] = [
  ...flat(14),
  [100, 102, 99.5, 101.5], // 14
  [101.5, 104, 101, 103.5], // 15
  [103.5, 106, 103, 105], // 16 свинг-хай 106
  [105, 105.5, 102, 102.5], // 17
  [102.5, 103, 100, 100.5], // 18
  [100.5, 101, 97, 97.5], // 19 свинг-лоу 97
  [97.5, 100, 97.5, 99.5], // 20
  [99.5, 101, 98.5, 100.5], // 21
  [100.5, 102, 99.5, 101], // 22 внутренний свинг-хай 102
  [101, 101.5, 98.5, 99], // 23
  [99, 99.5, 97.5, 98], // 24
  [98.6, 98.8, 96, 98.2], // 25 свип 97, медвежья — ордерблок
  [98.2, 100, 98, 99.8], // 26
  [99.8, 101.5, 99.6, 101.2], // 27 FVG: лоу 99,6 > хай 25 (98,8)
  [101.2, 103, 101, 102.8], // 28 закрытие выше 102 — слом
];

/** Случайное блуждание 15m-свечей — для сквозных тестов. */
export function walk(n: number, seed = 1, start = Date.UTC(2020, 0, 1)): Series {
  const rnd = mulberry32(seed);
  let p = 10_000;
  const rows = [];
  for (let i = 0; i < n; i++) {
    const open = p;
    const close = open * (1 + (rnd() - 0.5) * 0.006);
    const high = Math.max(open, close) * (1 + rnd() * 0.002);
    const low = Math.min(open, close) * (1 - rnd() * 0.002);
    rows.push({ time: start + i * 15 * 60_000, open, high, low, close });
    p = close;
  }
  return toSeries(15, rows);
}

/** Свечи старшего ТФ из младших (группы по началу старшей свечи). */
export function aggregate(s: Series, tf: number): Series {
  const step = tf * 60_000;
  const rows: {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
  }[] = [];
  for (let i = 0; i < s.n; i++) {
    const time = Math.floor(s.t[i] / step) * step;
    const last = rows[rows.length - 1];
    if (last && last.time === time) {
      last.high = Math.max(last.high, s.h[i]);
      last.low = Math.min(last.low, s.l[i]);
      last.close = s.c[i];
    } else {
      rows.push({ time, open: s.o[i], high: s.h[i], low: s.l[i], close: s.c[i] });
    }
  }
  return toSeries(tf, rows);
}
```

`series.spec.ts`:

```ts
import { bars, flat, SCENARIO, walk } from './fixtures';
import {
  alignToClose,
  atr,
  closeMs,
  lowerBound,
  structure,
  swings,
  toSeries,
} from './series';

const prefix = (s: ReturnType<typeof walk>, k: number) =>
  toSeries(
    s.tf,
    Array.from({ length: k }, (_, i) => ({
      time: s.t[i],
      open: s.o[i],
      high: s.h[i],
      low: s.l[i],
      close: s.c[i],
    })),
  );

describe('series', () => {
  it('atr — среднее TR за первые 14, дальше по Уайлдеру', () => {
    const s = bars([...flat(14), [100, 104, 100, 103]]);
    const a = atr(s);
    expect(Number.isNaN(a[12])).toBe(true);
    expect(a[13]).toBeCloseTo(2);
    expect(a[14]).toBeCloseTo((2 * 13 + 4) / 14);
  });

  it('swings — фракталы сценария', () => {
    const sw = swings(bars(SCENARIO));
    expect(sw.highs.map((x) => [x.i, x.price, x.known])).toEqual([
      [16, 106, 18],
      [22, 102, 24],
    ]);
    // Свеча свипа 25 сама становится свинг-лоу 96 (подтверждена на 27).
    expect(sw.lows.map((x) => [x.i, x.price])).toEqual([
      [19, 97],
      [25, 96],
    ]);
  });

  it('swings и structure не перерисовываются', () => {
    const s = walk(600, 3);
    const full = swings(s);
    const fullTrend = structure(s, full);
    for (const k of [50, 177, 333, 599]) {
      const p = prefix(s, k);
      const sw = swings(p);
      expect(sw.highs).toEqual(full.highs.filter((x) => x.known < k));
      expect(sw.lows).toEqual(full.lows.filter((x) => x.known < k));
      expect(Array.from(structure(p, sw))).toEqual(
        Array.from(fullTrend.slice(0, k)),
      );
    }
  });

  it('structure — слом вверх на закрытии выше свинг-хая', () => {
    const trend = structure(bars(SCENARIO));
    expect(trend[27]).toBe(0);
    expect(trend[28]).toBe(1);
  });

  it('alignToClose — берётся последняя старшая свеча, закрытая не позже', () => {
    const m15 = bars(flat(32), 15);
    const h1 = bars(flat(8), 60);
    const vals = Int8Array.from([1, -1, 1, -1, 1, -1, 1, -1]);
    const al = alignToClose(m15, h1, vals);
    expect(al[2]).toBe(0); // 00:45 — часовая ещё не закрыта
    expect(al[3]).toBe(1); // 01:00 — закрылась первая
    expect(al[7]).toBe(-1); // 02:00 — вторая
    expect(closeMs(m15, 3)).toBe(60 * 60_000);
  });

  it('lowerBound', () => {
    const arr = Float64Array.from([1, 3, 3, 5]);
    expect(lowerBound(arr, 3)).toBe(1);
    expect(lowerBound(arr, 4)).toBe(3);
    expect(lowerBound(arr, 9)).toBe(4);
  });
});
```

- [ ] **Step 7: Run — FAIL** (`Cannot find module './series'`)

Run: `cd backend && npx jest src/strategy/series.spec.ts`

- [ ] **Step 8: Write `series.ts`**

```ts
/**
 * Ряд свечей одного таймфрейма в типизированных массивах: на 15m с 2018 года
 * это ~300 тыс. свечей, и массив объектов стоил бы worker в разы больше памяти.
 */
export interface Series {
  /** Минут в свече. */
  tf: number;
  n: number;
  /** Время открытия, мс. */
  t: Float64Array;
  o: Float64Array;
  h: Float64Array;
  l: Float64Array;
  c: Float64Array;
}

export interface CandleRow {
  time: Date | number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export function toSeries(tf: number, rows: CandleRow[]): Series {
  const n = rows.length;
  const s: Series = {
    tf,
    n,
    t: new Float64Array(n),
    o: new Float64Array(n),
    h: new Float64Array(n),
    l: new Float64Array(n),
    c: new Float64Array(n),
  };
  for (let i = 0; i < n; i++) {
    const r = rows[i];
    s.t[i] = typeof r.time === 'number' ? r.time : r.time.getTime();
    s.o[i] = r.open;
    s.h[i] = r.high;
    s.l[i] = r.low;
    s.c[i] = r.close;
  }
  return s;
}

/** Время закрытия свечи i — момент, когда о ней известно всё. */
export const closeMs = (s: Series, i: number): number =>
  s.t[i] + s.tf * 60_000;

/** Первый индекс, где arr[i] ≥ x (arr по возрастанию). */
export function lowerBound(arr: Float64Array, x: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** ATR по Уайлдеру; до набора периода — NaN. */
export function atr(s: Series, period = 14): Float64Array {
  const out = new Float64Array(s.n).fill(NaN);
  let sum = 0;
  let prev = NaN;
  for (let i = 0; i < s.n; i++) {
    const tr =
      i === 0
        ? s.h[i] - s.l[i]
        : Math.max(
            s.h[i] - s.l[i],
            Math.abs(s.h[i] - s.c[i - 1]),
            Math.abs(s.l[i] - s.c[i - 1]),
          );
    if (i < period) {
      sum += tr;
      if (i === period - 1) {
        prev = sum / period;
        out[i] = prev;
      }
    } else {
      prev = (prev * (period - 1) + tr) / period;
      out[i] = prev;
    }
  }
  return out;
}

/** Свинг — пятисвечный фрактал; known — свеча, на закрытии которой он подтверждён. */
export interface Swing {
  i: number;
  price: number;
  known: number;
}

/** Свинг-хай: хай строго выше двух свечей слева и двух справа (лоу — зеркально). */
export function swings(s: Series): { highs: Swing[]; lows: Swing[] } {
  const highs: Swing[] = [];
  const lows: Swing[] = [];
  for (let i = 2; i + 2 < s.n; i++) {
    const h = s.h[i];
    if (h > s.h[i - 1] && h > s.h[i - 2] && h > s.h[i + 1] && h > s.h[i + 2]) {
      highs.push({ i, price: h, known: i + 2 });
    }
    const l = s.l[i];
    if (l < s.l[i - 1] && l < s.l[i - 2] && l < s.l[i + 1] && l < s.l[i + 2]) {
      lows.push({ i, price: l, known: i + 2 });
    }
  }
  return { highs, lows };
}

/**
 * Тренд по свинг-структуре на закрытии каждой свечи: 1 — последний слом вверх
 * (закрытие выше последнего подтверждённого непробитого свинг-хая), −1 — вниз,
 * 0 — сломов ещё не было. «Сильный/слабый HL» автора не формализован.
 */
export function structure(
  s: Series,
  sw: { highs: Swing[]; lows: Swing[] } = swings(s),
): Int8Array {
  const out = new Int8Array(s.n);
  let trend = 0;
  let hi = NaN;
  let lo = NaN;
  let a = 0;
  let b = 0;
  for (let i = 0; i < s.n; i++) {
    while (a < sw.highs.length && sw.highs[a].known <= i) hi = sw.highs[a++].price;
    while (b < sw.lows.length && sw.lows[b].known <= i) lo = sw.lows[b++].price;
    if (!Number.isNaN(hi) && s.c[i] > hi) {
      trend = 1;
      hi = NaN;
    }
    if (!Number.isNaN(lo) && s.c[i] < lo) {
      trend = -1;
      lo = NaN;
    }
    out[i] = trend;
  }
  return out;
}

/** Значение старшего ряда на закрытии каждой свечи младшего: последняя старшая, закрытая не позже. */
export function alignToClose(
  s: Series,
  htf: Series,
  values: Int8Array,
): Int8Array {
  const out = new Int8Array(s.n);
  let j = -1;
  for (let i = 0; i < s.n; i++) {
    const at = closeMs(s, i);
    while (j + 1 < htf.n && closeMs(htf, j + 1) <= at) j++;
    out[i] = j >= 0 ? values[j] : 0;
  }
  return out;
}
```

- [ ] **Step 9: Run — PASS**

Run: `cd backend && npx jest src/strategy/stats.spec.ts src/strategy/series.spec.ts`

- [ ] **Step 10: Commit**

```bash
cd backend && npx prettier --write src/strategy && cd ..
git add backend/src/strategy
git commit -m "feat(strategy): типы отчёта, статистика и ряды свечей"
```

---

### Task 2: Пулы ликвидности, свипы, пробои, подтверждение

**Files:**
- Create: `backend/src/strategy/events.ts`
- Test: `backend/src/strategy/events.spec.ts`

**Interfaces:**
- Consumes: `Series`, `Swing`, `atr`, `swings` из `series.ts`; фикстуры.
- Produces: `Sweep {i, dir, level, extreme, pierceAtr, ref}`, `Break {i, dir, level, depthAtr}`, `Scan {sweeps, breaks, nearHigh, nearLow}`, `scanLevels(s, a, sw) → Scan`, `fvgAt(s, k, dir)`, `WINDOW = 10`, `Confirm {fvg, bos}`, `confirmAfter(s, sw, window?) → Confirm`.

- [ ] **Step 1: Write the failing tests `events.spec.ts`**

```ts
import { bars, mirror, SCENARIO, walk } from './fixtures';
import { atr, swings, toSeries } from './series';
import { confirmAfter, fvgAt, scanLevels } from './events';

const scan = (s: ReturnType<typeof bars>) => scanLevels(s, atr(s), swings(s));

describe('events', () => {
  it('свип лоу 97 на свече 25 со ссылкой на внутренний хай 102', () => {
    const s = bars(SCENARIO);
    const r = scan(s);
    expect(r.sweeps).toHaveLength(1);
    const sw = r.sweeps[0];
    expect(sw).toMatchObject({ i: 25, dir: 1, level: 97, extreme: 96, ref: 102 });
    expect(sw.pierceAtr).toBeCloseTo(1 / atr(s)[25]);
  });

  it('пробой хая 102 закрытием на свече 28 с глубиной в ATR', () => {
    const s = bars(SCENARIO);
    const br = scan(s).breaks.find((b) => b.i === 28);
    expect(br).toMatchObject({ dir: 1, level: 102 });
    expect(br.depthAtr).toBeCloseTo(0.8 / atr(s)[28]);
  });

  it('закрытие за уровнем — пробой, а не свип', () => {
    const rows = SCENARIO.slice(0, 25);
    rows.push([98.6, 98.8, 96, 96.5]);
    const r = scan(bars(rows));
    expect(r.sweeps).toHaveLength(0);
    expect(r.breaks[0]).toMatchObject({ i: 25, dir: -1, level: 97 });
  });

  it('ближайшие нетронутые уровни после свечи', () => {
    const r = scan(bars(SCENARIO));
    expect(r.nearHigh[27]).toBe(102);
    expect(r.nearHigh[28]).toBe(106);
    expect(r.nearLow[24]).toBe(97);
    expect(Number.isNaN(r.nearLow[25])).toBe(true); // 97 снят, 96 ещё не подтверждён
    expect(r.nearLow[28]).toBe(96);
  });

  it('зеркальный ряд даёт зеркальный свип', () => {
    const r = scan(mirror(bars(SCENARIO)));
    expect(r.sweeps[0]).toMatchObject({ i: 25, dir: -1, level: -97, extreme: -96, ref: -102 });
  });

  it('события не перерисовываются', () => {
    const s = walk(800, 5);
    const full = scan(s);
    const k = 500;
    const p = toSeries(
      15,
      Array.from({ length: k }, (_, i) => ({
        time: s.t[i],
        open: s.o[i],
        high: s.h[i],
        low: s.l[i],
        close: s.c[i],
      })),
    );
    const part = scan(p);
    expect(part.sweeps).toEqual(full.sweeps.filter((x) => x.i < k));
    expect(part.breaks).toEqual(full.breaks.filter((x) => x.i < k));
    expect(Array.from(part.nearHigh)).toEqual(Array.from(full.nearHigh.slice(0, k)));
  });

  it('fvgAt и confirmAfter', () => {
    const s = bars(SCENARIO);
    expect(fvgAt(s, 27, 1)).toBe(true);
    expect(fvgAt(s, 26, 1)).toBe(false);
    const sw = scan(s).sweeps[0];
    expect(confirmAfter(s, sw)).toEqual({ fvg: 27, bos: 28 });
  });

  it('новый экстремум за свипом обрывает поиск подтверждения', () => {
    const rows = SCENARIO.slice(0, 27);
    rows.push([98, 98.5, 95.5, 98]); // 27: лоу ниже 96
    rows.push([98, 103, 98, 102.8]); // 28: слом уже не считается
    const s = bars(rows);
    expect(confirmAfter(s, scan(s).sweeps[0])).toEqual({ fvg: -1, bos: -1 });
  });
});
```

- [ ] **Step 2: Run — FAIL**

Run: `cd backend && npx jest src/strategy/events.spec.ts`

- [ ] **Step 3: Write `events.ts`**

```ts
import type { Dir } from './report.types';
import type { Series, Swing } from './series';

export interface Sweep {
  i: number;
  /** Куда ждём разворот: 1 — сняты лоу (ждём рост), −1 — сняты хаи. */
  dir: Dir;
  /** Снятый уровень — самый дальний из проколотых. */
  level: number;
  /** Экстремум свечи свипа: лоу для dir 1, хай для −1. */
  extreme: number;
  /** Насколько тень ушла за уровень, в ATR свечи свипа. */
  pierceAtr: number;
  /**
   * Последний подтверждённый свинг по другую сторону: хай для dir 1 (закрытие
   * выше него — слом структуры), лоу для −1. NaN — свингов ещё не было.
   */
  ref: number;
}

export interface Break {
  i: number;
  /** Направление пробоя: −1 — закрылись под лоу, 1 — над хаем. */
  dir: Dir;
  level: number;
  depthAtr: number;
}

export interface Scan {
  sweeps: Sweep[];
  breaks: Break[];
  /** После свечи i — ближайший нетронутый свинг-хай выше цены (NaN — нет). */
  nearHigh: Float64Array;
  /** После свечи i — ближайший нетронутый свинг-лоу ниже цены (NaN — нет). */
  nearLow: Float64Array;
}

/** Окно «сразу после свипа», свечей. */
export const WINDOW = 10;

function insertSorted(arr: number[], x: number, desc: boolean): void {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (desc ? arr[mid] > x : arr[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  arr.splice(lo, 0, x);
}

/**
 * Один проход по ряду: пулы ликвидности (подтверждённые свинги, ещё не снятые
 * ценой), их свипы и пробои. Лоу хранятся по возрастанию, хаи — по убыванию:
 * снимаемые уровни всегда в конце массива, и проход линейный.
 */
export function scanLevels(
  s: Series,
  a: Float64Array,
  sw: { highs: Swing[]; lows: Swing[] },
): Scan {
  const lows: number[] = [];
  const highs: number[] = [];
  const sweeps: Sweep[] = [];
  const breaks: Break[] = [];
  const nearHigh = new Float64Array(s.n).fill(NaN);
  const nearLow = new Float64Array(s.n).fill(NaN);
  let ha = 0;
  let lb = 0;
  let lastHigh = NaN;
  let lastLow = NaN;

  for (let i = 0; i < s.n; i++) {
    const takenLows: number[] = [];
    while (lows.length && lows[lows.length - 1] > s.l[i]) takenLows.push(lows.pop());
    const takenHighs: number[] = [];
    while (highs.length && highs[highs.length - 1] < s.h[i]) takenHighs.push(highs.pop());
    const ai = a[i];
    const measurable = Number.isFinite(ai) && ai > 0;

    if (takenLows.length && measurable) {
      const nearest = takenLows[0];
      const deepest = takenLows[takenLows.length - 1];
      if (s.c[i] > nearest) {
        sweeps.push({
          i,
          dir: 1,
          level: deepest,
          extreme: s.l[i],
          pierceAtr: (deepest - s.l[i]) / ai,
          ref: lastHigh,
        });
      } else {
        breaks.push({ i, dir: -1, level: nearest, depthAtr: (nearest - s.c[i]) / ai });
      }
    }
    if (takenHighs.length && measurable) {
      const nearest = takenHighs[0];
      const deepest = takenHighs[takenHighs.length - 1];
      if (s.c[i] < nearest) {
        sweeps.push({
          i,
          dir: -1,
          level: deepest,
          extreme: s.h[i],
          pierceAtr: (s.h[i] - deepest) / ai,
          ref: lastLow,
        });
      } else {
        breaks.push({ i, dir: 1, level: nearest, depthAtr: (s.c[i] - nearest) / ai });
      }
    }

    // Свинги, подтверждённые этой свечой, становятся пулами со следующей.
    while (ha < sw.highs.length && sw.highs[ha].known <= i) {
      lastHigh = sw.highs[ha++].price;
      insertSorted(highs, lastHigh, true);
    }
    while (lb < sw.lows.length && sw.lows[lb].known <= i) {
      lastLow = sw.lows[lb++].price;
      insertSorted(lows, lastLow, false);
    }
    nearHigh[i] = highs.length ? highs[highs.length - 1] : NaN;
    nearLow[i] = lows.length ? lows[lows.length - 1] : NaN;
  }
  return { sweeps, breaks, nearHigh, nearLow };
}

/** Имбаланс на свече k (свечи k−2, k−1, k): бычий — лоу k выше хая k−2. */
export const fvgAt = (s: Series, k: number, dir: Dir): boolean =>
  k >= 2 && (dir === 1 ? s.l[k] > s.h[k - 2] : s.h[k] < s.l[k - 2]);

export interface Confirm {
  /** Свеча, на которой сложился имбаланс; −1 — не было. */
  fvg: number;
  /** Свеча, закрывшаяся за `ref`; −1 — не было. */
  bos: number;
}

/**
 * Имбаланс и слом структуры в окне после свипа. Первая свеча имбаланса — не
 * раньше свипа. Новый экстремум за свипом ломает сетап: поиск на нём обрывается.
 */
export function confirmAfter(s: Series, sw: Sweep, window = WINDOW): Confirm {
  let fvg = -1;
  let bos = -1;
  const end = Math.min(s.n - 1, sw.i + window);
  for (let k = sw.i + 1; k <= end; k++) {
    if (sw.dir === 1 ? s.l[k] < sw.extreme : s.h[k] > sw.extreme) break;
    if (fvg < 0 && k - 2 >= sw.i && fvgAt(s, k, sw.dir)) fvg = k;
    if (
      bos < 0 &&
      Number.isFinite(sw.ref) &&
      (sw.dir === 1 ? s.c[k] > sw.ref : s.c[k] < sw.ref)
    ) {
      bos = k;
    }
  }
  return { fvg, bos };
}
```

- [ ] **Step 4: Run — PASS**

Run: `cd backend && npx jest src/strategy/events.spec.ts`

- [ ] **Step 5: Commit**

```bash
cd backend && npx prettier --write src/strategy && cd ..
git add backend/src/strategy
git commit -m "feat(strategy): пулы ликвидности, свипы, пробои и подтверждение"
```

---

### Task 3: Сетапы, варианты, признаки

**Files:**
- Create: `backend/src/strategy/setups.ts`
- Test: `backend/src/strategy/setups.spec.ts`

**Interfaces:**
- Consumes: `Series`, `closeMs`, `lowerBound`; `Scan`, `confirmAfter`; типы `Dir, FeatureKey, Features`.
- Produces: `FEATURE_KEYS: FeatureKey[]`, `Variant {id, label, tf, fvg, bos, context, entry, target}`, `MAIN`, `VARIANTS`, `Setup {id, dir, sweepI, fvgI, bosI, e, obI, level, entry, stop, target, plannedR, features}`, `SetupContext {htf, daily, atr, scan}`, `findSetups(s, ctx, v) → Setup[]`, `sessionOf(ms)`.

- [ ] **Step 1: Write the failing tests `setups.spec.ts`**

```ts
import { bars, mirror, SCENARIO } from './fixtures';
import { atr, swings } from './series';
import { scanLevels } from './events';
import { findSetups, MAIN, SetupContext, VARIANTS } from './setups';

const ctxOf = (s: ReturnType<typeof bars>, htf: number): SetupContext => {
  const a = atr(s);
  return {
    atr: a,
    scan: scanLevels(s, a, swings(s)),
    htf: new Int8Array(s.n).fill(htf),
    daily: new Int8Array(s.n),
  };
};
const variant = (id: string) => VARIANTS.find((v) => v.id === id);

describe('setups', () => {
  it('основной вариант собирает A+ сетап сценария', () => {
    const s = bars(SCENARIO);
    const [st] = findSetups(s, ctxOf(s, 1), MAIN);
    expect(st).toMatchObject({
      dir: 1,
      sweepI: 25,
      fvgI: 27,
      bosI: 28,
      e: 28,
      obI: 25,
      level: 97,
      entry: 98.6,
      stop: 96,
      target: 106,
    });
    expect(st.plannedR).toBeCloseTo(7.4 / 2.6);
  });

  it('контекст против — сетапа нет; без контекста — есть', () => {
    const s = bars(SCENARIO);
    expect(findSetups(s, ctxOf(s, -1), MAIN)).toHaveLength(0);
    expect(findSetups(s, ctxOf(s, -1), variant('no-context'))).toHaveLength(1);
  });

  it('вход от 50 % блока и фиксированная цель', () => {
    const s = bars(SCENARIO);
    const [mid] = findSetups(s, ctxOf(s, 1), variant('mid'));
    expect(mid.entry).toBeCloseTo(97.3);
    const [r2] = findSetups(s, ctxOf(s, 1), variant('r2'));
    expect(r2.target).toBeCloseTo(98.6 + 2 * 2.6);
    expect(r2.plannedR).toBeCloseTo(2);
  });

  it('цена уже в блоке на подтверждении — сетап пропускается', () => {
    const s = bars(SCENARIO);
    // «Только свип»: подтверждение — сама свеча свипа, она закрылась ниже входа 98,6.
    expect(findSetups(s, ctxOf(s, 1), variant('sweep'))).toHaveLength(0);
  });

  it('плановый R < 1 — сетап пропускается', () => {
    const s = bars(SCENARIO);
    const ctx = ctxOf(s, 1);
    ctx.scan.nearHigh[28] = 100; // ближайшая ликвидность сверху — в 0,54R от входа
    expect(findSetups(s, ctx, MAIN)).toHaveLength(0);
  });

  it('шорт — зеркало лонга', () => {
    const s = mirror(bars(SCENARIO));
    const [st] = findSetups(s, ctxOf(s, -1), MAIN);
    expect(st).toMatchObject({ dir: -1, entry: -98.6, stop: -96, target: -106 });
  });

  it('признаки сетапа', () => {
    const s = bars(SCENARIO);
    const [st] = findSetups(s, ctxOf(s, 1), MAIN);
    // Закрытие свечи 28 — 07:15 UTC четверга 1 января 1970.
    expect(st.features.session).toBe('asia');
    expect(st.features.weekend).toBe('no');
    expect(st.features.daily).toBe('with');
    expect(st.features.plannedR).toBe('2-3');
    expect(Object.keys(st.features).sort()).toEqual(
      ['daily', 'deep', 'pierce', 'plannedR', 'session', 'stopAtr', 'vol', 'weekend'],
    );
  });
});
```

- [ ] **Step 2: Run — FAIL**

Run: `cd backend && npx jest src/strategy/setups.spec.ts`

- [ ] **Step 3: Write `setups.ts`**

```ts
import type { Dir, FeatureKey, Features } from './report.types';
import { closeMs, lowerBound, Series } from './series';
import { confirmAfter, Scan } from './events';

export const FEATURE_KEYS: FeatureKey[] = [
  'session',
  'weekend',
  'daily',
  'vol',
  'stopAtr',
  'plannedR',
  'pierce',
  'deep',
];

export interface Variant {
  id: string;
  label: string;
  /** ТФ сетапа, минут. */
  tf: 15 | 60;
  fvg: boolean;
  bos: boolean;
  context: boolean;
  entry: 'top' | 'mid';
  /** 'liquidity' — ближайший нетронутый свинг; число — фиксированная цель в R. */
  target: 'liquidity' | 2 | 3;
}

export const MAIN: Variant = {
  id: 'main',
  label: 'Основной',
  tf: 15,
  fvg: true,
  bos: true,
  context: true,
  entry: 'top',
  target: 'liquidity',
};

/** Варианты отчёта: каждый отличается от основного одним правилом. */
export const VARIANTS: Variant[] = [
  MAIN,
  { ...MAIN, id: 'sweep', label: 'Только свип', fvg: false, bos: false },
  { ...MAIN, id: 'sweep-fvg', label: 'Свип + FVG', bos: false },
  { ...MAIN, id: 'sweep-bos', label: 'Свип + BOS', fvg: false },
  { ...MAIN, id: 'no-context', label: 'Без контекста 4H', context: false },
  { ...MAIN, id: 'mid', label: 'Вход от 50 % блока', entry: 'mid' },
  { ...MAIN, id: 'r2', label: 'Цель 2R', target: 2 },
  { ...MAIN, id: 'r3', label: 'Цель 3R', target: 3 },
  { ...MAIN, id: 'h1', label: 'ТФ сетапа 1H', tf: 60 },
];

export interface Setup {
  /** `${вариант}:${свеча свипа}` — уникален внутри варианта. */
  id: string;
  dir: Dir;
  sweepI: number;
  /** −1 — вариант условия не требует. */
  fvgI: number;
  bosI: number;
  /** Свеча подтверждения: на её закрытии выставляется лимит. */
  e: number;
  obI: number;
  level: number;
  entry: number;
  stop: number;
  target: number;
  plannedR: number;
  features: Features;
}

/** Всё, что сетапу нужно знать на закрытии каждой свечи своего ряда. */
export interface SetupContext {
  /** Тренд старшего ТФ (4H для 15m, 1D для 1H): 1, −1, 0. */
  htf: Int8Array;
  /** Дневная структура — признак обучения, не фильтр. */
  daily: Int8Array;
  atr: Float64Array;
  scan: Scan;
}

const OB_LOOKBACK = 5;
const VOL_WINDOW_MS = 90 * 86_400_000;

export function sessionOf(ms: number): string {
  const h = new Date(ms).getUTCHours();
  return h < 8 ? 'asia' : h < 14 ? 'london' : h < 21 ? 'ny' : 'night';
}

/** Доля значений ATR/цена за 90 дней до свечи, которые ниже текущего. */
function volatilityRanker(s: Series, a: Float64Array): (e: number) => number {
  const memo = new Map<number, number>();
  return (e) => {
    const hit = memo.get(e);
    if (hit !== undefined) return hit;
    const cur = a[e] / s.c[e];
    const from = lowerBound(s.t, s.t[e] - VOL_WINDOW_MS);
    let below = 0;
    let cnt = 0;
    for (let k = from; k < e; k++) {
      const v = a[k] / s.c[k];
      if (!Number.isFinite(v)) continue;
      cnt++;
      if (v < cur) below++;
    }
    const rank = cnt ? below / cnt : 0.5;
    memo.set(e, rank);
    return rank;
  };
}

interface FeatureInput {
  at: number;
  dir: Dir;
  daily: number;
  volRank: number;
  stopAtr: number;
  plannedR: number;
  pierce: number;
  deep: number;
}

function featuresOf(x: FeatureInput): Features {
  const day = new Date(x.at).getUTCDay();
  return {
    session: sessionOf(x.at),
    weekend: day === 0 || day === 6 ? 'yes' : 'no',
    daily: x.daily === -x.dir ? 'against' : 'with',
    vol: x.volRank < 1 / 3 ? 'low' : x.volRank < 2 / 3 ? 'mid' : 'high',
    stopAtr: x.stopAtr < 0.5 ? '<0.5' : x.stopAtr <= 1.5 ? '0.5-1.5' : '>1.5',
    plannedR: x.plannedR < 2 ? '1-2' : x.plannedR <= 3 ? '2-3' : '>3',
    pierce: x.pierce < 0.25 ? '<0.25' : '>=0.25',
    deep: x.deep < 0.25 ? 'yes' : 'no',
  };
}

/**
 * Сетапы варианта: свип → (FVG, BOS в окне) → контекст → ордерблок → вход,
 * стоп, цель. Всё решается на закрытии свечи подтверждения `e`.
 */
export function findSetups(s: Series, ctx: SetupContext, v: Variant): Setup[] {
  const out: Setup[] = [];
  const volRank = volatilityRanker(s, ctx.atr);
  for (const sw of ctx.scan.sweeps) {
    const d = sw.dir;
    const conf = confirmAfter(s, sw);
    let e = sw.i;
    if (v.fvg) {
      if (conf.fvg < 0) continue;
      e = Math.max(e, conf.fvg);
    }
    if (v.bos) {
      if (conf.bos < 0) continue;
      e = Math.max(e, conf.bos);
    }
    if (v.context && ctx.htf[e] !== d) continue;

    // Самая дальняя точка движения [свип, e] — от неё ищется ордерблок.
    let low = sw.i;
    for (let k = sw.i; k <= e; k++) {
      if (d === 1 ? s.l[k] < s.l[low] : s.h[k] > s.h[low]) low = k;
    }
    let obI = -1;
    for (let k = low; k >= Math.max(0, low - OB_LOOKBACK); k--) {
      if (d === 1 ? s.c[k] < s.o[k] : s.c[k] > s.o[k]) {
        obI = k;
        break;
      }
    }
    if (obI < 0) obI = sw.i;
    const top =
      d === 1 ? Math.max(s.o[obI], s.c[obI]) : Math.min(s.o[obI], s.c[obI]);
    let bottom = d === 1 ? Infinity : -Infinity;
    for (let k = obI; k <= e; k++) {
      bottom = d === 1 ? Math.min(bottom, s.l[k]) : Math.max(bottom, s.h[k]);
    }

    const entry = v.entry === 'top' ? top : (top + bottom) / 2;
    const stop = bottom;
    const risk = d * (entry - stop);
    if (!(risk > 0)) continue;
    if (d * (s.c[e] - entry) <= 0) continue; // цена уже в блоке

    let target: number;
    if (v.target === 'liquidity') {
      target = d === 1 ? ctx.scan.nearHigh[e] : ctx.scan.nearLow[e];
      if (!Number.isFinite(target)) continue;
    } else {
      target = entry + d * v.target * risk;
    }
    const plannedR = (d * (target - entry)) / risk;
    if (v.target === 'liquidity' && plannedR < 1) continue; // вход не в дискаунте

    out.push({
      id: `${v.id}:${sw.i}`,
      dir: d,
      sweepI: sw.i,
      fvgI: v.fvg ? conf.fvg : -1,
      bosI: v.bos ? conf.bos : -1,
      e,
      obI,
      level: sw.level,
      entry,
      stop,
      target,
      plannedR,
      features: featuresOf({
        at: closeMs(s, e),
        dir: d,
        daily: ctx.daily[e],
        volRank: volRank(e),
        stopAtr: risk / ctx.atr[e],
        plannedR,
        pierce: sw.pierceAtr,
        deep: (d * (entry - stop)) / (d * (target - stop)),
      }),
    });
  }
  return out;
}
```

- [ ] **Step 4: Run — PASS**

Run: `cd backend && npx jest src/strategy/setups.spec.ts`

- [ ] **Step 5: Commit**

```bash
cd backend && npx prettier --write src/strategy && cd ..
git add backend/src/strategy
git commit -m "feat(strategy): сборка сетапа, варианты отчёта и признаки"
```

---

### Task 4: Исполнение сделки

**Files:**
- Create: `backend/src/strategy/simulate.ts`
- Test: `backend/src/strategy/simulate.spec.ts`

**Interfaces:**
- Consumes: `Series`, `closeMs`; `Setup`; `Outcome`.
- Produces: `Bar {t0, t1, o, h, l, c}`, `Minutes`, `Fees`, `FEES`, `LIMIT_LIFE = 48`, `MAX_HOLD_MS`, `minuteKey(from, to)`, `Filled {status:'filled', fillMs, fill, exitMs, exit, outcome, rGross, rNet}`, `Final`, `Result`, `simulate(s, setup, minutes, fees?) → Result`, `FetchMinutes`, `Resolved {setup, result}`, `simulateAll(s, setups, fetch, cache, fees?) → Promise<Resolved[]>`.

- [ ] **Step 1: Write the failing tests `simulate.spec.ts`**

```ts
import { bars, mirror, Ohlc } from './fixtures';
import type { Setup } from './setups';
import type { Features } from './report.types';
import { Bar, FEES, minuteKey, simulate, simulateAll } from './simulate';

const M = 60_000;
const STEP = 15 * M;
const setup = (over: Partial<Setup> = {}): Setup => ({
  id: 't',
  dir: 1,
  sweepI: 0,
  fvgI: -1,
  bosI: -1,
  e: 0,
  obI: 0,
  level: 0,
  entry: 100,
  stop: 98,
  target: 104,
  plannedR: 2,
  features: {} as Features,
  ...over,
});
const E: Ohlc = [101, 101.5, 100.5, 101];
const none = () => null;

describe('simulate', () => {
  it('исполнился и дошёл до цели', () => {
    const s = bars([E, [101, 101.2, 99.8, 100.2], [100.2, 104.5, 100, 104]]);
    const r = simulate(s, setup(), none);
    expect(r).toMatchObject({ status: 'filled', outcome: 'target', fill: 100, exit: 104, fillMs: STEP, exitMs: 3 * STEP });
    if (r.status !== 'filled') throw new Error();
    expect(r.rGross).toBeCloseTo(2);
    expect(r.rNet).toBeCloseTo(2 - (FEES.maker * 100 + FEES.maker * 104) / 2);
  });

  it('цель раньше входа — пропущен', () => {
    const s = bars([E, [101, 104.2, 100.5, 104]]);
    expect(simulate(s, setup(), none).status).toBe('missed');
  });

  it('лимит живёт 48 свечей', () => {
    const s = bars([E, ...Array<Ohlc>(60).fill(E)]);
    expect(simulate(s, setup(), none).status).toBe('expired');
  });

  it('стоп: −1R и тейкерская комиссия на выходе', () => {
    const s = bars([E, [101, 101, 99.5, 100], [100, 100.5, 97.5, 98]]);
    const r = simulate(s, setup(), none);
    if (r.status !== 'filled') throw new Error(r.status);
    expect(r.outcome).toBe('stop');
    expect(r.rGross).toBeCloseTo(-1);
    expect(r.rNet).toBeCloseTo(-1 - (FEES.maker * 100 + FEES.taker * 98) / 2);
  });

  it('стоп и цель в одной свече — просит минутки, разбирает по ним', () => {
    const s = bars([E, [101, 101, 99.5, 100], [100, 104.5, 97.5, 101]]);
    expect(simulate(s, setup(), none)).toEqual({ status: 'needs', from: 2 * STEP, to: 3 * STEP });
    const mins: Bar[] = [
      { t0: 2 * STEP, t1: 2 * STEP + M, o: 100, h: 104.2, l: 99.9, c: 104 },
      { t0: 2 * STEP + M, t1: 2 * STEP + 2 * M, o: 104, h: 104, l: 97.5, c: 98 },
    ];
    expect(simulate(s, setup(), () => mins)).toMatchObject({ outcome: 'target', exit: 104 });
    expect(simulate(s, setup(), () => [])).toMatchObject({ outcome: 'stop' });
  });

  it('вход и цель в одной свече — минутки решают порядок', () => {
    const s = bars([E, [101, 104.5, 99.5, 104]]);
    const mins: Bar[] = [
      { t0: STEP, t1: STEP + M, o: 101, h: 101, l: 99.8, c: 100 },
      { t0: STEP + M, t1: STEP + 2 * M, o: 100, h: 104.5, l: 100, c: 104 },
    ];
    expect(simulate(s, setup(), () => mins)).toMatchObject({ outcome: 'target', fillMs: STEP });
  });

  it('выход по сроку через 3 суток — по закрытию свечи', () => {
    const hold: Ohlc = [100.5, 101, 99.5, 100.5];
    const s = bars([E, [101, 101, 99.8, 100.5], ...Array<Ohlc>(300).fill(hold)]);
    const r = simulate(s, setup(), none);
    expect(r).toMatchObject({ outcome: 'time', exit: 100.5 });
    if (r.status !== 'filled') throw new Error();
    expect(r.exitMs - r.fillMs).toBeGreaterThanOrEqual(3 * 86_400_000);
    expect(r.rGross).toBeCloseTo(0.25);
  });

  it('шорт — зеркало лонга', () => {
    const s = mirror(bars([E, [101, 101.2, 99.8, 100.2], [100.2, 104.5, 100, 104]]));
    const r = simulate(s, setup({ dir: -1, entry: -100, stop: -98, target: -104 }), none);
    expect(r).toMatchObject({ outcome: 'target', fill: -100, exit: -104 });
    if (r.status !== 'filled') throw new Error();
    expect(r.rGross).toBeCloseTo(2);
  });

  it('simulateAll подгружает минутки пачкой и доразбирает', async () => {
    const s = bars([E, [101, 101, 99.5, 100], [100, 104.5, 97.5, 101]]);
    const mins: Bar[] = [{ t0: 2 * STEP, t1: 2 * STEP + M, o: 100, h: 104.2, l: 99.9, c: 104 }];
    const fetch = jest.fn(async (ranges: [number, number][]) => new Map(ranges.map(([f, t]) => [minuteKey(f, t), mins])));
    const [res] = await simulateAll(s, [setup()], fetch, new Map());
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(res.result).toMatchObject({ status: 'filled', outcome: 'target' });
  });

  it('simulateAll без минуток — консервативно стоп', async () => {
    const s = bars([E, [101, 101, 99.5, 100], [100, 104.5, 97.5, 101]]);
    const [res] = await simulateAll(s, [setup()], async () => new Map(), new Map());
    expect(res.result).toMatchObject({ outcome: 'stop' });
  });
});
```

- [ ] **Step 2: Run — FAIL**

Run: `cd backend && npx jest src/strategy/simulate.spec.ts`

- [ ] **Step 3: Write `simulate.ts`**

```ts
import type { Dir, Outcome } from './report.types';
import { closeMs, Series } from './series';
import type { Setup } from './setups';

export interface Bar {
  t0: number;
  t1: number;
  o: number;
  h: number;
  l: number;
  c: number;
}

/** Минутки свечи [from, to); null — ещё не загружены. */
export type Minutes = (from: number, to: number) => Bar[] | null;

export interface Fees {
  maker: number;
  taker: number;
}

/** Bybit, бессрочные USDT: лимит — мейкер, стоп и рынок — тейкер. */
export const FEES: Fees = { maker: 0.0002, taker: 0.00055 };
/** Сколько свечей живёт лимит на вход. */
export const LIMIT_LIFE = 48;
/** Автор торгует внутри дня и срок не называет — выход по закрытию через 3 суток. */
export const MAX_HOLD_MS = 3 * 86_400_000;

export const minuteKey = (from: number, to: number): string => `${from}-${to}`;

export interface Filled {
  status: 'filled';
  fillMs: number;
  fill: number;
  exitMs: number;
  exit: number;
  outcome: Outcome;
  rGross: number;
  rNet: number;
}

/** missed — цель раньше входа; expired — лимит истёк; open — данные кончились посреди сделки. */
export type Final = Filled | { status: 'missed' | 'expired' | 'open' };
export type Result = Final | { status: 'needs'; from: number; to: number };

interface State {
  open: boolean;
  fillMs: number;
  fill: number;
}
interface Exit {
  price: number;
  ms: number;
  outcome: Outcome;
}
type Step = 'continue' | 'missed' | 'ambiguous' | Exit;

/** Свеча в «лонговых» координатах: шорт — те же правила на перевёрнутых ценах. */
const asLong = (b: Bar, d: Dir): Bar =>
  d === 1 ? b : { t0: b.t0, t1: b.t1, o: -b.o, h: -b.l, l: -b.h, c: -b.c };

/**
 * Одна свеча для лонга. На минутке спорный порядок решается худшим исходом:
 * вход и цель — сделки не было (а со стопом — убыток), стоп и цель — стоп.
 */
function step(
  st: State,
  b: Bar,
  entry: number,
  stop: number,
  target: number,
  minute: boolean,
): Step {
  if (!st.open) {
    const te = b.l <= entry;
    const tt = b.h >= target;
    const ts = b.l <= stop;
    if (!te) return tt ? 'missed' : 'continue';
    if (tt) {
      if (!minute) return 'ambiguous';
      if (!ts) return 'missed';
    }
    st.open = true;
    st.fill = Math.min(entry, b.o);
    st.fillMs = b.t0;
    if (ts) return { price: Math.min(stop, st.fill), ms: b.t1, outcome: 'stop' };
    return 'continue';
  }
  const ts = b.l <= stop;
  const tt = b.h >= target;
  if (ts && tt && !minute) return 'ambiguous';
  if (ts) return { price: Math.min(stop, b.o), ms: b.t1, outcome: 'stop' };
  if (tt) return { price: Math.max(target, b.o), ms: b.t1, outcome: 'target' };
  if (b.t1 >= st.fillMs + MAX_HOLD_MS) return { price: b.c, ms: b.t1, outcome: 'time' };
  return 'continue';
}

function done(st: State, x: Exit, d: Dir, risk: number, fees: Fees): Filled {
  const rGross = (x.price - st.fill) / risk;
  const fee =
    fees.maker * Math.abs(st.fill) +
    (x.outcome === 'target' ? fees.maker : fees.taker) * Math.abs(x.price);
  return {
    status: 'filled',
    fillMs: st.fillMs,
    fill: d * st.fill,
    exitMs: x.ms,
    exit: d * x.price,
    outcome: x.outcome,
    rGross,
    rNet: rGross - fee / risk,
  };
}

/** Лимит с закрытия свечи `e`, дальше стоп, цель или срок. R — от планового риска. */
export function simulate(
  s: Series,
  st: Setup,
  minutes: Minutes,
  fees: Fees = FEES,
): Result {
  const d = st.dir;
  const entry = d * st.entry;
  const stop = d * st.stop;
  const target = d * st.target;
  const state: State = { open: false, fillMs: 0, fill: 0 };
  for (let k = st.e + 1; k < s.n; k++) {
    if (!state.open && k > st.e + LIMIT_LIFE) return { status: 'expired' };
    const bar = asLong(
      { t0: s.t[k], t1: closeMs(s, k), o: s.o[k], h: s.h[k], l: s.l[k], c: s.c[k] },
      d,
    );
    let r = step(state, bar, entry, stop, target, false);
    if (r === 'ambiguous') {
      const mins = minutes(bar.t0, bar.t1);
      if (mins === null) return { status: 'needs', from: bar.t0, to: bar.t1 };
      r = 'continue';
      for (const m of mins) {
        r = step(state, asLong(m, d), entry, stop, target, true);
        if (r !== 'continue') break;
      }
      // Минуток нет (дыра в истории) — свеча целиком как одна минутка.
      if (mins.length === 0) r = step(state, bar, entry, stop, target, true);
    }
    if (r === 'missed') return { status: 'missed' };
    if (typeof r === 'object') return done(state, r, d, entry - stop, fees);
  }
  return { status: state.open ? 'open' : 'expired' };
}

export type FetchMinutes = (
  ranges: [number, number][],
) => Promise<Map<string, Bar[]>>;

export interface Resolved {
  setup: Setup;
  result: Final;
}

const ROUNDS = 5;

/**
 * Прогон всех сетапов. Спорные свечи просят минутки; их подгружают пачкой между
 * проходами, и сделки, которым они были нужны, считаются заново. После
 * `ROUNDS` проходов недостающие минутки считаются пустыми — худший исход.
 */
export async function simulateAll(
  s: Series,
  setups: Setup[],
  fetch: FetchMinutes,
  cache: Map<string, Bar[]>,
  fees: Fees = FEES,
): Promise<Resolved[]> {
  const out = new Map<string, Final>();
  let todo = setups;
  for (let round = 0; todo.length; round++) {
    const last = round >= ROUNDS;
    const lookup: Minutes = (from, to) =>
      cache.get(minuteKey(from, to)) ?? (last ? [] : null);
    const need = new Map<string, [number, number]>();
    const next: Setup[] = [];
    for (const st of todo) {
      const r = simulate(s, st, lookup, fees);
      if (r.status === 'needs') {
        need.set(minuteKey(r.from, r.to), [r.from, r.to]);
        next.push(st);
      } else {
        out.set(st.id, r);
      }
    }
    if (need.size) {
      for (const [k, v] of await fetch([...need.values()])) cache.set(k, v);
    }
    todo = next;
  }
  return setups.map((setup) => ({ setup, result: out.get(setup.id) }));
}
```

- [ ] **Step 4: Run — PASS**

Run: `cd backend && npx jest src/strategy/simulate.spec.ts`

- [ ] **Step 5: Commit**

```bash
cd backend && npx prettier --write src/strategy && cd ..
git add backend/src/strategy
git commit -m "feat(strategy): исполнение сделки с разбором спорных свечей минутками"
```

---

### Task 5: Проверка цифр автора

**Files:**
- Create: `backend/src/strategy/author-check.ts`
- Test: `backend/src/strategy/author-check.spec.ts`

**Interfaces:**
- Consumes: `Series`; `Scan`, `confirmAfter`; `wilson`; типы `AuthorRow, Dir, Share`.
- Produces: `HORIZON = 24`, `barrier(s, a, i, horizon?) → -1|0|1`, `baseUp(s, a) → number`, `shareOf(items, s, a, pUp) → Share`, `authorCheck(s, a, scan) → AuthorRow[]`.

- [ ] **Step 1: Write the failing tests `author-check.spec.ts`**

```ts
import { bars, flat, Ohlc, walk } from './fixtures';
import { atr, swings } from './series';
import { scanLevels } from './events';
import { authorCheck, barrier, shareOf } from './author-check';

describe('author-check', () => {
  const base = flat(14); // ATR = 2
  it('barrier — какая граница ±1 ATR первая', () => {
    const up = bars([...base, [100, 102.5, 99.5, 102]]);
    expect(barrier(up, atr(up), 13)).toBe(1);
    const dn = bars([...base, [100, 100.5, 97.5, 98]]);
    expect(barrier(dn, atr(dn), 13)).toBe(-1);
    const both = bars([...base, [100, 102.5, 97.5, 100]]);
    expect(barrier(both, atr(both), 13)).toBe(0);
    const none = bars([...base, ...Array<Ohlc>(30).fill([100, 101, 99, 100])]);
    expect(barrier(none, atr(none), 13)).toBe(0);
  });

  it('shareOf — доля, интервал, база и нерешённые', () => {
    const s = bars([...base, [100, 102.5, 99.5, 102]]);
    const a = atr(s);
    const sh = shareOf(
      [
        { i: 13, dir: 1 },
        { i: 13, dir: -1 },
        { i: 14, dir: 1 },
      ],
      s,
      a,
      0.6,
    );
    expect(sh.n).toBe(2);
    expect(sh.share).toBeCloseTo(0.5);
    expect(sh.base).toBeCloseTo((0.6 + 0.4) / 2);
    expect(sh.unresolved).toBe(1);
  });

  it('authorCheck — восемь строк, у условий два столбца', () => {
    const s = walk(3000, 9);
    const a = atr(s);
    const rows = authorCheck(s, a, scanLevels(s, a, swings(s)));
    expect(rows.map((r) => r.key)).toEqual([
      'sweep',
      'sweep-fvg',
      'sweep-bos',
      'sweep-all',
      'break',
      'break-lt02',
      'break-02-05',
      'break-gt05',
    ]);
    expect(rows[0].fromConfirm).toBeNull();
    expect(rows[1].fromConfirm).not.toBeNull();
    expect(rows[0].fromEvent.n).toBeGreaterThan(0);
    const br = rows.slice(5).reduce((x, r) => x + r.fromEvent.n + r.fromEvent.unresolved, 0);
    expect(br).toBe(rows[4].fromEvent.n + rows[4].fromEvent.unresolved);
  });
});
```

- [ ] **Step 2: Run — FAIL**

Run: `cd backend && npx jest src/strategy/author-check.spec.ts`

- [ ] **Step 3: Write `author-check.ts`**

```ts
import type { AuthorRow, Dir, Share } from './report.types';
import type { Series } from './series';
import { Confirm, confirmAfter, Scan } from './events';
import { wilson } from './stats';

/** Горизонт барьерного теста, свечей. */
export const HORIZON = 24;

/**
 * Какая граница ±1 ATR от закрытия свечи i задета первой за HORIZON свечей:
 * 1 — верхняя, −1 — нижняя, 0 — ни одна или обе в одной свече.
 */
export function barrier(
  s: Series,
  a: Float64Array,
  i: number,
  horizon = HORIZON,
): -1 | 0 | 1 {
  const up = s.c[i] + a[i];
  const dn = s.c[i] - a[i];
  for (let k = i + 1; k <= i + horizon && k < s.n; k++) {
    const hu = s.h[k] >= up;
    const hd = s.l[k] <= dn;
    if (hu && hd) return 0;
    if (hu) return 1;
    if (hd) return -1;
  }
  return 0;
}

/** Доля «верх первым» среди всех свечей — что даёт сам рынок, без сигнала. */
export function baseUp(s: Series, a: Float64Array): number {
  let up = 0;
  let dn = 0;
  for (let i = 0; i < s.n; i++) {
    if (!Number.isFinite(a[i])) continue;
    const b = barrier(s, a, i);
    if (b === 1) up++;
    else if (b === -1) dn++;
  }
  return up + dn ? up / (up + dn) : 0.5;
}

export interface Item {
  i: number;
  dir: Dir;
}

export function shareOf(
  items: Item[],
  s: Series,
  a: Float64Array,
  pUp: number,
): Share {
  let ok = 0;
  let n = 0;
  let unresolved = 0;
  let base = 0;
  for (const it of items) {
    const b = barrier(s, a, it.i);
    if (b === 0) {
      unresolved++;
      continue;
    }
    n++;
    if (b === it.dir) ok++;
    base += it.dir === 1 ? pUp : 1 - pUp;
  }
  if (!n) return { n, share: null, lo: null, hi: null, base: null, unresolved };
  const [lo, hi] = wilson(ok, n);
  return { n, share: ok / n, lo, hi, base: base / n, unresolved };
}

/** Цифры автора (видео 1, 5:32–11:11), доли. */
const AUTHOR = {
  sweep: 0.622,
  fvg: 0.84,
  bos: 0.89,
  all: 0.92,
  breakAll: 0.61,
  lt02: 0.492,
  mid: 0.539,
  gt05: 0.665,
};

/**
 * Статистика автора на BTC. Для свипа с условием — два столбца: от закрытия
 * свипа (условие ждём после — так, по-видимому, считал автор, и процент
 * завышается сам: слом вверх «после» уже значит, что цена пошла вверх) и от
 * свечи, на которой условие выполнилось (честно).
 */
export function authorCheck(s: Series, a: Float64Array, scan: Scan): AuthorRow[] {
  const pUp = baseUp(s, a);
  const sh = (items: Item[]) => shareOf(items, s, a, pUp);
  const conf = scan.sweeps.map((sw) => ({ sw, c: confirmAfter(s, sw) }));
  const cond = (pick: (c: Confirm) => number) => {
    const hits = conf
      .map((x) => ({ x, k: pick(x.c) }))
      .filter((y) => y.k >= 0);
    return {
      fromEvent: sh(hits.map((y) => ({ i: y.x.sw.i, dir: y.x.sw.dir }))),
      fromConfirm: sh(hits.map((y) => ({ i: y.k, dir: y.x.sw.dir }))),
    };
  };
  const br = (f: (depth: number) => boolean) =>
    sh(
      scan.breaks
        .filter((b) => f(b.depthAtr))
        .map((b) => ({ i: b.i, dir: b.dir })),
    );
  return [
    {
      key: 'sweep',
      label: 'Свип',
      author: AUTHOR.sweep,
      fromEvent: sh(scan.sweeps.map((sw) => ({ i: sw.i, dir: sw.dir }))),
      fromConfirm: null,
    },
    { key: 'sweep-fvg', label: 'Свип + имбаланс', author: AUTHOR.fvg, ...cond((c) => c.fvg) },
    { key: 'sweep-bos', label: 'Свип + слом структуры', author: AUTHOR.bos, ...cond((c) => c.bos) },
    {
      key: 'sweep-all',
      label: 'Все три фактора',
      author: AUTHOR.all,
      ...cond((c) => (c.fvg >= 0 && c.bos >= 0 ? Math.max(c.fvg, c.bos) : -1)),
    },
    { key: 'break', label: 'Пробой, любое закрытие', author: AUTHOR.breakAll, fromEvent: br(() => true), fromConfirm: null },
    { key: 'break-lt02', label: 'Пробой, закрытие < 0,2 ATR', author: AUTHOR.lt02, fromEvent: br((d) => d < 0.2), fromConfirm: null },
    { key: 'break-02-05', label: 'Пробой, закрытие 0,2–0,5 ATR', author: AUTHOR.mid, fromEvent: br((d) => d >= 0.2 && d <= 0.5), fromConfirm: null },
    { key: 'break-gt05', label: 'Пробой, закрытие > 0,5 ATR', author: AUTHOR.gt05, fromEvent: br((d) => d > 0.5), fromConfirm: null },
  ];
}
```

- [ ] **Step 4: Run — PASS**

Run: `cd backend && npx jest src/strategy/author-check.spec.ts`

- [ ] **Step 5: Commit**

```bash
cd backend && npx prettier --write src/strategy && cd ..
git add backend/src/strategy
git commit -m "feat(strategy): проверка статистики автора барьерным тестом"
```

---

### Task 6: Обучение на ошибках

**Files:**
- Create: `backend/src/strategy/learning.ts`
- Test: `backend/src/strategy/learning.spec.ts`

**Interfaces:**
- Consumes: `FEATURE_KEYS`; `meanCi`, `upper95`; типы `Effect, FeatureKey, Features, Mistake, Rule`.
- Produces: `LEARN_FROM_MS`, `MIN_TRAIN = 60`, `MIN_RULE_N = 20`, `MAX_RULES = 3`, `LearnTrade {id, fillMs, exitMs, rNet, features}`, `Quarter {key, startMs, endMs, rules, added, removed, trainN}`, `quarterStart(ms)`, `nextQuarter(ms)`, `quarterKey(ms)`, `kept(t, rules)`, `learnRules(train) → Rule[]`, `walkForward(trades, fromMs, toMs) → Quarter[]`, `rulesAt(quarters, ms) → Rule[] | null`, `effectOf(excluded) → Effect`, `topMistakes(trades, limit?) → Mistake[]`.

- [ ] **Step 1: Write the failing tests `learning.spec.ts`**

```ts
import type { Features } from './report.types';
import {
  effectOf,
  learnRules,
  LearnTrade,
  quarterKey,
  rulesAt,
  topMistakes,
  walkForward,
} from './learning';

const FEAT: Features = {
  session: 'asia',
  weekend: 'no',
  daily: 'with',
  vol: 'mid',
  stopAtr: '0.5-1.5',
  plannedR: '2-3',
  pierce: '<0.25',
  deep: 'no',
};
let seq = 0;
const trade = (rNet: number, ms: number, over: Partial<Features> = {}): LearnTrade => ({
  id: String(seq++),
  fillMs: ms,
  exitMs: ms + 3_600_000,
  rNet,
  features: { ...FEAT, ...over },
});
const DAY = 86_400_000;
const Y2019 = Date.UTC(2019, 0, 1);

describe('learning', () => {
  it('learnRules — уверенно убыточная корзина становится правилом', () => {
    const train = [
      ...Array.from({ length: 70 }, (_, i) => trade(0.5, Y2019 + i * DAY)),
      ...Array.from({ length: 30 }, (_, i) => trade(-1, Y2019 + i * DAY, { session: 'night' })),
    ];
    expect(learnRules(train)).toEqual([{ feature: 'session', value: 'night' }]);
  });

  it('learnRules — мало сделок или шум — правил нет', () => {
    const few = [
      ...Array.from({ length: 70 }, (_, i) => trade(0.5, Y2019 + i * DAY)),
      ...Array.from({ length: 15 }, (_, i) => trade(-1, Y2019 + i * DAY, { session: 'night' })),
    ];
    expect(learnRules(few)).toEqual([]);
    const noisy = [
      ...Array.from({ length: 70 }, (_, i) => trade(0.5, Y2019 + i * DAY)),
      ...Array.from({ length: 30 }, (_, i) => trade(i % 2 ? 0.9 : -1, Y2019 + i * DAY, { session: 'night' })),
    ];
    expect(learnRules(noisy)).toEqual([]);
  });

  it('learnRules — меньше 60 обучающих сделок — правил нет', () => {
    const train = Array.from({ length: 50 }, (_, i) => trade(-1, Y2019 + i * DAY, { session: 'night' }));
    expect(learnRules(train)).toEqual([]);
  });

  it('walkForward учит квартал только на сделках, закрытых до его начала', () => {
    const q1 = Date.UTC(2020, 0, 1);
    const trades = [
      ...Array.from({ length: 70 }, (_, i) => trade(0.5, Y2019 + i * DAY)),
      // Убыточные ночные — внутри 2020-Q1: в обучение Q1 не попадают, в Q2 — да.
      ...Array.from({ length: 30 }, (_, i) => trade(-1, q1 + i * DAY, { session: 'night' })),
    ];
    const qs = walkForward(trades, q1, Date.UTC(2020, 6, 1));
    expect(qs.map((q) => q.key)).toEqual(['2020-Q1', '2020-Q2']);
    expect(qs[0].rules).toEqual([]);
    expect(qs[0].trainN).toBe(70);
    expect(qs[1].rules).toEqual([{ feature: 'session', value: 'night' }]);
    expect(qs[1].added).toEqual(qs[1].rules);
    expect(rulesAt(qs, Date.UTC(2020, 4, 1))).toEqual(qs[1].rules);
    expect(rulesAt(qs, Date.UTC(2019, 4, 1))).toBeNull();
  });

  it('сделка, закрытая после начала квартала, в его обучение не попадает', () => {
    const q2 = Date.UTC(2020, 3, 1);
    const straddle = { ...trade(-1, q2 - DAY, { session: 'night' }), exitMs: q2 + DAY };
    const qs = walkForward([straddle], q2, q2 + DAY);
    expect(qs[0].trainN).toBe(0);
  });

  it('effectOf — вердикт по отсечённым вперёд сделкам', () => {
    expect(effectOf(Array(30).fill(-1).map((x, i) => x + (i % 3) * 0.1)).verdict).toBe('helped');
    expect(effectOf(Array(30).fill(1).map((x, i) => x - (i % 3) * 0.1)).verdict).toBe('hurt');
    expect(effectOf([]).verdict).toBe('unproven');
    expect(effectOf([-1, 1, -1, 1, 0.5, -0.5]).verdict).toBe('unproven');
  });

  it('topMistakes — худшие корзины по среднему R', () => {
    const trades = [
      ...Array.from({ length: 40 }, (_, i) => trade(0.4, Y2019 + i * DAY)),
      ...Array.from({ length: 25 }, (_, i) => trade(-0.8, Y2019 + i * DAY, { vol: 'high' })),
    ];
    const [worst] = topMistakes(trades);
    expect(worst).toMatchObject({ feature: 'vol', value: 'high', n: 25 });
    expect(worst.mean).toBeCloseTo(-0.8);
  });

  it('quarterKey', () => {
    expect(quarterKey(Date.UTC(2021, 10, 5))).toBe('2021-Q4');
  });
});
```

- [ ] **Step 2: Run — FAIL**

Run: `cd backend && npx jest src/strategy/learning.spec.ts`

- [ ] **Step 3: Write `learning.ts`**

```ts
import type { Effect, FeatureKey, Features, Mistake, Rule } from './report.types';
import { FEATURE_KEYS } from './setups';
import { meanCi, upper95 } from './stats';

/** С какого квартала система учится (до него — разгон истории с 2018). */
export const LEARN_FROM_MS = Date.UTC(2020, 0, 1);
export const MIN_TRAIN = 60;
export const MIN_RULE_N = 20;
export const MAX_RULES = 3;

export interface LearnTrade {
  id: string;
  fillMs: number;
  exitMs: number;
  rNet: number;
  features: Features;
}

export interface Quarter {
  key: string;
  startMs: number;
  endMs: number;
  rules: Rule[];
  added: Rule[];
  removed: Rule[];
  trainN: number;
}

export function quarterStart(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), Math.floor(d.getUTCMonth() / 3) * 3, 1);
}

export function nextQuarter(ms: number): number {
  const d = new Date(quarterStart(ms));
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 3, 1);
}

export function quarterKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
}

const sameRule = (a: Rule, b: Rule) => a.feature === b.feature && a.value === b.value;

/** Сетап проходит правила — ни одно правило под него не подходит. */
export const kept = (t: { features: Features }, rules: Rule[]): boolean =>
  !rules.some((r) => t.features[r.feature] === r.value);

/**
 * Правила из обучающих сделок: жадно берётся корзина признака, чьи сделки
 * уверенно убыточны (≥ MIN_RULE_N, средний R < 0, верхняя граница
 * одностороннего 95 % интервала < 0) с самым отрицательным суммарным R; её
 * сделки уходят из выборки, поиск повторяется — не больше MAX_RULES правил.
 */
export function learnRules(train: LearnTrade[]): Rule[] {
  if (train.length < MIN_TRAIN) return [];
  const rules: Rule[] = [];
  let pool = train;
  while (rules.length < MAX_RULES) {
    let best: { rule: Rule; sum: number } | null = null;
    for (const feature of FEATURE_KEYS) {
      const values = [...new Set(pool.map((t) => t.features[feature]))].sort();
      for (const value of values) {
        const rs = pool.filter((t) => t.features[feature] === value).map((t) => t.rNet);
        if (rs.length < MIN_RULE_N) continue;
        const sum = rs.reduce((a, b) => a + b, 0);
        if (!(sum < 0 && upper95(rs) < 0)) continue;
        if (!best || sum < best.sum) best = { rule: { feature, value }, sum };
      }
    }
    if (!best) break;
    const rule = best.rule;
    rules.push(rule);
    pool = pool.filter((t) => t.features[rule.feature] !== rule.value);
  }
  return rules;
}

/**
 * Проверка вперёд: каждый квартал правила выводятся заново из сделок,
 * закрытых до его начала, и применяются только к сетапам квартала.
 */
export function walkForward(trades: LearnTrade[], fromMs: number, toMs: number): Quarter[] {
  const out: Quarter[] = [];
  let prev: Rule[] = [];
  for (let q = quarterStart(fromMs); q < toMs; q = nextQuarter(q)) {
    const train = trades.filter((t) => t.exitMs < q);
    const rules = learnRules(train);
    out.push({
      key: quarterKey(q),
      startMs: q,
      endMs: nextQuarter(q),
      rules,
      added: rules.filter((r) => !prev.some((p) => sameRule(p, r))),
      removed: prev.filter((p) => !rules.some((r) => sameRule(p, r))),
      trainN: train.length,
    });
    prev = rules;
  }
  return out;
}

/** Правила квартала, в который попал момент; null — до начала обучения. */
export function rulesAt(quarters: Quarter[], ms: number): Rule[] | null {
  const q = quarters.find((x) => ms >= x.startMs && ms < x.endMs);
  return q ? q.rules : null;
}

/**
 * Вердикт по сетапам, которые правила отсекли вперёд: их средний R уверенно
 * ниже нуля — правила помогли, выше — вредят, иначе эффект не доказан.
 */
export function effectOf(excluded: number[]): Effect {
  if (excluded.length < 2) {
    return { n: excluded.length, mean: null, lo: null, hi: null, verdict: 'unproven' };
  }
  const ci = meanCi(excluded);
  return {
    n: excluded.length,
    mean: ci.mean,
    lo: ci.lo,
    hi: ci.hi,
    verdict: ci.hi < 0 ? 'helped' : ci.lo > 0 ? 'hurt' : 'unproven',
  };
}

/** Корзины признаков с худшим средним R за всю историю — диагностика, не правило. */
export function topMistakes(trades: LearnTrade[], limit = 6): Mistake[] {
  const out: Mistake[] = [];
  for (const feature of FEATURE_KEYS as FeatureKey[]) {
    const values = [...new Set(trades.map((t) => t.features[feature]))].sort();
    for (const value of values) {
      const rs = trades.filter((t) => t.features[feature] === value).map((t) => t.rNet);
      if (rs.length < MIN_RULE_N) continue;
      const ci = meanCi(rs);
      if (ci.mean >= 0) continue;
      out.push({ feature, value, n: rs.length, mean: ci.mean, lo: ci.lo, hi: ci.hi });
    }
  }
  return out.sort((a, b) => a.mean - b.mean).slice(0, limit);
}
```

- [ ] **Step 4: Run — PASS**

Run: `cd backend && npx jest src/strategy/learning.spec.ts`

- [ ] **Step 5: Commit**

```bash
cd backend && npx prettier --write src/strategy && cd ..
git add backend/src/strategy
git commit -m "feat(strategy): обучение на ошибках с проверкой вперёд по кварталам"
```

---

### Task 7: Теория «Трейдинг = математика»

**Files:**
- Create: `backend/src/strategy/theory.ts`
- Test: `backend/src/strategy/theory.spec.ts`

**Interfaces:**
- Consumes: `maxDrawdown`, `maxLossStreak`, `mulberry32`, `summarize`; `TheoryBlock`.
- Produces: `TheoryTrade {rGross, rNet, stopPct}`, `theoryOf(trades, seed?) → TheoryBlock`.

- [ ] **Step 1: Write the failing tests `theory.spec.ts`**

```ts
import { theoryOf, TheoryTrade } from './theory';

const video = (): TheoryTrade[] => [
  ...Array.from({ length: 15 }, () => ({ rGross: 8.05, rNet: 8, stopPct: 0.02 })),
  ...Array.from({ length: 85 }, () => ({ rGross: -0.97, rNet: -1, stopPct: 0.02 })),
];

describe('theory', () => {
  it('мат ожидание — пример видео: +0,35R, $35 при риске $100', () => {
    const t = theoryOf(video());
    expect(t.expectancy.net).toBeCloseTo(0.35);
    expect(t.expectancy.winrate).toBeCloseTo(0.15);
    expect(t.expectancy.gross).toBeGreaterThan(t.expectancy.net);
  });

  it('безубыточный винрейт: 50 / 33 / 25 / 20 %', () => {
    const t = theoryOf(video());
    expect(t.breakeven.table.map((x) => Math.round(x.winrate * 100))).toEqual([50, 33, 25, 20]);
    expect(t.breakeven.needed).toBeCloseTo(1 / 9);
  });

  it('объём позиции и 20 минусов подряд', () => {
    const t = theoryOf(video());
    expect(t.sizing.position).toBeCloseTo(250);
    expect(t.sizing.streak20[0].loss).toBeCloseTo(0.182, 3);
    expect(t.sizing.streak20[1].loss).toBeCloseTo(0.642, 3);
  });

  it('асимметрия: 10 → 11 %, 30 → 43 %, 50 → 100 %', () => {
    const t = theoryOf(video());
    expect(t.asymmetry.table.map((x) => Math.round(x.need * 100))).toEqual([11, 43, 100]);
  });

  it('риск разорения растёт с риском на сделку', () => {
    const p = theoryOf(video()).ruin.rows.map((r) => r.p);
    for (let i = 1; i < p.length; i++) expect(p[i]).toBeGreaterThanOrEqual(p[i - 1]);
    expect(p[3]).toBeGreaterThan(p[0]);
  });

  it('перестановки воспроизводимы', () => {
    expect(theoryOf(video(), 5)).toEqual(theoryOf(video(), 5));
  });

  it('накопленное среднее хранит первые 120 сделок поштучно', () => {
    const t = theoryOf(video());
    expect(t.running[19]).toEqual({ n: 20, mean: expect.any(Number) });
  });

  it('пустой список не ломается', () => {
    const t = theoryOf([]);
    expect(t.variance.paths).toEqual([]);
    expect(t.ruin.rows.every((r) => r.p === 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Run — FAIL**

Run: `cd backend && npx jest src/strategy/theory.spec.ts`

- [ ] **Step 3: Write `theory.ts`**

```ts
import type { TheoryBlock } from './report.types';
import { maxDrawdown, maxLossStreak, mulberry32, summarize } from './stats';

export interface TheoryTrade {
  rGross: number;
  rNet: number;
  /** Стоп сделки, доля цены входа. */
  stopPct: number;
}

const SIMS = 1000;
const RUIN_TRADES = 300;
const RISKS = [0.005, 0.01, 0.02, 0.05];
const MAX_POINTS = 200;
const KEEP_FIRST = 120;

function thin(xs: number[]): number[] {
  if (xs.length <= MAX_POINTS) return xs;
  const step = (xs.length - 1) / (MAX_POINTS - 1);
  return Array.from({ length: MAX_POINTS }, (_, i) => xs[Math.round(i * step)]);
}

function cumulative(rs: number[]): number[] {
  let s = 0;
  return rs.map((r) => (s += r));
}

/**
 * Принципы видео 2 на сделках стратегии: мат ожидание, безубыточный винрейт,
 * сходимость среднего, разброс перестановками, объём позиции, риск разорения,
 * асимметрия убытков. Перестановки — с возвращением, зерно фиксировано.
 */
export function theoryOf(trades: TheoryTrade[], seed = 20261030): TheoryBlock {
  const net = trades.map((t) => t.rNet);
  const sNet = summarize(net);
  const sGross = summarize(trades.map((t) => t.rGross));
  const n = net.length;
  const rnd = mulberry32(seed);
  const sample = (len: number) =>
    Array.from({ length: len }, () => net[Math.floor(rnd() * n)]);

  const sims = n ? Array.from({ length: SIMS }, () => sample(n)) : [];
  const order = sims
    .map((p, i) => ({ i, sum: p.reduce((a, b) => a + b, 0) }))
    .sort((a, b) => a.sum - b.sum);
  const pick = (q: number) =>
    sims[order[Math.min(order.length - 1, Math.floor(q * order.length))].i];
  const maxStreak = maxLossStreak(net);
  const paths = n
    ? [
        { label: '5-й процентиль', points: thin(cumulative(pick(0.05))) },
        { label: 'Медиана', points: thin(cumulative(pick(0.5))) },
        { label: '95-й процентиль', points: thin(cumulative(pick(0.95))) },
      ]
    : [];
  const pStreak = sims.length
    ? sims.filter((p) => maxLossStreak(p) >= maxStreak).length / sims.length
    : 0;

  const ruin = RISKS.map((risk) => {
    if (!n) return { risk, p: 0 };
    let ruined = 0;
    for (let k = 0; k < SIMS; k++) {
      if (maxDrawdown(sample(RUIN_TRADES), risk) >= 0.5) ruined++;
    }
    return { risk, p: ruined / SIMS };
  });

  const cum = cumulative(net);
  const stride = Math.max(1, Math.ceil(n / MAX_POINTS));
  const running = cum
    .map((s, i) => ({ n: i + 1, mean: s / (i + 1) }))
    .filter((_, i) => i < KEEP_FIRST || i % stride === 0 || i === n - 1);

  const stops = trades.map((t) => t.stopPct).sort((a, b) => a - b);
  const stopPct = stops.length ? stops[Math.floor(stops.length / 2)] : 0;
  const maxDd1 = maxDrawdown(net, 0.01);

  return {
    expectancy: {
      winrate: sNet.winrate,
      avgWin: sNet.avgWin,
      avgLoss: sNet.avgLoss,
      gross: sGross.expectancy,
      net: sNet.expectancy,
    },
    breakeven: {
      table: [1, 2, 3, 4].map((r) => ({ r, winrate: 1 / (1 + r) })),
      avgWin: sNet.avgWin,
      winrate: sNet.winrate,
      needed: sNet.breakeven,
    },
    running,
    variance: { paths, maxStreak, pStreak, sims: SIMS },
    sizing: {
      account: 1000,
      riskPct: 0.005,
      riskUsd: 5,
      stopPct,
      position: stopPct > 0 ? 5 / stopPct : 0,
      streak20: [0.01, 0.05].map((risk) => ({ risk, loss: 1 - (1 - risk) ** 20 })),
    },
    ruin: { trades: RUIN_TRADES, sims: SIMS, rows: ruin },
    asymmetry: {
      table: [0.1, 0.3, 0.5].map((loss) => ({ loss, need: loss / (1 - loss) })),
      maxDd1,
      need: maxDd1 < 1 ? maxDd1 / (1 - maxDd1) : null,
    },
  };
}
```

- [ ] **Step 4: Run — PASS**

Run: `cd backend && npx jest src/strategy/theory.spec.ts`

- [ ] **Step 5: Commit**

```bash
cd backend && npx prettier --write src/strategy && cd ..
git add backend/src/strategy
git commit -m "feat(strategy): теория «Трейдинг = математика» на сделках стратегии"
```

---

### Task 8: Сборка отчёта

**Files:**
- Create: `backend/src/strategy/report.ts`
- Test: `backend/src/strategy/report.spec.ts`

**Interfaces:**
- Consumes: всё из задач 1–7.
- Produces: `STRATEGY_VERSION = 1`, `REPORT_ID = 'smc-intraday'`, `ReportInput {m15, h1, h4, d1, nowMs}`, `sequential(trades)`, `buildReport(input, fetch, yieldFn?) → Promise<StrategyReport>`.

- [ ] **Step 1: Write the failing tests `report.spec.ts`**

```ts
import { aggregate, walk } from './fixtures';
import { closeMs } from './series';
import { buildReport, sequential, STRATEGY_VERSION } from './report';

describe('report', () => {
  it('sequential — одна позиция за раз', () => {
    const t = [
      { fillMs: 0, exitMs: 10 },
      { fillMs: 5, exitMs: 20 },
      { fillMs: 10, exitMs: 30 },
    ];
    expect(sequential(t)).toEqual([t[0], t[2]]);
  });

  it('buildReport собирает отчёт на случайном блуждании', async () => {
    const m15 = walk(200 * 96, 11);
    const report = await buildReport(
      {
        m15,
        h1: aggregate(m15, 60),
        h4: aggregate(m15, 240),
        d1: aggregate(m15, 1440),
        nowMs: closeMs(m15, m15.n - 1),
      },
      async () => new Map(),
      async () => undefined,
    );
    expect(report.version).toBe(STRATEGY_VERSION);
    expect(report.variants).toHaveLength(9);
    expect(report.variants[0].id).toBe('main');
    expect(report.author).toHaveLength(8);
    expect(report.learning.quarters.length).toBeGreaterThanOrEqual(2);
    expect(report.theory.ruin.rows).toHaveLength(4);
    for (const t of report.main.trades) expect(t.exitMs).toBeGreaterThan(t.fillMs);
    for (let i = 1; i < report.main.trades.length; i++) {
      expect(report.main.trades[i].fillMs).toBeGreaterThanOrEqual(report.main.trades[i - 1].exitMs);
    }
    expect(() => JSON.stringify(report)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run — FAIL**

Run: `cd backend && npx jest src/strategy/report.spec.ts`

- [ ] **Step 3: Write `report.ts`**

```ts
import type {
  LearningBlock,
  StrategyReport,
  SystemBlock,
  TradeRow,
  VariantRow,
  YearRow,
} from './report.types';
import { alignToClose, atr, closeMs, Series, structure, swings } from './series';
import { scanLevels } from './events';
import { findSetups, MAIN, Setup, SetupContext, Variant, VARIANTS } from './setups';
import { Bar, FetchMinutes, Filled, simulateAll } from './simulate';
import { authorCheck } from './author-check';
import {
  effectOf,
  kept,
  LEARN_FROM_MS,
  learnRules,
  LearnTrade,
  nextQuarter,
  quarterKey,
  quarterStart,
  rulesAt,
  topMistakes,
  walkForward,
} from './learning';
import { theoryOf } from './theory';
import { maxDrawdown, summarize } from './stats';

/** Поднимать при любой правке правил, обучения или формы отчёта. */
export const STRATEGY_VERSION = 1;
export const REPORT_ID = 'smc-intraday';

export interface ReportInput {
  m15: Series;
  h1: Series;
  h4: Series;
  d1: Series;
  nowMs: number;
}

const pause = () => new Promise<void>((resolve) => setImmediate(resolve));

interface Prepared {
  s: Series;
  ctx: SetupContext;
}

function prepare(
  s: Series,
  htf: Series,
  d1: Series,
  trendHtf: Int8Array,
  trendD: Int8Array,
): Prepared {
  const a = atr(s);
  return {
    s,
    ctx: {
      atr: a,
      scan: scanLevels(s, a, swings(s)),
      htf: alignToClose(s, htf, trendHtf),
      daily: alignToClose(s, d1, trendD),
    },
  };
}

/** Одна позиция за раз: сетап, чей вход приходится на открытую позицию, пропускается. */
export function sequential<T extends { fillMs: number; exitMs: number }>(trades: T[]): T[] {
  const sorted = [...trades].sort((a, b) => a.fillMs - b.fillMs);
  const out: T[] = [];
  let freeAt = -Infinity;
  for (const t of sorted) {
    if (t.fillMs >= freeAt) {
      out.push(t);
      freeAt = t.exitMs;
    }
  }
  return out;
}

function toRow(p: Prepared, st: Setup, f: Filled): TradeRow {
  const { s } = p;
  return {
    id: st.id,
    dir: st.dir,
    tf: s.tf,
    sweepMs: s.t[st.sweepI],
    obMs: s.t[st.obI],
    fvgMs: st.fvgI >= 0 ? s.t[st.fvgI] : null,
    bosMs: st.bosI >= 0 ? s.t[st.bosI] : null,
    confirmMs: closeMs(s, st.e),
    level: st.level,
    entry: st.entry,
    stop: st.stop,
    target: st.target,
    plannedR: st.plannedR,
    fillMs: f.fillMs,
    fill: f.fill,
    exitMs: f.exitMs,
    exit: f.exit,
    outcome: f.outcome,
    rGross: f.rGross,
    rNet: f.rNet,
    features: st.features,
  };
}

function systemOf(trades: TradeRow[]): SystemBlock {
  const rs = trades.map((t) => t.rNet);
  let cum = 0;
  return {
    summary: summarize(rs),
    maxDd1: maxDrawdown(rs, 0.01),
    equity: trades.map((t) => ({ ms: t.exitMs, r: (cum += t.rNet) })),
  };
}

function byYear(trades: TradeRow[]): YearRow[] {
  const map = new Map<number, number[]>();
  for (const t of trades) {
    const y = new Date(t.fillMs).getUTCFullYear();
    const list = map.get(y) ?? [];
    list.push(t.rNet);
    map.set(y, list);
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, rs]) => ({ year, summary: summarize(rs) }));
}

async function runVariant(
  v: Variant,
  p: Prepared,
  fetch: FetchMinutes,
  cache: Map<string, Bar[]>,
) {
  const setups = findSetups(p.s, p.ctx, v);
  const resolved = await simulateAll(p.s, setups, fetch, cache);
  const filled: TradeRow[] = [];
  let missed = 0;
  let expired = 0;
  for (const r of resolved) {
    if (r.result.status === 'filled') filled.push(toRow(p, r.setup, r.result));
    else if (r.result.status === 'missed') missed++;
    else if (r.result.status === 'expired') expired++;
  }
  const system = sequential(filled);
  const sys = systemOf(system);
  const row: VariantRow = {
    id: v.id,
    label: v.label,
    setups: setups.length,
    filled: filled.length,
    missed,
    expired,
    summary: sys.summary,
    grossExpectancy: summarize(system.map((t) => t.rGross)).expectancy,
    maxDd1: sys.maxDd1,
  };
  return { v, row, filled, system, sys };
}

function learningOf(filled: TradeRow[], nowMs: number): LearningBlock {
  const all: LearnTrade[] = filled.map((t) => ({
    id: t.id,
    fillMs: t.fillMs,
    exitMs: t.exitMs,
    rNet: t.rNet,
    features: t.features,
  }));
  const quarters = walkForward(all, LEARN_FROM_MS, nowMs);
  const forward = filled.filter((t) => t.fillMs >= LEARN_FROM_MS);
  const isKept = (t: TradeRow) => kept(t, rulesAt(quarters, t.fillMs) ?? []);
  const learned = forward.filter(isKept);
  const excluded = forward.filter((t) => !isKept(t)).map((t) => t.rNet);
  return {
    fromMs: LEARN_FROM_MS,
    quarters: quarters.map((q) => {
      const inQ = forward.filter((t) => t.fillMs >= q.startMs && t.fillMs < q.endMs);
      return {
        key: q.key,
        rules: q.rules,
        added: q.added,
        removed: q.removed,
        trainN: q.trainN,
        trades: inQ.length,
        excluded: inQ.filter((t) => !kept(t, q.rules)).length,
      };
    }),
    base: systemOf(sequential(forward)),
    learned: systemOf(sequential(learned)),
    effect: effectOf(excluded),
    mistakes: topMistakes(all),
    next: {
      key: quarterKey(nextQuarter(quarterStart(nowMs))),
      rules: learnRules(all.filter((t) => t.exitMs < nowMs)),
    },
  };
}

/**
 * Отчёт целиком. Между этапами — `yieldFn`: расчёт идёт в `worker`, который
 * держит сокеты терминалов, и один блок на секунды им вреден.
 */
export async function buildReport(
  input: ReportInput,
  fetch: FetchMinutes,
  yieldFn: () => Promise<void> = pause,
): Promise<StrategyReport> {
  const { m15, h1, h4, d1, nowMs } = input;
  const trend4h = structure(h4);
  const trendD = structure(d1);
  const p15 = prepare(m15, h4, d1, trend4h, trendD);
  await yieldFn();
  const p60 = prepare(h1, d1, d1, trendD, trendD);
  await yieldFn();

  const cache = new Map<string, Bar[]>();
  const runs = [];
  for (const v of VARIANTS) {
    runs.push(await runVariant(v, v.tf === 60 ? p60 : p15, fetch, cache));
    await yieldFn();
  }
  const main = runs.find((r) => r.v.id === MAIN.id);

  const author = authorCheck(h1, p60.ctx.atr, p60.ctx.scan);
  await yieldFn();
  const learning = learningOf(main.filled, nowMs);
  await yieldFn();
  const theory = theoryOf(
    main.system.map((t) => ({
      rGross: t.rGross,
      rNet: t.rNet,
      stopPct: Math.abs(t.entry - t.stop) / t.entry,
    })),
  );

  return {
    version: STRATEGY_VERSION,
    computedAt: new Date(nowMs).toISOString(),
    dataFrom: m15.t[0],
    dataTo: closeMs(m15, m15.n - 1),
    variants: runs.map((r) => r.row),
    main: {
      variant: main.row,
      equity: main.sys.equity,
      byYear: byYear(main.system),
      trades: main.system,
    },
    author,
    learning,
    theory,
  };
}
```

- [ ] **Step 4: Run — PASS, затем весь модуль**

Run: `cd backend && npx jest src/strategy`
Expected: все спеки модуля зелёные.

- [ ] **Step 5: Commit**

```bash
cd backend && npx prettier --write src/strategy && npx eslint src/strategy --fix && cd ..
git add backend/src/strategy
git commit -m "feat(strategy): сборка отчёта из вариантов, проверки автора, обучения и теории"
```

### ▶ Контрольная точка 1 (A): движок

Ревьюер Sonnet по `task-reviewer-prompt.md`: выдержка плана (задачи 1–8) + дифф `backend/src/strategy`. Фокус: заглядывание в будущее (свинги, пулы, `confirmAfter`, контекст старшего ТФ, обучение по `exitMs`), соответствие механики спеке (свип/пробой, ордерблок, вход/стоп/цель, R ≥ 1, лимит/срок, худший исход в спорной минутке, комиссия в R), граничные случаи (пустые ряды, NaN ATR, деление на ноль).

---

### Task 9: Таблица, сервис расчёта, API

**Files:**
- Modify: `backend/prisma/schema.prisma` (блок после `═══ /plan ═══`), `backend/src/app.module.ts`
- Create: `backend/src/strategy/strategy-report.service.ts`, `backend/src/strategy/strategy.controller.ts`, `backend/src/strategy/strategy.module.ts`
- Test: `backend/src/strategy/strategy.controller.spec.ts`

**Interfaces:**
- Consumes: `buildReport`, `REPORT_ID`, `STRATEGY_VERSION`, `Bar`, `minuteKey`, `toSeries`, `CandleRow`; `PrismaService`; `runsBackgroundJobs`; `SYMBOL` из `market-data/timeframes`; `JwtAuthGuard`, `AdminGuard`.
- Produces: модель `StrategyReport` (`strategy_reports`); `StrategyReportService.read() → Promise<{version, computedAt, data} | null>`; `GET /api/admin/strategy/report → ReportResponse`.

- [ ] **Step 1: Schema** — после строки `// ═══ /plan ═══` в `backend/prisma/schema.prisma`:

```prisma

// ═══ strategy ═══ Стратегия в админке (backend/src/strategy; спека
// docs/superpowers/specs/2026-10-30-strategy-lab-design.md). Отчёт считает
// worker раз в сутки; связей с таблицами продукта нет — блок сносится целиком.

/// Готовый отчёт стратегии: одна строка на стратегию.
model StrategyReport {
  /// 'smc-intraday'
  id         String   @id
  /// STRATEGY_VERSION кода, которым посчитан: другая — отчёт пересчитывается.
  version    Int
  computedAt DateTime
  data       Json

  @@map("strategy_reports")
}
// ═══ /strategy ═══
```

Run: `cd backend && npx prisma generate` (если падает EPERM — остановить `nest watch`, см. память `prisma_generate_eperm_windows`), затем `npx prisma db push`.

- [ ] **Step 2: Write the failing test `strategy.controller.spec.ts`**

```ts
import { StrategyController } from './strategy.controller';
import { STRATEGY_VERSION } from './report';

const at = new Date('2026-10-30T00:00:00Z');
const make = (row: unknown) =>
  new StrategyController({ read: async () => row } as never);

describe('StrategyController', () => {
  it('нет строки — pending', async () => {
    expect(await make(null).report()).toEqual({ status: 'pending', computedAt: null, report: null });
  });

  it('старая версия — pending с датой прошлого расчёта', async () => {
    const res = await make({ version: STRATEGY_VERSION - 1, computedAt: at, data: {} }).report();
    expect(res).toEqual({ status: 'pending', computedAt: at.toISOString(), report: null });
  });

  it('текущая версия — отчёт', async () => {
    const data = { version: STRATEGY_VERSION };
    const res = await make({ version: STRATEGY_VERSION, computedAt: at, data }).report();
    expect(res).toEqual({ status: 'ready', computedAt: at.toISOString(), report: data });
  });
});
```

- [ ] **Step 3: Run — FAIL**

Run: `cd backend && npx jest src/strategy/strategy.controller.spec.ts`

- [ ] **Step 4: Write service, controller, module**

`strategy-report.service.ts`:

```ts
import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { runsBackgroundJobs } from '../role';
import { SYMBOL } from '../market-data/timeframes';
import { buildReport, REPORT_ID, STRATEGY_VERSION } from './report';
import { CandleRow, Series, toSeries } from './series';
import { Bar, minuteKey } from './simulate';

const DAY_MS = 86_400_000;
/** Как часто проверять, не пора ли пересчитать. */
const CHECK_MS = 60 * 60_000;
/** Первый расчёт — после старта остальных фоновых сервисов. */
const START_DELAY_MS = 60_000;
const PAGE = 50_000;

/**
 * Отчёт стратегии в админке. Считает только `worker` (роль `all` — локально):
 * раз в сутки и сразу, если отчёта нет или он посчитан другой версией правил.
 * `api` строку только читает.
 */
@Injectable()
export class StrategyReportService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(StrategyReportService.name);
  private timers: NodeJS.Timeout[] = [];
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

  onApplicationBootstrap() {
    if (!runsBackgroundJobs()) return;
    const run = () =>
      this.tick().catch((e) => this.logger.error(`отчёт стратегии: ${e}`));
    this.timers.push(setTimeout(run, START_DELAY_MS));
    this.timers.push(setInterval(run, CHECK_MS));
  }

  onModuleDestroy() {
    for (const t of this.timers) clearTimeout(t);
  }

  read() {
    return this.prisma.strategyReport.findUnique({
      where: { id: REPORT_ID },
      select: { version: true, computedAt: true, data: true },
    });
  }

  async tick(): Promise<void> {
    if (this.running) return;
    const row = await this.prisma.strategyReport.findUnique({
      where: { id: REPORT_ID },
      select: { version: true, computedAt: true },
    });
    const fresh =
      row &&
      row.version === STRATEGY_VERSION &&
      Date.now() - row.computedAt.getTime() < DAY_MS;
    if (fresh) return;
    this.running = true;
    try {
      await this.compute();
    } finally {
      this.running = false;
    }
  }

  private async compute(): Promise<void> {
    const started = Date.now();
    const m15 = await this.load(15);
    const h1 = await this.load(60);
    const h4 = await this.load(240);
    const d1 = await this.load(1440);
    if (!m15.n || !h1.n || !h4.n || !d1.n) {
      this.logger.warn('отчёт стратегии: свечей BTC ещё нет — расчёт отложен');
      return;
    }
    const report = await buildReport(
      { m15, h1, h4, d1, nowMs: Date.now() },
      (ranges) => this.minutes(ranges),
    );
    const data = report as unknown as Prisma.InputJsonValue;
    const computedAt = new Date(report.computedAt);
    await this.prisma.strategyReport.upsert({
      where: { id: REPORT_ID },
      create: { id: REPORT_ID, version: STRATEGY_VERSION, computedAt, data },
      update: { version: STRATEGY_VERSION, computedAt, data },
    });
    this.logger.log(
      `отчёт стратегии: ${report.main.variant.summary.n} сделок, ${Math.round((Date.now() - started) / 1000)} с`,
    );
  }

  private async load(tf: number): Promise<Series> {
    const rows: CandleRow[] = [];
    let cursor: Date | undefined;
    for (;;) {
      const page = await this.prisma.priceCandle.findMany({
        where: {
          symbol: SYMBOL,
          timeframe: tf,
          ...(cursor ? { time: { gt: cursor } } : {}),
        },
        orderBy: { time: 'asc' },
        take: PAGE,
        select: { time: true, open: true, high: true, low: true, close: true },
      });
      for (const r of page) rows.push(r);
      if (page.length < PAGE) break;
      cursor = page[page.length - 1].time;
    }
    return toSeries(tf, rows);
  }

  private async minutes(
    ranges: [number, number][],
  ): Promise<Map<string, Bar[]>> {
    const out = new Map<string, Bar[]>();
    for (const [from, to] of ranges) {
      const rows = await this.prisma.priceCandle.findMany({
        where: {
          symbol: SYMBOL,
          timeframe: 1,
          time: { gte: new Date(from), lt: new Date(to) },
        },
        orderBy: { time: 'asc' },
        select: { time: true, open: true, high: true, low: true, close: true },
      });
      out.set(
        minuteKey(from, to),
        rows.map((r) => ({
          t0: r.time.getTime(),
          t1: r.time.getTime() + 60_000,
          o: r.open,
          h: r.high,
          l: r.low,
          c: r.close,
        })),
      );
    }
    return out;
  }
}
```

`strategy.controller.ts`:

```ts
import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../admin/guards/admin.guard';
import { StrategyReportService } from './strategy-report.service';
import { STRATEGY_VERSION } from './report';
import type { ReportResponse, StrategyReport } from './report.types';

/**
 * Стратегия — раздел владельца на поддомене админки, под тем же двойным
 * guard'ом, что учебник и план.
 */
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('api/admin/strategy')
export class StrategyController {
  constructor(private readonly reports: StrategyReportService) {}

  /** GET /api/admin/strategy/report — готовый отчёт или «считается». */
  @Get('report')
  async report(): Promise<ReportResponse> {
    const row = await this.reports.read();
    const computedAt = row ? row.computedAt.toISOString() : null;
    if (!row || row.version !== STRATEGY_VERSION) {
      return { status: 'pending', computedAt, report: null };
    }
    return {
      status: 'ready',
      computedAt,
      report: row.data as unknown as StrategyReport,
    };
  }
}
```

`strategy.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { AdminGuard } from '../admin/guards/admin.guard';
import { StrategyController } from './strategy.controller';
import { StrategyReportService } from './strategy-report.service';

/**
 * Стратегия владельца в админке. Раздел изолирован: снаружи берёт Prisma,
 * guard'ы и символ BTC; продукт от него не берёт ничего — снос описан в
 * `frontend/src/views/strategy/README.md`.
 */
@Module({
  controllers: [StrategyController],
  providers: [StrategyReportService, AdminGuard],
})
export class StrategyModule {}
```

В `backend/src/app.module.ts`: импорт `import { StrategyModule } from './strategy/strategy.module';` рядом с `PlanModule`, и `StrategyModule,` в `imports` сразу после `PlanModule,`.

- [ ] **Step 5: Run — PASS + сборка бэкенда**

Run: `cd backend && npx jest src/strategy && npx tsc --noEmit -p tsconfig.json`

- [ ] **Step 6: Commit**

```bash
cd backend && npx prettier --write src/strategy src/app.module.ts && npx eslint src/strategy --fix && cd ..
git add backend/prisma/schema.prisma backend/src/strategy backend/src/app.module.ts
git commit -m "feat(strategy): таблица отчёта, расчёт в worker и отдача владельцу"
```

---

### Task 10: Фронт — каркас раздела

**Files:**
- Create: `frontend/src/views/strategy/api/types.ts` (копия `backend/src/strategy/report.types.ts` без изменений), `frontend/src/views/strategy/api/hooks.ts`, `frontend/src/views/strategy/model/format.ts`, `frontend/src/views/strategy/model/format.test.ts`, `frontend/src/views/strategy/model/rules.ts`, `frontend/src/views/strategy/components/RulesSection.tsx`, `frontend/src/views/strategy/Page.tsx`, `frontend/src/views/strategy/strategy.css`, `frontend/src/app/admin/(in)/strategy/page.tsx`
- Modify: `frontend/src/app/(internal)/AdminChrome.tsx`, `frontend/src/shared/i18n/messages/ru.json`, `frontend/src/shared/i18n/messages/en.json`

**Interfaces:**
- Consumes: `ReportResponse`, `StrategyReport`, `TradeRow`, `Rule`, `FeatureKey` (копия типов); `apiJson`, `qs`; `usePersistentValue`; `useAuth`.
- Produces: `useStrategyReport(enabled)`, `useTradeCandles(trade)`, `ChartCandle`; `fmtR, fmtPct, fmtNum, fmtInt, fmtUsd, fmtPrice, fmtDate, clock, tone, ruleText, FEATURE_LABELS, OUTCOME_LABELS`; `STEPS`, `VIDEO_1`, `VIDEO_2`; `StrategyPage`; секции задачи 11 подключаются в `Page.tsx`.

- [ ] **Step 1: Write the failing test `format.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { clock, fmtPct, fmtR, ruleText, tone } from './format';

describe('format', () => {
  it('fmtR — знак, два знака, R', () => {
    expect(fmtR(0.35)).toBe('+0,35R');
    expect(fmtR(-1)).toBe('−1,00R');
    expect(fmtR(0)).toBe('0,00R');
    expect(fmtR(null)).toBe('—');
  });

  it('fmtPct', () => {
    expect(fmtPct(0.412)).toBe('41,2 %');
    expect(fmtPct(0.5, 0)).toBe('50 %');
    expect(fmtPct(null)).toBe('—');
  });

  it('ruleText — признак и корзина по-русски', () => {
    expect(ruleText({ feature: 'session', value: 'night' })).toBe('Сессия: ночь');
    expect(ruleText({ feature: 'stopAtr', value: '>1.5' })).toBe('Стоп: > 1,5 ATR');
  });

  it('clock и tone', () => {
    expect(clock(2214)).toBe('36:54');
    expect(tone(0.1)).toBe('pos');
    expect(tone(-0.1)).toBe('neg');
    expect(tone(0)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run — FAIL**

Run: `cd frontend && npx vitest run src/views/strategy`

- [ ] **Step 3: Write `api/types.ts`, `api/hooks.ts`, `model/format.ts`, `model/rules.ts`**

`api/types.ts` — содержимое `backend/src/strategy/report.types.ts` дословно (первая строка комментария: «Копия `backend/src/strategy/report.types.ts` — правятся вместе.»).

`api/hooks.ts`:

```ts
'use client';

import { useQuery } from '@tanstack/react-query';
import { apiJson, qs } from '@/shared/api/http';
import type { ReportResponse, TradeRow } from './types';

/**
 * Отчёт стратегии (`backend/src/strategy`). Считает его worker раз в сутки;
 * пока первого отчёта нет, страница спрашивает раз в полминуты и появится сама.
 */
export function useStrategyReport(enabled: boolean) {
  return useQuery({
    queryKey: ['strategy', 'report'],
    queryFn: () => apiJson<ReportResponse>('/api/admin/strategy/report'),
    enabled,
    staleTime: 5 * 60_000,
    refetchInterval: (q) => (q.state.data?.status === 'pending' ? 30_000 : false),
  });
}

/** Свеча, как её отдаёт `/api/market-data/candles`. */
export interface ChartCandle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export const CHART_BEFORE = 60;
export const CHART_AFTER = 20;

/** Свечи вокруг сделки: от 60 свечей до свипа до 20 после выхода. */
export function useTradeCandles(trade: TradeRow) {
  const step = trade.tf * 60_000;
  const from = trade.sweepMs - CHART_BEFORE * step;
  const to = trade.exitMs + CHART_AFTER * step;
  return useQuery({
    queryKey: ['strategy', 'candles', trade.tf, from, to],
    queryFn: () =>
      apiJson<ChartCandle[]>(`/api/market-data/candles${qs({ tf: trade.tf, from, to, limit: 5000 })}`),
    staleTime: Infinity,
  });
}
```

`model/format.ts`:

```ts
import { dateFormat } from '@/shared/lib/utils/intl';
import type { FeatureKey, Outcome, Rule } from '../api/types';

const R2 = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const N0 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const N1 = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pctFormat = new Map<number, Intl.NumberFormat>();

const ok = (x: number | null | undefined): x is number => x != null && Number.isFinite(x);

/** R со знаком: «+0,35R», «−1,00R». */
export const fmtR = (x: number | null | undefined): string =>
  ok(x) ? `${x > 0 ? '+' : x < 0 ? '−' : ''}${R2.format(Math.abs(x))}R` : '—';

/** Доля в процентах: 0,412 → «41,2 %». */
export function fmtPct(x: number | null | undefined, digits = 1): string {
  if (!ok(x)) return '—';
  let f = pctFormat.get(digits);
  if (!f) {
    f = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: digits, maximumFractionDigits: digits });
    pctFormat.set(digits, f);
  }
  return `${f.format(x * 100)} %`;
}

export const fmtNum = (x: number | null | undefined): string => (ok(x) ? R2.format(x) : '—');
export const fmtInt = (x: number | null | undefined): string => (ok(x) ? N0.format(x) : '—');
export const fmtPrice = (x: number): string => N1.format(x);
export const fmtUsd = (x: number): string => `${x < 0 ? '−' : ''}$${N0.format(Math.abs(x))}`;

export const fmtDate = (ms: number): string =>
  dateFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(new Date(ms));

export const fmtDateTime = (ms: number): string =>
  dateFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(ms));

/** Секунды → «36:54» — таймкод видео. */
export const clock = (sec: number): string =>
  `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

export const tone = (x: number | null | undefined): 'pos' | 'neg' | undefined =>
  ok(x) && x > 0 ? 'pos' : ok(x) && x < 0 ? 'neg' : undefined;

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  session: 'Сессия',
  weekend: 'День',
  daily: 'Дневная структура',
  vol: 'Волатильность',
  stopAtr: 'Стоп',
  plannedR: 'Плановый R',
  pierce: 'Прокол свипа',
  deep: 'Глубокий дисконт',
};

const VALUE_LABELS: Record<string, string> = {
  'session:asia': 'Азия',
  'session:london': 'Лондон',
  'session:ny': 'Нью-Йорк',
  'session:night': 'ночь',
  'weekend:yes': 'выходные',
  'weekend:no': 'будни',
  'daily:with': 'по ходу сделки',
  'daily:against': 'против сделки',
  'vol:low': 'низкая',
  'vol:mid': 'средняя',
  'vol:high': 'высокая',
  'stopAtr:<0.5': '< 0,5 ATR',
  'stopAtr:0.5-1.5': '0,5–1,5 ATR',
  'stopAtr:>1.5': '> 1,5 ATR',
  'plannedR:1-2': '1–2R',
  'plannedR:2-3': '2–3R',
  'plannedR:>3': '> 3R',
  'pierce:<0.25': '< 0,25 ATR',
  'pierce:>=0.25': '≥ 0,25 ATR',
  'deep:yes': 'да',
  'deep:no': 'нет',
};

export const valueText = (feature: FeatureKey, value: string): string =>
  VALUE_LABELS[`${feature}:${value}`] ?? value;

export const ruleText = (r: Rule): string => `${FEATURE_LABELS[r.feature]}: ${valueText(r.feature, r.value)}`;

export const OUTCOME_LABELS: Record<Outcome, string> = { target: 'цель', stop: 'стоп', time: 'срок' };
```

`model/rules.ts`:

```ts
export const VIDEO_1 = 'https://www.youtube.com/watch?v=E_V5B7jpEcY';
export const VIDEO_2 = 'https://www.youtube.com/watch?v=TS0rpBERanU';

export interface Step {
  title: string;
  /** Момент видео 1, секунды; нет — правило системы, а не автора. */
  at?: number;
  video: string;
  system: string;
}

/** Алгоритм для лонга; шорт — зеркально. Числа «как считает система» — из `backend/src/strategy`. */
export const STEPS: Step[] = [
  {
    title: 'Контекст старшего таймфрейма',
    at: 2282,
    video:
      'Анализ начинается с дневного и 4-часового графика: общая направленность, зоны интереса, путь от точки А к точке Б. Контекст важнее самого сетапа.',
    system:
      'Лонг — только при восходящей структуре 4H на момент решения. Дневная структура — признак для обучения, не фильтр: «точку Б» машина не выбирает.',
  },
  {
    title: 'Структура',
    at: 863,
    video: 'Тренд — HH и HL по пятисвечным свингам; слом — обновление HL, породившего последний HH.',
    system:
      'Пятисвечный фрактал; тренд меняется, когда свеча закрылась за последним подтверждённым свингом. «Сильный» и «слабый» HL не различаются.',
  },
  {
    title: 'Свип ликвидности',
    at: 470,
    video: 'Цена снимает уровень тенью без закрепления тела за ним — ликвидность забрали, ждём разворот.',
    system: 'Тень прошла за нетронутый свинг, закрытие — по свою сторону от всех проколотых уровней. Закрытие за уровнем — пробой.',
  },
  {
    title: 'Имбаланс и слом структуры',
    at: 482,
    video: 'Сразу после свипа — имбаланс и обновление пятисвечного свинга: A+ сетап.',
    system:
      'В 10 свечах после свипа: FVG, первая свеча которого не раньше свипа, и закрытие за последним свингом до свипа. Новый экстремум за свипом ломает сетап.',
  },
  {
    title: 'Премиум и дискаунт',
    at: 954,
    video: 'Покупать — только в дискаунте торгового диапазона, ниже уровня 0,5.',
    system: 'Вход в нижней половине отрезка «стоп → цель» — это ровно плановый R ≥ 1.',
  },
  {
    title: 'Ордерблок и вход',
    at: 1791,
    video:
      'Ордерблок — манипулятивная свеча после снятия ликвидности; граница — от тела до экстремума с тенью. Лимит от начала блока, стоп за его низом.',
    system:
      'Последняя медвежья свеча не дальше 5 свечей до лоу движения; лимит на верх её тела живёт 48 свечей; стоп — лоу движения.',
  },
  {
    title: 'Цели',
    at: 2214,
    video: 'Цели — предыдущий HH и ближайшее сопротивление выше.',
    system: 'Цель — ближайший нетронутый свинг-хай выше цены подтверждения. Не дошли за 3 суток — выход по закрытию свечи.',
  },
  {
    title: 'Исполнение и комиссия',
    video: 'Автор не описывает.',
    system:
      'Свеча, задевшая и стоп, и цель, разбирается по минуткам; в одной минутке — стоп. Комиссия Bybit: лимит и цель — 0,02 %, стоп и срок — 0,055 %.',
  },
];
```

- [ ] **Step 4: Run — PASS**

Run: `cd frontend && npx vitest run src/views/strategy`

- [ ] **Step 5: Page, rules section, route, nav, i18n, css**

`components/RulesSection.tsx`:

```tsx
'use client';

import { SectionHead } from '@/shared/ui/SectionHead';
import { clock } from '../model/format';
import { STEPS, VIDEO_1 } from '../model/rules';

/** Алгоритм автора шагами: как в видео и как правило понимает машина. */
export function RulesSection() {
  return (
    <section id="rules" className="st-section">
      <SectionHead title="Стратегия" />
      <p className="muted">
        «Интрадей стратегия с нуля» SanchoDT — для лонга, шорт зеркально. Слева — как в видео, справа — как
        правило считает система.
      </p>
      <ol className="st-steps">
        {STEPS.map((s) => (
          <li key={s.title}>
            <h3>
              {s.title}
              {s.at != null && (
                <a className="st-at" href={`${VIDEO_1}&t=${s.at}s`} target="_blank" rel="noreferrer">
                  {clock(s.at)}
                </a>
              )}
            </h3>
            <div className="st-step-cols">
              <p>
                <span className="lbl">В видео</span>
                {s.video}
              </p>
              <p>
                <span className="lbl">Система</span>
                {s.system}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
```

`Page.tsx` (секции задачи 11 подключены сразу; до задачи 11 вместо них — заглушки не нужны: задачи 10 и 11 коммитятся вместе, если сборка падает на отсутствующих импортах — выполнить задачу 11 до сборки):

```tsx
'use client';

import { useAuth } from '@/features/auth';
import { Wrap } from '@/shared/ui/Wrap';
import { PageHead } from '@/shared/ui/PageHead';
import { Seg } from '@/shared/ui/Seg';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { EmptyState } from '@/shared/ui/EmptyState';
import { SkeletonLines } from '@/shared/ui/Skeleton';
import { usePersistentValue } from '@/shared/lib/storage/usePersistentValue';
import { useStrategyReport } from './api/hooks';
import { fmtDateTime } from './model/format';
import { RulesSection } from './components/RulesSection';
import { BacktestSection } from './components/BacktestSection';
import { AuthorSection } from './components/AuthorSection';
import { LearningSection } from './components/LearningSection';
import { TheorySection } from './components/TheorySection';
import './strategy.css';

const THEORY_KEY = 'virex.admin.strategy.theory';
const decodeTheory = (raw: string | null) => raw !== '0';
const encodeTheory = (on: boolean) => (on ? null : '0');

/**
 * Стратегия владельца: правила из видео, готовый отчёт бектеста на истории BTC,
 * проверка цифр автора, обучение на ошибках и — выключаемо — теория.
 * Право проверяет бэкенд (AdminGuard); isAdmin — чтобы не слать заведомый 403.
 */
export function StrategyPage() {
  const { user, loading } = useAuth();
  const q = useStrategyReport(!!user?.isAdmin);
  const [theory, setTheory] = usePersistentValue(THEORY_KEY, decodeTheory, true, encodeTheory);
  const report = q.data?.report ?? null;
  const anchors: [string, string][] = [
    ['rules', 'Стратегия'],
    ['backtest', 'Бектест'],
    ['author', 'Цифры автора'],
    ['learning', 'Обучение'],
    ...(theory ? ([['theory', 'Теория']] as [string, string][]) : []),
  ];

  return (
    <Wrap page>
      <PageHead
        title="Стратегия"
        lede={
          report
            ? `Интрадей Smart Money на истории BTC. Отчёт посчитан ${fmtDateTime(Date.parse(report.computedAt))} UTC, пересчитывается раз в сутки.`
            : 'Интрадей Smart Money на истории BTC: правила, бектест, проверка цифр автора и обучение на ошибках.'
        }
      >
        <Seg
          ariaLabel="Теория"
          options={[
            { value: 'on', label: 'С теорией' },
            { value: 'off', label: 'Без теории' },
          ]}
          value={theory ? 'on' : 'off'}
          onChange={(v) => setTheory(v === 'on')}
        />
      </PageHead>
      <nav className="st-anchors" aria-label="Разделы">
        {anchors.map(([id, label]) => (
          <a key={id} href={`#${id}`}>
            {label}
          </a>
        ))}
      </nav>
      <RulesSection />
      <ErrorNote error={q.error} fallback="Отчёт не загрузился" />
      {loading || q.isLoading ? (
        <SkeletonLines />
      ) : report ? (
        <>
          <BacktestSection report={report} />
          <AuthorSection rows={report.author} />
          <LearningSection block={report.learning} />
          {theory && <TheorySection t={report.theory} />}
        </>
      ) : (
        <EmptyState title="Отчёт считается">
          {q.data?.computedAt
            ? `Правила изменились — отчёт пересчитывается. Прошлый расчёт — ${fmtDateTime(Date.parse(q.data.computedAt))} UTC.`
            : 'Первый расчёт идёт в фоне после запуска сервера; страница обновится сама.'}
        </EmptyState>
      )}
    </Wrap>
  );
}
```

`frontend/src/app/admin/(in)/strategy/page.tsx`:

```tsx
/** Стратегия — admin.<домен>/strategy. */
export { StrategyPage as default } from '@/views/strategy/Page';
```

`AdminChrome.tsx`: в импорт `lucide-react` добавить `FlaskConical`; в тип ключа добавить `| 'strategy'`; в `ITEMS` после пункта `plan`:

```tsx
  // Стратегия — отчёт бектеста и обучения (views/strategy).
  { href: '/strategy', key: 'strategy', icon: FlaskConical },
```

`ru.json` → `adminShell`: `"strategy": "Стратегия",` после `"plan"`; `en.json` → `"strategy": "Strategy",`.

`strategy.css`:

```css
/* Стратегия в админке (views/strategy). Префикс st-. */

.st-anchors {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s3);
  margin: var(--s2) 0 var(--s4);
}
.st-anchors a {
  color: var(--ink);
  text-decoration: none;
  border-bottom: 1px solid var(--hair);
}
.st-section {
  margin-top: var(--s5);
  scroll-margin-top: calc(var(--top-h) + var(--s3));
}
.st-sub {
  margin: var(--s4) 0 var(--s2);
  font-size: inherit;
}
.st-steps {
  padding-left: 1.2em;
}
.st-steps li {
  margin-bottom: var(--s4);
}
.st-steps h3 {
  margin: 0 0 var(--s1);
  font-size: inherit;
}
.st-at {
  margin-left: var(--s2);
  font-weight: normal;
  color: var(--ink-2);
}
.st-step-cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--s4);
}
.st-step-cols p {
  margin: 0;
}
.st-step-cols .lbl {
  display: block;
  margin-bottom: var(--s1);
}
.st-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: var(--s3);
  margin: var(--s3) 0;
}
.st-chart {
  margin: var(--s2) 0;
}
.st-chart svg {
  display: block;
}
.st-zero,
.st-mark {
  stroke: var(--hair);
  stroke-width: 1;
}
.st-mark {
  stroke-dasharray: 3 3;
}
.st-line {
  fill: none;
  stroke-width: 1.5;
}
.st-line-ink {
  stroke: var(--ink);
  color: var(--ink);
}
.st-line-muted {
  stroke: var(--ink-2);
  color: var(--ink-2);
}
.st-line-pos {
  stroke: var(--profit);
  color: var(--profit);
}
.st-line-neg {
  stroke: var(--loss);
  color: var(--loss);
}
.st-legend {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s3);
  margin-top: var(--s1);
  font-size: 0.85em;
}
.st-key::before {
  content: '';
  display: inline-block;
  width: 12px;
  height: 2px;
  margin-right: 6px;
  vertical-align: middle;
  background: currentColor;
}
.st-verdict {
  margin: var(--s3) 0;
  padding: var(--s2) var(--s3);
  border-left: 2px solid var(--ink);
}
.st-trade {
  padding: var(--s2) 0;
}
.st-trade svg {
  display: block;
  width: 100%;
  height: auto;
}
.st-candle-up {
  fill: var(--profit);
  stroke: var(--profit);
}
.st-candle-down {
  fill: var(--loss);
  stroke: var(--loss);
}
.st-lvl {
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
}
.st-lvl-entry {
  stroke: var(--ink);
  stroke-dasharray: 4 3;
}
.st-lvl-stop {
  stroke: var(--loss);
}
.st-lvl-target {
  stroke: var(--profit);
}
.st-lvl-pool {
  stroke: var(--ink-2);
  stroke-dasharray: 2 3;
}
.st-ob {
  fill: var(--ink);
  opacity: 0.08;
}
.st-tag {
  fill: var(--ink-2);
}

@media (max-width: 760px) {
  .st-step-cols {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 6: Commit** (вместе с задачей 11, если `Page.tsx` уже ссылается на её секции)

```bash
git add frontend/src/views/strategy "frontend/src/app/admin/(in)/strategy" "frontend/src/app/(internal)/AdminChrome.tsx" frontend/src/shared/i18n/messages/ru.json frontend/src/shared/i18n/messages/en.json
git commit -m "feat(strategy): страница стратегии в админке — каркас, правила, формат"
```

---

### Task 11: Фронт — секции отчёта

**Files:**
- Create: `frontend/src/views/strategy/components/LineChart.tsx`, `BacktestSection.tsx`, `TradeChart.tsx`, `AuthorSection.tsx`, `LearningSection.tsx`, `TheorySection.tsx`

**Interfaces:**
- Consumes: типы отчёта, хуки и формат задачи 10; `LedgerTable`, `LedgerColumn`, `Pagination`, `MetricCell`, `SectionHead`, `Skeleton`, `ErrorNote` из `shared/ui`.
- Produces: `LineChart({lines, marks?, height?})`, `BacktestSection({report})`, `TradeChart({trade})`, `AuthorSection({rows})`, `LearningSection({block})`, `TheorySection({t})`.

- [ ] **Step 1: `LineChart.tsx`**

```tsx
'use client';

export interface Line {
  label: string;
  values: number[];
  tone?: 'ink' | 'muted' | 'pos' | 'neg';
}

// Холст в своих единицах, ширина тянется листом (u = W / boxW): линии не
// толстеют от растяжения — non-scaling-stroke.
const W = 600;
const PAD = 6;

/** Линии по номеру точки с нулевой осью; подписи — легендой под графиком. */
export function LineChart({
  lines,
  marks = [],
  height = 180,
}: {
  lines: Line[];
  /** Вертикальные отметки по индексу точки. */
  marks?: { at: number; label: string }[];
  height?: number;
}) {
  const all = lines.flatMap((l) => l.values);
  if (!all.length) return <p className="muted">Сделок нет.</p>;
  let lo = 0;
  let hi = 0;
  for (const v of all) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const len = Math.max(...lines.map((l) => l.values.length));
  const x = (i: number) => (len > 1 ? (i / (len - 1)) * W : W / 2);
  const y = (v: number) => PAD + (1 - (v - lo) / (hi - lo || 1)) * (height - 2 * PAD);
  return (
    <figure className="st-chart">
      <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" width="100%" height={height} role="img">
        <line className="st-zero" x1={0} x2={W} y1={y(0)} y2={y(0)} vectorEffect="non-scaling-stroke" />
        {marks.map((m) => (
          <line
            key={m.label}
            className="st-mark"
            x1={x(m.at)}
            x2={x(m.at)}
            y1={0}
            y2={height}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {lines.map((l) => (
          <polyline
            key={l.label}
            className={`st-line st-line-${l.tone ?? 'ink'}`}
            points={l.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      <figcaption className="st-legend">
        {lines.map((l) => (
          <span key={l.label} className={`st-key st-line-${l.tone ?? 'ink'}`}>
            {l.label}
          </span>
        ))}
        {marks.map((m) => (
          <span key={m.label} className="muted">
            ┆ {m.label}
          </span>
        ))}
        <span className="muted">
          от {lo.toFixed(1)} до {hi.toFixed(1)}
        </span>
      </figcaption>
    </figure>
  );
}
```

- [ ] **Step 2: `TradeChart.tsx`**

```tsx
'use client';

import { Skeleton } from '@/shared/ui/Skeleton';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { useTradeCandles } from '../api/hooks';
import type { TradeRow } from '../api/types';
import { fmtPrice, OUTCOME_LABELS } from '../model/format';

const CW = 6;
const H = 260;

/**
 * Сделка на свечах ТФ сетапа: уровень ликвидности, свип, FVG, BOS, ордерблок,
 * вход, стоп, цель и выход — чтобы глазами сверить, как система поняла правила.
 */
export function TradeChart({ trade }: { trade: TradeRow }) {
  const q = useTradeCandles(trade);
  if (q.isLoading) return <Skeleton height={H} />;
  if (q.error) return <ErrorNote error={q.error} fallback="Свечи не загрузились" />;
  const cs = q.data ?? [];
  if (!cs.length) return <p className="muted">Свечей за этот отрезок нет.</p>;

  const times = cs.map((c) => Date.parse(c.time));
  const W = cs.length * CW;
  let lo = Math.min(trade.stop, trade.target, trade.level);
  let hi = Math.max(trade.stop, trade.target, trade.level);
  for (const c of cs) {
    lo = Math.min(lo, c.low);
    hi = Math.max(hi, c.high);
  }
  const y = (p: number) => 10 + (1 - (p - lo) / (hi - lo || 1)) * (H - 20);
  const idx = (ms: number) => {
    let k = 0;
    while (k + 1 < times.length && times[k + 1] <= ms) k++;
    return k;
  };
  const cx = (k: number) => k * CW + CW / 2;
  const sweep = idx(trade.sweepMs);
  const confirm = idx(trade.confirmMs - trade.tf * 60_000);
  const exit = idx(trade.exitMs - 1);
  const fill = idx(trade.fillMs);
  const ob = idx(trade.obMs);
  const font = Math.max(9, W / 90);
  const tags: [number | null, string][] = [
    [sweep, 'свип'],
    [trade.fvgMs != null ? idx(trade.fvgMs) : null, 'FVG'],
    [trade.bosMs != null ? idx(trade.bosMs) : null, 'BOS'],
  ];

  return (
    <div className="st-trade">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Сделка на графике">
        <rect
          className="st-ob"
          x={cx(ob) - CW / 2}
          width={cx(exit) - cx(ob) + CW}
          y={y(Math.max(trade.entry, trade.stop))}
          height={Math.abs(y(trade.stop) - y(trade.entry))}
        />
        <line className="st-lvl st-lvl-pool" x1={0} x2={cx(sweep)} y1={y(trade.level)} y2={y(trade.level)} />
        {cs.map((c, k) => {
          const up = c.close >= c.open;
          return (
            <g key={c.time} className={up ? 'st-candle-up' : 'st-candle-down'}>
              <line x1={cx(k)} x2={cx(k)} y1={y(c.high)} y2={y(c.low)} strokeWidth={1} />
              <rect
                x={k * CW + 1}
                width={CW - 2}
                y={y(Math.max(c.open, c.close))}
                height={Math.max(1, Math.abs(y(c.open) - y(c.close)))}
              />
            </g>
          );
        })}
        {(
          [
            ['entry', trade.entry],
            ['stop', trade.stop],
            ['target', trade.target],
          ] as const
        ).map(([k, p]) => (
          <line key={k} className={`st-lvl st-lvl-${k}`} x1={cx(confirm)} x2={cx(exit)} y1={y(p)} y2={y(p)} />
        ))}
        {tags.map(([k, label]) =>
          k == null ? null : (
            <text key={label} className="st-tag" x={cx(k)} y={font} fontSize={font} textAnchor="middle">
              {label}
            </text>
          ),
        )}
        <circle cx={cx(fill)} cy={y(trade.fill)} r={CW / 2} className="st-tag" />
        <circle cx={cx(exit)} cy={y(trade.exit)} r={CW / 2} className="st-tag" />
      </svg>
      <p className="muted">
        Вход {fmtPrice(trade.fill)}, стоп {fmtPrice(trade.stop)}, цель {fmtPrice(trade.target)}, уровень ликвидности{' '}
        {fmtPrice(trade.level)}; выход {fmtPrice(trade.exit)} — {OUTCOME_LABELS[trade.outcome]}. Время — UTC.
      </p>
    </div>
  );
}
```

- [ ] **Step 3: `BacktestSection.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { SectionHead } from '@/shared/ui/SectionHead';
import { MetricCell } from '@/shared/ui/MetricCell';
import { LedgerTable, type LedgerColumn } from '@/shared/ui/LedgerTable';
import { Pagination } from '@/shared/ui/Pagination';
import type { StrategyReport, TradeRow, VariantRow, YearRow } from '../api/types';
import { fmtDate, fmtDateTime, fmtInt, fmtNum, fmtPct, fmtPrice, fmtR, OUTCOME_LABELS, tone } from '../model/format';
import { LineChart } from './LineChart';
import { TradeChart } from './TradeChart';

const PAGE = 25;

const variantColumns: LedgerColumn<VariantRow>[] = [
  { key: 'label', header: 'Вариант', render: (v) => v.label },
  { key: 'setups', header: 'Сетапов', align: 'right', cellClassName: 'n', render: (v) => fmtInt(v.setups) },
  { key: 'n', header: 'Сделок', align: 'right', cellClassName: 'n', render: (v) => fmtInt(v.summary.n) },
  { key: 'wr', header: 'Винрейт', align: 'right', cellClassName: 'n', render: (v) => fmtPct(v.summary.winrate) },
  { key: 'be', header: 'Безубыточный', align: 'right', cellClassName: 'n', render: (v) => fmtPct(v.summary.breakeven) },
  {
    key: 'exp',
    header: 'Мат ожидание',
    align: 'right',
    cellClassName: 'n',
    render: (v) => <span className={tone(v.summary.expectancy)}>{fmtR(v.summary.expectancy)}</span>,
  },
  { key: 'gross', header: 'До комиссии', align: 'right', cellClassName: 'n', render: (v) => fmtR(v.grossExpectancy) },
  { key: 'pf', header: 'PF', align: 'right', cellClassName: 'n', render: (v) => fmtNum(v.summary.pf) },
  { key: 'dd', header: 'Просадка 1 %', align: 'right', cellClassName: 'n', render: (v) => fmtPct(v.maxDd1) },
  {
    key: 'sum',
    header: 'Итог',
    align: 'right',
    cellClassName: 'n',
    render: (v) => <span className={tone(v.summary.sumR)}>{fmtR(v.summary.sumR)}</span>,
  },
];

const yearColumns: LedgerColumn<YearRow>[] = [
  { key: 'year', header: 'Год', render: (y) => y.year },
  { key: 'n', header: 'Сделок', align: 'right', cellClassName: 'n', render: (y) => fmtInt(y.summary.n) },
  { key: 'wr', header: 'Винрейт', align: 'right', cellClassName: 'n', render: (y) => fmtPct(y.summary.winrate) },
  {
    key: 'exp',
    header: 'Мат ожидание',
    align: 'right',
    cellClassName: 'n',
    render: (y) => <span className={tone(y.summary.expectancy)}>{fmtR(y.summary.expectancy)}</span>,
  },
  {
    key: 'sum',
    header: 'Итог',
    align: 'right',
    cellClassName: 'n',
    render: (y) => <span className={tone(y.summary.sumR)}>{fmtR(y.summary.sumR)}</span>,
  },
];

const tradeColumns: LedgerColumn<TradeRow>[] = [
  { key: 'date', header: 'Вход (UTC)', render: (t) => fmtDateTime(t.fillMs) },
  { key: 'dir', header: 'Сторона', render: (t) => (t.dir === 1 ? 'Лонг' : 'Шорт') },
  { key: 'entry', header: 'Вход', align: 'right', cellClassName: 'n', render: (t) => fmtPrice(t.fill) },
  { key: 'stop', header: 'Стоп', align: 'right', cellClassName: 'n', render: (t) => fmtPrice(t.stop) },
  { key: 'target', header: 'Цель', align: 'right', cellClassName: 'n', render: (t) => fmtPrice(t.target) },
  { key: 'plan', header: 'План', align: 'right', cellClassName: 'n', render: (t) => fmtR(t.plannedR) },
  { key: 'outcome', header: 'Выход', render: (t) => OUTCOME_LABELS[t.outcome] },
  {
    key: 'r',
    header: 'R',
    align: 'right',
    cellClassName: 'n',
    render: (t) => <span className={tone(t.rNet)}>{fmtR(t.rNet)}</span>,
  },
];

/** Сводка основного варианта, варианты рядом, кривая, годы и сделки с графиком. */
export function BacktestSection({ report }: { report: StrategyReport }) {
  const { variant, equity, byYear, trades } = report.main;
  const s = variant.summary;
  const [page, setPage] = useState(1);
  const newestFirst = [...trades].reverse();

  return (
    <section id="backtest" className="st-section">
      <SectionHead title="Бектест" />
      <p className="muted">
        BTCUSDT, {fmtDate(report.dataFrom)} — {fmtDate(report.dataTo)}. Основной вариант: сетап на 15m, контекст 4H,
        свип + имбаланс + слом, вход от верха ордерблока, цель — ликвидность сверху. Одна позиция за раз, R — после
        комиссии Bybit.
      </p>
      <div className="st-metrics">
        <MetricCell label="Сделок" value={fmtInt(s.n)} sub={`сетапов ${fmtInt(variant.setups)}, исполнено ${fmtInt(variant.filled)}`} />
        <MetricCell label="Винрейт" value={fmtPct(s.winrate)} sub={`безубыточный ${fmtPct(s.breakeven)}`} />
        <MetricCell
          label="Мат ожидание"
          value={fmtR(s.expectancy)}
          tone={tone(s.expectancy)}
          sub={`до комиссии ${fmtR(variant.grossExpectancy)}`}
        />
        <MetricCell label="Профит-фактор" value={fmtNum(s.pf)} />
        <MetricCell label="Просадка при риске 1 %" value={fmtPct(variant.maxDd1)} />
        <MetricCell label="Итог" value={fmtR(s.sumR)} tone={tone(s.sumR)} />
      </div>

      <h3 className="st-sub">Кривая счёта — накопленный R по номеру сделки</h3>
      <LineChart lines={[{ label: 'Основной', values: equity.map((p) => p.r) }]} />

      <h3 className="st-sub">Варианты</h3>
      <p className="muted">
        Каждый отличается от основного одним правилом. «Сетапов» — сколько нашлось, сводка — по сделкам одной позиции за
        раз.
      </p>
      <LedgerTable columns={variantColumns} rows={report.variants} rowKey={(v) => v.id} minWidth={980} />

      <h3 className="st-sub">По годам</h3>
      <LedgerTable columns={yearColumns} rows={byYear} rowKey={(y) => String(y.year)} />

      <h3 className="st-sub">Сделки — строка открывает график</h3>
      <LedgerTable
        columns={tradeColumns}
        rows={newestFirst.slice((page - 1) * PAGE, page * PAGE)}
        rowKey={(t) => t.id}
        renderExpanded={(t) => <TradeChart trade={t} />}
        minWidth={860}
        empty="Сделок нет"
      />
      <Pagination
        page={page}
        pageSize={PAGE}
        total={newestFirst.length}
        onPrev={() => setPage((p) => Math.max(1, p - 1))}
        onNext={() => setPage((p) => p + 1)}
      />
    </section>
  );
}
```

- [ ] **Step 4: `AuthorSection.tsx`**

```tsx
'use client';

import { SectionHead } from '@/shared/ui/SectionHead';
import { LedgerTable, type LedgerColumn } from '@/shared/ui/LedgerTable';
import type { AuthorRow, Share } from '../api/types';
import { fmtInt, fmtPct } from '../model/format';
import { VIDEO_1 } from '../model/rules';

const shareText = (x: Share | null) =>
  x == null || x.share == null
    ? '—'
    : `${fmtPct(x.share)} (${fmtPct(x.lo, 0)}–${fmtPct(x.hi, 0)}), n = ${fmtInt(x.n)}`;

const columns: LedgerColumn<AuthorRow>[] = [
  { key: 'label', header: 'Условие', render: (r) => r.label },
  { key: 'author', header: 'Автор', align: 'right', cellClassName: 'n', render: (r) => fmtPct(r.author) },
  { key: 'event', header: 'BTC, от события', align: 'right', cellClassName: 'n', render: (r) => shareText(r.fromEvent) },
  { key: 'base', header: 'Сам рынок', align: 'right', cellClassName: 'n', render: (r) => fmtPct(r.fromEvent.base) },
  {
    key: 'confirm',
    header: 'BTC, от подтверждения',
    align: 'right',
    cellClassName: 'n',
    render: (r) => shareText(r.fromConfirm),
  },
];

/** Статистика автора против BTC: исход — какая граница ±1 ATR задета первой. */
export function AuthorSection({ rows }: { rows: AuthorRow[] }) {
  return (
    <section id="author" className="st-section">
      <SectionHead title="Цифры автора" />
      <p className="muted">
        Автор называет проценты по 88 активам на 1H с 2020 года, не говоря, что считает разворотом (
        <a href={`${VIDEO_1}&t=332s`} target="_blank" rel="noreferrer">
          5:32
        </a>
        ). Здесь — BTC, 1H, с 2018: исход — какая граница ±1 ATR от закрытия задета первой за 24 свечи; обе в одной свече
        или ни одной — в счёт не идёт. «Сам рынок» — тот же тест от каждой свечи: столько даёт BTC без всякого сигнала. В
        скобках — 95 % интервал.
      </p>
      <p className="muted">
        У свипа с условием два столбца. «От события» — исход от закрытия свипа, а условие ждём после: слом вверх «после
        свипа» уже значит, что цена пошла вверх, и процент завышается сам собой — так, по-видимому, считал автор. «От
        подтверждения» — от свечи, на которой условие выполнилось: только это число можно использовать для входа.
      </p>
      <LedgerTable columns={columns} rows={rows} rowKey={(r) => r.key} minWidth={900} />
    </section>
  );
}
```

- [ ] **Step 5: `LearningSection.tsx`**

```tsx
'use client';

import { SectionHead } from '@/shared/ui/SectionHead';
import { LedgerTable, type LedgerColumn } from '@/shared/ui/LedgerTable';
import type { LearningBlock, Mistake, QuarterRow, SystemBlock } from '../api/types';
import { fmtDate, fmtInt, fmtPct, fmtR, ruleText, tone, valueText, FEATURE_LABELS } from '../model/format';
import { LineChart } from './LineChart';

const rules = (list: QuarterRow['rules']) => (list.length ? list.map(ruleText).join('; ') : '—');

const quarterColumns: LedgerColumn<QuarterRow>[] = [
  { key: 'key', header: 'Квартал', render: (q) => q.key },
  { key: 'rules', header: 'Правила квартала', render: (q) => rules(q.rules) },
  { key: 'added', header: 'Добавлены', render: (q) => rules(q.added) },
  { key: 'removed', header: 'Сняты', render: (q) => rules(q.removed) },
  { key: 'train', header: 'Обучение', align: 'right', cellClassName: 'n', render: (q) => fmtInt(q.trainN) },
  { key: 'trades', header: 'Сделок', align: 'right', cellClassName: 'n', render: (q) => fmtInt(q.trades) },
  { key: 'excluded', header: 'Отсечено', align: 'right', cellClassName: 'n', render: (q) => fmtInt(q.excluded) },
];

const mistakeColumns: LedgerColumn<Mistake>[] = [
  { key: 'f', header: 'Признак', render: (m) => FEATURE_LABELS[m.feature] },
  { key: 'v', header: 'Корзина', render: (m) => valueText(m.feature, m.value) },
  { key: 'n', header: 'Сделок', align: 'right', cellClassName: 'n', render: (m) => fmtInt(m.n) },
  {
    key: 'mean',
    header: 'Средний R',
    align: 'right',
    cellClassName: 'n',
    render: (m) => <span className={tone(m.mean)}>{fmtR(m.mean)}</span>,
  },
  { key: 'ci', header: '95 % интервал', align: 'right', cellClassName: 'n', render: (m) => `${fmtR(m.lo)} … ${fmtR(m.hi)}` },
];

interface SysRow {
  key: string;
  label: string;
  b: SystemBlock;
}
const sysColumns: LedgerColumn<SysRow>[] = [
  { key: 'label', header: 'Система', render: (r) => r.label },
  { key: 'n', header: 'Сделок', align: 'right', cellClassName: 'n', render: (r) => fmtInt(r.b.summary.n) },
  { key: 'wr', header: 'Винрейт', align: 'right', cellClassName: 'n', render: (r) => fmtPct(r.b.summary.winrate) },
  {
    key: 'exp',
    header: 'Мат ожидание',
    align: 'right',
    cellClassName: 'n',
    render: (r) => <span className={tone(r.b.summary.expectancy)}>{fmtR(r.b.summary.expectancy)}</span>,
  },
  { key: 'dd', header: 'Просадка 1 %', align: 'right', cellClassName: 'n', render: (r) => fmtPct(r.b.maxDd1) },
  {
    key: 'sum',
    header: 'Итог',
    align: 'right',
    cellClassName: 'n',
    render: (r) => <span className={tone(r.b.summary.sumR)}>{fmtR(r.b.summary.sumR)}</span>,
  },
];

function verdict(b: LearningBlock): string {
  const e = b.effect;
  if (e.n === 0) return 'Правила ещё ни разу не отсекали сетапы вперёд — судить не о чем.';
  const range = `${e.n} сетапов, средний R ${fmtR(e.mean)}, 95 % интервал ${fmtR(e.lo)} … ${fmtR(e.hi)}`;
  if (e.verdict === 'helped') return `Правила помогли: сетапы, которые они отсекли на следующих кварталах, уверенно теряли (${range}).`;
  if (e.verdict === 'hurt') return `Правила вредят: отсечённые ими сетапы на следующих кварталах были прибыльными (${range}).`;
  return `Эффект не доказан: отсечённые сетапы на следующих кварталах в пределах шума (${range}).`;
}

/** Обучение на ошибках: правила кварталов, проверка вперёд, типичные ошибки. */
export function LearningSection({ block }: { block: LearningBlock }) {
  return (
    <section id="learning" className="st-section">
      <SectionHead title="Обучение на ошибках" />
      <p className="muted">
        Раз в квартал с {fmtDate(block.fromMs)} система разбирает свои закрытые сделки по восьми признакам и вводит
        правило «не брать такие сетапы», если сделки с признаком уверенно убыточны: не меньше 20, средний R ниже нуля
        вместе с 95 % интервалом. Правило применяется только к следующему кварталу — к сетапам, которых при обучении ещё
        не было; каждый квартал правила выводятся заново.
      </p>
      <p className="st-verdict">{verdict(block)}</p>
      <LedgerTable
        columns={sysColumns}
        rows={[
          { key: 'base', label: 'Без обучения', b: block.base },
          { key: 'learned', label: 'С обучением', b: block.learned },
        ]}
        rowKey={(r) => r.key}
      />
      <LineChart
        lines={[
          { label: 'Без обучения', values: block.base.equity.map((p) => p.r), tone: 'muted' },
          { label: 'С обучением', values: block.learned.equity.map((p) => p.r) },
        ]}
      />
      <h3 className="st-sub">Правила на {block.next.key}</h3>
      <p>{block.next.rules.length ? block.next.rules.map(ruleText).join('; ') : 'Правил нет — уверенно убыточных корзин не нашлось.'}</p>
      <h3 className="st-sub">Кварталы</h3>
      <LedgerTable columns={quarterColumns} rows={[...block.quarters].reverse()} rowKey={(q) => q.key} minWidth={900} />
      <h3 className="st-sub">Типичные ошибки за всю историю</h3>
      <p className="muted">Диагностика, а не правило: корзина становится правилом, только пройдя проверку вперёд.</p>
      <LedgerTable columns={mistakeColumns} rows={block.mistakes} rowKey={(m) => `${m.feature}:${m.value}`} empty="Убыточных корзин нет" />
    </section>
  );
}
```

- [ ] **Step 6: `TheorySection.tsx`**

```tsx
'use client';

import { SectionHead } from '@/shared/ui/SectionHead';
import { LedgerTable, type LedgerColumn } from '@/shared/ui/LedgerTable';
import type { TheoryBlock } from '../api/types';
import { fmtNum, fmtPct, fmtR, fmtUsd, tone } from '../model/format';
import { VIDEO_2 } from '../model/rules';
import { LineChart, type Line } from './LineChart';

const TONES: Line['tone'][] = ['neg', 'ink', 'pos'];

/** «Трейдинг = математика» (КриптоБош) на сделках основного варианта. */
export function TheorySection({ t }: { t: TheoryBlock }) {
  const e = t.expectancy;
  const at = (n: number) => t.running.find((p) => p.n === n);
  const last = t.running[t.running.length - 1];
  const marks = [20, 100]
    .map((n) => ({ n, i: t.running.findIndex((p) => p.n === n) }))
    .filter((m) => m.i >= 0)
    .map((m) => ({ at: m.i, label: `${m.n} сделок` }));
  const beColumns: LedgerColumn<{ r: number; winrate: number }>[] = [
    { key: 'r', header: 'Цель', render: (x) => `${x.r}R` },
    { key: 'wr', header: 'Нужный винрейт', align: 'right', cellClassName: 'n', render: (x) => fmtPct(x.winrate, 0) },
  ];
  const ruinColumns: LedgerColumn<{ risk: number; p: number }>[] = [
    { key: 'risk', header: 'Риск на сделку', render: (x) => fmtPct(x.risk) },
    {
      key: 'p',
      header: `Шанс просадки 50 % за ${t.ruin.trades} сделок`,
      align: 'right',
      cellClassName: 'n',
      render: (x) => fmtPct(x.p),
    },
  ];
  const asymColumns: LedgerColumn<{ loss: number; need: number }>[] = [
    { key: 'loss', header: 'Потеря', render: (x) => fmtPct(x.loss, 0) },
    { key: 'need', header: 'Нужно, чтобы вернуться', align: 'right', cellClassName: 'n', render: (x) => `+${fmtPct(x.need, 0)}` },
  ];

  return (
    <section id="theory" className="st-section">
      <SectionHead title="Теория: трейдинг = математика" />
      <p className="muted">
        Принципы видео{' '}
        <a href={VIDEO_2} target="_blank" rel="noreferrer">
          «Трейдинг = математика»
        </a>{' '}
        на сделках основного варианта. Блок выключается переключателем вверху страницы.
      </p>

      <h3 className="st-sub">1. Мат ожидание</h3>
      <p>
        Винрейт × средняя прибыль − доля убыточных × средний убыток = {fmtPct(e.winrate)} × {fmtNum(e.avgWin)}R −{' '}
        {fmtPct(1 - e.winrate)} × {fmtNum(e.avgLoss)}R = <span className={tone(e.net)}>{fmtR(e.net)}</span> на сделку, при
        риске $100 — {fmtUsd(e.net * 100)}. До комиссии было {fmtR(e.gross)}: мат ожидание на бумаге и на счёте — разные
        числа.
      </p>

      <h3 className="st-sub">2. Безубыточный винрейт</h3>
      <LedgerTable columns={beColumns} rows={t.breakeven.table} rowKey={(x) => String(x.r)} />
      <p>
        Средняя прибыль стратегии — {fmtNum(t.breakeven.avgWin)}R: ей нужен винрейт {fmtPct(t.breakeven.needed)}, а он{' '}
        <span className={t.breakeven.winrate > t.breakeven.needed ? 'pos' : 'neg'}>{fmtPct(t.breakeven.winrate)}</span>.
      </p>

      <h3 className="st-sub">3. Сколько сделок нужно, чтобы судить</h3>
      <LineChart lines={[{ label: 'Среднее R после N сделок', values: t.running.map((p) => p.mean) }]} marks={marks} />
      <p>
        После 20 сделок среднее — {fmtR(at(20)?.mean)}, после 100 — {fmtR(at(100)?.mean)}, за всю историю —{' '}
        {fmtR(last?.mean)}. Первые десятки сделок — шум.
      </p>

      <h3 className="st-sub">4. Вариативность</h3>
      <LineChart
        lines={t.variance.paths.map((p, i) => ({ label: p.label, values: p.points, tone: TONES[i] }))}
      />
      <p>
        {t.variance.sims} перестановок тех же сделок: одна система, разный опыт. Самая длинная серия минусов в истории —{' '}
        {t.variance.maxStreak} подряд; такая или длиннее встречается в {fmtPct(t.variance.pStreak)} перестановок. Рынок
        не помнит прошлых сделок: после серии минусов шанс следующей тот же.
      </p>

      <h3 className="st-sub">5. Риск и объём позиции</h3>
      <p>
        Объём = риск в долларах / размер стопа. Счёт {fmtUsd(t.sizing.account)}, риск {fmtPct(t.sizing.riskPct)} ={' '}
        {fmtUsd(t.sizing.riskUsd)}; медианный стоп стратегии — {fmtPct(t.sizing.stopPct, 2)} от входа, значит позиция{' '}
        {fmtUsd(t.sizing.position)}. 20 минусов подряд: при риске {fmtPct(t.sizing.streak20[0].risk, 0)} — минус{' '}
        {fmtPct(t.sizing.streak20[0].loss)} счёта, при {fmtPct(t.sizing.streak20[1].risk, 0)} — минус{' '}
        {fmtPct(t.sizing.streak20[1].loss)}.
      </p>

      <h3 className="st-sub">6. Риск разорения</h3>
      <LedgerTable columns={ruinColumns} rows={t.ruin.rows} rowKey={(x) => String(x.risk)} />
      <p className="muted">{t.ruin.sims} случайных последовательностей из сделок стратегии.</p>

      <h3 className="st-sub">7. Асимметрия убытков</h3>
      <LedgerTable columns={asymColumns} rows={t.asymmetry.table} rowKey={(x) => String(x.loss)} />
      <p>
        Макс. просадка стратегии при риске 1 % — {fmtPct(t.asymmetry.maxDd1)}; чтобы её отыграть, нужно +
        {fmtPct(t.asymmetry.need)}.
      </p>
    </section>
  );
}
```

- [ ] **Step 7: Проверка фронта**

Run: `cd frontend && npx vitest run src/views/strategy && npx tsc --noEmit && npx eslint src/views/strategy "src/app/(internal)/AdminChrome.tsx"`
Expected: тесты зелёные, ошибок типов и линта нет.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/views/strategy
git commit -m "feat(strategy): секции отчёта — бектест, цифры автора, обучение, теория"
```

---

### Task 12: Документация, сборки, живой прогон

**Files:**
- Create: `frontend/src/views/strategy/README.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: `README.md` раздела**

```markdown
# Стратегия (админка)

Раздел владельца на `admin.<домен>/strategy`: интрадей Smart Money из видео SanchoDT на истории BTC —
формализованные правила, готовый отчёт бектеста с вариантами, проверка цифр автора, обучение на ошибках
с проверкой вперёд и выключаемая теория «Трейдинг = математика». Спека —
`docs/superpowers/specs/2026-10-30-strategy-lab-design.md`.

Раздел изолирован: весь код — этот каталог и `backend/src/strategy/`. Продукт от него не зависит.

## Где что

- Движок — чистые функции `backend/src/strategy/` (`series` → `events` → `setups` → `simulate`,
  `author-check`, `learning`, `theory`, `report`). Отчёт считает `worker` раз в сутки
  (`strategy-report.service.ts`) и пишет в `strategy_reports`; `api` только отдаёт.
- `api/types.ts` — копия `backend/src/strategy/report.types.ts`, правятся вместе.
- Правка правил, обучения или формы отчёта — поднять `STRATEGY_VERSION` в `report.ts`: отчёт пересчитается сам.

## Точки подключения

1. `backend/src/app.module.ts` — `StrategyModule` в `imports`.
2. `frontend/src/app/(internal)/AdminChrome.tsx` — пункт `strategy` в `ITEMS`; ключ
   `adminShell.strategy` в `frontend/src/shared/i18n/messages/{ru,en}.json`.
3. `frontend/src/app/admin/(in)/strategy/` — файл маршрута.
4. `backend/prisma/schema.prisma` — блок между метками `═══ strategy ═══` и `═══ /strategy ═══`.

## Снести

1. Удалить `frontend/src/views/strategy/`, `frontend/src/app/admin/(in)/strategy/`, `backend/src/strategy/`.
2. Убрать точки подключения 1, 2 и блок схемы (4).
3. На базе: `DROP TABLE strategy_reports;`
```

- [ ] **Step 2: `CLAUDE.md`**

В разделе «Стек и структура», в описании роли `worker`: «тринадцать фоновых сервисов — … `hl-scout` —» → «четырнадцать фоновых сервисов — … `hl-scout`, `strategy-report` —»; «каждого из тринадцати сервисов» → «каждого из четырнадцати сервисов». После раздела «План дня в админке (2026-10-23)» добавить:

```markdown
## Стратегия в админке (2026-10-30)

`admin.<домен>/strategy` — интрадей Smart Money из видео SanchoDT на истории BTC: правила, готовый
отчёт бектеста (варианты рядом, настроек нет), проверка цифр автора, обучение на ошибках и выключаемая
теория «Трейдинг = математика» (видео КриптоБош). Спека —
`docs/superpowers/specs/2026-10-30-strategy-lab-design.md`. Изолирован, как учебник: `views/strategy/` и
`backend/src/strategy/`, снос — `views/strategy/README.md`.

- **Отчёт считает `worker`** (`strategy-report`) раз в сутки и сразу при другой `STRATEGY_VERSION`, пишет JSON
  в `strategy_reports`; `api` только отдаёт. Правка правил, обучения или формы отчёта — поднять версию.
- **Детекция не заглядывает в будущее**: свинг известен на закрытии i+2, контекст — последняя закрытая
  старшая свеча, тесты сверяют с обрезанным рядом. Спорная свеча (стоп и цель) — по минуткам, в одной
  минутке — стоп.
- **Обучение — только с проверкой вперёд**: правила квартала выводятся из сделок, закрытых до его начала,
  и применяются к следующему кварталу; вердикт — по отсечённым вперёд сделкам. «Улучшение» на той же
  истории, на которой проверяют, не показывать.
- **Цифры автора — два столбца**: от свипа (как, видимо, у автора — завышено условием «после») и от
  подтверждения (честно).
- Скриншотов из видео на странице нет — ссылки на таймкоды; как правило понято машиной, показывает график
  настоящей сделки.
```

- [ ] **Step 3: Сборки**

Run: `cd backend && npx tsc --noEmit -p tsconfig.json && npx jest src/strategy` и `cd frontend && npx next build`
Expected: обе сборки зелёные (новый маршрут — `next build` обязателен).

- [ ] **Step 4: Живой прогон расчёта на локальной базе**

Локально (`ROLE=all`): поднять бэкенд, дождаться в логе `отчёт стратегии: N сделок, T с` (первый расчёт — через минуту после старта). Проверить строку: `select id, version, computed_at, pg_column_size(data) from strategy_reports;`. Открыть `admin.localhost:<порт>/strategy` (вход владельцем): числа в разумных пределах (сделок — сотни, винрейт 20–70 %, нет NaN), три-четыре сделки раскрыть и сверить график с правилами глазами (свип за уровнем, FVG и BOS после, вход у верха блока, стоп у лоу, цель у свинг-хая). Если в локальной базе нет минуток с 2018 — отметить это: спорные свечи тогда разбираются худшим исходом.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/strategy/README.md CLAUDE.md
git commit -m "docs(strategy): README раздела и CLAUDE.md"
```

### ▶ Контрольная точка 2 (B): сервис, фронт, стык

Ревьюер Sonnet: выдержка плана (задачи 9–12) + дифф `backend/src/strategy/strategy*`, `backend/prisma/schema.prisma`, `backend/src/app.module.ts`, `frontend/src/views/strategy`, `AdminChrome.tsx`, i18n. Фокус: копия типов совпадает с `report.types.ts`; guard'ы и роль `worker`; таймеры снимаются; загрузка свечей постранично; пустая база; страница без отчёта; переключатель теории; строгий TS фронта; правила фронта (`shared/ui`, без инлайновых цветов, своё SVG).
