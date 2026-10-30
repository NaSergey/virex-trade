# Стратегия в админке v2 — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** перевести стратегию на сетку входа (4 лимита) и сетку тейков (3 лимита) со стопом за тейками, план 3–5R, фильтр по вероятности успеха у лонгов и шортов и денежные итоги «с теорией / без теории».

**Architecture:** меняются чистые функции движка `backend/src/strategy` (setups, simulate, report) и добавляются `odds.ts` и `money.ts`; форма отчёта меняется вместе с копией типов на фронте; `STRATEGY_VERSION` = 2 — прод пересчитает отчёт сам.

**Tech Stack:** NestJS (jest), Next.js (vitest).

**Спека:** `docs/superpowers/specs/2026-10-30-strategy-lab-v2-design.md` (дополняет v1).

## Global Constraints

- Сетка входа: уровни `верх − k·h`, k ∈ {0; 0,25; 0,5; 0,75}, равный объём; снимается, если ни один не исполнился за 48 свечей, и после первого тейка.
- План 3–5R от первого ордера: ликвидность ближе 3R — пропуск, дальше 5R — цель на 5R.
- Тейки на 1/3, 2/3, 3/3 пути от верха до цели, каждый — равная доля открытого; стоп после первого — средняя цена входа, после второго — первый тейк; только подтягивается.
- 1R — плановый риск всей сетки; комиссия: входы и тейки — мейкер 0,02 %, стоп и срок — тейкер 0,055 %.
- Спорная свеча (вниз и вверх) — по минуткам; в спорной минутке: стоп задет — сначала вниз; иначе тейки, потом откат.
- Фильтр по вероятности — у лонгов и шортов: прошлые сделки той же стороны, закрытые до подтверждения, та же дневная структура (< 30 — вся сторона; < 30 — без оценки, берётся); `p < нужно` — пропуск.
- Деньги: счёт $1000; с теорией — 1 % текущего счёта; без теории — одинаковый объём, `$1000 · 1 % / медианный стоп`; счёт в ноль — торговля кончилась.
- Копия `report.types.ts` на фронте — дословно; тексты страницы — по-русски во вью.

## Разметка риска и контрольные точки

| Задачи | Класс | Почему |
|---|---|---|
| 1–4 движок | A | исполнение многоордерной сделки, фильтр без заглядывания вперёд |
| 5 фронт | B | контракт отчёта бэк ↔ фронт |
| 6 документация и прогон | C | — |

Контрольная точка 1 — после задачи 4; контрольная точка 2 — после задачи 6 (включает стык).

---

### Task 1: Сетапы v2 и общий `thin`

**Files:**
- Modify: `backend/src/strategy/stats.ts` (добавить `thin`), `backend/src/strategy/theory.ts` (брать `thin` из stats), `backend/src/strategy/report.types.ts` (новая форма — целиком, ниже), `backend/src/strategy/setups.ts` (целиком, ниже)
- Test: `backend/src/strategy/stats.spec.ts` (тест `thin`), `backend/src/strategy/setups.spec.ts` (целиком, ниже)

**Interfaces:**
- Produces: `thin<T>(xs, max?)`; `MIN_R = 3`, `MAX_R = 5`, `GRID_STEPS`, `TAKE_STEPS`; `Variant {id, label, tf, fvg, bos, context, grid, odds}`; `VARIANTS` (8); `Setup {id, dir, sweepI, fvgI, bosI, e, obI, level, entries, stop, target, takes, trail, plannedR, features}`; типы `Outcome` ('target'|'stop'|'trail'|'time'), `OddsCheck`, `OddsSide`, `OddsBlock`, `MoneyBlock`, `TradeRow` v2, `StrategyReport` v2.

- [ ] **Step 1: `report.types.ts` v2** — отличия от v1:

```ts
export type Outcome = 'target' | 'stop' | 'trail' | 'time';

export interface OddsCheck {
  /** Доля сделок с R > 0 среди прошлых сделок той же стороны. */
  p: number;
  /** Безубыточный винрейт той же выборки. */
  needed: number;
  n: number;
}

export interface TradeRow {
  id: string;
  dir: Dir;
  tf: number;
  sweepMs: number;
  obMs: number;
  fvgMs: number | null;
  bosMs: number | null;
  /** Закрытие свечи подтверждения — момент, когда выставлена сетка. */
  confirmMs: number;
  level: number;
  /** Уровни сетки входа, от верха блока к стопу. */
  entries: number[];
  /** Сколько уровней исполнилось. */
  filled: number;
  avgEntry: number;
  /** Исходный стоп. */
  stop: number;
  /** Стоп на выходе — после подтягивания за тейками. */
  finalStop: number;
  target: number;
  takes: number[];
  takesHit: number;
  /** План от первого ордера, 3–5R. */
  plannedR: number;
  /** Первое исполнение входа. */
  fillMs: number;
  exitMs: number;
  /** Цена последнего выхода. */
  exit: number;
  outcome: Outcome;
  rGross: number;
  rNet: number;
  features: Features;
  /** Оценка вероятности на момент решения; null — фильтра нет или истории мало. */
  odds: OddsCheck | null;
}

export interface MoneyBlock {
  start: number;
  final: number;
  maxDd: number;
  /** Худшая сделка, доля счёта перед ней. */
  worstTrade: number;
  /** Счёт после каждой сделки (не больше 200 точек). */
  equity: number[];
}

export interface OddsSide {
  considered: number;
  taken: number;
  skipped: number;
  /** Взято без оценки — истории ещё не было. */
  unjudged: number;
}

export interface OddsBlock {
  long: OddsSide;
  short: OddsSide;
  /** Доля лонгов среди взятых. */
  longShare: number;
  /** Вердикт по пропущенным сделкам. */
  effect: Effect;
}
```

В `StrategyReport`: `main` получает поле `money: { theory: MoneyBlock; plain: MoneyBlock; plainNotional: number }`, корень — поле `odds: OddsBlock`. Остальные типы — как в v1.

- [ ] **Step 2: тест `thin` в `stats.spec.ts`**

