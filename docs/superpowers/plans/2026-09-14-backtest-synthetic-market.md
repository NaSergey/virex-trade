# Тренажёр на сгенерированном рынке — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** второй режим сессии бектеста — «Тренажёр», где свечи строит детерминированный генератор BTC-подобного рынка вместо `price_candles`.

**Architecture:** генератор — чистые функции в `backend/src/backtest/synthetic/`: ГПСЧ с потоком на сутки, модель цены (стохастическая волатильность + режимы + уровни), ось сессии с контрольными точками на начало суток. `SyntheticMarketService` держит LRU построенных осей. `BacktestService` создаёт synthetic-сессию, отдаёт её свечи отдельным эндпоинтом, завершает сессии устаревшей версии генератора и делит статистику по источнику. Фронт выбирает адрес свечей по `session.dataSource`, остальной движок прокрутки не меняется.

**Tech Stack:** NestJS 10 + Prisma (`db push`), jest; Next.js App Router + FSD, react-query, next-intl, vitest.

**Спека:** `docs/superpowers/specs/2026-09-14-backtest-synthetic-market-design.md`.

## Global Constraints

- Свечи synthetic не хранятся: график — функция от `(seed, SYNTH_VERSION, время)`.
- Любая правка генератора, меняющая путь цены, поднимает `SYNTH_VERSION`.
- `SYNTH_EPOCH = Date.UTC(2000, 0, 3)`; старт = эпоха + 366 суток + случайная минута первой недели; конец = старт + `FUTURE_AFTER_MS` (30 суток).
- `hideDate` у synthetic всегда `true`, выставляет сервер.
- Семантика `GET /api/backtest/sessions/:id/candles` = `GET /api/market-data/candles`: по возрастанию; `from`+`limit` — первые N; без `from` — последние N до `to` включительно; потолок 5000.
- Коды ошибок: `BACKTEST_NOT_SYNTHETIC` (400), `BACKTEST_SYNTH_OUTDATED` (409).
- Шаг цены 0.1. `high ≥ max(open, close)`, `low ≤ min(open, close)`, `open` = предыдущий `close`.
- `/api/backtest/stats?source=real|synthetic`, по умолчанию `real`.
- Фронт: только `shared/ui`, цвета классами, тексты в `backtest` / `errors` обоих `ru.json` и `en.json`. Проверка фронта — `npx next build`, не только tsc.
- Схема применяется `npx prisma db push`; при EPERM на `prisma generate` — остановить локальный `nest --watch`.

---

### Task 1: ГПСЧ и параметры генератора

**Files:**
- Create: `backend/src/backtest/synthetic/rng.ts`
- Create: `backend/src/backtest/synthetic/params.ts`
- Test: `backend/src/backtest/synthetic/rng.spec.ts`

**Interfaces:**
- Produces: `type Rng = () => number`; `mulberry32(seed: number): Rng`; `streamSeed(seed: number, stream: number): number`; `uniform(rng, min, max): number`; `normal(rng): number`; `studentT4(rng): number`. Все константы `params.ts` (см. код).

- [ ] **Step 1: Тест**

```ts
// backend/src/backtest/synthetic/rng.spec.ts
import { mulberry32, normal, streamSeed, studentT4 } from './rng';

const sample = (n: number, f: () => number) => Array.from({ length: n }, f);
const variance = (xs: number[]) => {
  const m = xs.reduce((a, x) => a + x, 0) / xs.length;
  return xs.reduce((a, x) => a + (x - m) ** 2, 0) / xs.length;
};

describe('ГПСЧ генератора', () => {
  it('одно зерно — одна последовательность', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect(sample(5, a)).toEqual(sample(5, b));
    expect(sample(5, mulberry32(43))).not.toEqual(sample(5, mulberry32(42)));
  });

  it('числа в [0, 1)', () => {
    const rng = mulberry32(7);
    const xs = sample(100_000, rng);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThan(1);
  });

  it('потоки суток различаются', () => {
    const seeds = new Set(Array.from({ length: 1000 }, (_, d) => streamSeed(12345, d)));
    expect(seeds.size).toBe(1000);
    expect(streamSeed(12345, -1)).not.toBe(streamSeed(12345, 0));
  });

  it('нормальное — единичная дисперсия', () => {
    const rng = mulberry32(1);
    expect(variance(sample(200_000, () => normal(rng)))).toBeGreaterThan(0.98);
    expect(variance(sample(200_000, () => normal(rng)))).toBeLessThan(1.02);
  });

  it('t(4) — единичная дисперсия и хвосты тяжелее нормальных', () => {
    const rng = mulberry32(2);
    const xs = sample(200_000, () => Math.max(-8, Math.min(8, studentT4(rng))));
    expect(variance(xs)).toBeGreaterThan(0.9);
    expect(variance(xs)).toBeLessThan(1.1);
    const beyond3 = xs.filter((x) => Math.abs(x) > 3).length / xs.length;
    expect(beyond3).toBeGreaterThan(0.009); // у нормального ≈ 0.0027
    expect(beyond3).toBeLessThan(0.018);
  });
});
```

- [ ] **Step 2: Запустить — падает** (`cd backend && npx jest src/backtest/synthetic/rng.spec.ts`, ожидание: `Cannot find module './rng'`).

- [ ] **Step 3: Реализация**

```ts
// backend/src/backtest/synthetic/rng.ts
/**
 * Случайность генератора рынка. Своя, а не Math.random: график обязан
 * повторяться от зерна — один и тот же запрос свечей всегда даёт одни и те же
 * свечи, в каком бы порядке их ни запросили.
 */

/** Равномерное число из [0, 1). */
export type Rng = () => number;

/** mulberry32: 32 бита состояния, быстрый, разброса для симуляции хватает. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Зерно отдельного потока. У каждых суток свой поток: их минутки не зависят от
 * того, сколько чисел съели другие сутки, и сутки строятся с контрольной точки
 * отдельно. Отрицательные номера — служебные потоки сессии.
 */
export function streamSeed(seed: number, stream: number): number {
  let h = (seed ^ Math.imul(stream + 0x632be5ab, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

export const uniform = (rng: Rng, min: number, max: number) => min + rng() * (max - min);

/** Стандартное нормальное (Бокс — Мюллер). `1 − rng()` — чтобы не взять логарифм нуля. */
export function normal(rng: Rng): number {
  return Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
}

/**
 * t-распределение с четырьмя степенями свободы, приведённое к единичной
 * дисперсии: хвосты доходностей BTC тяжелее нормальных. χ²(4) — это −2·ln(U₁U₂).
 */
export function studentT4(rng: Rng): number {
  const z = normal(rng);
  const chi2 = Math.max(-2 * Math.log((1 - rng()) * (1 - rng())), 1e-12);
  return z / Math.sqrt(chi2 / 4) / Math.SQRT2;
}
```

```ts
// backend/src/backtest/synthetic/params.ts
/**
 * Параметры сгенерированного рынка. Стартовые значения — первое приближение;
 * подбираются по таблице `src/scripts/synthetic-market-preview.ts`, а не на глаз.
 */
import { DAY_MS, FUTURE_AFTER_MS, MINUTE_MS } from '../backtest-math';

/**
 * Версия генератора. Поднимается при ЛЮБОЙ правке, меняющей путь цены:
 * незавершённая сессия иначе молча получила бы другой график под открытыми сделками.
 */
export const SYNTH_VERSION = 1;

export { DAY_MS, MINUTE_MS };
export const MINUTES_PER_DAY = 1440;

/** Начало оси — понедельник, полночь UTC. Даты вымышленные, день недели и час — настоящие. */
export const SYNTH_EPOCH = Date.UTC(2000, 0, 3);
/** История до старта: год пана назад (HISTORY_CAP_MS на фронте) и сутки на недоформированную дневку. */
export const HISTORY_DAYS = 366;
/** Сессия идёт вперёд столько же, сколько реальной гарантировано истории после старта. */
export const SESSION_MS = FUTURE_AFTER_MS;

/** Якорь цены сессии — логравномерно в этих границах. */
export const ANCHOR_PRICE_MIN = 25_000;
export const ANCHOR_PRICE_MAX = 110_000;
/** Полураспад возврата к якорю: год блуждания не уводит цену в 3 тысячи или в полмиллиона. */
export const ANCHOR_HALF_LIFE_MIN = 120 * MINUTES_PER_DAY;

/** Базовая суточная волатильность (доля). */
export const BASE_DAILY_VOL = 0.025;
/** Разброс логарифма волатильности в устойчивом состоянии и её память. */
export const LOG_VOL_SD = 0.45;
export const LOG_VOL_MEMORY_MIN = MINUTES_PER_DAY;
/** Логарифм волатильности не уходит от среднего дальше этого. */
export const LOG_VOL_BAND = 1.5;
/** Минута с шумом больше SHOCK_Z сигм поднимает волатильность на SHOCK_KICK. */
export const SHOCK_Z = 4;
export const SHOCK_KICK = 0.08;
/** Потолок шума минуты в сигмах: t(4) изредка даёт абсурдные 50σ. */
export const NOISE_CLAMP = 8;
/** Выходные тише будней во столько раз. */
export const WEEKEND_VOL = 0.7;

export const DURATION_SPREAD = 0.5;
export const MIN_DURATION_MIN = 20;

export const REGIME = {
  trend: { medianH: 36, volMult: 1.1 },
  range: { medianH: 48, volMult: 0.85 },
  squeeze: { medianH: 18, volMult: 0.45 },
} as const;

/** Вероятности выхода из режима; остаток до 1 у тренда — разворот. */
export const FROM_TREND = { range: 0.55, squeeze: 0.25 };
export const FROM_RANGE = { trend: 0.6 };
/** Выход из сжатия толкает волатильность — расширение после сжатия. */
export const SQUEEZE_EXIT_KICK = 0.5;

/** Импульс тренда: снос в базовых минутных волатильностях. */
export const IMPULSE = { medianH: 6, kappaMin: 0.06, kappaMax: 0.14 };
/** Откат: доля сноса импульса против направления. */
export const PULLBACK = { medianH: 3, shareMin: 0.5, shareMax: 0.9, volMult: 0.8 };

/** Полуширина коридора — в суточных волатильностях. */
export const RANGE_WIDTH = { min: 0.8, max: 1.5 };
export const RANGE_PULL_HALF_LIFE_MIN = 720;
export const RANGE_EDGE_HALF_LIFE_MIN = 30;
export const SQUEEZE_PULL_HALF_LIFE_MIN = 360;
/** Дальше этой доли полуширины от центра выход из коридора идёт в сторону этого края. */
export const BREAKOUT_SIDE = 0.5;

export const MAX_LEVELS = 8;
/** Зона уровня — в суточных волатильностях. */
export const LEVEL_ZONE = 0.15;
/** Вероятность, что импульс кончится на уровне, к которому подошёл. */
export const LEVEL_REACT_P = 0.45;
/** Вынос — длинная тень без закрытия: базовая вероятность на минуту и множитель у уровня. */
export const SWEEP_P = 0.0015;
export const SWEEP_NEAR_LEVEL = 4;
export const SWEEP_SIGMAS = { min: 3, max: 8 };
```

- [ ] **Step 4: Запустить — проходит** (та же команда, PASS).

- [ ] **Step 5: Коммит**

```bash
git add backend/src/backtest/synthetic/rng.ts backend/src/backtest/synthetic/params.ts backend/src/backtest/synthetic/rng.spec.ts
git commit -m "feat(backtest): ГПСЧ и параметры генератора рынка"
```

---

### Task 2: Модель цены и ось сессии