```ts
  it('thin — не больше max точек, края сохраняются', () => {
    const xs = Array.from({ length: 1000 }, (_, i) => i);
    const t = thin(xs, 10);
    expect(t).toHaveLength(10);
    expect(t[0]).toBe(0);
    expect(t[9]).toBe(999);
    expect(thin([1, 2], 10)).toEqual([1, 2]);
  });
```

`stats.ts`:

```ts
/** Не больше `max` точек равным шагом, края сохраняются — для графиков отчёта. */
export function thin<T>(xs: T[], max = 200): T[] {
  if (xs.length <= max) return xs;
  const step = (xs.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => xs[Math.round(i * step)]);
}
```

`theory.ts`: удалить локальную `thin`, импортировать из `./stats` (вызовы `thin(...)` не меняются).

- [ ] **Step 3: `setups.spec.ts` v2 (целиком)**

```ts
import { bars, mirror, SCENARIO } from './fixtures';
import { atr, Series, swings } from './series';
import { scanLevels } from './events';
import { findSetups, MAIN, SetupContext, VARIANTS } from './setups';

/** Ликвидность сверху (снизу у зеркала) на свече подтверждения 28 подменяется. */
const ctxOf = (s: Series, htf: number, liq?: number): SetupContext => {
  const a = atr(s);
  const scan = scanLevels(s, a, swings(s));
  if (liq !== undefined) {
    scan.nearHigh[28] = liq;
    scan.nearLow[28] = -liq;
  }
  return { atr: a, scan, htf: new Int8Array(s.n).fill(htf), daily: new Int8Array(s.n) };
};
const variant = (id: string) => VARIANTS.find((v) => v.id === id);
const close = (xs: number[], ys: number[]) =>
  xs.forEach((x, i) => expect(x).toBeCloseTo(ys[i]));

describe('setups v2', () => {
  it('сетка входа, тейки и план 3–5R', () => {
    const s = bars(SCENARIO);
    const [st] = findSetups(s, ctxOf(s, 1, 110), MAIN);
    expect(st).toMatchObject({ id: 'main:25:1', dir: 1, sweepI: 25, e: 28, obI: 25, stop: 96, target: 110, trail: true });
    close(st.entries, [98.6, 97.95, 97.3, 96.65]);
    close(st.takes, [102.4, 106.2, 110]);
    expect(st.plannedR).toBeCloseTo(11.4 / 2.6);
  });

  it('ликвидность дальше 5R — цель на 5R', () => {
    const s = bars(SCENARIO);
    const [st] = findSetups(s, ctxOf(s, 1, 120), MAIN);
    expect(st.target).toBeCloseTo(98.6 + 5 * 2.6);
    expect(st.plannedR).toBe(5);
  });

  it('ликвидность ближе 3R — сетап пропускается', () => {
    const s = bars(SCENARIO); // ближайший хай 106 — 2,85R
    expect(findSetups(s, ctxOf(s, 1), MAIN)).toHaveLength(0);
  });

  it('контекст против — сетапа нет; без контекста — есть', () => {
    const s = bars(SCENARIO);
    expect(findSetups(s, ctxOf(s, -1, 110), MAIN)).toHaveLength(0);
    expect(findSetups(s, ctxOf(s, -1, 110), variant('no-context'))).toHaveLength(1);
  });

  it('одиночный вход и выход', () => {
    const s = bars(SCENARIO);
    const [st] = findSetups(s, ctxOf(s, 1, 110), variant('single'));
    expect(st).toMatchObject({ entries: [98.6], takes: [110], trail: false });
  });

  it('цена уже в блоке на подтверждении — сетап пропускается', () => {
    const s = bars(SCENARIO);
    expect(findSetups(s, ctxOf(s, 1, 110), variant('sweep'))).toHaveLength(0);
  });

  it('шорт — зеркало лонга', () => {
    const s = mirror(bars(SCENARIO));
    const [st] = findSetups(s, ctxOf(s, -1, 110), MAIN);
    expect(st).toMatchObject({ dir: -1, stop: -96, target: -110 });
    close(st.entries, [-98.6, -97.95, -97.3, -96.65]);
  });

  it('признаки сетапа', () => {
    const s = bars(SCENARIO);
    const [st] = findSetups(s, ctxOf(s, 1, 110), MAIN);
    expect(st.features).toMatchObject({ session: 'asia', weekend: 'no', daily: 'with', plannedR: '4-5' });
    expect(Object.keys(st.features).sort()).toEqual(
      ['daily', 'pierce', 'plannedR', 'session', 'stopAtr', 'vol', 'weekend'],
    );
  });
});
```

- [ ] **Step 4: Run — FAIL**: `cd backend && npx jest src/strategy/setups.spec.ts src/strategy/stats.spec.ts`

- [ ] **Step 5: `setups.ts` v2** — отличия от v1 (остальное — как было: `FEATURE_KEYS`, `SetupContext`, `sessionOf`, `volatilityRanker`, поиск свипа, контекста и ордерблока):

```ts
/** План сделки — от первого ордера сетки, строго 3–5R. */
export const MIN_R = 3;
export const MAX_R = 5;
/** Уровни сетки входа — доли высоты блока от его верха. */
export const GRID_STEPS = [0, 0.25, 0.5, 0.75];
/** Тейки — доли пути от верха блока до цели. */
export const TAKE_STEPS = [1 / 3, 2 / 3, 1];

export interface Variant {
  id: string;
  label: string;
  tf: 15 | 60;
  fvg: boolean;
  bos: boolean;
  context: boolean;
  /** Сетка входа и тейков со стопом за тейками; false — один лимит и один тейк. */
  grid: boolean;
  /** Пропуск сделок со слабой вероятностью успеха. */
  odds: boolean;
}

export const MAIN: Variant = { id: 'main', label: 'Основной', tf: 15, fvg: true, bos: true, context: true, grid: true, odds: true };

export const VARIANTS: Variant[] = [
  MAIN,
  { ...MAIN, id: 'sweep', label: 'Только свип', fvg: false, bos: false },
  { ...MAIN, id: 'sweep-fvg', label: 'Свип + FVG', bos: false },
  { ...MAIN, id: 'sweep-bos', label: 'Свип + BOS', fvg: false },
  { ...MAIN, id: 'no-context', label: 'Без контекста 4H', context: false },
  { ...MAIN, id: 'no-odds', label: 'Без фильтра вероятности', odds: false },
  { ...MAIN, id: 'single', label: 'Одиночный вход и выход', grid: false },
  { ...MAIN, id: 'h1', label: 'ТФ сетапа 1H', tf: 60 },
];

export interface Setup {
  id: string;
  dir: Dir;
  sweepI: number;
  fvgI: number;
  bosI: number;
  e: number;
  obI: number;
  level: number;
  /** Уровни входа, от верха блока к стопу. */
  entries: number[];
  stop: number;
  /** Последний тейк. */
  target: number;
  takes: number[];
  /** Стоп за тейками и снятие входа после первого тейка. */
  trail: boolean;
  plannedR: number;
  features: Features;
}
```