**Files:**
- Create: `backend/src/backtest/synthetic/model.ts`
- Create: `backend/src/backtest/synthetic/series.ts`
- Test: `backend/src/backtest/synthetic/series.spec.ts`

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - `model.ts`: `interface Bar { t; o; h; l; c; v }` (числа, `t` — открытие, мс); `interface State`; `type RegimeKind = 'trend' | 'range' | 'squeeze'`; `initialState(anchorPrice: number, rng: Rng): State`; `cloneState(s: State): State`; `stepMinute(s: State, rng: Rng, t: number): Bar`.
  - `series.ts`: `interface Axis { seed; start; end; days; anchorPrice }`; `axisFor(seed): Axis`; `interface Series { axis: Axis; checkpoints: State[]; daily: Bar[] }`; `buildSeries(seed): Series`; `simulateDay(state, seed, day, onBar: (b: Bar) => void, until?: number): void`; `class BucketFold { constructor(tfMs); out: Bar[]; push(b: Bar) }`; `interface SeriesQuery { timeframe: number; from?: number; to?: number; limit: number }`; `querySeries(series, q): Bar[]`; `startOf(series): { start: number; price: number }`.

- [ ] **Step 1: Тест**

```ts
// backend/src/backtest/synthetic/series.spec.ts
import { DAY_MS, MINUTE_MS, SYNTH_EPOCH } from './params';
import { cloneState, type Bar } from './model';
import { BucketFold, axisFor, buildSeries, querySeries, simulateDay, startOf, type Series } from './series';

// Прогон оси — десятые доли секунды: одна ось на файл, а не на тест.
const SEED = 20260914;
let series: Series;
beforeAll(() => {
  series = buildSeries(SEED);
});

const fold = (bars: Bar[], tfMs: number) => {
  const f = new BucketFold(tfMs);
  bars.forEach((b) => f.push(b));
  return f.out;
};

describe('ось сессии', () => {
  it('старт через 366 суток после эпохи, в первую неделю, на границе минуты; 30 суток вперёд', () => {
    const { start, end, days } = series.axis;
    expect(start - SYNTH_EPOCH).toBeGreaterThanOrEqual(366 * DAY_MS);
    expect(start - SYNTH_EPOCH).toBeLessThan(373 * DAY_MS);
    expect(start % MINUTE_MS).toBe(0);
    expect(end - start).toBe(30 * DAY_MS);
    expect(series.daily).toHaveLength(days);
    expect(series.checkpoints).toHaveLength(days + 1);
  });

  it('разные зёрна — разные оси', () => {
    expect(axisFor(1).anchorPrice).not.toBe(axisFor(2).anchorPrice);
  });
});

describe('детерминизм', () => {
  it('то же зерно — те же свечи', () => {
    const again = buildSeries(SEED);
    const q = { timeframe: 1, from: series.axis.start - DAY_MS, limit: 3000 };
    expect(querySeries(again, q)).toEqual(querySeries(series, q));
    expect(again.daily).toEqual(series.daily);
  });

  it('другое зерно — другие свечи', () => {
    expect(buildSeries(SEED + 1).daily.map((d) => d.c)).not.toEqual(series.daily.map((d) => d.c));
  });

  it('сутки с контрольной точки приводят ровно к следующей точке', () => {
    for (const d of [0, 200, series.axis.days - 2]) {
      const state = cloneState(series.checkpoints[d]);
      simulateDay(state, SEED, d, () => undefined);
      expect(state).toEqual(series.checkpoints[d + 1]);
    }
  });
});

describe('куски без шва', () => {
  it('минутки вперёд кусками равны одному запросу', () => {
    const from = series.axis.start - DAY_MS;
    const whole = querySeries(series, { timeframe: 1, from, limit: 12_000 });
    const a = querySeries(series, { timeframe: 1, from, limit: 5000 });
    const b = querySeries(series, { timeframe: 1, from: a[a.length - 1].t + MINUTE_MS, limit: 5000 });
    const c = querySeries(series, { timeframe: 1, from: b[b.length - 1].t + MINUTE_MS, limit: 2000 });
    expect([...a, ...b, ...c]).toEqual(whole);
  });

  it('история назад кусками равна одному запросу', () => {
    const to = series.axis.start - 1;
    const whole = querySeries(series, { timeframe: 240, to, limit: 800 });
    const late = querySeries(series, { timeframe: 240, to, limit: 300 });
    const early = querySeries(series, { timeframe: 240, to: late[0].t - 1, limit: 500 });
    expect([...early, ...late]).toEqual(whole);
  });

  it('дневка из прогона равна свёртке минуток тех же суток', () => {
    const t = SYNTH_EPOCH + 100 * DAY_MS;
    const minutes = querySeries(series, { timeframe: 1, from: t, limit: 1440 });
    expect(querySeries(series, { timeframe: 1440, from: t, limit: 1 })).toEqual(fold(minutes, DAY_MS));
  });

  it('часовые свечи равны свёртке минуток', () => {
    const t = SYNTH_EPOCH + 50 * DAY_MS;
    const minutes = querySeries(series, { timeframe: 1, from: t, limit: 2 * 1440 });
    expect(querySeries(series, { timeframe: 60, from: t, limit: 48 })).toEqual(fold(minutes, 60 * MINUTE_MS));
  });
});

describe('минутки', () => {
  const bars = () => querySeries(series, { timeframe: 1, from: series.axis.start - 3 * DAY_MS, limit: 6 * 1440 });
  const onTick = (x: number) => Math.abs(x * 10 - Math.round(x * 10)) < 1e-6;

  it('OHLC согласованы, цена положительна и кратна 0.1', () => {
    const bad = bars().filter(
      (b) =>
        !(b.l <= Math.min(b.o, b.c) && b.h >= Math.max(b.o, b.c) && b.l > 0 && [b.o, b.h, b.l, b.c].every(onTick)),
    );
    expect(bad).toEqual([]);
  });

  it('открытие — закрытие предыдущей минутки, без дыр во времени', () => {
    const xs = bars();
    const bad = xs.slice(1).filter((b, i) => b.o !== xs[i].c || b.t - xs[i].t !== MINUTE_MS);
    expect(bad).toEqual([]);
  });
});

describe('запрос', () => {
  it('без from — последние limit свечей до to включительно, по возрастанию', () => {
    const to = series.axis.start - MINUTE_MS;
    expect(querySeries(series, { timeframe: 1, to, limit: 3 }).map((b) => b.t)).toEqual([
      to - 2 * MINUTE_MS,
      to - MINUTE_MS,
      to,
    ]);
  });

  it('from округляется вверх до границы свечи', () => {
    const t = SYNTH_EPOCH + 30 * DAY_MS;
    expect(querySeries(series, { timeframe: 60, from: t + 1, limit: 1 })[0].t).toBe(t + 3_600_000);
  });

  it('раньше эпохи и после конца свечей нет', () => {
    expect(querySeries(series, { timeframe: 60, to: SYNTH_EPOCH - 1, limit: 10 })).toEqual([]);
    expect(querySeries(series, { timeframe: 1, from: SYNTH_EPOCH - DAY_MS, limit: 1 })[0].t).toBe(SYNTH_EPOCH);
    const { end } = series.axis;
    expect(querySeries(series, { timeframe: 1, from: end - 2 * MINUTE_MS, limit: 10 }).map((b) => b.t)).toEqual([
      end - 2 * MINUTE_MS,
      end - MINUTE_MS,
    ]);
  });

  it('последняя дневка кончается последней минуткой сессии', () => {
    const [lastDay] = querySeries(series, { timeframe: 1440, limit: 1 });
    const [lastMinute] = querySeries(series, { timeframe: 1, limit: 1 });
    expect(lastDay.t).toBe(Math.floor((series.axis.end - 1) / DAY_MS) * DAY_MS);
    expect(lastDay.c).toBe(lastMinute.c);
  });

  it('цена старта — закрытие минутки перед стартом', () => {
    const { start, price } = startOf(series);
    expect(start).toBe(series.axis.start);
    expect(price).toBe(querySeries(series, { timeframe: 1, to: start - MINUTE_MS, limit: 1 })[0].c);
  });
});
```

- [ ] **Step 2: Запустить — падает** (`npx jest src/backtest/synthetic/series.spec.ts`, `Cannot find module './model'`).

- [ ] **Step 3: Модель**

```ts
// backend/src/backtest/synthetic/model.ts
/**
 * Модель цены сгенерированного рынка: одна минута из состояния. Три слоя —
 * волатильность (серии спокойных и горячих дней, час суток, выходные),
 * режимы (тренд ногами, флэт коридором, сжатие) и память уровней (отбои,
 * ретесты, выносы). Всё состояние — в State: сутки строятся с контрольной точки.
 */
import * as P from './params';
import { type Rng, normal, studentT4, uniform } from './rng';

export type RegimeKind = 'trend' | 'range' | 'squeeze';

export interface Regime {
  kind: RegimeKind;
  /** Минут до конца режима. */
  left: number;
  /** Направление тренда; у флэта и сжатия не используется. */
  dir: 1 | -1;
  /** Логарифм цены на входе в режим — центр коридора или сжатия. */
  center: number;
  /** Полуширина коридора в логарифме цены; у тренда и сжатия 0. */
  halfWidth: number;
  leg: 'impulse' | 'pullback';
  legLeft: number;
  /** Снос ноги в базовых минутных волатильностях; у отката отрицательный. */
  kappa: number;
  /** Пробитый край коридора, к которому идёт первый откат; null — ретеста нет. */
  retest: number | null;
}

export interface State {
  /** Логарифм закрытия последней минутки. */
  logPrice: number;
  /** Логарифм базовой минутной волатильности — без часа суток и режима. */
  logVol: number;
  /** Логарифм якоря цены сессии. */
  anchor: number;
  regime: Regime;
  /** Значимые уровни (логарифм цены), новые в конце. */
  levels: number[];
  /** Уровень, в зоне которого цена: реакция разыгрывается один раз на вход в зону. */
  zoneLevel: number | null;
}

/** Минутка генератора. t — время открытия, мс; v — условный объём. */
export interface Bar {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export const MEAN_LOG_VOL = Math.log(P.BASE_DAILY_VOL / Math.sqrt(P.MINUTES_PER_DAY));
const VOL_PHI = Math.exp(-1 / P.LOG_VOL_MEMORY_MIN);
const VOL_ETA = P.LOG_VOL_SD * Math.sqrt(1 - VOL_PHI * VOL_PHI);
const RANGE_PULL = Math.LN2 / P.RANGE_PULL_HALF_LIFE_MIN;
const EDGE_PULL = Math.LN2 / P.RANGE_EDGE_HALF_LIFE_MIN;
const SQUEEZE_PULL = Math.LN2 / P.SQUEEZE_PULL_HALF_LIFE_MIN;
const ANCHOR_PULL = Math.LN2 / P.ANCHOR_HALF_LIFE_MIN;
const HOUR_MS = 3_600_000;

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const tick = (x: number) => Math.round(x * 10) / 10;

/** Пик — пересечение Европы и США, минимум — азиатская ночь. */
const HOUR_SHAPE = Array.from(
  { length: 24 },
  (_, h) => 1 + 0.35 * Math.exp(-((h - 14.5) ** 2) / (2 * 2.2 ** 2)) - 0.25 * Math.exp(-((h - 5) ** 2) / (2 * 2.5 ** 2)),
);

/** 168 множителей «день недели (UTC, 0 — воскресенье) × час», в среднем по неделе ровно 1. */
const SEASON: number[] = (() => {
  const raw: number[] = [];
  for (let wd = 0; wd < 7; wd++) {
    for (let h = 0; h < 24; h++) raw.push(HOUR_SHAPE[h] * (wd === 0 || wd === 6 ? P.WEEKEND_VOL : 1));
  }
  const mean = raw.reduce((a, x) => a + x, 0) / raw.length;
  return raw.map((x) => x / mean);
})();

/** Без new Date на каждую минуту: 1970-01-01 — четверг. */
export function seasonAt(t: number): number {
  const day = Math.floor(t / P.DAY_MS);
  return SEASON[((day + 4) % 7) * 24 + Math.floor((t - day * P.DAY_MS) / HOUR_MS)];
}

const dailyVol = (s: State) => Math.exp(s.logVol) * Math.sqrt(P.MINUTES_PER_DAY);
const zone = (s: State) => P.LEVEL_ZONE * dailyVol(s);

const duration = (rng: Rng, medianH: number) =>
  Math.max(P.MIN_DURATION_MIN, Math.round(medianH * 60 * Math.exp(P.DURATION_SPREAD * normal(rng))));

function startImpulse(r: Regime, rng: Rng) {
  r.leg = 'impulse';
  r.legLeft = duration(rng, P.IMPULSE.medianH);
  r.kappa = uniform(rng, P.IMPULSE.kappaMin, P.IMPULSE.kappaMax);
}

function startPullback(s: State, rng: Rng) {
  const r = s.regime;
  r.leg = 'pullback';
  r.legLeft = duration(rng, P.PULLBACK.medianH);
  r.kappa = -Math.abs(r.kappa) * uniform(rng, P.PULLBACK.shareMin, P.PULLBACK.shareMax);
  // Ретест имеет смысл, только если импульс увёл цену за пробитый край.
  if (r.retest != null && r.dir * (s.logPrice - r.retest) <= 0) r.retest = null;
}

function trend(s: State, rng: Rng, dir: 1 | -1, retest: number | null): Regime {
  const r: Regime = {
    kind: 'trend',
    left: duration(rng, P.REGIME.trend.medianH),
    dir,
    center: s.logPrice,
    halfWidth: 0,
    leg: 'impulse',
    legLeft: 0,
    kappa: 0,
    retest,
  };
  startImpulse(r, rng);
  return r;
}

const flat = (s: State, rng: Rng, kind: 'range' | 'squeeze'): Regime => ({
  kind,
  left: duration(rng, P.REGIME[kind].medianH),
  dir: 1,
  center: s.logPrice,
  halfWidth: kind === 'range' ? uniform(rng, P.RANGE_WIDTH.min, P.RANGE_WIDTH.max) * dailyVol(s) : 0,
  leg: 'impulse',
  legLeft: 0,
  kappa: 0,
  retest: null,
});

function remember(s: State, level: number) {
  s.levels.push(level);
  if (s.levels.length > P.MAX_LEVELS) s.levels.shift();
}

/** Куда выходить из флэта или сжатия: к краю, у которого цена, иначе жребий. */
function exitSide(s: State, rng: Rng): 1 | -1 {
  const r = s.regime;
  const off = s.logPrice - r.center;
  const threshold = r.halfWidth > 0 ? P.BREAKOUT_SIDE * r.halfWidth : zone(s);
  if (Math.abs(off) > threshold) return off > 0 ? 1 : -1;
  return rng() < 0.5 ? 1 : -1;
}

function nextRegime(s: State, rng: Rng) {
  const r = s.regime;
  const roll = rng();
  if (r.kind === 'trend') {
    remember(s, s.logPrice);
    if (roll < P.FROM_TREND.range) s.regime = flat(s, rng, 'range');
    else if (roll < P.FROM_TREND.range + P.FROM_TREND.squeeze) s.regime = flat(s, rng, 'squeeze');
    else s.regime = trend(s, rng, r.dir === 1 ? -1 : 1, null);
  } else if (r.kind === 'range') {
    remember(s, r.center - r.halfWidth);
    remember(s, r.center + r.halfWidth);
    if (roll < P.FROM_RANGE.trend) {
      const dir = exitSide(s, rng);
      s.regime = trend(s, rng, dir, r.center + dir * r.halfWidth);
    } else {
      s.regime = flat(s, rng, 'squeeze');
    }
  } else {
    const dir = exitSide(s, rng);
    s.logVol += P.SQUEEZE_EXIT_KICK;
    s.regime = trend(s, rng, dir, null);
  }
}

function nextLeg(s: State, rng: Rng) {
  const r = s.regime;
  if (r.leg === 'impulse') {
    remember(s, s.logPrice);
    startPullback(s, rng);
  } else {
    r.retest = null;
    startImpulse(r, rng);
  }
}

function reactToLevels(s: State, rng: Rng) {
  const width = zone(s);
  const near = s.levels.find((level) => Math.abs(level - s.logPrice) < width) ?? null;
  if (near === s.zoneLevel) return;
  s.zoneLevel = near;
  const r = s.regime;
  if (near == null || r.kind !== 'trend' || r.leg !== 'impulse') return;
  if (r.dir * (near - s.logPrice) > 0 && rng() < P.LEVEL_REACT_P) startPullback(s, rng);
}

function drift(s: State): number {
  const r = s.regime;
  let d = -ANCHOR_PULL * (s.logPrice - s.anchor);
  if (r.kind === 'trend') {
    d += r.dir * r.kappa * Math.exp(s.logVol);
  } else if (r.kind === 'range') {
    const off = s.logPrice - r.center;
    d -= RANGE_PULL * off;
    const excess = Math.abs(off) - r.halfWidth;
    if (excess > 0) d -= Math.sign(off) * EDGE_PULL * excess;
  } else {
    d -= SQUEEZE_PULL * (s.logPrice - r.center);
  }
  return d;
}

const regimeVol = (r: Regime) =>
  P.REGIME[r.kind].volMult * (r.kind === 'trend' && r.leg === 'pullback' ? P.PULLBACK.volMult : 1);

export function initialState(anchorPrice: number, rng: Rng): State {
  const anchor = Math.log(anchorPrice);
  const s: State = { logPrice: anchor, logVol: MEAN_LOG_VOL, anchor, regime: undefined, levels: [], zoneLevel: null };
  s.regime = flat(s, rng, 'range');
  return s;
}

export const cloneState = (s: State): State => ({ ...s, regime: { ...s.regime }, levels: [...s.levels] });

/** Одна минута: меняет состояние на месте и отдаёт свечу. */
export function stepMinute(s: State, rng: Rng, t: number): Bar {
  if (--s.regime.left <= 0) nextRegime(s, rng);
  const r = s.regime;
  if (r.kind === 'trend') {
    const retested = r.leg === 'pullback' && r.retest != null && r.dir * (s.logPrice - r.retest) <= 0;
    if (--r.legLeft <= 0 || retested) nextLeg(s, rng);
  }
  reactToLevels(s, rng);

  const sigma = Math.exp(s.logVol) * seasonAt(t) * regimeVol(s.regime);
  const z = clamp(studentT4(rng), -P.NOISE_CLAMP, P.NOISE_CLAMP);
  const ret = drift(s) + sigma * z;
  const from = s.logPrice;

  // Экстремумы пути внутри минуты — выборка максимума и минимума броуновского
  // моста от 0 до ret: P(max > m) = exp(−2m(m − ret)/σ²).
  const bridge = -2 * sigma * sigma;
  let hi = from + (ret + Math.sqrt(ret * ret + bridge * Math.log(1 - rng()))) / 2;
  let lo = from + (ret - Math.sqrt(ret * ret + bridge * Math.log(1 - rng()))) / 2;

  const near = s.zoneLevel;
  if (rng() < P.SWEEP_P * (near == null ? 1 : P.SWEEP_NEAR_LEVEL)) {
    if (near != null) {
      // У уровня тень прокалывает его: снятие стопов за уровнем.
      const pierce = Math.abs(near - from) + uniform(rng, 0.2, 1) * zone(s);
      if (near > from) hi = Math.max(hi, from + pierce);
      else lo = Math.min(lo, from - pierce);
    } else {
      const ext = uniform(rng, P.SWEEP_SIGMAS.min, P.SWEEP_SIGMAS.max) * sigma;
      if (rng() < 0.5) hi = Math.max(hi, from + ext);
      else lo = Math.min(lo, from - ext);
    }
  }

  s.logPrice = from + ret;
  const o = tick(Math.exp(from));
  const c = tick(Math.exp(s.logPrice));
  const bar: Bar = {
    t,
    o,
    h: Math.max(tick(Math.exp(hi)), o, c),
    l: Math.min(tick(Math.exp(lo)), o, c),
    c,
    v: seasonAt(t) * (0.5 + Math.abs(z)) * 10,
  };

  s.logVol = MEAN_LOG_VOL + VOL_PHI * (s.logVol - MEAN_LOG_VOL) + VOL_ETA * normal(rng);
  if (Math.abs(z) > P.SHOCK_Z) s.logVol += P.SHOCK_KICK;
  s.logVol = clamp(s.logVol, MEAN_LOG_VOL - P.LOG_VOL_BAND, MEAN_LOG_VOL + P.LOG_VOL_BAND);
  return bar;
}
```

- [ ] **Step 4: Ось**

```ts
// backend/src/backtest/synthetic/series.ts
/**
 * Ось сессии сгенерированного рынка: от SYNTH_EPOCH до конца сессии.
 *
 * Путь цены последовательный, а свечи запрашивают кусками и в любом порядке.
 * Поэтому у каждых суток свой поток случайности, а состояние на начало суток
 * запоминается контрольной точкой: сутки, построенные с точки, дают ровно те
 * же минутки, что и сплошной прогон.
 */
import * as P from './params';
import { type Bar, type State, cloneState, initialState, stepMinute } from './model';
import { mulberry32, streamSeed } from './rng';

export interface Axis {
  seed: number;
  start: number;
  /** Конец сессии, мс, не включительно: минуток с t ≥ end нет. */
  end: number;
  /** Сколько суток (включая неполные последние) покрывает ось. */
  days: number;
  anchorPrice: number;
}

export interface Series {
  axis: Axis;
  /** Состояние на начало каждых суток; последний элемент — после последних. */
  checkpoints: State[];
  daily: Bar[];
}

export interface SeriesQuery {
  timeframe: number;
  from?: number;
  to?: number;
  limit: number;
}

const AXIS_STREAM = -1;
const INITIAL_STREAM = -2;

export function axisFor(seed: number): Axis {
  const rng = mulberry32(streamSeed(seed, AXIS_STREAM));
  const start = P.SYNTH_EPOCH + P.HISTORY_DAYS * P.DAY_MS + Math.floor(rng() * 7 * P.MINUTES_PER_DAY) * P.MINUTE_MS;
  const end = start + P.SESSION_MS;
  const lo = Math.log(P.ANCHOR_PRICE_MIN);
  const hi = Math.log(P.ANCHOR_PRICE_MAX);
  return {
    seed,
    start,
    end,
    days: Math.ceil((end - P.SYNTH_EPOCH) / P.DAY_MS),
    anchorPrice: Math.exp(lo + rng() * (hi - lo)),
  };
}

/** Сворачивает минутки в корзины таймфрейма по UTC — той же границей, что bucketStart на фронте. */
export class BucketFold {
  readonly out: Bar[] = [];
  constructor(private readonly tfMs: number) {}

  push(b: Bar) {
    const start = Math.floor(b.t / this.tfMs) * this.tfMs;
    const cur = this.out[this.out.length - 1];
    if (!cur || cur.t !== start) {
      this.out.push({ t: start, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v });
    } else {
      cur.h = Math.max(cur.h, b.h);
      cur.l = Math.min(cur.l, b.l);
      cur.c = b.c;
      cur.v += b.v;
    }
  }
}

/**
 * Минутки суток day из состояния на их начало. Сутки прогоняются целиком
 * всегда — иначе состояние на конец не совпало бы с контрольной точкой; until
 * отсекает только выдачу.
 */
export function simulateDay(state: State, seed: number, day: number, onBar: (b: Bar) => void, until = Infinity) {
  const rng = mulberry32(streamSeed(seed, day));
  const t0 = P.SYNTH_EPOCH + day * P.DAY_MS;
  for (let i = 0; i < P.MINUTES_PER_DAY; i++) {
    const t = t0 + i * P.MINUTE_MS;
    const bar = stepMinute(state, rng, t);
    if (t < until) onBar(bar);
  }
}

export function buildSeries(seed: number): Series {
  const axis = axisFor(seed);
  const state = initialState(axis.anchorPrice, mulberry32(streamSeed(seed, INITIAL_STREAM)));
  const checkpoints: State[] = [];
  const daily = new BucketFold(P.DAY_MS);
  for (let d = 0; d < axis.days; d++) {
    checkpoints.push(cloneState(state));
    simulateDay(state, seed, d, (b) => daily.push(b), axis.end);
  }
  checkpoints.push(cloneState(state));
  return { axis, checkpoints, daily: daily.out };
}

/** Та же семантика, что у MarketDataService.getCandles: from/to по времени открытия, to включительно. */
export function querySeries(series: Series, q: SeriesQuery): Bar[] {
  const tfMs = q.timeframe * P.MINUTE_MS;
  const floorB = (t: number) => Math.floor(t / tfMs) * tfMs;
  const lastOpen = floorB(series.axis.end - 1);
  const hi = q.to != null ? Math.min(lastOpen, floorB(q.to)) : lastOpen;
  let a: number;
  let b: number;
  if (q.from != null) {
    a = Math.max(P.SYNTH_EPOCH, Math.ceil(q.from / tfMs) * tfMs);
    b = Math.min(hi, a + (q.limit - 1) * tfMs);
  } else {
    b = hi;
    a = Math.max(P.SYNTH_EPOCH, b - (q.limit - 1) * tfMs);
  }
  if (a > b) return [];
  if (q.timeframe === P.MINUTES_PER_DAY) return series.daily.filter((d) => d.t >= a && d.t <= b);

  const fold = new BucketFold(tfMs);
  const firstDay = Math.floor((a - P.SYNTH_EPOCH) / P.DAY_MS);
  const lastDay = Math.min(series.axis.days - 1, Math.floor((b + tfMs - 1 - P.SYNTH_EPOCH) / P.DAY_MS));
  for (let d = firstDay; d <= lastDay; d++) {
    simulateDay(
      cloneState(series.checkpoints[d]),
      series.axis.seed,
      d,
      (bar) => {
        if (bar.t >= a && bar.t < b + tfMs) fold.push(bar);
      },
      series.axis.end,
    );
  }
  return fold.out;
}

/** Момент старта и цена в нём — закрытие минутки, которая кончается в момент старта. */
export function startOf(series: Series): { start: number; price: number } {
  const { start } = series.axis;
  const [last] = querySeries(series, { timeframe: 1, to: start - P.MINUTE_MS, limit: 1 });
  return { start, price: last.c };
}
```