В `featuresOf`: `plannedR: x.plannedR < 4 ? '3-4' : '4-5'`. В `findSetups` после поиска ордерблока (`top`, `bottom`) вместо расчёта входа/цели v1:

```ts
    const stop = bottom;
    const h = d * (top - stop);
    if (!(h > 0)) continue;
    if (d * (s.c[e] - top) <= 0) continue; // цена уже в блоке
    const liq = d === 1 ? ctx.scan.nearHigh[e] : ctx.scan.nearLow[e];
    if (!Number.isFinite(liq)) continue;
    const rLiq = (d * (liq - top)) / h;
    if (rLiq < MIN_R) continue; // ликвидность ближе 3R
    const plannedR = Math.min(rLiq, MAX_R);
    const target = top + d * plannedR * h;
    const entries = v.grid ? GRID_STEPS.map((k) => top - d * k * h) : [top];
    const takes = v.grid ? TAKE_STEPS.map((k) => top + (target - top) * k) : [target];
```

и в `out.push` — поля `entries, stop, target, takes, trail: v.grid, plannedR`, признак `stopAtr: h / ctx.atr[e]`.

- [ ] **Step 6: Run — PASS** (те же файлы).
- [ ] **Step 7: Commit** — `feat(strategy): v2 — сетка входа и тейков, план 3–5R`.

---

### Task 2: Исполнение многоордерной сделки

**Files:**
- Modify: `backend/src/strategy/simulate.ts` (целиком, ниже)
- Test: `backend/src/strategy/simulate.spec.ts` (целиком, ниже)

**Interfaces:**
- Consumes: `Setup` v2.
- Produces: `Filled {status:'filled', fillMs, filled, avgEntry, exitMs, exit, outcome, takesHit, finalStop, rGross, rNet}`; остальное API (`Bar`, `Minutes`, `FEES`, `LIMIT_LIFE`, `MAX_HOLD_MS`, `minuteKey`, `simulate`, `simulateAll`, `FetchMinutes`, `Resolved`) — как в v1.

- [ ] **Step 1: `simulate.spec.ts` v2**