- [ ] **Step 5: Запустить — проходит** (`npx jest src/backtest/synthetic`, PASS). Если падает сравнение контрольных точек — искать поле `State`, которое `cloneState` копирует по ссылке.

- [ ] **Step 6: Коммит**

```bash
git add backend/src/backtest/synthetic/model.ts backend/src/backtest/synthetic/series.ts backend/src/backtest/synthetic/series.spec.ts
git commit -m "feat(backtest): модель цены и ось сгенерированного рынка"
```

---

### Task 3: Метрики сходства с BTC и скрипт калибровки

**Files:**
- Create: `backend/src/backtest/synthetic/market-stats.ts`
- Create: `backend/src/scripts/synthetic-market-preview.ts`
- Test: `backend/src/backtest/synthetic/realism.spec.ts`

**Interfaces:**
- Consumes: `buildSeries`, `querySeries`, `Bar` из Task 2.
- Produces: `interface MarketProfile`; `marketProfile(daily: Ohlc[], hourly: Ohlc[], minutes: Ohlc[]): MarketProfile`; `syntheticProfile(series: Series): MarketProfile`; `type Ohlc = { t; o; h; l; c }`.

- [ ] **Step 1: Тест**

```ts
// backend/src/backtest/synthetic/realism.spec.ts
import { buildSeries } from './series';
import { syntheticProfile } from './market-stats';

// Грубые рамки «похоже на BTC». Точная подгонка — по скрипту
// synthetic-market-preview.ts; если рамка падает, правится params.ts, а не рамка.
const SEEDS = [11, 22, 33];
const built = SEEDS.map((seed) => buildSeries(seed));
const profiles = built.map(syntheticProfile);

describe('сгенерированный рынок похож на BTC', () => {
  it('суточная волатильность 1.5–6 %', () => {
    for (const p of profiles) {
      expect(p.dailyVol).toBeGreaterThan(0.015);
      expect(p.dailyVol).toBeLessThan(0.06);
    }
  });

  it('хвосты часовых доходностей тяжелее нормальных', () => {
    for (const p of profiles) expect(p.hourlyKurtosis).toBeGreaterThan(4);
  });

  it('волатильность идёт сериями', () => {
    for (const p of profiles) expect(p.absAutocorr[0]).toBeGreaterThan(0.1);
  });

  it('выходные тише будней', () => {
    for (const p of profiles) expect(p.weekendRatio).toBeLessThan(0.9);
  });

  it('за год встречаются все три режима', () => {
    for (const s of built) {
      expect(new Set(s.checkpoints.map((c) => c.regime.kind))).toEqual(new Set(['trend', 'range', 'squeeze']));
    }
  });

  it('цена не уходит от якоря дальше чем в четыре раза', () => {
    for (const s of built) {
      const closes = s.daily.map((d) => d.c);
      expect(Math.min(...closes)).toBeGreaterThan(s.axis.anchorPrice / 4);
      expect(Math.max(...closes)).toBeLessThan(s.axis.anchorPrice * 4);
    }
  });
});
```

- [ ] **Step 2: Запустить — падает** (`npx jest src/backtest/synthetic/realism.spec.ts`, `Cannot find module './market-stats'`).

- [ ] **Step 3: Метрики**

```ts
// backend/src/backtest/synthetic/market-stats.ts
/**
 * Числа, по которым сгенерированный рынок сверяется с настоящим BTC: одни и те
 * же функции считают профиль и для price_candles, и для генератора.
 */
import { DAY_MS, MINUTE_MS, SYNTH_EPOCH } from './params';
import { querySeries, type Series } from './series';

export interface Ohlc {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
}

export interface MarketProfile {
  /** Стандартное отклонение дневных логдоходностей. */
  dailyVol: number;
  /** 10-й и 90-й перцентили волатильности по 30-дневным окнам. */
  monthlyVol: [number, number];
  /** Эксцесс часовых доходностей (у нормального 3). */
  hourlyKurtosis: number;
  /** Автокорреляция модуля часовой доходности на лагах 1, 6, 24. */
  absAutocorr: [number, number, number];
  /** Средний модуль часовой свечи по часам UTC к общему среднему. */
  hourProfile: number[];
  weekendRatio: number;
  /** Квартили коэффициента эффективности суток по часовым свечам. */
  dailyEfficiency: [number, number, number];
  /** Медиана отношения размаха минутки к её телу. */
  wickToBody: number;
}

const mean = (xs: number[]) => xs.reduce((a, x) => a + x, 0) / xs.length;

function stdev(xs: number[]): number {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}

function kurtosis(xs: number[]): number {
  const m = mean(xs);
  const v = xs.reduce((a, x) => a + (x - m) ** 2, 0) / xs.length;
  return xs.reduce((a, x) => a + (x - m) ** 4, 0) / xs.length / (v * v);
}

function autocorrelation(xs: number[], lag: number): number {
  const m = mean(xs);
  let num = 0;
  let den = 0;
  for (let i = 0; i < xs.length; i++) {
    den += (xs[i] - m) ** 2;
    if (i >= lag) num += (xs[i] - m) * (xs[i - lag] - m);
  }
  return num / den;
}

function quantile(xs: number[], q: number): number {
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

const logReturns = (bars: Ohlc[]) => bars.slice(1).map((b, i) => Math.log(b.c / bars[i].c));
const bodyReturn = (b: Ohlc) => Math.abs(Math.log(b.c / b.o));
const isWeekend = (t: number) => [0, 6].includes(new Date(t).getUTCDay());

export function marketProfile(daily: Ohlc[], hourly: Ohlc[], minutes: Ohlc[]): MarketProfile {
  const dailyReturns = logReturns(daily);
  const monthly: number[] = [];
  for (let i = 0; i + 30 <= dailyReturns.length; i += 30) monthly.push(stdev(dailyReturns.slice(i, i + 30)));

  const hourlyReturns = logReturns(hourly);
  const absHourly = hourlyReturns.map(Math.abs);

  const byHour = Array.from({ length: 24 }, () => [] as number[]);
  for (const b of hourly) byHour[new Date(b.t).getUTCHours()].push(bodyReturn(b));
  const hourAvg = byHour.map((xs) => (xs.length ? mean(xs) : 0));
  const allAvg = mean(hourAvg);

  const weekend = hourly.filter((b) => isWeekend(b.t)).map(bodyReturn);
  const weekday = hourly.filter((b) => !isWeekend(b.t)).map(bodyReturn);

  const efficiency: number[] = [];
  for (let i = 0; i + 24 < hourly.length; i += 24) {
    let path = 0;
    for (let j = i + 1; j <= i + 24; j++) path += Math.abs(hourly[j].c - hourly[j - 1].c);
    if (path > 0) efficiency.push(Math.abs(hourly[i + 24].c - hourly[i].c) / path);
  }

  return {
    dailyVol: stdev(dailyReturns),
    monthlyVol: [quantile(monthly, 0.1), quantile(monthly, 0.9)],
    hourlyKurtosis: kurtosis(hourlyReturns),
    absAutocorr: [autocorrelation(absHourly, 1), autocorrelation(absHourly, 6), autocorrelation(absHourly, 24)],
    hourProfile: hourAvg.map((x) => x / allAvg),
    weekendRatio: mean(weekend) / mean(weekday),
    dailyEfficiency: [quantile(efficiency, 0.25), quantile(efficiency, 0.5), quantile(efficiency, 0.75)],
    wickToBody: quantile(
      minutes.map((b) => (b.h - b.l) / Math.max(Math.abs(b.c - b.o), 0.1)),
      0.5,
    ),
  };
}

/** Профиль всей истории оси до старта: дневки, часы и неделя минуток перед стартом. */
export function syntheticProfile(series: Series): MarketProfile {
  const to = series.axis.start - 1;
  return marketProfile(
    querySeries(series, { timeframe: 1440, from: SYNTH_EPOCH, to, limit: 1000 }),
    querySeries(series, { timeframe: 60, from: SYNTH_EPOCH, to, limit: 24 * 1000 }),
    querySeries(series, { timeframe: 1, from: series.axis.start - 7 * DAY_MS, to: to - MINUTE_MS + 1, limit: 7 * 1440 }),
  );
}
```

- [ ] **Step 4: Запустить — проходит.** Если рамка падает — подкрутить `params.ts` (например, `SHOCK_KICK`, `LOG_VOL_SD`, `WEEKEND_VOL`) и перезапустить; `SYNTH_VERSION` пока не поднимать: сессий этой версии ещё нет.

- [ ] **Step 5: Скрипт калибровки**