```ts
import { bars, mirror, Ohlc } from './fixtures';
import type { Setup } from './setups';
import type { Features } from './report.types';
import { Bar, FEES, minuteKey, simulate, simulateAll } from './simulate';

const M = 60_000;
const STEP = 15 * M;
// Верх 100, стоп 96: уровни 100/99/98/97, тейки 104/108/112, 1R = средняя дистанция 2,5.
const setup = (over: Partial<Setup> = {}): Setup => ({
  id: 't', dir: 1, sweepI: 0, fvgI: -1, bosI: -1, e: 0, obI: 0, level: 0,
  entries: [100, 99, 98, 97], stop: 96, target: 112, takes: [104, 108, 112],
  trail: true, plannedR: 3, features: {} as Features, ...over,
});
const E: Ohlc = [101, 101.5, 100.5, 101];
const FILL_TOP: Ohlc = [101, 101, 99.5, 100];
const TP1: Ohlc = [100.6, 104.5, 100.5, 104];
const none = () => null;

describe('simulate v2', () => {
  it('исполнен верх, все три тейка', () => {
    const s = bars([E, FILL_TOP, TP1, [104.5, 108.5, 104.5, 108], [108, 112.5, 108.2, 112]]);
    const r = simulate(s, setup(), none);
    expect(r).toMatchObject({ status: 'filled', outcome: 'target', filled: 1, avgEntry: 100, takesHit: 3, finalStop: 108, fillMs: STEP, exitMs: 5 * STEP, exit: 112 });
    if (r.status !== 'filled') throw new Error(r.status);
    expect(r.rGross).toBeCloseTo(0.8);
    expect(r.rNet).toBeCloseTo(0.8 - (FEES.maker * (25 + 27)) / 2.5);
  });

  it('вся сетка набрана и выбит стоп — −1R', () => {
    const s = bars([E, [101, 101, 96.5, 97], [97, 97.5, 95.5, 96]]);
    const r = simulate(s, setup(), none);
    expect(r).toMatchObject({ outcome: 'stop', filled: 4, avgEntry: 98.5 });
    if (r.status !== 'filled') throw new Error(r.status);
    expect(r.rGross).toBeCloseTo(-1);
    expect(r.rNet).toBeCloseTo(-1 - (FEES.maker * 98.5 + FEES.taker * 96) / 2.5);
  });

  it('цель раньше входа — пропущен; лимиты живут 48 свечей', () => {
    expect(simulate(bars([E, [101, 112.5, 100.5, 112]]), setup(), none).status).toBe('missed');
    expect(simulate(bars([E, ...Array<Ohlc>(60).fill(E)]), setup(), none).status).toBe('expired');
  });

  it('после первого тейка стоп — в безубыток, вход снят', () => {
    const s = bars([E, FILL_TOP, TP1, [104, 104.2, 97.5, 98]]);
    const r = simulate(s, setup(), none);
    expect(r).toMatchObject({ outcome: 'trail', filled: 1, takesHit: 1, finalStop: 100, exit: 100 });
    if (r.status !== 'filled') throw new Error(r.status);
    expect(r.rGross).toBeCloseTo(((0.25 / 3) * 4) / 2.5);
  });

  it('тейк и стоп в одной свече — минутки; без минуток — худший порядок', () => {
    const s = bars([E, FILL_TOP, [100.2, 104.5, 95.5, 101]]);
    expect(simulate(s, setup(), none)).toEqual({ status: 'needs', from: 2 * STEP, to: 3 * STEP });
    const mins: Bar[] = [
      { t0: 2 * STEP, t1: 2 * STEP + M, o: 100.2, h: 104.5, l: 100.1, c: 104 },
      { t0: 2 * STEP + M, t1: 2 * STEP + 2 * M, o: 104, h: 104, l: 99.8, c: 100 },
    ];
    expect(simulate(s, setup(), () => mins)).toMatchObject({ outcome: 'trail', takesHit: 1 });
    const worst = simulate(s, setup(), () => []);
    expect(worst).toMatchObject({ outcome: 'stop', filled: 4, takesHit: 0 });
    if (worst.status !== 'filled') throw new Error(worst.status);
    expect(worst.rGross).toBeCloseTo(-1);
  });

  it('вход и первый тейк в одной свече — порядок по минуткам', () => {
    const s = bars([E, [101, 104.5, 99.5, 104], [104, 104.2, 99.5, 100]]);
    expect(simulate(s, setup(), none).status).toBe('needs');
    const mins: Bar[] = [
      { t0: STEP, t1: STEP + M, o: 101, h: 101, l: 99.8, c: 100 },
      { t0: STEP + M, t1: STEP + 2 * M, o: 100, h: 104.5, l: 100.2, c: 104 },
    ];
    expect(simulate(s, setup(), () => mins)).toMatchObject({ outcome: 'trail', takesHit: 1, fillMs: STEP });
  });

  it('срок — 3 суток от первого исполнения', () => {
    const hold: Ohlc = [100.5, 101, 99.5, 100.5];
    const s = bars([E, [101, 101, 99.8, 100.5], ...Array<Ohlc>(300).fill(hold)]);
    const r = simulate(s, setup(), none);
    expect(r).toMatchObject({ outcome: 'time', exit: 100.5, filled: 1 });
    if (r.status !== 'filled') throw new Error(r.status);
    expect(r.rGross).toBeCloseTo((0.25 * 0.5) / 2.5);
  });

  it('одиночный вход и выход', () => {
    const s = bars([E, FILL_TOP, [100.2, 112.5, 100, 112]]);
    const r = simulate(s, setup({ entries: [100], takes: [112], trail: false }), none);
    expect(r).toMatchObject({ outcome: 'target', filled: 1 });
    if (r.status !== 'filled') throw new Error(r.status);
    expect(r.rGross).toBeCloseTo(3);
  });

  it('шорт — зеркало лонга', () => {
    const s = mirror(bars([E, FILL_TOP, TP1, [104.5, 108.5, 104.5, 108], [108, 112.5, 108.2, 112]]));
    const neg = (xs: number[]) => xs.map((x) => -x);
    const r = simulate(s, setup({ dir: -1, entries: neg([100, 99, 98, 97]), stop: -96, target: -112, takes: neg([104, 108, 112]) }), none);
    expect(r).toMatchObject({ outcome: 'target', avgEntry: -100, exit: -112 });
    if (r.status !== 'filled') throw new Error(r.status);
    expect(r.rGross).toBeCloseTo(0.8);
  });

  it('simulateAll доразбирает спорную свечу минутками', async () => {
    const s = bars([E, FILL_TOP, [100.2, 104.5, 95.5, 101]]);
    const mins: Bar[] = [
      { t0: 2 * STEP, t1: 2 * STEP + M, o: 100.2, h: 104.5, l: 100.1, c: 104 },
      { t0: 2 * STEP + M, t1: 2 * STEP + 2 * M, o: 104, h: 104, l: 99.8, c: 100 },
    ];
    const fetch = jest.fn(async (ranges: [number, number][]) => new Map(ranges.map(([f, t]) => [minuteKey(f, t), mins])));
    const [res] = await simulateAll(s, [setup()], fetch, new Map());
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(res.result).toMatchObject({ outcome: 'trail' });
    const [worst] = await simulateAll(s, [setup()], async () => new Map(), new Map());
    expect(worst.result).toMatchObject({ outcome: 'stop' });
  });
});
```

- [ ] **Step 2: Run — FAIL**: `cd backend && npx jest src/strategy/simulate.spec.ts`

- [ ] **Step 3: `simulate.ts` v2** — `Bar`, `Minutes`, `Fees`, `FEES`, `LIMIT_LIFE`, `MAX_HOLD_MS`, `minuteKey`, `asLong`, `FetchMinutes`, `Resolved`, `ROUNDS`, `simulateAll` — без изменений. Заменяется всё между ними:

```ts
export interface Filled {
  status: 'filled';
  /** Первое исполнение входа. */
  fillMs: number;
  /** Сколько уровней сетки исполнилось. */
  filled: number;
  avgEntry: number;
  exitMs: number;
  /** Цена последнего выхода. */
  exit: number;
  outcome: Outcome;
  takesHit: number;
  finalStop: number;
  rGross: number;
  rNet: number;
}

/** missed — цель раньше входа; expired — лимиты истекли; open — данные кончились посреди сделки. */
export type Final = Filled | { status: 'missed' | 'expired' | 'open' };
export type Result = Final | { status: 'needs'; from: number; to: number };

const EPS = 1e-12;

/** План сделки в «лонговых» координатах. */
interface Plan {
  /** Уровни входа по убыванию цены. */
  levels: number[];
  takes: number[];
  stop0: number;
  /** Объём уровня: 1 / число уровней. */
  q: number;
  trail: boolean;
  fees: Fees;
}

/** Позиция по сетке: исполнения входа, тейки, стоп за тейками, деньги и комиссия. */
class Position {
  readonly filled: boolean[];
  fills = 0;
  qty = 0;
  cost = 0;
  cash = 0;
  fee = 0;
  stop: number;
  tp = 0;
  entriesOn = true;
  firstMs = NaN;
  exitMs = NaN;
  exit = NaN;
  outcome: Outcome | null = null;

  constructor(private readonly p: Plan) {
    this.filled = p.levels.map(() => false);
    this.stop = p.stop0;
  }

  get done(): boolean {
    return this.outcome !== null;
  }

  get avg(): number {
    return this.cost / (this.fills * this.p.q);
  }

  touchesEntry(b: Bar): boolean {
    return this.entriesOn && this.p.levels.some((lvl, k) => !this.filled[k] && b.l <= lvl);
  }

  /** Стоп, каким он станет после тейков этой свечи. */
  stopAfterUp(b: Bar): number {
    let stop = this.stop;
    for (let j = this.tp; this.p.trail && j < this.p.takes.length && b.h >= this.p.takes[j]; j++) {
      stop = Math.max(stop, j === 0 ? this.avg : this.p.takes[j - 1]);
    }
    return stop;
  }

  /** Вниз: исполнения входа по убыванию цены, затем стоп. */
  down(b: Bar): void {
    if (this.entriesOn) {
      this.p.levels.forEach((lvl, k) => {
        if (!this.filled[k] && b.l <= lvl) this.fill(k, Math.min(lvl, b.o), b.t0);
      });
    }
    if (this.qty > 0 && b.l <= this.stop) {
      const outcome = this.stop === this.p.stop0 ? 'stop' : 'trail';
      this.close(this.qty, Math.min(this.stop, b.o), b.t1, false, outcome);
    }
  }

  /** Вверх: тейки по возрастанию; после каждого — стоп за тейками и снятие входа. */
  up(b: Bar): void {
    const { takes, trail } = this.p;
    while (!this.done && this.qty > 0 && this.tp < takes.length && b.h >= takes[this.tp]) {
      const avg = this.avg;
      const share = this.qty / (takes.length - this.tp);
      this.close(share, Math.max(takes[this.tp], b.o), b.t1, true, 'target');
      if (trail) {
        this.stop = Math.max(this.stop, this.tp === 0 ? avg : takes[this.tp - 1]);
        this.entriesOn = false;
      }
      this.tp++;
    }
  }

  timeExit(b: Bar): void {
    if (!this.done && this.qty > 0 && b.t1 >= this.firstMs + MAX_HOLD_MS) {
      this.close(this.qty, b.c, b.t1, false, 'time');
    }
  }

  private fill(k: number, price: number, ms: number): void {
    const { q, fees } = this.p;
    this.filled[k] = true;
    this.fills++;
    this.qty += q;
    this.cost += q * price;
    this.cash -= q * price;
    this.fee += fees.maker * q * Math.abs(price);
    if (Number.isNaN(this.firstMs)) this.firstMs = ms;
  }

  private close(x: number, price: number, ms: number, maker: boolean, last: Outcome): void {
    this.qty -= x;
    this.cash += x * price;
    this.fee += (maker ? this.p.fees.maker : this.p.fees.taker) * x * Math.abs(price);
    this.exitMs = ms;
    this.exit = price;
    if (this.qty <= EPS) {
      this.qty = 0;
      this.outcome = last;
    }
  }
}

type Step = 'continue' | 'missed' | 'ambiguous';

/**
 * Одна свеча. Спорная (вниз и вверх) на свече ТФ — 'ambiguous'; на минутке —
 * худший порядок: стоп задет — сначала вниз, иначе тейки, потом откат.
 */
function step(pos: Position, plan: Plan, b: Bar, minute: boolean): Step {
  const { takes } = plan;
  const last = takes[takes.length - 1];
  if (pos.fills === 0) {
    if (!pos.touchesEntry(b)) return b.h >= last ? 'missed' : 'continue';
    if (b.h >= takes[0]) {
      if (!minute) return 'ambiguous';
      if (b.l > pos.stop && b.h >= last) return 'missed';
    }
    pos.down(b);
    return 'continue';
  }
  const up = pos.tp < takes.length && b.h >= takes[pos.tp];
  if (!up) {
    pos.down(b);
  } else if (b.l <= pos.stopAfterUp(b) || pos.touchesEntry(b)) {
    if (!minute) return 'ambiguous';
    if (b.l <= pos.stop) {
      pos.down(b);
    } else {
      pos.up(b);
      if (!pos.done) pos.down(b);
    }
  } else {
    pos.up(b);
  }
  if (!pos.done) pos.timeExit(b);
  return 'continue';
}

function result(pos: Position, d: Dir, risk: number): Filled {
  return {
    status: 'filled',
    fillMs: pos.firstMs,
    filled: pos.fills,
    avgEntry: d * pos.avg,
    exitMs: pos.exitMs,
    exit: d * pos.exit,
    outcome: pos.outcome,
    takesHit: pos.tp,
    finalStop: d * pos.stop,
    rGross: pos.cash / risk,
    rNet: (pos.cash - pos.fee) / risk,
  };
}

/** Сетка с закрытия свечи `e`: исполнения, тейки, стоп за тейками, срок. R — от риска всей сетки. */
export function simulate(s: Series, st: Setup, minutes: Minutes, fees: Fees = FEES): Result {
  const d = st.dir;
  const plan: Plan = {
    levels: st.entries.map((x) => d * x),
    takes: st.takes.map((x) => d * x),
    stop0: d * st.stop,
    q: 1 / st.entries.length,
    trail: st.trail,
    fees,
  };
  const risk = plan.levels.reduce((a, x) => a + (x - plan.stop0), 0) * plan.q;
  const pos = new Position(plan);
  for (let k = st.e + 1; k < s.n; k++) {
    if (pos.fills === 0 && k > st.e + LIMIT_LIFE) return { status: 'expired' };
    const bar = asLong({ t0: s.t[k], t1: closeMs(s, k), o: s.o[k], h: s.h[k], l: s.l[k], c: s.c[k] }, d);
    let r = step(pos, plan, bar, false);
    if (r === 'ambiguous') {
      const mins = minutes(bar.t0, bar.t1);
      if (mins === null) return { status: 'needs', from: bar.t0, to: bar.t1 };
      // Минуток нет (дыра в истории) — свеча целиком как одна минутка.
      const seq = mins.length ? mins.map((m) => asLong(m, d)) : [bar];
      r = 'continue';
      for (const m of seq) {
        r = step(pos, plan, m, true);
        if (r !== 'continue' || pos.done) break;
      }
    }
    if (r === 'missed') return { status: 'missed' };
    if (pos.done) return result(pos, d, risk);
  }
  return { status: pos.fills ? 'open' : 'expired' };
}
```