```ts
// backend/src/scripts/synthetic-market-preview.ts
/**
 * Похож ли сгенерированный рынок на BTC — таблица «настоящий против генератора».
 *
 * Запуск локально:
 *   npx ts-node -r tsconfig-paths/register src/scripts/synthetic-market-preview.ts
 * На проде:
 *   docker compose --env-file .env.prod -f docker-compose.prod.yml \
 *     exec api node dist/scripts/synthetic-market-preview.js
 *
 * Параметры генератора (backtest/synthetic/params.ts) подбираются по этой
 * таблице. Правка, меняющая путь цены, поднимает SYNTH_VERSION.
 * Скрипт ничего не пишет.
 */
import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';
import { marketProfile, syntheticProfile, type MarketProfile, type Ohlc } from '../backtest/synthetic/market-stats';
import { buildSeries } from '../backtest/synthetic/series';

const SEEDS = Array.from({ length: 20 }, (_, i) => 1000 + i);
const DAY = 86_400_000;

const pct = (x: number) => `${(x * 100).toFixed(2)}%`;
const num = (x: number) => x.toFixed(2);

async function loadReal(prisma: PrismaClient): Promise<MarketProfile | null> {
  const load = async (timeframe: number, days: number): Promise<Ohlc[]> =>
    (
      await prisma.priceCandle.findMany({
        where: { symbol: 'BTCUSDT', timeframe, time: { gte: new Date(Date.now() - days * DAY) } },
        orderBy: { time: 'asc' },
      })
    ).map((c) => ({ t: c.time.getTime(), o: c.open, h: c.high, l: c.low, c: c.close }));
  const [daily, hourly, minutes] = await Promise.all([load(1440, 730), load(60, 730), load(1, 7)]);
  if (daily.length < 60 || hourly.length < 24 * 60 || minutes.length < 1440) return null;
  return marketProfile(daily, hourly, minutes);
}

function row(label: string, real: MarketProfile | null, synth: MarketProfile[], pick: (p: MarketProfile) => number, fmt: (x: number) => string) {
  const xs = synth.map(pick).sort((a, b) => a - b);
  const median = xs[Math.floor(xs.length / 2)];
  console.log(
    `${label.padEnd(34)} ${(real ? fmt(pick(real)) : '—').padStart(10)}   ${fmt(median).padStart(10)}  [${fmt(xs[0])} … ${fmt(xs[xs.length - 1])}]`,
  );
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const real = await loadReal(prisma);
    if (!real) console.log('В price_candles мало истории — колонка «BTC» пустая.\n');
    const t0 = Date.now();
    const synth = SEEDS.map((seed) => syntheticProfile(buildSeries(seed)));
    console.log(`Генератор: ${SEEDS.length} зёрен за ${Date.now() - t0} мс\n`);

    console.log(`${'метрика'.padEnd(34)} ${'BTC'.padStart(10)}   ${'генератор'.padStart(10)}  [мин … макс]`);
    row('суточная волатильность', real, synth, (p) => p.dailyVol, pct);
    row('30-дн. волатильность, p10', real, synth, (p) => p.monthlyVol[0], pct);
    row('30-дн. волатильность, p90', real, synth, (p) => p.monthlyVol[1], pct);
    row('эксцесс часовых доходностей', real, synth, (p) => p.hourlyKurtosis, num);
    row('автокорр. |r| 1ч, лаг 1', real, synth, (p) => p.absAutocorr[0], num);
    row('автокорр. |r| 1ч, лаг 6', real, synth, (p) => p.absAutocorr[1], num);
    row('автокорр. |r| 1ч, лаг 24', real, synth, (p) => p.absAutocorr[2], num);
    row('выходные / будни', real, synth, (p) => p.weekendRatio, num);
    row('эффективность суток, q25', real, synth, (p) => p.dailyEfficiency[0], num);
    row('эффективность суток, медиана', real, synth, (p) => p.dailyEfficiency[1], num);
    row('эффективность суток, q75', real, synth, (p) => p.dailyEfficiency[2], num);
    row('размах / тело минутки, медиана', real, synth, (p) => p.wickToBody, num);
    for (let h = 0; h < 24; h += 3) row(`час ${String(h).padStart(2, '0')}:00 UTC к среднему`, real, synth, (p) => p.hourProfile[h], num);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 6: Прогнать скрипт** (`cd backend && npx ts-node -r tsconfig-paths/register src/scripts/synthetic-market-preview.ts`). Если база не поднята, колонка «BTC» пустая — это не ошибка. Сверить: суточная волатильность и эффективность суток генератора не расходятся с BTC больше чем в полтора раза; при расхождении — подкрутить `params.ts`, повторить `npx jest src/backtest/synthetic`.

- [ ] **Step 7: Коммит**

```bash
git add backend/src/backtest/synthetic/market-stats.ts backend/src/backtest/synthetic/realism.spec.ts backend/src/scripts/synthetic-market-preview.ts backend/src/backtest/synthetic/params.ts
git commit -m "feat(backtest): метрики сходства с BTC и скрипт калибровки генератора"
```

---

### Task 4: Сервер — synthetic-сессия и её свечи

**Files:**
- Modify: `backend/prisma/schema.prisma` (модель `BacktestSession`, после `priceScale`)
- Create: `backend/src/market-data/candle-query.ts`
- Modify: `backend/src/market-data/market-data.controller.ts`
- Create: `backend/src/backtest/synthetic/synthetic-market.service.ts`
- Test: `backend/src/backtest/synthetic/synthetic-market.service.spec.ts`
- Modify: `backend/src/backtest/backtest.service.ts`, `backtest.controller.ts`, `backtest.module.ts`, `dto/backtest.dto.ts`
- Test: `backend/src/backtest/backtest.service.spec.ts`

**Interfaces:**
- Consumes: `querySeries`, `buildSeries`, `startOf`, `SeriesQuery`, `Bar` (Task 2); `SYNTH_VERSION` (Task 1).
- Produces:
  - `parseCandleQuery(raw: { tf?: string; from?: string; to?: string; limit?: string }): { timeframe: number; from?: Date; to?: Date; limit: number }`.
  - `SyntheticMarketService.getCandles(seed: number, q: SeriesQuery): Candle[]`; `.start(seed: number): { start: number; price: number }`.
  - `BacktestService`: `type DataSource = 'real' | 'synthetic'`; `CreateSessionInput.dataSource?: DataSource`; `sessionCandles(userId, id, q: { timeframe: number; from?: Date; to?: Date; limit: number })`; `getSession(...)` возвращает ещё `synthOutdated: boolean`; экспорт `isSynthOutdated(s)`.
  - HTTP: `GET /api/backtest/sessions/:id/candles`; `POST /api/backtest/sessions` принимает `dataSource`.

- [ ] **Step 1: Схема**

В `backend/prisma/schema.prisma` после строки `  priceScale     Float` вставить:

```prisma
  /// Откуда свечи: 'real' — отрезок price_candles, 'synthetic' — рынок строит генератор (backtest/synthetic).
  dataSource     String    @default("real")
  /// Зерно генератора; только у synthetic.
  seed           Int?
  /// Версия генератора (SYNTH_VERSION), которой построена сессия; только у synthetic.
  synthVersion   Int?
```

Run: `cd backend && npx prisma db push && npx prisma generate`
Expected: «Your database is now in sync», клиент сгенерирован. EPERM на generate — остановить локальный `nest start --watch` и повторить.

- [ ] **Step 2: Тесты сервиса генератора и BacktestService**

```ts
// backend/src/backtest/synthetic/synthetic-market.service.spec.ts
import { SyntheticMarketService } from './synthetic-market.service';

describe('SyntheticMarketService', () => {
  const service = new SyntheticMarketService();

  it('отдаёт свечи в форме хранилища и одинаково на повторный запрос', () => {
    const { start } = service.start(5);
    const q = { timeframe: 60, to: start - 1, limit: 3 };
    const first = service.getCandles(5, q);
    expect(first).toHaveLength(3);
    expect(first[0].time).toBeInstanceOf(Date);
    expect(Object.keys(first[0]).sort()).toEqual(['close', 'high', 'low', 'open', 'time', 'volume']);
    expect(service.getCandles(5, q)).toEqual(first);
  });

  it('цена старта — закрытие минутки перед стартом', () => {
    const { start, price } = service.start(6);
    const [last] = service.getCandles(6, { timeframe: 1, to: start - 60_000, limit: 1 });
    expect(price).toBe(last.close);
  });
});
```

В `backend/src/backtest/backtest.service.spec.ts`:

1) импорт вверху: `import { SYNTH_VERSION } from './synthetic/params';`
2) в `makeService` перед `const service = ...` добавить заглушку и передать её третьим аргументом:

```ts
  const synthetic = {
    start: jest.fn().mockReturnValue({ start: T0 + 400 * DAY, price: 60_000 }),
    getCandles: jest.fn().mockReturnValue([]),
  };
  const service = new BacktestService(prisma as never, marketData as never, synthetic as never);
  (service as unknown as { rnd: () => number }).rnd = () => 0;
  return { service, prisma, marketData, synthetic };
```

3) в `SESSION` добавить поля `dataSource: 'real', seed: null, synthVersion: null,`;
4) после `const INPUT = ...` добавить:

```ts
const SYNTH = { ...SESSION, dataSource: 'synthetic', seed: 77, synthVersion: SYNTH_VERSION, hideDate: true };
```

5) новый блок в конец файла:

```ts
describe('BacktestService — тренажёр', () => {
  it('создаёт synthetic-сессию без хранилища: зерно, версия, старт генератора, дата скрыта всегда', async () => {
    const { service, prisma, marketData, synthetic } = makeService();

    await service.createSession('u1', { ...INPUT, hideDate: false, dataSource: 'synthetic' });

    expect(marketData.getCoverage).not.toHaveBeenCalled();
    expect(synthetic.start).toHaveBeenCalledWith(0);
    expect(prisma.backtestSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        dataSource: 'synthetic',
        seed: 0,
        synthVersion: SYNTH_VERSION,
        startTime: new Date(T0 + 400 * DAY),
        cursorTime: new Date(T0 + 400 * DAY),
        hideDate: true,
        priceScale: 1,
      }),
    });
  });

  it('скрытая цена тренажёра — масштаб от цены генератора в точке старта', async () => {
    const { service, prisma } = makeService();

    await service.createSession('u1', { ...INPUT, hidePrice: true, dataSource: 'synthetic' });

    expect(prisma.backtestSession.create.mock.calls[0][0].data.priceScale).toBeCloseTo(100 / 60_000, 12);
  });

  it('свечи тренажёра — по зерну сессии, время в миллисекундах', async () => {
    const { service, prisma, synthetic } = makeService();
    prisma.backtestSession.findUnique.mockResolvedValue(SYNTH);

    await service.sessionCandles('u1', 's1', { timeframe: 60, to: new Date(T0), limit: 300 });

    expect(synthetic.getCandles).toHaveBeenCalledWith(77, { timeframe: 60, from: undefined, to: T0, limit: 300 });
  });

  it('свечи чужой сессии — 404', async () => {
    const { service, prisma } = makeService();
    prisma.backtestSession.findUnique.mockResolvedValue({ ...SYNTH, userId: 'u2' });

    const err = await rejection(service.sessionCandles('u1', 's1', { timeframe: 60, limit: 1 }));

    expect(err).toBeInstanceOf(NotFoundException);
  });

  it('у реальной сессии свечей генератора нет — 400', async () => {
    const { service, prisma } = makeService();
    prisma.backtestSession.findUnique.mockResolvedValue(SESSION);

    const err = await rejection(service.sessionCandles('u1', 's1', { timeframe: 60, limit: 1 }));

    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.getResponse()).toMatchObject({ code: 'BACKTEST_NOT_SYNTHETIC' });
  });

  it('сессия прежней версии генератора свечей не получает — 409', async () => {
    const { service, prisma, synthetic } = makeService();
    prisma.backtestSession.findUnique.mockResolvedValue({ ...SYNTH, synthVersion: SYNTH_VERSION - 1 });

    const err = await rejection(service.sessionCandles('u1', 's1', { timeframe: 60, limit: 1 }));

    expect(err).toBeInstanceOf(ConflictException);
    expect(err.getResponse()).toMatchObject({ code: 'BACKTEST_SYNTH_OUTDATED' });
    expect(synthetic.getCandles).not.toHaveBeenCalled();
  });

  it('неизвестный таймфрейм — 400', async () => {
    const { service, prisma } = makeService();
    prisma.backtestSession.findUnique.mockResolvedValue(SYNTH);

    const err = await rejection(service.sessionCandles('u1', 's1', { timeframe: 7, limit: 1 }));

    expect(err).toBeInstanceOf(BadRequestException);
  });

  it('сессия отдаёт признак устаревшей версии генератора', async () => {
    const { service, prisma } = makeService();
    prisma.backtestSession.findUnique.mockResolvedValue({ ...SYNTH, synthVersion: SYNTH_VERSION - 1 });
    expect((await service.getSession('u1', 's1')).synthOutdated).toBe(true);

    prisma.backtestSession.findUnique.mockResolvedValue(SYNTH);
    expect((await service.getSession('u1', 's1')).synthOutdated).toBe(false);

    prisma.backtestSession.findUnique.mockResolvedValue(SESSION);
    expect((await service.getSession('u1', 's1')).synthOutdated).toBe(false);
  });
});
```

- [ ] **Step 3: Запустить — падает** (`npx jest src/backtest`, ошибки компиляции: нет `sessionCandles`, нет модуля `synthetic-market.service`).

- [ ] **Step 4: Разбор запроса свечей**

```ts
// backend/src/market-data/candle-query.ts
import { BadRequestException } from '@nestjs/common';

// Потолок отдачи наружу. Внутренние потребители (market-events) лимит не
// передают и получают весь диапазон — им нужно 17 тысяч часовых свечей за два
// года, и резать их этим числом было бы ошибкой.
export const MAX_LIMIT = 5000;

// Непарсящееся значение не должно молча превращаться в «границы нет»: тогда
// битый `from`/`to` тихо отдаёт последние MAX_LIMIT свечей вместо запрошенного
// окна, и клиент получает HTTP 200 с правдоподобными, но неверными данными.
// Отсутствующий параметр (не передан вовсе) — это законное «границы нет», и
// его правка не касается.
const asDate = (raw: string | undefined, paramName: string): Date | undefined => {
  if (!raw) return undefined;
  const ms = Number(raw);
  if (!Number.isFinite(ms)) {
    throw new BadRequestException(
      `Параметр «${paramName}» не распознан: «${raw}». Формат — миллисекунды эпохи Unix.`,
    );
  }
  return new Date(ms);
};

export interface ParsedCandleQuery {
  timeframe: number;
  from?: Date;
  to?: Date;
  limit: number;
}

/** Параметры свечей из адреса — одни для хранилища и для сгенерированного рынка. */
export function parseCandleQuery(raw: { tf?: string; from?: string; to?: string; limit?: string }): ParsedCandleQuery {
  const requested = Number(raw.limit);
  return {
    timeframe: Number(raw.tf),
    from: asDate(raw.from, 'from'),
    to: asDate(raw.to, 'to'),
    limit: Number.isFinite(requested) && requested > 0 ? Math.min(requested, MAX_LIMIT) : MAX_LIMIT,
  };
}
```

`backend/src/market-data/market-data.controller.ts` целиком:

```ts
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { parseCandleQuery } from './candle-query';
import { MarketDataService } from './market-data.service';

/**
 * Данные публичные, но эндпоинт под гвардом: открытым он сделал бы из сервера
 * бесплатный прокси к истории BTC для кого угодно.
 */
@UseGuards(JwtAuthGuard)
@Controller('api/market-data')
export class MarketDataController {
  constructor(private readonly marketData: MarketDataService) {}

  @Get('candles')
  async getCandles(
    @Query('tf') tf?: string,
    @Query('symbol') symbol?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    return this.marketData.getCandles({ symbol, ...parseCandleQuery({ tf, from, to, limit }) });
  }

  @Get('coverage')
  async getCoverage(@Query('symbol') symbol?: string) {
    return this.marketData.getCoverage(symbol);
  }
}
```

- [ ] **Step 5: Сервис генератора**

```ts
// backend/src/backtest/synthetic/synthetic-market.service.ts
import { Injectable } from '@nestjs/common';
import type { Candle } from '../../market-data/market-data.service';
import type { Bar } from './model';
import { buildSeries, querySeries, startOf, type Series, type SeriesQuery } from './series';

/** Сколько осей держать построенными. Промах — не ошибка: тот же прогон даёт то же самое. */
const CACHE_SIZE = 16;

const toCandle = (b: Bar): Candle => ({
  time: new Date(b.t),
  open: b.o,
  high: b.h,
  low: b.l,
  close: b.c,
  volume: Math.round(b.v * 1000) / 1000,
});

/** Свечи сгенерированного рынка по зерну сессии. Перезапуск api графиков не меняет. */
@Injectable()
export class SyntheticMarketService {
  private readonly cache = new Map<number, Series>();

  getCandles(seed: number, q: SeriesQuery): Candle[] {
    return querySeries(this.series(seed), q).map(toCandle);
  }

  /** Момент старта и цена в нём — для новой сессии; заодно прогревает кэш. */
  start(seed: number): { start: number; price: number } {
    return startOf(this.series(seed));
  }

  private series(seed: number): Series {
    const hit = this.cache.get(seed);
    if (hit) {
      // Map помнит порядок вставки: переставленная в конец запись — самая свежая.
      this.cache.delete(seed);
      this.cache.set(seed, hit);
      return hit;
    }
    const built = buildSeries(seed);
    this.cache.set(seed, built);
    if (this.cache.size > CACHE_SIZE) this.cache.delete(this.cache.keys().next().value);
    return built;
  }
}
```

- [ ] **Step 6: BacktestService**

Импорты — добавить к существующим:

```ts
import { TIMEFRAMES, isValidTimeframe } from '../market-data/timeframes';
import { SYNTH_VERSION } from './synthetic/params';
import { SyntheticMarketService } from './synthetic/synthetic-market.service';
```

`CreateSessionInput` заменить на:

```ts
export type DataSource = 'real' | 'synthetic';

export interface CreateSessionInput {
  startBalance: number;
  hideDate: boolean;
  hidePrice: boolean;
  /** Не задан — реальная история. */
  dataSource?: DataSource;
}

export interface SessionCandlesInput {
  timeframe: number;
  from?: Date;
  to?: Date;
  limit: number;
}
```

После `sessionFinished` добавить:

```ts
/** Сессия построена прежней версией генератора: её график больше не построить. */
export const isSynthOutdated = (s: { dataSource: string; synthVersion: number | null }) =>
  s.dataSource === 'synthetic' && s.synthVersion !== SYNTH_VERSION;

const synthOutdated = () =>
  new ConflictException({
    message: 'Генератор рынка обновился — график этой сессии больше не построить',
    code: 'BACKTEST_SYNTH_OUTDATED',
  });
```

Конструктор:

```ts
  constructor(
    protected readonly prisma: PrismaService,
    protected readonly marketData: MarketDataService,
    protected readonly synthetic: SyntheticMarketService,
  ) {}
```

Первой строкой `createSession`:

```ts
    if (input.dataSource === 'synthetic') return this.createSyntheticSession(userId, input);
```

После `createSession` — новые методы:

```ts
  protected async createSyntheticSession(userId: string, input: CreateSessionInput) {
    // Зерно выбирает сервер тем же случаем, что и старт реальной сессии.
    const seed = Math.floor(this.rnd() * 2 ** 31);
    const { start, price } = this.synthetic.start(seed);
    const session = await this.prisma.backtestSession.create({
      data: {
        userId,
        dataSource: 'synthetic',
        seed,
        synthVersion: SYNTH_VERSION,
        startTime: new Date(start),
        cursorTime: new Date(start),
        startBalance: input.startBalance,
        balance: input.startBalance,
        // Даты у сгенерированного рынка вымышленные — показывать их незачем.
        hideDate: true,
        hidePrice: input.hidePrice,
        priceScale: input.hidePrice ? pickPriceScale(price, this.rnd) : 1,
        status: 'active',
      },
    });
    return { session };
  }

  async sessionCandles(userId: string, id: string, q: SessionCandlesInput) {
    const s = await this.ownedSession(userId, id);
    if (s.dataSource !== 'synthetic') {
      throw new BadRequestException({
        message: 'У этой сессии реальный график, а не сгенерированный',
        code: 'BACKTEST_NOT_SYNTHETIC',
      });
    }
    if (isSynthOutdated(s)) throw synthOutdated();
    if (!isValidTimeframe(q.timeframe)) {
      throw new BadRequestException(`Неизвестный таймфрейм: ${q.timeframe}. Допустимы: ${TIMEFRAMES.join(', ')}`);
    }
    return this.synthetic.getCandles(s.seed, {
      timeframe: q.timeframe,
      from: q.from?.getTime(),
      to: q.to?.getTime(),
      limit: q.limit,
    });
  }
```

В `getSession` в возвращаемый объект после `session,` добавить строку `synthOutdated: isSynthOutdated(session),`.

- [ ] **Step 7: DTO, контроллер, модуль**

В `CreateSessionDto` после `hidePrice`:

```ts
  /** Не задан — реальная история. */
  @IsOptional()
  @IsIn(['real', 'synthetic'])
  dataSource?: 'real' | 'synthetic';
```

`backtest.controller.ts`: в импорт из `@nestjs/common` добавить `Query`; добавить импорт `import { parseCandleQuery } from '../market-data/candle-query';`; после метода `get` добавить:

```ts
  // Только у тренажёра: у реальной сессии свечи из /api/market-data/candles.
  @Get('sessions/:id/candles')
  candles(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Query('tf') tf?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    return this.backtest.sessionCandles(userId, id, parseCandleQuery({ tf, from, to, limit }));
  }
```

`backtest.module.ts`: импорт `import { SyntheticMarketService } from './synthetic/synthetic-market.service';`, `providers: [BacktestService, SyntheticMarketService],`.

- [ ] **Step 8: Запустить — проходит**

Run: `cd backend && npx jest src/backtest src/market-data && npx tsc --noEmit -p tsconfig.json`
Expected: все PASS, tsc без ошибок.

- [ ] **Step 9: Коммит**

```bash
git add backend/prisma/schema.prisma backend/src/market-data/candle-query.ts backend/src/market-data/market-data.controller.ts backend/src/backtest
git commit -m "feat(backtest): synthetic-сессия и эндпоинт её свечей"
```

---

### Task 5: Сервер — завершение устаревшей сессии и статистика по источнику

**Files:**
- Modify: `backend/src/backtest/backtest.service.ts` (`finish`, `stats`, новый `closeAtEntry`)
- Modify: `backend/src/backtest/backtest.controller.ts` (`stats`)
- Test: `backend/src/backtest/backtest.service.spec.ts`

**Interfaces:**
- Consumes: `isSynthOutdated`, `DataSource`, `SYNTH` из Task 4.
- Produces: `stats(userId: string, source?: DataSource)`; HTTP `GET /api/backtest/stats?source=real|synthetic`.

- [ ] **Step 1: Тесты** — в блок `BacktestService — тренажёр`:

```ts
  it('устаревшая сессия завершается: открытый остаток закрыт по цене входа с комиссией', async () => {
    const { service, prisma } = makeService();
    const cursor = new Date(T0 + 401 * DAY);
    prisma.backtestSession.findUnique.mockResolvedValue({ ...SYNTH, synthVersion: SYNTH_VERSION - 1, cursorTime: cursor });
    prisma.backtestTrade.findMany.mockResolvedValue([
      { id: 't1', direction: 'long', entryPrice: 60_000, qty: 0.1, closedQty: 0.04, riskUsdt: 100 },
    ]);
    const fee = (60_000 + 60_000) * 0.06 * 0.00055;
    prisma.backtestTradeExit.findMany.mockResolvedValue([
      { fee: 1, pnl: 10 },
      { fee, pnl: -fee },
    ]);

    await service.finish('u1', 's1');

    const exit = prisma.backtestTradeExit.create.mock.calls[0][0].data;
    expect(exit).toMatchObject({ tradeId: 't1', price: 60_000, time: cursor, reason: 'finish' });
    expect(exit.qty).toBeCloseTo(0.06, 12);
    expect(exit.fee).toBeCloseTo(fee, 9);
    expect(exit.pnl).toBeCloseTo(-fee, 9);
    const update = prisma.backtestTrade.update.mock.calls[0][0];
    expect(update.where).toEqual({ id: 't1' });
    expect(update.data).toMatchObject({ closedQty: 0.1, exitTime: cursor, exitPrice: 60_000, exitReason: 'finish' });
    expect(update.data.pnl).toBeCloseTo(10 - fee, 9);
    expect(prisma.backtestCloseOrder.deleteMany).toHaveBeenCalledWith({ where: { trade: { sessionId: 's1' } } });
    expect(prisma.backtestSession.update).toHaveBeenLastCalledWith({
      where: { id: 's1' },
      data: { status: 'finished', finishedAt: expect.any(Date) },
    });
  });

  it('актуальная synthetic-сессия с открытой сделкой не завершается — закрывает браузер', async () => {
    const { service, prisma } = makeService();
    prisma.backtestSession.findUnique.mockResolvedValue(SYNTH);
    prisma.backtestTrade.count.mockResolvedValue(1);

    const err = await rejection(service.finish('u1', 's1'));

    expect(err.getResponse()).toMatchObject({ code: 'BACKTEST_OPEN_TRADE' });
    expect(prisma.backtestTradeExit.create).not.toHaveBeenCalled();
  });

  it('статистика тренажёра — только по synthetic-сессиям', async () => {
    const { service, prisma } = makeService();

    await service.stats('u1', 'synthetic');

    expect(prisma.backtestSession.count).toHaveBeenCalledWith({ where: { userId: 'u1', dataSource: 'synthetic' } });
    expect(prisma.backtestTrade.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { session: { userId: 'u1', dataSource: 'synthetic' }, exitTime: { not: null } } }),
    );
  });