- [ ] **Step 4: Run — PASS**; **Step 5: Commit** — `feat(strategy): v2 — исполнение сетки входа и тейков со стопом за тейками`.

---

### Task 3: Фильтр по вероятности и деньги

**Files:**
- Create: `backend/src/strategy/odds.ts`, `backend/src/strategy/money.ts`
- Test: `backend/src/strategy/odds.spec.ts`, `backend/src/strategy/money.spec.ts`

**Interfaces:**
- Produces: `MIN_ODDS_N = 30`, `judge(t, all) → OddsCheck | null`, `filterByOdds(trades) → {kept, skipped, block: OddsBlock}`; `START = 1000`, `RISK = 0.01`, `MoneyTrade {rNet, stopPct}`, `plainNotional(trades)`, `withTheory(trades)`, `withoutTheory(trades, notional)`.

- [ ] **Step 1: tests**

`odds.spec.ts`:

```ts
import type { Features, TradeRow } from './report.types';
import { filterByOdds, judge } from './odds';

const FEAT = { session: 'asia', weekend: 'no', daily: 'with', vol: 'mid', stopAtr: '0.5-1.5', plannedR: '3-4', pierce: '<0.25' } as Features;
let seq = 0;
const row = (dir: 1 | -1, rNet: number, confirmMs: number, exitMs: number, daily = 'with'): TradeRow => ({
  id: String(seq++), dir, tf: 15, sweepMs: 0, obMs: 0, fvgMs: null, bosMs: null, confirmMs, level: 0,
  entries: [1], filled: 1, avgEntry: 1, stop: 0, finalStop: 0, target: 2, takes: [2], takesHit: 0,
  plannedR: 3, fillMs: confirmMs, exitMs, exit: 1, outcome: 'stop', rGross: rNet, rNet,
  features: { ...FEAT, daily }, odds: null,
});
const T = 1_000_000;
const past = (dir: 1 | -1, rs: (i: number) => number, daily = 'with') =>
  Array.from({ length: 40 }, (_, i) => row(dir, rs(i), i, i + 1, daily));

describe('odds', () => {
  it('истории мало — сделка берётся без оценки', () => {
    const now = row(-1, 0, T, T + 1);
    expect(judge(now, [...past(-1, () => -1).slice(0, 10), now])).toBeNull();
  });

  it('слабый шорт пропускается, сильный лонг берётся', () => {
    const short = row(-1, 0, T, T + 1);
    const long = row(1, 0, T, T + 1);
    const all = [...past(-1, () => -1), ...past(1, (i) => (i % 2 ? 3 : -1)), short, long];
    expect(judge(short, all)).toMatchObject({ p: 0, n: 40 });
    expect(judge(long, all)).toMatchObject({ p: 0.5, needed: 0.25, n: 40 });
    const res = filterByOdds(all);
    expect(res.skipped.map((t) => t.id)).toContain(short.id);
    expect(res.kept.map((t) => t.id)).toContain(long.id);
    expect(res.kept.find((t) => t.id === long.id).odds).toMatchObject({ p: 0.5 });
  });

  it('сделки, закрытые после подтверждения, в выборку не входят', () => {
    const now = row(-1, 0, T, T + 1);
    const late = Array.from({ length: 40 }, (_, i) => row(-1, -1, i, T + 10 + i));
    expect(judge(now, [...late, now])).toBeNull();
  });

  it('своя дневная структура, если её хватает', () => {
    const all = [...past(-1, () => 3, 'with'), ...past(-1, () => -1, 'against')];
    expect(judge(row(-1, 0, T, T + 1, 'with'), all)).toMatchObject({ p: 1 });
    expect(judge(row(-1, 0, T, T + 1, 'against'), all)).toMatchObject({ p: 0 });
  });

  it('сводка блока: стороны, доля лонгов, вердикт', () => {
    const all = [...past(-1, () => -1), ...past(1, (i) => (i % 2 ? 3 : -1)), row(-1, -1, T, T + 1), row(1, 3, T, T + 1)];
    const { block } = filterByOdds(all);
    expect(block.short.considered).toBe(41);
    expect(block.long.considered).toBe(41);
    expect(block.short.skipped).toBeGreaterThanOrEqual(1);
    expect(block.longShare).toBeGreaterThan(0.5);
    expect(['helped', 'hurt', 'unproven']).toContain(block.effect.verdict);
  });
});
```

`money.spec.ts`:

```ts
import { plainNotional, withTheory, withoutTheory } from './money';

describe('money', () => {
  it('с теорией — 1 % текущего счёта', () => {
    const m = withTheory([{ rNet: 1, stopPct: 0.01 }, { rNet: -1, stopPct: 0.02 }]);
    expect(m.final).toBeCloseTo(1000 * 1.01 * 0.99);
    expect(m.maxDd).toBeCloseTo(0.01);
    expect(m.worstTrade).toBeCloseTo(-0.01);
    expect(m.equity).toHaveLength(3);
  });

  it('без теории — одинаковый объём', () => {
    const n = plainNotional([{ rNet: 0, stopPct: 0.01 }, { rNet: 0, stopPct: 0.02 }, { rNet: 0, stopPct: 0.03 }]);
    expect(n).toBeCloseTo(500);
    const m = withoutTheory([{ rNet: 1, stopPct: 0.02 }, { rNet: -1, stopPct: 0.04 }, { rNet: 2, stopPct: 0.01 }], 500);
    expect(m.final).toBeCloseTo(1000);
    expect(m.worstTrade).toBeCloseTo(-20 / 1010);
  });

  it('счёт в ноль — торговля кончилась', () => {
    const m = withoutTheory([{ rNet: -300, stopPct: 0.01 }, { rNet: 5, stopPct: 0.01 }], 500);
    expect(m.final).toBe(0);
    expect(m.maxDd).toBe(1);
    expect(m.equity).toEqual([1000, 0]);
  });

  it('пустой список', () => {
    expect(withTheory([])).toMatchObject({ final: 1000, maxDd: 0, worstTrade: 0 });
  });
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: implementation**

`odds.ts`:

```ts
import type { OddsBlock, OddsCheck, OddsSide, TradeRow } from './report.types';
import { summarize } from './stats';
import { effectOf } from './learning';