```

И в существующем тесте `'берёт только закрытые сделки своих сессий'` ожидание заменить на:

```ts
    expect(prisma.backtestTrade.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { session: { userId: 'u1', dataSource: 'real' }, exitTime: { not: null } } }),
    );
```

- [ ] **Step 2: Запустить — падает** (`npx jest src/backtest/backtest.service.spec.ts`: новые тесты и изменённый — FAIL).

- [ ] **Step 3: Реализация**

В `finish` заменить две строки проверки открытой сделки:

```ts
      if (isSynthOutdated(s)) {
        // Цены момента у такой сессии больше нет — закрыть по рынку браузеру нечем.
        await this.closeAtEntry(tx, id, s.cursorTime);
      } else {
        // Позицию закрывает браузер (он знает цену момента), сервер только проверяет.
        const open = await tx.backtestTrade.count({ where: { sessionId: id, exitTime: null } });
        if (open > 0) throw new ConflictException({ message: 'Сначала закройте открытую сделку', code: 'BACKTEST_OPEN_TRADE' });
      }
```

Перед `protected async ownedTrade` добавить:

```ts
  /**
   * Закрывает открытый остаток по цене входа: движение ноль, комиссия по обычной
   * формуле. Любая другая цена была бы выдуманной, а удалить сделку нельзя — её
   * частичные закрытия уже в депозите.
   */
  protected async closeAtEntry(tx: Prisma.TransactionClient, sessionId: string, time: Date) {
    const open = await tx.backtestTrade.findMany({ where: { sessionId, exitTime: null } });
    for (const trade of open) {
      const qty = trade.qty - trade.closedQty;
      if (qty > QTY_EPS) {
        const { fee, pnl } = tradeResult({
          direction: trade.direction as Direction,
          entryPrice: trade.entryPrice,
          exitPrice: trade.entryPrice,
          qty,
          riskUsdt: trade.riskUsdt,
        });
        await tx.backtestTradeExit.create({
          data: { tradeId: trade.id, qty, price: trade.entryPrice, time, reason: 'finish', fee, pnl },
        });
        await tx.backtestSession.update({ where: { id: sessionId }, data: { balance: { increment: pnl } } });
      }
      const exits = await tx.backtestTradeExit.findMany({ where: { tradeId: trade.id } });
      const totalFee = exits.reduce((a, e) => a + e.fee, 0);
      const totalPnl = exits.reduce((a, e) => a + e.pnl, 0);
      await tx.backtestTrade.update({
        where: { id: trade.id },
        data: {
          closedQty: trade.qty,
          exitTime: time,
          exitPrice: trade.entryPrice,
          exitReason: 'finish',
          fee: totalFee,
          pnl: totalPnl,
          r: totalPnl / trade.riskUsdt,
        },
      });
    }
    await tx.backtestCloseOrder.deleteMany({ where: { trade: { sessionId } } });
  }
```

`stats`:

```ts
  /**
   * Сделки тренажёра и реальной истории не смешиваются: генератор сам содержит
   * тренды и отбои, и результат тега на нём — о генераторе, а не о рынке.
   */
  async stats(userId: string, source: DataSource = 'real') {
    const [sessions, trades] = await Promise.all([
      this.prisma.backtestSession.count({ where: { userId, dataSource: source } }),
      this.prisma.backtestTrade.findMany({
        where: { session: { userId, dataSource: source }, exitTime: { not: null } },
        include: TAGS,
      }),
    ]);
```

(остальное тело без изменений).

Контроллер:

```ts
  @Get('stats')
  stats(@CurrentUser('userId') userId: string, @Query('source') source?: string) {
    return this.backtest.stats(userId, source === 'synthetic' ? 'synthetic' : 'real');
  }
```

- [ ] **Step 4: Запустить — проходит** (`npx jest src/backtest && npx tsc --noEmit -p tsconfig.json`).

- [ ] **Step 5: Коммит**

```bash
git add backend/src/backtest/backtest.service.ts backend/src/backtest/backtest.controller.ts backend/src/backtest/backtest.service.spec.ts
git commit -m "feat(backtest): завершение сессии прежней версии генератора, статистика по источнику"
```

---

### Task 6: Фронт — источник свечей и данные

**Files:**
- Modify: `frontend/src/views/backtest/api/types.ts`
- Modify: `frontend/src/views/backtest/lib/candles.ts`
- Test: `frontend/src/views/backtest/lib/candles.test.ts`
- Modify: `frontend/src/views/backtest/api/hooks.ts`
- Modify: `frontend/src/views/backtest/model/useReplay.ts`

**Interfaces:**
- Consumes: HTTP из Task 4–5.
- Produces: `type DataSource = 'real' | 'synthetic'`; `BacktestSession.dataSource`; `SessionDetail.synthOutdated`; `candlesPath(s: { id: string; dataSource: DataSource }): string`; `fetchCandles(session, tf, range)`; `useCreateSession` принимает `dataSource`; `useBacktestStats(source: DataSource)`.

- [ ] **Step 1: Тест** — дописать в `frontend/src/views/backtest/lib/candles.test.ts` (импорт `candlesPath` добавить к существующему импорту из `./candles`):

```ts
describe('candlesPath', () => {
  it('реальная сессия — хранилище BTC, тренажёр — свечи своей сессии', () => {
    expect(candlesPath({ id: 's1', dataSource: 'real' })).toBe('/api/market-data/candles');
    expect(candlesPath({ id: 's1', dataSource: 'synthetic' })).toBe('/api/backtest/sessions/s1/candles');
  });
});
```

- [ ] **Step 2: Запустить — падает** (`cd frontend && npx vitest run src/views/backtest/lib/candles.test.ts`).

- [ ] **Step 3: Реализация**

`types.ts`: после `export type ExitReason = ...` добавить

```ts
/** Откуда свечи сессии: отрезок истории BTC или сгенерированный рынок тренажёра. */
export type DataSource = 'real' | 'synthetic';
```

в `BacktestSession` после `priceScale: number;` — `dataSource: DataSource;`; в `SessionDetail` после `session: BacktestSession;` —

```ts
  /** Тренажёр прежней версии генератора: графика нет, сессию можно только завершить. */
  synthOutdated: boolean;
```

`lib/candles.ts` — в конец:

```ts
/** Откуда брать свечи: реальная сессия — хранилище BTC, тренажёр — генератор этой сессии. */
export const candlesPath = (s: { id: string; dataSource: 'real' | 'synthetic' }) =>
  s.dataSource === 'synthetic' ? `/api/backtest/sessions/${s.id}/candles` : '/api/market-data/candles';
```

`hooks.ts`:
- импорт из `../lib/candles`: `import { candlesPath, fromApi, type ApiCandle, type Candle } from '../lib/candles';`; в импорт типов добавить `DataSource`;
- `useBacktestStats`:

```ts
export const useBacktestStats = (source: DataSource) =>
  useQuery({
    queryKey: ['backtest', 'stats', source],
    queryFn: () => apiJson<BacktestStats>(`/api/backtest/stats${qs({ source })}`),
  });
```

- `useCreateSession` — тип входа `{ startBalance: number; hideDate: boolean; hidePrice: boolean; dataSource: DataSource }`;
- `fetchCandles`:

```ts
/** Свечи сессии. Без from и с limit — последние limit свечей до to, по возрастанию. */
export async function fetchCandles(
  session: { id: string; dataSource: DataSource },
  tf: number,
  range: { from?: number; to?: number; limit: number },
): Promise<Candle[]> {
  const rows = await apiJson<ApiCandle[]>(
    `${candlesPath(session)}${qs({ tf, from: range.from, to: range.to, limit: range.limit })}`,
  );
  return rows.map(fromApi);
}
```

`useReplay.ts`:
- после `const sessionId = detail.session.id;`:

```ts
  const dataSource = detail.session.dataSource;
  const source = useMemo(() => ({ id: sessionId, dataSource }), [sessionId, dataSource]);
```

- `fetchCandles(1, { from, limit: CHUNK })` → `fetchCandles(source, 1, { from, limit: CHUNK })`, зависимости `ensureMinutes` `[]` → `[source]`;
- `fetchCandles(t, { to: anchor - 1, limit: CLOSED_LIMIT })` → `fetchCandles(source, t, { ... })`, зависимости `loadClosed` `[]` → `[source]`;
- `fetchCandles(tf, { to: earliest - 1, limit: HISTORY_CHUNK })` → `fetchCandles(source, tf, { ... })`, зависимости `loadMoreHistory` `[closed, shownTf]` → `[closed, shownTf, source]`;
- комментарий у `CHUNK`: `/** Потолок эндпоинта свечей на один запрос. */`.

- [ ] **Step 4: Запустить** (`npx vitest run src/views/backtest && npx tsc --noEmit`). Ожидание: vitest PASS; tsc падает только в `StartSession.tsx` (нет `dataSource`) и `Page.tsx` (нет аргумента `useBacktestStats`) — чинится в Task 7.

- [ ] **Step 5: Коммит** — вместе с Task 7 (без него фронт не собирается).

---

### Task 7: Фронт — экраны тренажёра и тексты

**Files:**
- Modify: `frontend/src/views/backtest/components/StartSession.tsx`
- Modify: `frontend/src/views/backtest/components/SessionScreen.tsx`
- Modify: `frontend/src/views/backtest/components/SessionSummary.tsx`
- Modify: `frontend/src/views/backtest/components/SessionsList.tsx`
- Modify: `frontend/src/views/backtest/components/StatsBlock.tsx`
- Modify: `frontend/src/views/backtest/Page.tsx`
- Modify: `frontend/src/shared/i18n/messages/ru.json`, `en.json`

**Interfaces:**
- Consumes: всё из Task 6.
- Produces: `StatsBlock` принимает `source: DataSource`, `onSource: (s: DataSource) => void`.

- [ ] **Step 1: Тексты**

`ru.json`, после `    "hide": "Скрыть",`:

```json
    "market": "График",
    "marketReal": "Реальный",
    "marketSynthetic": "Тренажёр",
    "syntheticLead": "Рынок строится заново для каждой сессии: тренды, флэт, уровни и волатильность как у BTC, но это не история — отрезок не узнать. Дата всегда скрыта, статистика тренажёра считается отдельно от реальных сессий.",
    "startingSynthetic": "Строим рынок…",
    "syntheticBadge": "Тренажёр: рынок сгенерирован",
    "syntheticTag": "тренажёр",
    "syntheticRevealed": "Рынок был сгенерирован — настоящих дат у отрезка нет.",
    "finishRevealSynthetic": "Откроются цены сгенерированного рынка.",
    "outdatedTitle": "Сессию не продолжить",
    "outdatedText": "Генератор рынка обновился, и график этой сессии больше не построить. Сессию можно только завершить.",
    "outdatedOpenTrades": "Открытые сделки закроются по цене входа — с комиссией, без движения цены.",
    "statsSource": "Какие сессии",
    "statsReal": "Реальные",
    "statsSynthetic": "Тренажёр",
```

после `    "BACKTEST_TIME_INVALID": "Время сделки вне сессии или раньше входа"` (добавив запятую к этой строке):

```json
    "BACKTEST_NOT_SYNTHETIC": "У этой сессии реальный график, а не сгенерированный",
    "BACKTEST_SYNTH_OUTDATED": "Генератор рынка обновился — график этой сессии больше не построить"
```

`en.json`, после `    "hide": "Hide",` (в блоке `backtest`):

```json
    "market": "Chart",
    "marketReal": "Real",
    "marketSynthetic": "Simulator",
    "syntheticLead": "A fresh market is built for every session: trends, ranges, levels and volatility like BTC, but it isn't history — you can't recognise the stretch. The date is always hidden, and simulator stats are kept apart from real sessions.",
    "startingSynthetic": "Building the market…",
    "syntheticBadge": "Simulator: generated market",
    "syntheticTag": "simulator",
    "syntheticRevealed": "The market was generated — this stretch has no real dates.",
    "finishRevealSynthetic": "The generated market's prices will be revealed.",
    "outdatedTitle": "This session can't continue",
    "outdatedText": "The market generator has been updated, and this session's chart can no longer be built. The session can only be finished.",
    "outdatedOpenTrades": "Open trades will be closed at their entry price — with fees, no price move.",
    "statsSource": "Which sessions",
    "statsReal": "Real",
    "statsSynthetic": "Simulator",
```

после `    "BACKTEST_TIME_INVALID": "The trade time is outside the session or before the entry"` (с запятой):

```json
    "BACKTEST_NOT_SYNTHETIC": "This session has a real chart, not a generated one",
    "BACKTEST_SYNTH_OUTDATED": "The market generator has been updated — this session's chart can no longer be built"
```

- [ ] **Step 2: `StartSession.tsx`** целиком:

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
import type { DataSource } from '../api/types';

type Visibility = 'show' | 'hide';

/**
 * Параметры новой сессии. Дата по умолчанию скрыта: «это март 2020» — и трейдер
 * уже помнит, куда пошла цена. Цена по умолчанию видна: условная шкала от 100
 * до 1000 непривычна, и включать её — осознанный выбор. У тренажёра даты
 * вымышленные, поэтому поля «Дата» у него нет — сервер скрывает её сам.
 */
export function StartSession({ onStarted }: { onStarted: (id: string) => void }) {
  const t = useTranslations('backtest');
  const [market, setMarket] = useState<DataSource>('real');
  const [deposit, setDeposit] = useState('10000');
  const [date, setDate] = useState<Visibility>('hide');
  const [price, setPrice] = useState<Visibility>('show');
  const create = useCreateSession();

  const synthetic = market === 'synthetic';
  const depositN = Number(deposit);
  const valid = depositN >= 100 && depositN <= 10_000_000;
  const markets: SegOption<DataSource>[] = [
    { value: 'real', label: t('marketReal') },
    { value: 'synthetic', label: t('marketSynthetic') },
  ];
  const visibility: SegOption<Visibility>[] = [
    { value: 'show', label: t('show') },
    { value: 'hide', label: t('hide') },
  ];

  return (
    <section>
      <SectionHead title={t('startTitle')} />
      <FieldGroup label={t('market')}>
        <Seg options={markets} value={market} onChange={setMarket} ariaLabel={t('market')} />
      </FieldGroup>
      <p className="muted">{synthetic ? t('syntheticLead') : t('startLead')}</p>
      <Field label={t('deposit')}>
        {(id) => <Input id={id} full inputMode="decimal" value={deposit} onChange={(e) => setDeposit(e.target.value)} />}
      </Field>
      {!synthetic && (
        <FieldGroup label={t('date')}>
          <Seg options={visibility} value={date} onChange={setDate} ariaLabel={t('date')} />
        </FieldGroup>
      )}
      <FieldGroup label={t('price')}>
        <Seg options={visibility} value={price} onChange={setPrice} ariaLabel={t('price')} />
      </FieldGroup>
      <Button
        variant="solid"
        disabled={!valid || create.isPending}
        onClick={() =>
          create.mutate(
            { startBalance: depositN, dataSource: market, hideDate: synthetic || date === 'hide', hidePrice: price === 'hide' },
            { onSuccess: (r) => onStarted(r.session.id) },
          )
        }
      >
        {create.isPending ? t(synthetic ? 'startingSynthetic' : 'starting') : t('start')}
      </Button>
      <ErrorNote error={create.error} fallback={t('startFailed')} />
    </section>
  );
}
```

- [ ] **Step 3: `SessionScreen.tsx`**

1) импорт: `import { SectionHead } from '@/shared/ui/SectionHead';`
2) в `SessionScreen` между веткой `finished` и `return <ActiveSession …/>`:

```tsx
  if (data.synthOutdated)
    return (
      <Wrap page>
        <OutdatedSession detail={data} onLeave={onLeave} />
      </Wrap>
    );
```

3) сразу после функции `SessionScreen`:

```tsx
/**
 * Тренажёр прежней версии генератора: графика больше нет, торговать не на чем.
 * Остаётся завершить — открытые сделки сервер сам закроет по цене входа.
 */
function OutdatedSession({ detail, onLeave }: { detail: SessionDetail; onLeave: () => void }) {
  const t = useTranslations('backtest');
  const finishM = useFinishSession(detail.session.id);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const hasOpen = detail.trades.some((x) => x.exitTime == null);

  return (
    <>
      <SectionHead title={t('outdatedTitle')}>
        <Button tight onClick={onLeave}>
          {t('backToList')}
        </Button>
      </SectionHead>
      <p>{t('outdatedText')}</p>
      <Button
        variant="solid"
        disabled={finishM.isPending}
        onClick={() =>
          setConfirm({
            title: t('finishTitle'),
            subtitle: t('finishSubtitle'),
            consequences: [...(hasOpen ? [t('outdatedOpenTrades')] : []), t('finishRevealSynthetic')],
            word: t('finishWord'),
            onConfirm: () => finishM.mutate(),
          })
        }
      >
        {t('finish')}
      </Button>
      <ErrorNote error={finishM.error} fallback={t('actionFailed')} />
      {confirm && <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />}
    </>
  );
}
```

4) в `askFinish` последний элемент `consequences`: `session.dataSource === 'synthetic' ? t('finishRevealSynthetic') : t('finishReveal')`;
5) в `.replay-controls` перед кнопкой «К списку»:

```tsx
            {session.dataSource === 'synthetic' && <span className="muted">{t('syntheticBadge')}</span>}
```

- [ ] **Step 4: `SessionSummary.tsx`** — строку с `revealed` заменить на:

```tsx
      <p>
        {session.dataSource === 'synthetic'
          ? t('syntheticRevealed')
          : t('revealed', { from: full(Date.parse(session.startTime)), to: full(Date.parse(session.cursorTime)) })}
      </p>
```

и в комментарии компонента после «настоящие цены сделок.» добавить «У тренажёра дат нет — вместо них строка о том, что рынок сгенерирован.»

- [ ] **Step 5: `SessionsList.tsx`** — `render` колонки `blind`:

```tsx
      render: (s) =>
        [s.dataSource === 'synthetic' ? t('syntheticTag') : s.hideDate && t('blindDate'), s.hidePrice && t('blindPrice')]
          .filter(Boolean)
          .join(', ') || <span className="muted">—</span>,
```

- [ ] **Step 6: `StatsBlock.tsx` и `Page.tsx`**

`StatsBlock.tsx`: импорты `import { Seg, type SegOption } from '@/shared/ui/Seg';`, в импорт типов добавить `DataSource`; сигнатура и заголовок:

```tsx
export function StatsBlock({
  stats,
  isLoading,
  source,
  onSource,
}: {
  stats?: BacktestStats;
  isLoading: boolean;
  source: DataSource;
  onSource: (source: DataSource) => void;
}) {
  const t = useTranslations('backtest');
  const sources: SegOption<DataSource>[] = [
    { value: 'real', label: t('statsReal') },
    { value: 'synthetic', label: t('statsSynthetic') },
  ];
```

```tsx
      <SectionHead title={t('statsTitle')}>
        <Seg options={sources} value={source} onChange={onSource} ariaLabel={t('statsSource')} />
      </SectionHead>
```

в комментарий компонента добавить: «Тренажёр и реальные сессии — раздельно: результат тега на сгенерированном рынке говорит о генераторе, а не о рынке.»

`Page.tsx`: импорт `import type { DataSource } from './api/types';`;

```tsx
  const [statsSource, setStatsSource] = useState<DataSource>('real');
  const stats = useBacktestStats(statsSource);
```

```tsx
          <StatsBlock stats={stats.data} isLoading={stats.isLoading} source={statsSource} onSource={setStatsSource} />
```

- [ ] **Step 7: Проверки**

Run: `cd frontend && npx vitest run src/views/backtest && npx eslint src/views/backtest && npx next build`
Expected: vitest PASS, eslint без ошибок, build успешен.

- [ ] **Step 8: Коммит Task 6 + 7**

```bash
git add frontend/src/views/backtest frontend/src/shared/i18n/messages/ru.json frontend/src/shared/i18n/messages/en.json
git commit -m "feat(backtest): режим «Тренажёр» на фронте — старт, свечи, итог, статистика"
```

---

### Task 8: Проверка целиком и запись решения

**Files:**
- Modify: `CLAUDE.md` (новый раздел после «Бектест: панель ордера не знает об открытых сделках»)

- [ ] **Step 1: Бэкенд целиком** — `cd backend && npx jest && npx tsc --noEmit -p tsconfig.json`. Ожидание: PASS.

- [ ] **Step 2: Раздел в CLAUDE.md**

```markdown
## Бектест: тренажёр на сгенерированном рынке

Режим сессии «Тренажёр» (`dataSource = 'synthetic'`) — свечи строит генератор
`backend/src/backtest/synthetic/`, а не `price_candles`. Спека —
`docs/superpowers/specs/2026-09-14-backtest-synthetic-market-design.md`.

- **Свечи не хранятся**: график — функция от `(seed, SYNTH_VERSION, время)`. У каждых
  суток свой поток ГПСЧ и контрольная точка состояния — куски свечей в любом порядке
  сходятся без шва.
- **Любая правка генератора, меняющая путь цены, поднимает `SYNTH_VERSION`.** Сессия
  прежней версии свечей не получает (409 `BACKTEST_SYNTH_OUTDATED`) и только
  завершается: открытый остаток сервер закрывает по цене входа.
- **Параметры подбираются по `src/scripts/synthetic-market-preview.ts`**, а не на глаз.
- **Статистика тренажёра отдельно от реальных сессий** (`/api/backtest/stats?source=`):
  тренды и отбои заложены в сам генератор, и результат тега на нём — о генераторе.
- `hideDate` у тренажёра всегда true: даты от вымышленной эпохи 2000-01-03.
```

- [ ] **Step 3: Коммит**

```bash
git add CLAUDE.md docs/superpowers/specs/2026-09-14-backtest-synthetic-market-design.md
git commit -m "docs: решения по тренажёру на сгенерированном рынке"
```

- [ ] **Step 4:** Сказать пользователю, что смотреть в браузере: старт сессии «Тренажёр», переключение ТФ, пан назад, автопрокрутку; таблицу калибровки — вывод скрипта из Task 3.