/** Меньше прошлых сделок — оценки нет, сделка берётся. */
export const MIN_ODDS_N = 30;

/**
 * Вероятность успеха сделки на свече подтверждения: доля прибыльных среди
 * прошлых сделок той же стороны, закрытых до неё, с той же дневной структурой
 * (меньше MIN_ODDS_N — вся сторона), против безубыточного винрейта той же выборки.
 */
export function judge(t: TradeRow, all: TradeRow[]): OddsCheck | null {
  const closed = all.filter((x) => x.dir === t.dir && x.exitMs < t.confirmMs);
  const same = closed.filter((x) => x.features.daily === t.features.daily);
  const pool = same.length >= MIN_ODDS_N ? same : closed;
  if (pool.length < MIN_ODDS_N) return null;
  const s = summarize(pool.map((x) => x.rNet));
  return { p: s.winrate, needed: s.breakeven, n: pool.length };
}

export interface OddsResult {
  kept: TradeRow[];
  skipped: TradeRow[];
  block: OddsBlock;
}

/** Сделка с p < нужно пропускается — правило одно для лонгов и шортов. */
export function filterByOdds(trades: TradeRow[]): OddsResult {
  const kept: TradeRow[] = [];
  const skipped: TradeRow[] = [];
  const side = (): OddsSide => ({ considered: 0, taken: 0, skipped: 0, unjudged: 0 });
  const long = side();
  const short = side();
  for (const t of trades) {
    const odds = judge(t, trades);
    const row = { ...t, odds };
    const s = t.dir === 1 ? long : short;
    s.considered++;
    if (!odds) s.unjudged++;
    if (!odds || odds.p >= odds.needed) {
      kept.push(row);
      s.taken++;
    } else {
      skipped.push(row);
      s.skipped++;
    }
  }
  const taken = long.taken + short.taken;
  return {
    kept,
    skipped,
    block: {
      long,
      short,
      longShare: taken ? long.taken / taken : 0,
      effect: effectOf(skipped.map((t) => t.rNet)),
    },
  };
}
```

`money.ts`:

```ts
import type { MoneyBlock } from './report.types';
import { thin } from './stats';

/** Счёт и риск — как в примерах видео 2. */
export const START = 1000;
export const RISK = 0.01;

export interface MoneyTrade {
  rNet: number;
  /** Риск сделки в долях цены (дистанция до стопа к цене входа). */
  stopPct: number;
}

function run(trades: MoneyTrade[], pnlOf: (t: MoneyTrade, eq: number) => number, start: number): MoneyBlock {
  let eq = start;
  let peak = start;
  let maxDd = 0;
  let worst = 0;
  const curve = [start];
  for (const t of trades) {
    if (eq <= 0) break;
    const pnl = pnlOf(t, eq);
    worst = Math.min(worst, pnl / eq);
    eq = Math.max(0, eq + pnl);
    peak = Math.max(peak, eq);
    maxDd = Math.max(maxDd, 1 - eq / peak);
    curve.push(eq);
  }
  return { start, final: eq, maxDd, worstTrade: worst, equity: thin(curve) };
}

/** С теорией: риск — 1 % текущего счёта, объём от стопа. */
export const withTheory = (trades: MoneyTrade[], start = START, risk = RISK): MoneyBlock =>
  run(trades, (t, eq) => t.rNet * risk * eq, start);

/** Без теории: одинаковый объём позиции, без поправки на стоп и на счёт. */
export const withoutTheory = (trades: MoneyTrade[], notional: number, start = START): MoneyBlock =>
  run(trades, (t) => t.rNet * notional * t.stopPct, start);

/** Объём «без теории»: на медианном стопе — тот же риск, что «с теорией» на старте. */
export function plainNotional(trades: MoneyTrade[], start = START, risk = RISK): number {
  const stops = trades.map((t) => t.stopPct).sort((a, b) => a - b);
  const median = stops.length ? stops[Math.floor(stops.length / 2)] : 0;
  return median > 0 ? (start * risk) / median : 0;
}
```

- [ ] **Step 4: Run — PASS**; **Step 5: Commit** — `feat(strategy): v2 — фильтр по вероятности успеха и деньги с теорией и без`.

---

### Task 4: Отчёт v2

**Files:**
- Modify: `backend/src/strategy/report.ts`, `backend/src/strategy/report.spec.ts`

**Interfaces:**
- Produces: `STRATEGY_VERSION = 2`, `stopPctOf(t)`, отчёт с `main.money`, `odds`.

- [ ] **Step 1: `report.spec.ts`** — в тесте `buildReport`: `variants` → длина 8; вместо проверки `no-context` — `const noOdds = report.variants.find((v) => v.id === 'no-odds'); expect(noOdds.filled).toBeGreaterThan(0);` (основной вариант на блуждании может отсечь все сделки фильтром); удалить `expect(report.main.trades.length).toBeGreaterThan(0)`; добавить:

```ts
    expect(report.main.money.theory.start).toBe(1000);
    expect(report.main.money.plain.equity.length).toBeGreaterThanOrEqual(1);
    expect(report.odds.long.considered + report.odds.short.considered).toBe(report.variants[0].filled);
```

и тест `stopPctOf`:

```ts
  it('stopPctOf — средняя дистанция уровней до стопа к средней цене', () => {
    expect(stopPctOf({ entries: [100, 98], stop: 96 } as never)).toBeCloseTo(3 / 99);
  });
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: `report.ts`** — изменения:

```ts
import { filterByOdds, OddsResult } from './odds';
import { plainNotional, withTheory, withoutTheory } from './money';

export const STRATEGY_VERSION = 2;

/** Риск сделки в долях цены: средняя дистанция уровней входа до стопа к средней цене уровней. */
export function stopPctOf(t: Pick<TradeRow, 'entries' | 'stop'>): number {
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  return mean(t.entries.map((e) => Math.abs(e - t.stop))) / mean(t.entries.map(Math.abs));
}
```

`toRow` — поля v2: `entries: st.entries, filled: f.filled, avgEntry: f.avgEntry, stop: st.stop, finalStop: f.finalStop, target: st.target, takes: st.takes, takesHit: f.takesHit, plannedR: st.plannedR, fillMs: f.fillMs, exitMs: f.exitMs, exit: f.exit, outcome: f.outcome, rGross: f.rGross, rNet: f.rNet, features: st.features, odds: null` (плюс прежние `id, dir, tf, sweepMs, obMs, fvgMs, bosMs, confirmMs, level`).

`runVariant` — после сборки исполненных (`all`):

```ts
  const odds: OddsResult | null = v.odds ? filterByOdds(all) : null;
  const filled = odds ? odds.kept : all;
  const system = sequential(filled);
```

`row.filled` — `all.length`; вернуть `{ v, row, filled, system, sys, odds }`.

`buildReport` — после обучения:

```ts
  const mt = main.system.map((t) => ({ rNet: t.rNet, stopPct: stopPctOf(t) }));
  const notional = plainNotional(mt);
  const money = { theory: withTheory(mt), plain: withoutTheory(mt, notional), plainNotional: notional };
  const theory = theoryOf(main.system.map((t) => ({ rGross: t.rGross, rNet: t.rNet, stopPct: stopPctOf(t) })));
```

в возврат: `main: { …, money }`, `odds: main.odds.block`.

- [ ] **Step 4: Run — весь модуль PASS** (`npx jest src/strategy`), `npx tsc --noEmit -p tsconfig.json`, `npx eslint src/strategy`.
- [ ] **Step 5: Commit** — `feat(strategy): v2 — отчёт с фильтром вероятности и деньгами, STRATEGY_VERSION 2`.

### ▶ Контрольная точка 1 (A)

Ревьюер Sonnet: дифф `backend/src/strategy` от начала ветки. Фокус: машина состояний `Position`/`step` (порядок событий в свече, худший порядок на минутке, стоп за тейками, снятие входа, доли тейков, срок, комиссия в R), отсутствие заглядывания вперёд в `judge`, деньги без теории (ноль счёта), соответствие спеке v2.

---

### Task 5: Фронт v2

**Files:**
- Modify: `frontend/src/views/strategy/api/types.ts` (копия), `model/format.ts`, `model/rules.ts`, `components/BacktestSection.tsx`, `components/TradeChart.tsx`, `Page.tsx`, `strategy.css`
- Create: `components/OddsSection.tsx`

- [ ] **Step 1:** `api/types.ts` — копия `report.types.ts` (шапка — «Копия …»).
- [ ] **Step 2:** `format.ts` — `OUTCOME_LABELS = { target: 'все тейки', stop: 'стоп', trail: 'стоп за тейками', time: 'срок' }`; в `VALUE_LABELS` корзины плана — `'plannedR:3-4': '3–4R', 'plannedR:4-5': '4–5R'` (вместо прежних трёх).
- [ ] **Step 3:** `rules.ts` — шаги «Ордерблок и сетка входа», «RR 3–5», «Сетка тейков и стоп за ними» (видео 26:18 = 1578 с), «Фильтр по вероятности», «Управление риском» вместо «Ордерблок и вход» и «Цели»; «Исполнение и комиссия» — про спорную свечу и худший порядок.
- [ ] **Step 4:** `BacktestSection` — проп `theory`; денежный блок режима (`main.money.theory | plain`: старт, итог, макс. просадка, худшая сделка, кривая счёта; у «без теории» — подпись про объём `plainNotional`); колонки сделок: вход (UTC), сторона, средняя цена, исполнено `filled/entries`, стоп, цель, план, тейков `takesHit/takes`, выход, R, «шанс / нужно» (`odds`).
- [ ] **Step 5:** `TradeChart` — линии всех уровней входа, тейков, исходного стопа и подтянутого (`finalStop`, если отличается), прямоугольник блока от первого уровня до стопа, точки первого исполнения (средняя цена) и выхода.
- [ ] **Step 6:** `OddsSection` — описание правила, вердикт по пропущенным (с оговоркой, если основной вариант убыточен), доля лонгов среди взятых, таблица по сторонам (рассмотрено, взято, пропущено, без оценки).
- [ ] **Step 7:** `Page` — `BacktestSection theory={theory}`, `OddsSection` после бектеста, якорь «Фильтр».
- [ ] **Step 8:** `npx vitest run src/views/strategy`, `npx tsc --noEmit`, `npx eslint src/views/strategy`; commit — `feat(strategy): страница v2 — сетка, вероятность, деньги с теорией и без`.

### Task 6: Документация и прогон

- [ ] CLAUDE.md, раздел «Стратегия в админке» — пункты v2 (сетка, 3–5R, вероятность у обеих сторон, переключатель меняет деньги).
- [ ] `npx next build`.
- [ ] Прогон движка на истории BTC с Binance (скрипт сессии `live-run.ts`), сверка чисел глазами.
- [ ] Commit — `docs(strategy): v2 в CLAUDE.md`.

### ▶ Контрольная точка 2 (B)

Ревьюер Sonnet: дифф фронта и `report.types.ts`; фокус — копия типов, все новые поля в UI, переключатель меняет деньги, графики сделки с сеткой.
