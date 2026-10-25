# Экспериментальные индикаторы вероятностей — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Четыре экспериментальных индикатора терминала — шанс тейка, статистика тегов, дивергенции RSI в истории, деривативы BTC — включаемые в настройках графика.

**Architecture:** Шанс тейка и вывод по тегу считаются на фронте чистыми функциями от данных, которые уже есть. Частоты дивергенций и зон деривативов считает новый фоновый сервис `worker` (`backend/src/probabilities`) раз в сутки по свечам BTC из `price_candles` и рядам Bybit, которые он сам доливает в `deriv_points`; `api` отдаёт готовые числа `GET /api/probabilities`. Терминал рисует их плашкой поверх графика.

**Tech Stack:** NestJS + Prisma (PostgreSQL), Jest; Next.js App Router + React Query + next-intl, Vitest.

**Спека:** `docs/superpowers/specs/2026-10-25-probability-indicators-design.md`.

## Global Constraints

- Все четыре выключателя по умолчанию **выключены**; ключи `virex.terminal.exp.take|tags|signals|derivs`.
- Любой запрос к Bybit — только `bybitFetch` из `backend/src/bybit/bybit-gate.ts` (тест шлюза проверяет исходники).
- Фоновый сервис — guard `runsBackgroundJobs()` первой строкой `onApplicationBootstrap`.
- Исход: барьеры `±1 ATR(14)` своего таймфрейма от закрытия свечи события, горизонт 20 свечей; касание обоих в одной свече и «ни одного» — вне выборки.
- Проверка вперёд: история — события до `2023-01-01T00:00Z`, проверка — с неё. «Держится» = в истории доля стороны > 50 % и нижняя граница 95 % Вильсона на проверке > 50 %.
- Зона ряда — среди значений за 180 дней до точки (1080 свечей 4ч), крайние 10 %, строго выше/ниже.
- Пункты 3–4 — только BTCUSDT и только на живом рынке (`isLiveSession`); плашка — HTML поверх графика, `pointer-events: none`, без блюра и свечения.
- Цвета — классами `globals.css` (`.pos`, `.neg`, `.muted`), не инлайновым `style`.
- Тексты интерфейса — next-intl, ключи в обеих локалях (`ru.json`, `en.json`).
- Не запускать `next build` после каждой задачи — только в задаче 11.

## Карта файлов

Бэкенд, новый модуль `backend/src/probabilities/`:
- `odds-math.ts` — Вильсон, ATR, исход по барьерам, частота стороны, зоны, события зон. Чистые функции.
- `rsi.ts` — побайтная копия `frontend/src/widgets/backtest-session/lib/rsi.ts`; `rsi-copy.spec.ts` сверяет.
- `divergence-stats.ts` — частоты после дивергенций одного таймфрейма.
- `deriv-stats.ts` — выравнивание рядов по 4ч, ряд зоны, частоты зон, текущее состояние.
- `deriv-feed.ts` — описание рядов Bybit, окна запросов, доливка в `deriv_points`.
- `probability-stats.service.ts` — фоновый сервис `worker`: доливка раз в час, «сейчас», пересчёт раз в сутки.
- `probabilities.service.ts`, `probabilities.controller.ts`, `probabilities.module.ts`, `types.ts` — `GET /api/probabilities`.
- Правки: `prisma/schema.prisma` (две модели), `app.module.ts`, `backtest/backtest-math.ts` (`winLossR`), `backtest/backtest.service.ts` (`byTag`).

Фронт:
- `widgets/backtest-session/lib/rsi.ts` — `divergenceEventsOf` (и формат по prettier бэка).
- `widgets/backtest-session/lib/odds.ts` — `takeOdds`.
- `widgets/backtest-session/lib/odds-plaque.ts` — свежая дивергенция, подпись значения ряда.
- `widgets/backtest-session/model/useChartSettings.ts` — выключатели.
- `widgets/backtest-session/model/useTagOdds.ts` — числа тегов для окна.
- `widgets/backtest-session/components/OddsPlaque.tsx` — плашка.
- Правки: `ChartSettingsPanel.tsx`, `SessionScreen.tsx`, `ReplayChart.tsx` (`Level.oddsAt`), `lib/draft-levels.ts`, `api/hooks.ts` и `api/types.ts`, `index.ts`.
- `shared/lib/utils/wilson.ts`; `entities/tag/lib/odds.ts`, `entities/tag/ui/TagOddsLine.tsx`, правки `TagPicker.tsx`, `TagsDialog.tsx`, `api/hooks.ts`, `index.ts`.
- `entities/probabilities/` — типы и `useProbabilities`.
- `views/terminal/components/TerminalScreen.tsx`, `ExchangeHistory.tsx`, `views/landing/components/TerminalDemo.tsx` — пропсы.
- `app/globals.css`, `shared/i18n/messages/{ru,en}.json`.

Команды тестов: бэкенд — `cd backend && npx jest src/probabilities`; фронт — `cd frontend && npx vitest run <путь>`.

---

### Task 1: Математика вероятностей (бэкенд)

**Files:**
- Create: `backend/src/probabilities/odds-math.ts`
- Test: `backend/src/probabilities/odds-math.spec.ts`

**Interfaces:**
- Produces: `Bar`, `Side`, `Zone`, `OddsCount`, `OddsStat`, `Outcome`, `SPLIT`, `HORIZON`, `ATR_LEN`, `wilson(hits, n)`, `countOf(hits, n)`, `atrOf(bars, len?)`, `firstBarrier(bars, i, dist, horizon?)`, `statOf(outcomes, side | 'auto', split?)`, `zonesOf(values, window, tail?, minFill?)`, `zoneEvents(zones, cooldown?)`.

- [ ] **Step 1: Написать падающие тесты**

```ts
// backend/src/probabilities/odds-math.spec.ts
import {
  atrOf,
  countOf,
  firstBarrier,
  statOf,
  wilson,
  zoneEvents,
  zonesOf,
  type Bar,
  type Outcome,
} from './odds-math';

const bar = (t: number, c: number, h = c, l = c): Bar => ({ t, h, l, c });

describe('wilson', () => {
  it('без наблюдений — весь отрезок', () => {
    expect(wilson(0, 0)).toEqual({ low: 0, high: 100 });
  });
  it('70 из 100 — около 60.4…78.1', () => {
    const w = wilson(70, 100);
    expect(w.low).toBeCloseTo(60.42, 1);
    expect(w.high).toBeCloseTo(78.12, 1);
  });
  it('5 из 5 — нижняя граница выше 50', () => {
    expect(wilson(5, 5).low).toBeGreaterThan(50);
  });
});

describe('countOf', () => {
  it('доля в процентах и интервал', () => {
    const c = countOf(3, 4);
    expect(c.n).toBe(4);
    expect(c.hits).toBe(3);
    expect(c.share).toBe(75);
    expect(c.low).toBeLessThan(75);
    expect(c.high).toBeGreaterThan(75);
  });
});

describe('atrOf', () => {
  it('разгон — NaN, дальше ровный TR', () => {
    // Каждая свеча: размах 10, закрытие на прошлом уровне — TR = 10.
    const bars = Array.from({ length: 30 }, (_, i) => bar(i, 100, 105, 95));
    const atr = atrOf(bars, 14);
    for (let i = 0; i < 14; i++) expect(Number.isNaN(atr[i])).toBe(true);
    expect(atr[14]).toBeCloseTo(10, 10);
    expect(atr[29]).toBeCloseTo(10, 10);
  });
});

describe('firstBarrier', () => {
  const base = [bar(0, 100)];
  it('вверх первым', () => {
    expect(firstBarrier([...base, bar(1, 101, 102, 99.5), bar(2, 109, 111, 108)], 0, 10)).toBe('up');
  });
  it('вниз первым', () => {
    expect(firstBarrier([...base, bar(1, 95, 101, 89)], 0, 10)).toBe('down');
  });
  it('обе границы в одной свече — вне выборки', () => {
    expect(firstBarrier([...base, bar(1, 100, 111, 89)], 0, 10)).toBeNull();
  });
  it('за горизонт не дошла — вне выборки', () => {
    const flat = Array.from({ length: 30 }, (_, i) => bar(i, 100, 101, 99));
    expect(firstBarrier(flat, 0, 10, 20)).toBeNull();
  });
  it('касание после горизонта не считается', () => {
    const bars = [...Array.from({ length: 22 }, (_, i) => bar(i, 100, 101, 99)), bar(22, 120, 120, 119)];
    expect(firstBarrier(bars, 0, 10, 20)).toBeNull();
  });
});

describe('statOf', () => {
  const SPLIT = 1000;
  const o = (t: number, side: 'up' | 'down'): Outcome => ({ t, side });

  it('пусто — null', () => {
    expect(statOf([], 'up', SPLIT)).toBeNull();
  });
  it('история и проверка делятся по SPLIT, «держится» при сильной проверке', () => {
    const outs = [
      ...Array.from({ length: 10 }, (_, i) => o(i, i < 8 ? 'up' : 'down')),
      ...Array.from({ length: 10 }, (_, i) => o(SPLIT + i, 'up')),
    ];
    const s = statOf(outs, 'up', SPLIT)!;
    expect(s.side).toBe('up');
    expect(s.train).toMatchObject({ n: 10, hits: 8, share: 80 });
    expect(s.test).toMatchObject({ n: 10, hits: 10, share: 100 });
    expect(s.holds).toBe(true);
  });
  it('медвежья сторона считает «вниз»', () => {
    const s = statOf([o(1, 'down'), o(2, 'down'), o(3, 'up')], 'down', SPLIT)!;
    expect(s.train).toMatchObject({ n: 3, hits: 2 });
  });
  it('auto берёт сторону, чаще шедшую первой в истории', () => {
    const s = statOf([o(1, 'down'), o(2, 'down'), o(3, 'up'), o(SPLIT, 'down')], 'auto', SPLIT)!;
    expect(s.side).toBe('down');
    expect(s.test).toMatchObject({ n: 1, hits: 1 });
  });
  it('без проверки или со слабой — не держится', () => {
    expect(statOf([o(1, 'up'), o(2, 'up')], 'up', SPLIT)!.holds).toBe(false);
    const weak = statOf([o(1, 'up'), o(2, 'up'), o(SPLIT, 'up'), o(SPLIT + 1, 'down')], 'up', SPLIT)!;
    expect(weak.holds).toBe(false);
  });
  it('в истории сторона не перевешивает — не держится, как бы ни шла проверка', () => {
    const outs = [o(1, 'down'), o(2, 'down'), ...Array.from({ length: 10 }, (_, i) => o(SPLIT + i, 'up'))];
    expect(statOf(outs, 'up', SPLIT)!.holds).toBe(false);
  });
});

describe('zonesOf', () => {
  it('до заполнения окна — null; выброс вверх — high, вниз — low', () => {
    const values: (number | null)[] = [...Array.from({ length: 10 }, (_, i) => i), 100, -5, 5];
    const z = zonesOf(values, 10, 0.1, 10);
    for (let i = 0; i < 10; i++) expect(z[i]).toBeNull();
    expect(z[10]).toBe('high');
    expect(z[11]).toBe('low');
    expect(z[12]).toBe('normal');
  });
  it('повторы обычного значения крайними не делают', () => {
    // Фандинг месяцами на одной ставке: точка, равная почти всем, — обычная.
    const values = [...Array.from({ length: 20 }, () => 1), 1];
    expect(zonesOf(values, 20, 0.1, 20)[20]).toBe('normal');
  });
  it('пропуск значения — null', () => {
    const values: (number | null)[] = [...Array.from({ length: 10 }, (_, i) => i), null];
    expect(zonesOf(values, 10, 0.1, 10)[10]).toBeNull();
  });
});

describe('zoneEvents', () => {
  it('вход в зону — событие, стояние в ней — нет', () => {
    expect(zoneEvents(['normal', 'high', 'high', 'normal'], 20)).toEqual([{ i: 1, zone: 'high' }]);
  });
  it('повторный вход раньше паузы не считается, после — считается', () => {
    const z: ('high' | 'normal')[] = ['normal', 'high', 'normal', 'high', ...Array.from({ length: 20 }, () => 'normal' as const), 'high'];
    expect(zoneEvents(z, 20).map((e) => e.i)).toEqual([1, 24]);
  });
  it('у разных зон паузы свои', () => {
    expect(zoneEvents(['normal', 'high', 'low'], 20)).toEqual([
      { i: 1, zone: 'high' },
      { i: 2, zone: 'low' },
    ]);
  });
});
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `cd backend && npx jest src/probabilities/odds-math.spec.ts`
Expected: FAIL — `Cannot find module './odds-math'`.

- [ ] **Step 3: Реализация**

```ts
// backend/src/probabilities/odds-math.ts
/**
 * Математика экспериментальных вероятностей (спека
 * docs/superpowers/specs/2026-10-25-probability-indicators-design.md): исход
 * по барьерам, частота стороны с проверкой вперёд, зоны рядов по скользящему
 * перцентилю и события зон. Без БД и сети.
 */

export interface Bar {
  /** Время открытия свечи, мс. */
  t: number;
  h: number;
  l: number;
  c: number;
}

export type Side = 'up' | 'down';
export type Zone = 'high' | 'low' | 'normal';

/** Доля стороны и её 95 % интервал Вильсона; доли — 0..100. */
export interface OddsCount {
  n: number;
  hits: number;
  share: number;
  low: number;
  high: number;
}

/** Частота стороны в истории (до SPLIT) и на проверке вперёд (с SPLIT). */
export interface OddsStat {
  side: Side;
  train: OddsCount;
  test: OddsCount;
  holds: boolean;
}

/** Исход одного события: время свечи события и сторона, коснувшаяся первой. */
export interface Outcome {
  t: number;
  side: Side;
}

/** Граница истории и проверки вперёд. */
export const SPLIT = Date.UTC(2023, 0, 1);
/** Горизонт исхода в свечах — он же свежесть сигнала и пауза между событиями зоны. */
export const HORIZON = 20;
export const ATR_LEN = 14;

const Z = 1.96;

/** 95 % интервал Вильсона доли `hits` из `n`, в процентах. */
export function wilson(hits: number, n: number): { low: number; high: number } {
  if (n === 0) return { low: 0, high: 100 };
  const p = hits / n;
  const z2 = Z * Z;
  const den = 1 + z2 / n;
  const mid = (p + z2 / (2 * n)) / den;
  const half = (Z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / den;
  return { low: Math.max(0, mid - half) * 100, high: Math.min(1, mid + half) * 100 };
}

export function countOf(hits: number, n: number): OddsCount {
  return { n, hits, share: n ? (hits / n) * 100 : 0, ...wilson(hits, n) };
}

/** ATR Уайлдера; на разгоне (первые `len` свечей) — NaN: такой ATR — среднее нескольких свечей. */
export function atrOf(bars: readonly Bar[], len = ATR_LEN): number[] {
  const out = new Array<number>(bars.length).fill(NaN);
  let sum = 0;
  let atr = NaN;
  for (let i = 1; i < bars.length; i++) {
    const b = bars[i];
    const pc = bars[i - 1].c;
    const tr = Math.max(b.h - b.l, Math.abs(b.h - pc), Math.abs(b.l - pc));
    if (i < len) {
      sum += tr;
    } else if (i === len) {
      atr = (sum + tr) / len;
      out[i] = atr;
    } else {
      atr = (atr * (len - 1) + tr) / len;
      out[i] = atr;
    }
  }
  return out;
}

/**
 * Какую границу `±dist` от закрытия свечи `i` цена коснулась первой за
 * `horizon` свечей. Обе в одной свече (порядок внутри свечи неизвестен), ни
 * одной или ряд кончился раньше — null: такие события в выборку не идут.
 */
export function firstBarrier(bars: readonly Bar[], i: number, dist: number, horizon = HORIZON): Side | null {
  const up = bars[i].c + dist;
  const dn = bars[i].c - dist;
  for (let j = i + 1; j <= i + horizon && j < bars.length; j++) {
    const u = bars[j].h >= up;
    const d = bars[j].l <= dn;
    if (u && d) return null;
    if (u) return 'up';
    if (d) return 'down';
  }
  return null;
}

/**
 * Частота стороны: `side` задана (дивергенция — по своему смыслу) или 'auto' —
 * та, что чаще шла первой в истории. «Держится» — в истории сторона выше 50 %, а
 * на проверке нижняя граница интервала выше 50 %. Исходов нет — null.
 */
export function statOf(outcomes: readonly Outcome[], side: Side | 'auto', split = SPLIT): OddsStat | null {
  if (outcomes.length === 0) return null;
  const tally = (inPart: (o: Outcome) => boolean) => {
    let n = 0;
    let up = 0;
    for (const o of outcomes) {
      if (!inPart(o)) continue;
      n++;
      if (o.side === 'up') up++;
    }
    return { n, up };
  };
  const tr = tally((o) => o.t < split);
  const te = tally((o) => o.t >= split);
  const s: Side = side === 'auto' ? (tr.up * 2 >= tr.n ? 'up' : 'down') : side;
  const hitsOf = (x: { n: number; up: number }) => (s === 'up' ? x.up : x.n - x.up);
  const train = countOf(hitsOf(tr), tr.n);
  const test = countOf(hitsOf(te), te.n);
  return { side: s, train, test, holds: train.n > 0 && train.share > 50 && test.n > 0 && test.low > 50 };
}

/**
 * Зона каждой точки среди `window` прошлых (без неё самой): не меньше `1 − tail`
 * прошлых строго ниже — 'high', строго выше — 'low', иначе 'normal'. Строго —
 * из-за повторов: фандинг месяцами стоит на 0.01 %, и «не выше» сделало бы
 * крайней обычную ставку. Прошлых меньше `minFill` или самой точки нет — null.
 */
export function zonesOf(
  values: readonly (number | null)[],
  window: number,
  tail = 0.1,
  minFill = Math.ceil(window * 0.9),
): (Zone | null)[] {
  const out: (Zone | null)[] = [];
  for (let i = 0; i < values.length; i++) {
    const x = values[i];
    if (x == null) {
      out.push(null);
      continue;
    }
    let n = 0;
    let below = 0;
    let above = 0;
    for (let k = Math.max(0, i - window); k < i; k++) {
      const v = values[k];
      if (v == null) continue;
      n++;
      if (v < x) below++;
      else if (v > x) above++;
    }
    if (n < minFill) out.push(null);
    else if (below >= (1 - tail) * n) out.push('high');
    else if (above >= (1 - tail) * n) out.push('low');
    else out.push('normal');
  }
  return out;
}

/**
 * Входы в крайнюю зону: на прошлой свече зона была другой, и событие той же
 * зоны было не ближе `cooldown` свечей. Соседние свечи в одной зоне — почти одно
 * наблюдение, и без паузы выборка раздувалась бы.
 */
export function zoneEvents(
  zones: readonly (Zone | null)[],
  cooldown = HORIZON,
): { i: number; zone: 'high' | 'low' }[] {
  const out: { i: number; zone: 'high' | 'low' }[] = [];
  const last = { high: -Infinity, low: -Infinity };
  for (let i = 1; i < zones.length; i++) {
    const z = zones[i];
    if (z !== 'high' && z !== 'low') continue;
    if (zones[i - 1] === z) continue;
    if (i - last[z] < cooldown) continue;
    last[z] = i;
    out.push({ i, zone: z });
  }
  return out;
}
```

Примечание к `atrOf`: первое значение — на свече `len` (среднее TR свечей 1..len), до неё NaN; тест проверяет `atr[14]` при `len = 14`.

- [ ] **Step 4: Тесты проходят**

Run: `cd backend && npx jest src/probabilities/odds-math.spec.ts`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add backend/src/probabilities/odds-math.ts backend/src/probabilities/odds-math.spec.ts
git commit -m "feat(probabilities): математика исхода, частот и зон"
```

---

### Task 2: События дивергенций и их частоты

**Files:**
- Modify: `frontend/src/widgets/backtest-session/lib/rsi.ts` (параметр `seen` у `divergencesOfSide`, экспорт `divergenceEventsOf`, строка в шапке о копии)
- Modify: `frontend/src/widgets/backtest-session/lib/rsi.test.ts`
- Create: `backend/src/probabilities/rsi.ts` (копия), `backend/src/probabilities/rsi-copy.spec.ts`
- Create: `backend/src/probabilities/divergence-stats.ts`, `backend/src/probabilities/divergence-stats.spec.ts`

**Interfaces:**
- Consumes: `atrOf`, `firstBarrier`, `statOf`, `Bar`, `OddsStat`, `Outcome` (Task 1).
- Produces: `divergenceEventsOf(candles, o?) => Divergence[]` (в обеих копиях `rsi.ts`); `DivergenceOdds { bull: OddsStat | null; bear: OddsStat | null }`, `DIVERGENCE_TFS = [15, 30, 60, 240, 1440]`, `divergenceOdds(bars: readonly Bar[]) => DivergenceOdds`.

- [ ] **Step 1: Падающий тест фронта — события не видят будущего**

Добавить в конец `frontend/src/widgets/backtest-session/lib/rsi.test.ts` (импорт `divergenceEventsOf` дописать в строку импорта из `./rsi`; фикстура — тот же `./__fixtures__/btc-4h-2024.json`, что у `ranges.test.ts`, строки `[t, o, h, l, c]`):

```ts
import btc from './__fixtures__/btc-4h-2024.json';

describe('divergenceEventsOf', () => {
  const bars = (btc as number[][]).map(([t, o, h, l, c]) => ({ t, o, h, l, c }));
  const key = (d: { kind: string; from: number; to: number }) => `${d.kind}:${d.from}:${d.to}`;

  it('содержит всё, что рисует график, и удлинённые раньше продолжения', () => {
    const drawn = rsiSeries(bars).divergences.map(key);
    const events = divergenceEventsOf(bars).map(key);
    expect(events.length).toBeGreaterThanOrEqual(drawn.length);
    for (const k of drawn) expect(events).toContain(k);
  });

  it('событие видно на свечах до своего подтверждения включительно', () => {
    const events = divergenceEventsOf(bars);
    expect(events.length).toBeGreaterThan(0);
    for (const e of events) {
      const cut = bars.slice(0, e.to + RSI_DEFAULTS.rightBars + 1);
      expect(divergenceEventsOf(cut).map(key)).toContain(key(e));
    }
  });
});
```

- [ ] **Step 2: Тест падает**

Run: `cd frontend && npx vitest run src/widgets/backtest-session/lib/rsi.test.ts`
Expected: FAIL — `divergenceEventsOf` не экспортирован.

- [ ] **Step 3: Реализация во фронте**

В `rsi.ts`:

1. Сигнатура `divergencesOfSide` — пятый необязательный параметр, и запись каждого подтверждения сразу после сборки `dv`:

```ts
function divergencesOfSide(
  kind: 'bear' | 'bull',
  rsi: readonly number[],
  price: readonly number[],
  o: RsiOptions,
  /** Сюда — каждое подтверждение по порядку, и то, что потом заменит продолжение. */
  seen?: Divergence[],
): Divergence[] {
```

```ts
        const dv: Divergence = {
          // …поля как были…
        };
        seen?.push(dv);
        const was = started.get(a.bar);
```

2. После `divergencesOf` — новый экспорт:

```ts
/**
 * Каждое подтверждение дивергенции, как его видели в свою свечу: и те, что
 * потом удлинились (на графике продолжение заменяет их линию). Для частот «что
 * было после» (спека 2026-10-25): по `divergencesOf` удлинённые выпали бы из
 * выборки, хотя в свою свечу их было видно. Подтверждение — свеча `to + rightBars`.
 */
export function divergenceEventsOf(
  candles: readonly { h: number; l: number; c: number }[],
  o: RsiOptions = RSI_DEFAULTS,
): Divergence[] {
  const rsi = rsiOf(
    candles.map((c) => c.c),
    o.length,
  );
  const seen: Divergence[] = [];
  divergencesOfSide('bear', rsi, candles.map((c) => c.h), o, seen);
  divergencesOfSide('bull', rsi, candles.map((c) => c.l), o, seen);
  return seen.sort((a, b) => a.to - b.to);
}
```

3. В конец шапки файла (перед закрывающим `*/` первого комментария) — абзац:

```ts
 *
 * Файл живёт в двух местах: копия — `backend/src/probabilities/rsi.ts`
 * (частоты дивергенций в истории считает сервер), `rsi-copy.spec.ts` сверяет
 * их побайтно. Правка — в обоих; формат — prettier бэкенда.
```

Run: `cd frontend && npx vitest run src/widgets/backtest-session/lib/rsi.test.ts`
Expected: PASS (все прежние тесты тоже).

- [ ] **Step 4: Копия на сервер и сверка**

```bash
cp frontend/src/widgets/backtest-session/lib/rsi.ts backend/src/probabilities/rsi.ts
cd backend && npx prettier --write src/probabilities/rsi.ts && npx eslint src/probabilities/rsi.ts --fix && cd ..
cp backend/src/probabilities/rsi.ts frontend/src/widgets/backtest-session/lib/rsi.ts
```

```ts
// backend/src/probabilities/rsi-copy.spec.ts
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Дивергенции в истории сервер считает тем же кодом, что рисует панель RSI
 * терминала (спека 2026-10-25). Сборки раздельные — у сервера копия, и здесь
 * она сверяется побайтно. Упал — правка сделана в одной копии: перенесите её во
 * вторую (формат — prettier бэкенда).
 */
describe('копия rsi.ts', () => {
  it('совпадает с фронтом побайтно', () => {
    const back = readFileSync(join(__dirname, 'rsi.ts'), 'utf8');
    const front = readFileSync(
      join(__dirname, '../../../frontend/src/widgets/backtest-session/lib/rsi.ts'),
      'utf8',
    );
    expect(front).toBe(back);
  });
});
```

Run: `cd backend && npx jest src/probabilities/rsi-copy.spec.ts` → PASS; `cd frontend && npx vitest run src/widgets/backtest-session/lib/rsi.test.ts` → PASS.

- [ ] **Step 5: Падающий тест частот дивергенций**

```ts
// backend/src/probabilities/divergence-stats.spec.ts
import { readFileSync } from 'fs';
import { join } from 'path';
import { divergenceOdds } from './divergence-stats';
import { divergenceEventsOf } from './rsi';

const fixture = JSON.parse(
  readFileSync(
    join(__dirname, '../../../frontend/src/widgets/backtest-session/lib/__fixtures__/btc-4h-2024.json'),
    'utf8',
  ),
) as number[][];
const bars = fixture.map(([t, , h, l, c]) => ({ t, h, l, c }));

describe('divergenceOdds', () => {
  it('2024 год целиком — в проверке, история пуста', () => {
    const odds = divergenceOdds(bars);
    for (const s of [odds.bull, odds.bear]) {
      if (!s) continue;
      expect(s.train.n).toBe(0);
      expect(s.holds).toBe(false);
    }
  });

  it('стороны — по смыслу дивергенции, исходов не больше событий', () => {
    const odds = divergenceOdds(bars);
    const events = divergenceEventsOf(bars);
    expect(odds.bull?.side ?? 'up').toBe('up');
    expect(odds.bear?.side ?? 'down').toBe('down');
    const n = (odds.bull?.test.n ?? 0) + (odds.bear?.test.n ?? 0);
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThanOrEqual(events.length);
  });

  it('пустой ряд — без частот', () => {
    expect(divergenceOdds([])).toEqual({ bull: null, bear: null });
  });
});
```

Run: `cd backend && npx jest src/probabilities/divergence-stats.spec.ts` → FAIL (нет модуля).

- [ ] **Step 6: Реализация**

```ts
// backend/src/probabilities/divergence-stats.ts
import { atrOf, firstBarrier, statOf, type Bar, type OddsStat, type Outcome } from './odds-math';
import { divergenceEventsOf, RSI_DEFAULTS } from './rsi';

export interface DivergenceOdds {
  bull: OddsStat | null;
  bear: OddsStat | null;
}

/** Таймфреймы со статистикой дивергенций, минуты: на 1м и 5м выборка — шум. */
export const DIVERGENCE_TFS = [15, 30, 60, 240, 1440] as const;

/**
 * Частоты после дивергенций RSI одного таймфрейма: событие — подтверждение
 * второй вершины (`to + rightBars`), исход — какую границу ±1 ATR цена коснулась
 * первой. Бычья считает «вверх», медвежья — «вниз».
 */
export function divergenceOdds(bars: readonly Bar[]): DivergenceOdds {
  const atr = atrOf(bars);
  const outs: Record<'bull' | 'bear', Outcome[]> = { bull: [], bear: [] };
  for (const d of divergenceEventsOf(bars)) {
    const i = d.to + RSI_DEFAULTS.rightBars;
    if (i >= bars.length || Number.isNaN(atr[i])) continue;
    const side = firstBarrier(bars, i, atr[i]);
    if (side) outs[d.kind].push({ t: bars[i].t, side });
  }
  return { bull: statOf(outs.bull, 'up'), bear: statOf(outs.bear, 'down') };
}
```

- [ ] **Step 7: Тесты проходят**

Run: `cd backend && npx jest src/probabilities` → PASS.

- [ ] **Step 8: Коммит**

```bash
git add frontend/src/widgets/backtest-session/lib/rsi.ts frontend/src/widgets/backtest-session/lib/rsi.test.ts backend/src/probabilities/rsi.ts backend/src/probabilities/rsi-copy.spec.ts backend/src/probabilities/divergence-stats.ts backend/src/probabilities/divergence-stats.spec.ts
git commit -m "feat(probabilities): события дивергенций RSI и их частоты"
```

---

### Task 3: Ряды деривативов — выравнивание, зоны, частоты

**Files:**
- Create: `backend/src/probabilities/deriv-stats.ts`, `backend/src/probabilities/deriv-stats.spec.ts`

**Interfaces:**
- Consumes: `atrOf`, `firstBarrier`, `statOf`, `zoneEvents`, `zonesOf`, `Bar`, `OddsStat`, `Outcome`, `Zone` (Task 1).
- Produces: `DerivKind = 'funding' | 'ratio' | 'oi'`, `DERIV_KINDS`, `DerivPointLike { kind; time; value }`, `ZONE_DAYS = 180`, `ZONE_WINDOW`, `alignTo(bars, points)`, `seriesOf(kind, bars, points)`, `DerivOdds = Record<string, OddsStat | null>` (ключи `funding:high`, `funding:low`, …), `derivOdds(bars, points)`, `DerivNow { kind; value: number | null; zone: Zone | null }`, `derivNow(bars, points, now)`.

- [ ] **Step 1: Падающие тесты**

```ts
// backend/src/probabilities/deriv-stats.spec.ts
import { alignTo, derivNow, derivOdds, seriesOf, type DerivPointLike } from './deriv-stats';
import type { Bar } from './odds-math';

const H4 = 4 * 3_600_000;
const T0 = Date.UTC(2021, 0, 1);

/** Ровный рост: каждая следующая свеча берёт верхнюю границу ±1 ATR — исход всегда «вверх». */
const rising = (n: number): Bar[] =>
  Array.from({ length: n }, (_, i) => {
    const c = 1000 + i * 10;
    return { t: T0 + i * H4, h: c + 5, l: c - 5, c };
  });

describe('alignTo', () => {
  const bars: Bar[] = [0, 1, 2, 3, 4].map((i) => ({ t: T0 + i * H4, h: 1, l: 1, c: 1 }));
  it('берёт последнюю точку не позже открытия свечи', () => {
    const points = [
      { time: T0, value: 1 },
      { time: T0 + H4 + 1, value: 2 }, // после открытия свечи 1 — ей не достаётся
    ];
    expect(alignTo(bars, points).slice(0, 3)).toEqual([1, 1, 2]);
  });
  it('точка старше 12 часов — значения нет', () => {
    expect(alignTo(bars, [{ time: T0, value: 1 }])).toEqual([1, 1, 1, 1, null]);
  });
});

describe('seriesOf', () => {
  it('открытый интерес — изменение за сутки', () => {
    const bars: Bar[] = Array.from({ length: 8 }, (_, i) => ({ t: T0 + i * H4, h: 1, l: 1, c: 1 }));
    const points = bars.map((b, i) => ({ time: b.t, value: i < 6 ? 100 : 110 }));
    const s = seriesOf('oi', bars, points);
    expect(s.slice(0, 6)).toEqual([null, null, null, null, null, null]);
    expect(s[6]).toBeCloseTo(0.1, 10);
  });
  it('фандинг — как есть', () => {
    const bars: Bar[] = [{ t: T0, h: 1, l: 1, c: 1 }];
    expect(seriesOf('funding', bars, [{ time: T0, value: 0.0001 }])).toEqual([0.0001]);
  });
});

describe('derivOdds', () => {
  // Четыре года 4ч; фандинг почти всегда 0.01 %, раз в 300 свечей — выброс.
  const bars = rising(8760);
  const points: DerivPointLike[] = bars.map((b, i) => ({
    kind: 'funding',
    time: b.t,
    value: i % 300 === 299 ? 0.001 : 0.0001,
  }));

  it('выбросы — события зоны high, исход «вверх», проверка держится', () => {
    const s = derivOdds(bars, points)['funding:high']!;
    expect(s.side).toBe('up');
    expect(s.train.n).toBeGreaterThan(0);
    expect(s.train.hits).toBe(s.train.n);
    expect(s.test.n).toBeGreaterThan(4);
    expect(s.holds).toBe(true);
  });

  it('ряд без точек — без частот', () => {
    const odds = derivOdds(bars, points);
    expect(odds['ratio:high']).toBeNull();
    expect(odds['oi:low']).toBeNull();
  });
});

describe('derivNow', () => {
  it('значение и зона на свече, открывшейся последней к `now`', () => {
    const bars = rising(1200);
    const last = bars[bars.length - 1].t;
    const points: DerivPointLike[] = [
      ...bars.map((b) => ({ kind: 'funding' as const, time: b.t, value: 0.0001 })),
      { kind: 'funding', time: last + H4, value: 0.002 },
    ];
    const now = derivNow(bars, points, last + H4 + 60_000);
    expect(now.find((x) => x.kind === 'funding')).toEqual({ kind: 'funding', value: 0.002, zone: 'high' });
    expect(now.find((x) => x.kind === 'ratio')).toEqual({ kind: 'ratio', value: null, zone: null });
  });
});
```

Run: `cd backend && npx jest src/probabilities/deriv-stats.spec.ts` → FAIL (нет модуля).

- [ ] **Step 2: Реализация**

```ts
// backend/src/probabilities/deriv-stats.ts
import {
  atrOf,
  firstBarrier,
  statOf,
  zoneEvents,
  zonesOf,
  type Bar,
  type OddsStat,
  type Outcome,
  type Zone,
} from './odds-math';

export type DerivKind = 'funding' | 'ratio' | 'oi';
export const DERIV_KINDS: readonly DerivKind[] = ['funding', 'ratio', 'oi'];

export interface DerivPointLike {
  kind: DerivKind;
  time: number;
  value: number;
}

const H4 = 4 * 3_600_000;
/** Окно зоны — полгода прошлых свечей 4ч. */
export const ZONE_DAYS = 180;
export const ZONE_WINDOW = ZONE_DAYS * 6;
/** Точка старше этого к открытию свечи — значения нет (дыра в ряду). */
const STALE_MS = 12 * 3_600_000;
/** Изменение открытого интереса — за сутки, шесть свечей 4ч. */
const OI_LAG = 6;

/**
 * Значение ряда на каждой свече — последняя точка не позже ОТКРЫТИЯ свечи. Не
 * закрытия: метка точки у Bybit — начало или конец её периода, и точка до
 * закрытия при одной из них заглядывала бы на свечу вперёд. `points` — по
 * возрастанию времени.
 */
export function alignTo(
  bars: readonly Bar[],
  points: readonly { time: number; value: number }[],
): (number | null)[] {
  const out: (number | null)[] = [];
  let j = -1;
  for (const b of bars) {
    while (j + 1 < points.length && points[j + 1].time <= b.t) j++;
    out.push(j >= 0 && b.t - points[j].time <= STALE_MS ? points[j].value : null);
  }
  return out;
}

/** Ряд, по которому меряется зона: фандинг и доля лонгов — как есть, открытый интерес — изменение за сутки. */
export function seriesOf(
  kind: DerivKind,
  bars: readonly Bar[],
  points: readonly { time: number; value: number }[],
): (number | null)[] {
  const raw = alignTo(bars, points);
  if (kind !== 'oi') return raw;
  return raw.map((v, i) => {
    const was = i >= OI_LAG ? raw[i - OI_LAG] : null;
    return v != null && was != null && was > 0 ? v / was - 1 : null;
  });
}

/** Частоты зон: ключ `<ряд>:high` / `<ряд>:low`. */
export type DerivOdds = Record<string, OddsStat | null>;

const ofKind = (points: readonly DerivPointLike[], kind: DerivKind) =>
  points.filter((p) => p.kind === kind);

/**
 * Частоты после входа ряда в крайнюю зону: исход — какую границу ±1 ATR(4ч)
 * цена коснулась первой; сторона — та, что чаще шла первой в истории.
 */
export function derivOdds(bars: readonly Bar[], points: readonly DerivPointLike[]): DerivOdds {
  const atr = atrOf(bars);
  const out: DerivOdds = {};
  for (const kind of DERIV_KINDS) {
    const zones = zonesOf(seriesOf(kind, bars, ofKind(points, kind)), ZONE_WINDOW);
    const outs: Record<'high' | 'low', Outcome[]> = { high: [], low: [] };
    for (const e of zoneEvents(zones)) {
      if (Number.isNaN(atr[e.i])) continue;
      const side = firstBarrier(bars, e.i, atr[e.i]);
      if (side) outs[e.zone].push({ t: bars[e.i].t, side });
    }
    out[`${kind}:high`] = statOf(outs.high, 'auto');
    out[`${kind}:low`] = statOf(outs.low, 'auto');
  }
  return out;
}

export interface DerivNow {
  kind: DerivKind;
  value: number | null;
  zone: Zone | null;
}

/**
 * Что ряды показывают сейчас: значение и зона на свече, открывшейся последней к
 * `now` (её в `price_candles` ещё нет — синк пишет закрытые), теми же функциями,
 * что считают частоты.
 */
export function derivNow(bars: readonly Bar[], points: readonly DerivPointLike[], now: number): DerivNow[] {
  const open = Math.floor(now / H4) * H4;
  const last = bars.at(-1);
  const grid = last && last.t >= open ? bars : [...bars, { t: open, h: 0, l: 0, c: 0 }];
  const i = grid.length - 1;
  return DERIV_KINDS.map((kind) => {
    const s = seriesOf(kind, grid, ofKind(points, kind));
    return { kind, value: s[i], zone: zonesOf(s, ZONE_WINDOW)[i] };
  });
}
```

- [ ] **Step 3: Тесты проходят**

Run: `cd backend && npx jest src/probabilities/deriv-stats.spec.ts` → PASS.

- [ ] **Step 4: Коммит**

```bash
git add backend/src/probabilities/deriv-stats.ts backend/src/probabilities/deriv-stats.spec.ts
git commit -m "feat(probabilities): зоны и частоты рядов деривативов"
```

---

### Task 4: Таблицы и доливка рядов Bybit

**Files:**
- Modify: `backend/prisma/schema.prisma` (две модели в конец файла)
- Create: `backend/src/probabilities/deriv-feed.ts`, `backend/src/probabilities/deriv-feed.spec.ts`

**Interfaces:**
- Consumes: `DerivKind` (Task 3); `BYBIT_API`, `bybitFetch` из `../bybit/bybit-gate`; `PrismaService`.
- Produces: `DERIV_SYMBOL = 'BTCUSDT'`, `SERIES_START`, `SERIES`, `windowsOf(from, now, step, limit)`, `@Injectable() DerivFeed { pull(now: number): Promise<number> }`; Prisma-модели `derivPoint`, `probabilityStat`.

- [ ] **Step 1: Модели**

В конец `backend/prisma/schema.prisma`:

```prisma
/// Ряды деривативов Bybit для экспериментальных вероятностей терминала (спека
/// 2026-10-25): фандинг, доля лонг-аккаунтов, открытый интерес. История есть у
/// биржи с 2020 года — ProbabilityStatsService доливает её от последней точки.
model DerivPoint {
  symbol String
  kind   String // 'funding' | 'ratio' | 'oi'
  time   DateTime
  value  Float

  @@id([symbol, kind, time])
  @@map("deriv_points")
}

/// Готовые числа экспериментальных вероятностей: 'divergence', 'derivs', 'now'.
/// Пишет worker, читает api — пересчёт по всей истории в запросе не делается.
model ProbabilityStat {
  key        String   @id
  data       Json
  computedAt DateTime

  @@map("probability_stats")
}
```

Перед командой остановить локальный backend (держит движок Prisma — см. память про EPERM), потом:

Run: `cd backend && npx prisma db push && npx prisma generate`
Expected: «Your database is now in sync», клиент сгенерирован.

- [ ] **Step 2: Падающие тесты доливки**

```ts
// backend/src/probabilities/deriv-feed.spec.ts
jest.mock('../bybit/bybit-gate', () => ({
  BYBIT_API: 'https://api.bybit.com/v5',
  bybitFetch: jest.fn(),
}));

import { bybitFetch } from '../bybit/bybit-gate';
import { DerivFeed, SERIES, SERIES_START, windowsOf } from './deriv-feed';

const H = 3_600_000;
const fetchMock = bybitFetch as jest.Mock;
const ok = (json: unknown) => ({ ok: true, status: 200, json: async () => json });

describe('windowsOf', () => {
  it('окна по limit точек, без пропусков и наложений', () => {
    const w = windowsOf(0, 10 * H, H, 4);
    expect(w).toEqual([
      [0, 3 * H],
      [3 * H + 1, 6 * H + 1],
      [6 * H + 2, 9 * H + 2],
      [9 * H + 3, 10 * H],
    ]);
  });
  it('начало позже конца — пусто', () => {
    expect(windowsOf(10, 5, H, 4)).toEqual([]);
  });
});

describe('SERIES.parse', () => {
  it('фандинг, доля лонгов, открытый интерес', () => {
    expect(
      SERIES.funding.parse({ retCode: 0, result: { list: [{ fundingRate: '0.0001', fundingRateTimestamp: '1590969600000' }] } }),
    ).toEqual([{ time: 1590969600000, value: 0.0001 }]);
    expect(
      SERIES.ratio.parse({ retCode: 0, result: { list: [{ buyRatio: '0.5953', timestamp: '1609459200000' }] } }),
    ).toEqual([{ time: 1609459200000, value: 0.5953 }]);
    expect(
      SERIES.oi.parse({ retCode: 0, result: { list: [{ openInterest: '5505.046', timestamp: '1609459200000' }] } }),
    ).toEqual([{ time: 1609459200000, value: 5505.046 }]);
  });
  it('отказ биржи и ответ без retCode — исключение, а не пустой ряд', () => {
    expect(() => SERIES.ratio.parse({ retCode: 10001, retMsg: 'bad' })).toThrow();
    expect(() => SERIES.ratio.parse({ result: { list: [] } })).toThrow();
  });
});

describe('DerivFeed.pull', () => {
  const prisma = {
    derivPoint: {
      findFirst: jest.fn(),
      createMany: jest.fn(async ({ data }: { data: unknown[]; skipDuplicates?: boolean }) => ({ count: data.length })),
    },
  };
  const feed = new DerivFeed(prisma as never);

  beforeEach(() => {
    fetchMock.mockReset();
    prisma.derivPoint.findFirst.mockReset();
    prisma.derivPoint.createMany.mockClear();
  });

  it('доливает от последней точки и пишет точки каждого ряда', async () => {
    const last = Date.UTC(2026, 9, 25, 0);
    prisma.derivPoint.findFirst.mockResolvedValue({ time: new Date(last) });
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('funding')) return ok({ retCode: 0, result: { list: [{ fundingRate: '0.0002', fundingRateTimestamp: String(last + 8 * H) }] } });
      if (url.includes('account-ratio')) return ok({ retCode: 0, result: { list: [{ buyRatio: '0.6', timestamp: String(last + 4 * H) }] } });
      return ok({ retCode: 0, result: { list: [{ openInterest: '100', timestamp: String(last + 4 * H) }] } });
    });
    const written = await feed.pull(last + 9 * H);
    expect(written).toBe(3);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    for (const [url] of fetchMock.mock.calls) expect(url).toContain(`startTime=${last + 1}`);
    const kinds = prisma.derivPoint.createMany.mock.calls.map(([arg]) => (arg.data[0] as { kind: string }).kind);
    expect(kinds.sort()).toEqual(['funding', 'oi', 'ratio']);
    expect(prisma.derivPoint.createMany.mock.calls[0][0].skipDuplicates).toBe(true);
  });

  it('пустая таблица — с начала рядов', async () => {
    prisma.derivPoint.findFirst.mockResolvedValue(null);
    fetchMock.mockResolvedValue(ok({ retCode: 0, result: { list: [] } }));
    await feed.pull(SERIES_START + H);
    expect(fetchMock.mock.calls[0][0]).toContain(`startTime=${SERIES_START}`);
  });

  it('сбой одного ряда не мешает остальным', async () => {
    prisma.derivPoint.findFirst.mockResolvedValue({ time: new Date(Date.UTC(2026, 9, 25)) });
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('funding')) throw new Error('BYBIT_BUSY');
      return ok({ retCode: 0, result: { list: [{ buyRatio: '0.6', openInterest: '1', timestamp: String(Date.UTC(2026, 9, 25, 4)) }] } });
    });
    await expect(feed.pull(Date.UTC(2026, 9, 25, 5))).resolves.toBe(2);
  });
});
```

Run: `cd backend && npx jest src/probabilities/deriv-feed.spec.ts` → FAIL (нет модуля).

- [ ] **Step 3: Реализация**

```ts
// backend/src/probabilities/deriv-feed.ts
import { Injectable, Logger } from '@nestjs/common';
import { BYBIT_API, bybitFetch } from '../bybit/bybit-gate';
import { PrismaService } from '../prisma/prisma.service';
import type { DerivKind } from './deriv-stats';

export const DERIV_SYMBOL = 'BTCUSDT';
/** С этого дня у Bybit есть все три ряда; фандинг начинается с середины 2020 — ранние окна пустые. */
export const SERIES_START = Date.UTC(2020, 0, 1);

const H = 3_600_000;
const Q = `category=linear&symbol=${DERIV_SYMBOL}`;

type Row = Record<string, string | undefined>;

/** Список ответа; `retCode ≠ 0` и ответ без числового `retCode` — отказ, а не пустой ряд. */
function listOf(json: unknown): Row[] {
  const j = json as { retCode?: unknown; retMsg?: unknown; result?: { list?: Row[] } } | null;
  if (typeof j?.retCode !== 'number' || j.retCode !== 0) {
    throw new Error(`Bybit отказал: retCode ${String(j?.retCode)} ${String(j?.retMsg ?? '')}`);
  }
  return j.result?.list ?? [];
}

const num = (s: string | undefined) => (s == null ? NaN : Number(s));

interface SeriesSpec {
  /** Шаг точек ряда, мс. */
  step: number;
  /** Сколько точек отдаёт один запрос. */
  limit: number;
  url: (from: number, to: number) => string;
  parse: (json: unknown) => { time: number; value: number }[];
}

export const SERIES: Record<DerivKind, SeriesSpec> = {
  funding: {
    step: 8 * H,
    limit: 200,
    url: (a, b) => `${BYBIT_API}/market/funding/history?${Q}&startTime=${a}&endTime=${b}&limit=200`,
    parse: (json) =>
      listOf(json).map((r) => ({ time: num(r.fundingRateTimestamp), value: num(r.fundingRate) })),
  },
  ratio: {
    step: 4 * H,
    limit: 500,
    url: (a, b) =>
      `${BYBIT_API}/market/account-ratio?${Q}&period=4h&startTime=${a}&endTime=${b}&limit=500`,
    parse: (json) => listOf(json).map((r) => ({ time: num(r.timestamp), value: num(r.buyRatio) })),
  },
  oi: {
    step: 4 * H,
    limit: 200,
    url: (a, b) =>
      `${BYBIT_API}/market/open-interest?${Q}&intervalTime=4h&startTime=${a}&endTime=${b}&limit=200`,
    parse: (json) =>
      listOf(json).map((r) => ({ time: num(r.timestamp), value: num(r.openInterest) })),
  },
};

/**
 * Окна запросов `[от, до]` (включительно) не длиннее `limit` точек ряда: каждое
 * окно — один запрос без курсора, следующее начинается через миллисекунду.
 */
export function windowsOf(from: number, now: number, step: number, limit: number): [number, number][] {
  const span = (limit - 1) * step;
  const out: [number, number][] = [];
  for (let a = from; a <= now; a += span + 1) out.push([a, Math.min(a + span, now)]);
  return out;
}

/**
 * Доливка рядов деривативов BTC в `deriv_points`. Первый прогон — с 2020 года,
 * около 140 запросов через шлюз Bybit; дальше — несколько в час. Окна пишутся
 * по порядку, поэтому сорванная доливка продолжается с последней точки.
 */
@Injectable()
export class DerivFeed {
  private readonly logger = new Logger(DerivFeed.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Сколько точек записано. Сбой ряда (шлюз, сеть, отказ биржи) — в лог; остальные ряды идут. */
  async pull(now: number): Promise<number> {
    let written = 0;
    for (const kind of Object.keys(SERIES) as DerivKind[]) {
      try {
        written += await this.pullOne(kind, now);
      } catch (e) {
        this.logger.warn(`ряд ${kind} не долит: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return written;
  }

  private async pullOne(kind: DerivKind, now: number): Promise<number> {
    const spec = SERIES[kind];
    const last = await this.prisma.derivPoint.findFirst({
      where: { symbol: DERIV_SYMBOL, kind },
      orderBy: { time: 'desc' },
      select: { time: true },
    });
    const from = last ? last.time.getTime() + 1 : SERIES_START;
    let written = 0;
    for (const [a, b] of windowsOf(from, now, spec.step, spec.limit)) {
      const res = await bybitFetch(spec.url(a, b));
      if (!res.ok) throw new Error(`Bybit ответил ${res.status}`);
      const points = spec
        .parse(await res.json())
        .filter((p) => Number.isFinite(p.time) && Number.isFinite(p.value));
      if (points.length === 0) continue;
      const r = await this.prisma.derivPoint.createMany({
        data: points.map((p) => ({ symbol: DERIV_SYMBOL, kind, time: new Date(p.time), value: p.value })),
        skipDuplicates: true,
      });
      written += r.count;
    }
    return written;
  }
}
```

- [ ] **Step 4: Тесты проходят, шлюз доволен**

Run: `cd backend && npx jest src/probabilities/deriv-feed.spec.ts src/bybit/bybit-gate.spec.ts`
Expected: PASS (тест шлюза: адрес Bybit только в шлюзе, голого `fetch` нет).

- [ ] **Step 5: Коммит**

```bash
git add backend/prisma/schema.prisma backend/src/probabilities/deriv-feed.ts backend/src/probabilities/deriv-feed.spec.ts
git commit -m "feat(probabilities): таблицы и доливка рядов деривативов Bybit"
```

---

### Task 5: Фоновый сервис и `GET /api/probabilities`

**Files:**
- Create: `backend/src/probabilities/types.ts`, `probability-stats.service.ts`, `probability-stats.service.spec.ts`, `probabilities.service.ts`, `probabilities.service.spec.ts`, `probabilities.controller.ts`, `probabilities.module.ts`
- Modify: `backend/src/app.module.ts` (импорт `ProbabilitiesModule` после `PlanModule`)

**Interfaces:**
- Consumes: `DerivFeed`, `DERIV_SYMBOL`, `SERIES_START` (Task 4); `divergenceOdds`, `DIVERGENCE_TFS`, `DivergenceOdds` (Task 2); `derivOdds`, `derivNow`, `ZONE_DAYS`, `DerivKind`, `DerivPointLike`, `DerivNow` (Task 3); `START_MS` из `../market-data/timeframes`; `runsBackgroundJobs` из `../role`.
- Produces: `ProbabilitiesResponse` (JSON ответа, ниже) — фронт копирует его форму в Task 10.

```ts
// форма ответа GET /api/probabilities
interface ProbabilitiesResponse {
  divergence: Record<string, DivergenceOdds>; // ключ — таймфрейм в минутах: '15', '30', '60', '240', '1440'
  derivs: Record<string, OddsStat | null>;    // 'funding:high', 'funding:low', 'ratio:…', 'oi:…'
  now: DerivNow[];                            // по ряду: значение и зона сейчас
  computedAt: string | null;                  // когда посчитаны частоты
  nowAt: string | null;                       // когда посчитано «сейчас»
}
```

- [ ] **Step 1: Падающие тесты**

```ts
// backend/src/probabilities/probability-stats.service.spec.ts
import { isStale, ProbabilityStatsService } from './probability-stats.service';

const DAY = 86_400_000;

describe('isStale', () => {
  it('ни разу не считали — пора', () => {
    expect(isStale(null, Date.now())).toBe(true);
  });
  it('сутки — граница', () => {
    const now = Date.UTC(2026, 9, 25, 12);
    expect(isStale(new Date(now - DAY + 1), now)).toBe(false);
    expect(isStale(new Date(now - DAY), now)).toBe(true);
  });
});

describe('ProbabilityStatsService.tick', () => {
  const make = (computedAt: Date | null) => {
    const prisma = {
      probabilityStat: { findUnique: jest.fn().mockResolvedValue(computedAt ? { computedAt } : null) },
    };
    const feed = { pull: jest.fn().mockResolvedValue(0) };
    const svc = new ProbabilityStatsService(prisma as never, feed as never);
    const writeNow = jest.spyOn(svc, 'writeNow').mockResolvedValue(undefined);
    const recompute = jest.spyOn(svc, 'recompute').mockResolvedValue(undefined);
    return { svc, feed, writeNow, recompute };
  };

  it('доливает, пишет «сейчас» и пересчитывает просроченное', async () => {
    const { svc, feed, writeNow, recompute } = make(null);
    await svc.tick(Date.UTC(2026, 9, 25));
    expect(feed.pull).toHaveBeenCalled();
    expect(writeNow).toHaveBeenCalled();
    expect(recompute).toHaveBeenCalled();
  });

  it('свежие частоты не пересчитывает', async () => {
    const now = Date.UTC(2026, 9, 25, 12);
    const { svc, recompute } = make(new Date(now - 3_600_000));
    await svc.tick(now);
    expect(recompute).not.toHaveBeenCalled();
  });

  it('второй тик поверх идущего — пропуск', async () => {
    const { svc, feed } = make(null);
    let release!: () => void;
    feed.pull.mockImplementation(() => new Promise<number>((r) => (release = () => r(0))));
    const first = svc.tick(1);
    await svc.tick(2);
    expect(feed.pull).toHaveBeenCalledTimes(1);
    release();
    await first;
  });
});
```

```ts
// backend/src/probabilities/probabilities.service.spec.ts
import { ProbabilitiesService } from './probabilities.service';

describe('ProbabilitiesService.get', () => {
  it('пустая таблица — пустой ответ', async () => {
    const prisma = { probabilityStat: { findMany: jest.fn().mockResolvedValue([]) } };
    await expect(new ProbabilitiesService(prisma as never).get()).resolves.toEqual({
      divergence: {},
      derivs: {},
      now: [],
      computedAt: null,
      nowAt: null,
    });
  });

  it('раскладывает строки по полям ответа', async () => {
    const at = new Date('2026-10-25T00:30:00Z');
    const nowAt = new Date('2026-10-25T05:00:00Z');
    const prisma = {
      probabilityStat: {
        findMany: jest.fn().mockResolvedValue([
          { key: 'divergence', data: { '240': { bull: null, bear: null } }, computedAt: at },
          { key: 'derivs', data: { 'funding:high': null }, computedAt: at },
          { key: 'now', data: [{ kind: 'funding', value: 0.0001, zone: 'normal' }], computedAt: nowAt },
        ]),
      },
    };
    const r = await new ProbabilitiesService(prisma as never).get();
    expect(r.divergence['240']).toEqual({ bull: null, bear: null });
    expect(r.derivs).toEqual({ 'funding:high': null });
    expect(r.now).toHaveLength(1);
    expect(r.computedAt).toBe(at.toISOString());
    expect(r.nowAt).toBe(nowAt.toISOString());
  });
});
```

Run: `cd backend && npx jest src/probabilities/probability-stats.service.spec.ts src/probabilities/probabilities.service.spec.ts` → FAIL.

- [ ] **Step 2: Типы ответа**

```ts
// backend/src/probabilities/types.ts
import type { DerivNow } from './deriv-stats';
import type { DivergenceOdds } from './divergence-stats';
import type { OddsStat } from './odds-math';

/** Ответ `GET /api/probabilities` (спека 2026-10-25); фронт держит копию формы в `entities/probabilities`. */
export interface ProbabilitiesResponse {
  /** Ключ — таймфрейм в минутах. */
  divergence: Record<string, DivergenceOdds>;
  /** Ключ — `<ряд>:high` / `<ряд>:low`. */
  derivs: Record<string, OddsStat | null>;
  now: DerivNow[];
  computedAt: string | null;
  nowAt: string | null;
}
```

- [ ] **Step 3: Фоновый сервис**

```ts
// backend/src/probabilities/probability-stats.service.ts
import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { START_MS } from '../market-data/timeframes';
import { PrismaService } from '../prisma/prisma.service';
import { runsBackgroundJobs } from '../role';
import { DerivFeed, DERIV_SYMBOL, SERIES_START } from './deriv-feed';
import { derivNow, derivOdds, ZONE_DAYS, type DerivKind, type DerivPointLike } from './deriv-stats';
import { DIVERGENCE_TFS, divergenceOdds, type DivergenceOdds } from './divergence-stats';
import type { Bar } from './odds-math';

const TICK_MS = 60 * 60_000;
const DAY = 86_400_000;
const YEAR = 365 * DAY;

/** Частоты пересчитываются раз в сутки; срок — от `computedAt` в базе, не от памяти процесса. */
export const isStale = (computedAt: Date | null, now: number) =>
  computedAt == null || now - computedAt.getTime() >= DAY;

/**
 * Экспериментальные вероятности терминала (спека 2026-10-25), роль `worker`.
 * Раз в час доливает ряды Bybit и пишет «сейчас» (значение и зона каждого ряда),
 * раз в сутки пересчитывает частоты дивергенций RSI (свечи BTC с 2018 года) и
 * зон деривативов. `api` читает готовые строки `probability_stats`.
 */
@Injectable()
export class ProbabilityStatsService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ProbabilityStatsService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly feed: DerivFeed,
  ) {}

  onApplicationBootstrap() {
    if (!runsBackgroundJobs()) return;
    void this.tick().catch((e) => this.logger.error(`вероятности: ${e}`));
    this.timer = setInterval(() => {
      this.tick().catch((e) => this.logger.error(`вероятности: ${e}`));
    }, TICK_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(now: number = Date.now()): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.feed.pull(now);
      await this.writeNow(now);
      const last = await this.prisma.probabilityStat.findUnique({
        where: { key: 'derivs' },
        select: { computedAt: true },
      });
      if (isStale(last?.computedAt ?? null, now)) await this.recompute(now);
    } finally {
      this.running = false;
    }
  }

  async writeNow(now: number): Promise<void> {
    const from = now - (ZONE_DAYS + 2) * DAY;
    const data = derivNow(await this.bars(240, from, now), await this.points(from), now);
    await this.save('now', data, new Date(now));
  }

  async recompute(now: number): Promise<void> {
    const divergence: Record<string, DivergenceOdds> = {};
    for (const tf of DIVERGENCE_TFS) divergence[tf] = divergenceOdds(await this.bars(tf, START_MS, now));
    const derivs = derivOdds(await this.bars(240, SERIES_START, now), await this.points(SERIES_START));
    const at = new Date(now);
    await this.save('divergence', divergence, at);
    // Последней: по её `computedAt` тик решает, пора ли пересчитывать.
    await this.save('derivs', derivs, at);
    this.logger.log('частоты вероятностей пересчитаны');
  }

  /**
   * Свечи BTC таймфрейма кусками по году и только нужными столбцами: 15м с 2018
   * — около 300 тысяч строк, и целые строки Prisma тянули бы впустую.
   */
  private async bars(tf: number, from: number, to: number): Promise<Bar[]> {
    const out: Bar[] = [];
    for (let a = from; a < to; a += YEAR) {
      const rows = await this.prisma.$queryRaw<Bar[]>`
        SELECT (extract(epoch from "time") * 1000)::float8 AS t, "high" AS h, "low" AS l, "close" AS c
        FROM price_candles
        WHERE symbol = ${DERIV_SYMBOL} AND timeframe = ${tf}
          AND "time" >= ${new Date(a)} AND "time" < ${new Date(Math.min(a + YEAR, to))}
        ORDER BY "time"`;
      for (const r of rows) out.push(r);
    }
    return out;
  }

  private async points(from: number): Promise<DerivPointLike[]> {
    const rows = await this.prisma.derivPoint.findMany({
      where: { symbol: DERIV_SYMBOL, time: { gte: new Date(from) } },
      orderBy: { time: 'asc' },
      select: { kind: true, time: true, value: true },
    });
    return rows.map((r) => ({ kind: r.kind as DerivKind, time: r.time.getTime(), value: r.value }));
  }

  private save(key: string, data: unknown, computedAt: Date) {
    const json = data as Prisma.InputJsonValue;
    return this.prisma.probabilityStat.upsert({
      where: { key },
      create: { key, data: json, computedAt },
      update: { data: json, computedAt },
    });
  }
}
```

- [ ] **Step 4: Чтение, контроллер, модуль**

```ts
// backend/src/probabilities/probabilities.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { ProbabilitiesResponse } from './types';

/** Готовые числа для терминала: строки, которые пишет worker, — без расчёта в запросе. */
@Injectable()
export class ProbabilitiesService {
  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<ProbabilitiesResponse> {
    const rows = await this.prisma.probabilityStat.findMany({
      where: { key: { in: ['divergence', 'derivs', 'now'] } },
    });
    const by = new Map(rows.map((r) => [r.key, r]));
    return {
      divergence: (by.get('divergence')?.data ?? {}) as unknown as ProbabilitiesResponse['divergence'],
      derivs: (by.get('derivs')?.data ?? {}) as unknown as ProbabilitiesResponse['derivs'],
      now: (by.get('now')?.data ?? []) as unknown as ProbabilitiesResponse['now'],
      computedAt: by.get('derivs')?.computedAt.toISOString() ?? null,
      nowAt: by.get('now')?.computedAt.toISOString() ?? null,
    };
  }
}
```

```ts
// backend/src/probabilities/probabilities.controller.ts
import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProbabilitiesService } from './probabilities.service';

@UseGuards(JwtAuthGuard)
@Controller('api/probabilities')
export class ProbabilitiesController {
  constructor(private readonly probabilities: ProbabilitiesService) {}

  /** Экспериментальные индикаторы терминала (спека 2026-10-25). */
  @Get()
  get() {
    return this.probabilities.get();
  }
}
```

```ts
// backend/src/probabilities/probabilities.module.ts
import { Module } from '@nestjs/common';
import { DerivFeed } from './deriv-feed';
import { ProbabilitiesController } from './probabilities.controller';
import { ProbabilitiesService } from './probabilities.service';
import { ProbabilityStatsService } from './probability-stats.service';

// PrismaModule — @Global. Расчёт идёт в worker (guard в сервисе), чтение — в api.
@Module({
  controllers: [ProbabilitiesController],
  providers: [DerivFeed, ProbabilityStatsService, ProbabilitiesService],
})
export class ProbabilitiesModule {}
```

В `backend/src/app.module.ts`: `import { ProbabilitiesModule } from './probabilities/probabilities.module';` рядом с `PlanModule` и `ProbabilitiesModule,` в `imports` после `PlanModule,`.

- [ ] **Step 5: Тесты и типы**

Run: `cd backend && npx jest src/probabilities && npx tsc --noEmit -p tsconfig.json`
Expected: PASS, без ошибок типов.

- [ ] **Step 6: Коммит**

```bash
git add backend/src/probabilities backend/src/app.module.ts
git commit -m "feat(probabilities): фоновый пересчёт и GET /api/probabilities"
```

---

### Task 6: Средние R по тегу в статистике бектеста

**Files:**
- Modify: `backend/src/backtest/backtest-math.ts` (функция `winLossR`), `backend/src/backtest/backtest-math.spec.ts`
- Modify: `backend/src/backtest/backtest.service.ts:1657` (`byTag`)
- Modify: `frontend/src/widgets/backtest-session/api/types.ts:237` (`TagSummary`)

**Interfaces:**
- Produces: в ответе `/api/backtest/stats` у каждой строки `byTag` — `avgWinR: number` (средний R прибыльных), `avgLossR: number` (средний |R| убыточных, ≥ 0).

- [ ] **Step 1: Падающий тест**

В `backend/src/backtest/backtest-math.spec.ts` (импорт `winLossR` дописать к импорту из `./backtest-math`):

```ts
describe('winLossR', () => {
  it('средний R прибыльных и средний |R| убыточных', () => {
    expect(
      winLossR([
        { pnl: 10, r: 2 },
        { pnl: 20, r: 4 },
        { pnl: -5, r: -1 },
        { pnl: 0, r: 0 },
      ]),
    ).toEqual({ avgWinR: 3, avgLossR: 1 });
  });
  it('без прибыльных или убыточных — ноль', () => {
    expect(winLossR([])).toEqual({ avgWinR: 0, avgLossR: 0 });
  });
});
```

Run: `cd backend && npx jest src/backtest/backtest-math.spec.ts` → FAIL.

- [ ] **Step 2: Реализация**

В `backend/src/backtest/backtest-math.ts` после `summarize`:

```ts
/**
 * Средний R прибыльных и средний |R| убыточных — из них терминал выводит
 * винрейт безубыточности тега (спека 2026-10-25). Ноль — таких сделок нет.
 */
export function winLossR(rows: { pnl: number; r: number }[]): { avgWinR: number; avgLossR: number } {
  const mean = (xs: { r: number }[]) => (xs.length ? xs.reduce((s, x) => s + Math.abs(x.r), 0) / xs.length : 0);
  return { avgWinR: mean(rows.filter((x) => x.pnl > 0)), avgLossR: mean(rows.filter((x) => x.pnl < 0)) };
}
```

В `backtest.service.ts` импорт `winLossR` из `./backtest-math` и строка `byTag`:

```ts
        .map(({ tag, rows }) => ({ tag, ...summarize(rows), ...winLossR(rows) }))
```

Во фронте `frontend/src/widgets/backtest-session/api/types.ts`:

```ts
export interface TagSummary extends Summary {
  tag: TagItem;
  /** Средний R прибыльных сделок тега. */
  avgWinR: number;
  /** Средний |R| убыточных, ≥ 0. */
  avgLossR: number;
}
```

- [ ] **Step 3: Тесты проходят**

Run: `cd backend && npx jest src/backtest/backtest-math.spec.ts src/backtest/backtest.service.spec.ts` → PASS.

- [ ] **Step 4: Коммит**

```bash
git add backend/src/backtest/backtest-math.ts backend/src/backtest/backtest-math.spec.ts backend/src/backtest/backtest.service.ts frontend/src/widgets/backtest-session/api/types.ts
git commit -m "feat(backtest): средние R прибыльных и убыточных по тегу"
```

---

> **Контрольная точка ревью (B — шлюз Bybit, фоновый сервис, контракт API).** Задачи 1–6 одним пакетом: свежий ревьюер Sonnet, вердикт «спека ✅/❌» + качество, до трёх кругов правок.

---

### Task 7: Выключатели в настройках графика

**Files:**
- Modify: `frontend/src/widgets/backtest-session/model/useChartSettings.ts`
- Modify: `frontend/src/widgets/backtest-session/components/ChartSettingsPanel.tsx`
- Modify: `frontend/src/widgets/backtest-session/components/SessionScreen.tsx` (пропсы `serverStats`, `tagStatsFrom`; `useExpSettings`; проводка в панель)
- Modify: `frontend/src/widgets/backtest-session/index.ts` (экспорт `useExpOn`)
- Modify: `frontend/src/views/landing/components/TerminalDemo.tsx` (`serverStats={false}`), `frontend/src/views/terminal/components/TerminalScreen.tsx` (`tagStatsFrom="journal"`)
- Modify: `frontend/src/app/globals.css`, `frontend/src/shared/i18n/messages/{ru,en}.json`

**Interfaces:**
- Produces: `EXP_IDS`, `ExpId = 'take' | 'tags' | 'signals' | 'derivs'`, `useExpOn(id) => [boolean, (on: boolean) => void]`, `useExpSettings() => { on: Record<ExpId, boolean>; set: (id: ExpId, on: boolean) => void }`; в `Terminal` — `const expOn = (id: ExpId) => boolean` (учитывает `serverStats`), пропсы `serverStats?: boolean` (по умолчанию `true`) и `tagStatsFrom?: 'journal'`.

- [ ] **Step 1: Хранилище выключателей**

В конец `useChartSettings.ts`:

```ts
/**
 * Экспериментальные индикаторы терминала (спека 2026-10-25) — выключены, пока
 * их не включили в настройках графика; выбор на устройстве и общий для всех
 * терминалов, как у RSI.
 */
export const EXP_IDS = ['take', 'tags', 'signals', 'derivs'] as const;
export type ExpId = (typeof EXP_IDS)[number];

const decodeOff = (raw: string | null) => raw === '1';
const encodeOff = (on: boolean) => (on ? '1' : null);

export const useExpOn = (id: ExpId) => usePersistentValue(`virex.terminal.exp.${id}`, decodeOff, false, encodeOff);

export function useExpSettings() {
  const [take, setTake] = useExpOn('take');
  const [tags, setTags] = useExpOn('tags');
  const [signals, setSignals] = useExpOn('signals');
  const [derivs, setDerivs] = useExpOn('derivs');
  const setters: Record<ExpId, (on: boolean) => void> = { take: setTake, tags: setTags, signals: setSignals, derivs: setDerivs };
  return { on: { take, tags, signals, derivs }, set: (id: ExpId, on: boolean) => setters[id](on) };
}
```

- [ ] **Step 2: Раздел в панели**

`ChartSettingsPanel.tsx`: импорт `type ExpId` из `../model/useChartSettings`; новые пропсы и разметка после кнопки боковиков:

```tsx
  /** Экспериментальные индикаторы: какие показать (на главной — только шанс тейка) и что включено. */
  expIds: readonly ExpId[];
  exp: Record<ExpId, boolean>;
  onExp: (id: ExpId, on: boolean) => void;
```

```tsx
      <p className="cs-group muted">{t('exp.section')}</p>
      {expIds.map((id) => (
        <Button key={id} variant="none" className="cs-indicator" aria-pressed={exp[id]} onClick={() => onExp(id, !exp[id])}>
          {t(`exp.toggle.${id}`)}
        </Button>
      ))}
      <p className="muted">{t('exp.hint')}</p>
```

`globals.css` рядом с `.cs-indicator`:

```css
  .cs-group { margin-top: var(--s3); font-size: 11px; }
```

- [ ] **Step 3: Пропсы терминала и проводка**

В `TerminalProps` (SessionScreen.tsx) после `chartActions`:

```ts
  /**
   * Числа нашего сервера у экспериментальных индикаторов (теги, сигналы,
   * деривативы); по умолчанию есть. На главной гость не вошёл — там только
   * «Шанс тейка»: остальное получило бы 401.
   */
  serverStats?: boolean;
  /** Откуда статистика тегов: журнал (биржевой терминал); не задано — бектест по источнику сессии. */
  tagStatsFrom?: 'journal';
```

В деструктуризации `Terminal`: `serverStats = true, tagStatsFrom,`. Рядом с `const [rsiOn, setRsiOn] = useRsiOn();`:

```ts
  const exp = useExpSettings();
  const expIds: readonly ExpId[] = serverStats ? EXP_IDS : ['take'];
  const expOn = (id: ExpId) => exp.on[id] && expIds.includes(id);
```

(импорт `EXP_IDS`, `useExpSettings`, `type ExpId` из `../model/useChartSettings`). В `<ChartSettingsPanel …>` добавить `expIds={expIds} exp={exp.on} onExp={exp.set}`. `tagStatsFrom` пока не используется — его читает Task 9.

`TerminalDemo.tsx`: `serverStats={false}` рядом с `tags={false}`. `TerminalScreen.tsx`: `tagStatsFrom="journal"` рядом с `history={ExchangeHistory}`. `widgets/backtest-session/index.ts`: `export { useExpOn } from './model/useChartSettings';`.

- [ ] **Step 4: Тексты**

`ru.json`, в объект `backtest` после `"revealHiddenHint"`:

```json
    "exp": {
      "section": "Экспериментальные",
      "hint": "Частоты из истории, не прогноз.",
      "toggle": {
        "take": "Шанс тейка",
        "tags": "Статистика тегов",
        "signals": "Дивергенции RSI в истории",
        "derivs": "Деривативы BTC"
      }
    },
```

`en.json`, туда же:

```json
    "exp": {
      "section": "Experimental",
      "hint": "Historical frequencies, not a forecast.",
      "toggle": {
        "take": "Take-profit odds",
        "tags": "Tag statistics",
        "signals": "RSI divergences in history",
        "derivs": "BTC derivatives"
      }
    },
```

- [ ] **Step 5: Проверка**

Run: `cd frontend && npx tsc --noEmit && npx vitest run src/shared/i18n src/widgets/backtest-session`
Expected: без ошибок; тест сообщений (паритет ключей ru/en) зелёный.

- [ ] **Step 6: Коммит**

```bash
git add frontend/src
git commit -m "feat(terminal): раздел экспериментальных индикаторов в настройках графика"
```

---

### Task 8: Шанс тейка на подписи уровня

**Files:**
- Create: `frontend/src/widgets/backtest-session/lib/odds.ts`, `frontend/src/widgets/backtest-session/lib/odds.test.ts`
- Modify: `frontend/src/widgets/backtest-session/components/ReplayChart.tsx` (`Level.oddsAt`, текст плашки)
- Modify: `frontend/src/widgets/backtest-session/lib/draft-levels.ts` (+ тест в `draft-levels.test.ts`)
- Modify: `frontend/src/widgets/backtest-session/components/SessionScreen.tsx` (тейк позиции, вход `draftLevels`)

**Interfaces:**
- Consumes: `expOn('take')` (Task 7).
- Produces: `takeOdds(price, stop, take): number | null` (0..100); `Level.oddsAt?: (price: number) => number | null`; `DraftLevelsInput.oddsOn?: boolean`.

- [ ] **Step 1: Падающие тесты**

```ts
// frontend/src/widgets/backtest-session/lib/odds.test.ts
import { describe, expect, it } from 'vitest';
import { takeOdds } from './odds';

describe('takeOdds', () => {
  it('лонг: стоп 1 %, тейк 3 % — 25 %', () => {
    expect(takeOdds(100, 99, 103)).toBeCloseTo(25, 10);
  });
  it('шорт — зеркально', () => {
    expect(takeOdds(100, 101, 97)).toBeCloseTo(25, 10);
  });
  it('тейк и стоп по одну сторону — нет числа', () => {
    expect(takeOdds(100, 99, 98)).toBeNull();
  });
  it('без стопа или цена на уровне — нет числа', () => {
    expect(takeOdds(100, 0, 103)).toBeNull();
    expect(takeOdds(100, 100, 103)).toBeNull();
    expect(takeOdds(100, 99, 100)).toBeNull();
  });
});
```

В `draft-levels.test.ts`, внутри `describe('draftLevels')`:

```ts
  it('шанс тейка — только при включённом индикаторе и от цены «Маркета»', () => {
    const market = { stop: 59_500, take: 61_000, risk: 1 };
    const off = draftLevels({ ...base, market }).find((l) => l.id === 'draft-take')!;
    expect(off.oddsAt).toBeUndefined();
    const on = draftLevels({ ...base, market, oddsOn: true }).find((l) => l.id === 'draft-take')!;
    // До стопа 500, до тейка 1000: 500 / 1500.
    expect(on.oddsAt!(61_000)).toBeCloseTo(33.333, 2);
  });

  it('шанс тейка «Лимита» — от цены лимита', () => {
    const limit = { entry: 59_000, stop: 58_000, take: 62_000, risk: 1 };
    const take = draftLevels({ ...base, tab: 'limit', limit, oddsOn: true }).find((l) => l.id === 'draft-limit-take')!;
    expect(take.oddsAt!(62_000)).toBeCloseTo(25, 10);
  });
```

Run: `cd frontend && npx vitest run src/widgets/backtest-session/lib/odds.test.ts src/widgets/backtest-session/lib/draft-levels.test.ts` → FAIL.

- [ ] **Step 2: Функция**

```ts
// frontend/src/widgets/backtest-session/lib/odds.ts
/**
 * Шанс дойти до тейка раньше стопа на рынке без перекоса (спека 2026-10-25):
 * |цена − стоп| / (|цена − стоп| + |тейк − цена|), в процентах. Планка, а не
 * прогноз: сетап, который её не перебивает, на дистанции в минусе (без
 * комиссий). Цены — в одних единицах, экранных или настоящих: отношение от
 * масштаба не зависит. Тейк и стоп по одну сторону от цены — null.
 */
export function takeOdds(price: number, stop: number, take: number): number | null {
  const toStop = price - stop;
  const toTake = take - price;
  if (!(stop > 0) || !(take > 0) || toStop === 0 || toTake === 0 || Math.sign(toStop) !== Math.sign(toTake)) return null;
  return (Math.abs(toStop) / (Math.abs(toStop) + Math.abs(toTake))) * 100;
}
```

- [ ] **Step 3: Уровень и подпись**

`ReplayChart.tsx`, в `interface Level` после `impactAt`:

```ts
  /** Шанс дойти до тейка раньше стопа, 0..100 (`lib/odds.ts`) — только у тейка с включённым индикатором.
   * Функцией, как `impactAt`: пока тейк тащат, число считается на цене под курсором. */
  oddsAt?: (price: number) => number | null;
```

В отрисовке плашки (где собирается `first`) — строку тейка/стопа заменить:

```ts
                  const odds = l.kind === 'take' ? (l.oddsAt?.(price) ?? null) : null;
                  const first = isEntry
                    ? `P&L ${l.pnl != null ? formatMoney(l.pnl) : '—'}`
                    : isLimit(l.kind)
                      ? `${levelLabel(l.kind)} ${formatPriceGrouped(price, priceDecimals)}`
                      : `${levelLabel(l.kind)}${impact != null ? ` ${formatMoney(impact)}` : ''}${odds != null ? ` · ${Math.round(odds)} %` : ''}`;
```

- [ ] **Step 4: Черновики**

`draft-levels.ts`: импорт `takeOdds` из `./odds`; в `DraftLevelsInput` поле

```ts
  /** Индикатор «Шанс тейка» включён — у тейков черновика есть `oddsAt`. */
  oddsOn?: boolean;
```

в деструктуризацию — `oddsOn`; у `draft-take` («Маркет») добавить

```ts
      oddsAt: oddsOn && market.stop > 0 ? (p) => takeOdds(screenPrice, market.stop, p) : undefined,
```

у `draft-limit-take`:

```ts
      list.push({
        id: 'draft-limit-take',
        kind: 'take',
        price: limit.take,
        draggable: true,
        qty: limitQty,
        impactAt: takeAt,
        oddsAt: oddsOn && limit.stop > 0 ? (p) => takeOdds(lAnchor, limit.stop, p) : undefined,
      });
```

- [ ] **Step 5: Позиции**

`SessionScreen.tsx`: в вызов `draftLevels({ … })` добавить `oddsOn: expOn('take'),`. В цикле `for (const trade of chartTrades)` тейк позиции:

```ts
      const take = pending?.kind === 'take' ? pending.price : trade.takeProfit != null ? toScreen(trade.takeProfit, scale) : null;
      if (take != null) {
        // Шанс — от текущей цены и стопа, каким он стоит (или его тянут): меняется вместе с ценой.
        const stopNow = pending?.kind === 'stop' ? pending.price : trade.stopLoss > 0 ? toScreen(trade.stopLoss, scale) : null;
        const nowPrice = screenPriceOf(trade.symbol);
        list.push({
          id: `take-${trade.id}`,
          kind: 'take',
          tradeId: trade.id,
          price: take,
          draggable: true,
          qty: remaining,
          impactAt: impactAt(remaining),
          oddsAt: expOn('take') && stopNow != null && nowPrice != null ? (p) => takeOdds(nowPrice, stopNow, p) : undefined,
        });
      }
```

Импорт `takeOdds` из `../lib/odds`. Если список уровней собран в `useMemo`, добавить в его зависимости `exp.on.take` (и то, от чего зависит `screenPriceOf` — цену; если она уже в зависимостях через `livePrice`/`replay.price`, ничего не добавлять).

- [ ] **Step 6: Тесты проходят**

Run: `cd frontend && npx vitest run src/widgets/backtest-session && npx tsc --noEmit` → PASS.

- [ ] **Step 7: Коммит**

```bash
git add frontend/src/widgets/backtest-session
git commit -m "feat(terminal): шанс тейка на подписи уровня"
```

---

### Task 9: Статистика тегов в окне тегов терминала

**Files:**
- Create: `frontend/src/shared/lib/utils/wilson.ts`
- Create: `frontend/src/entities/tag/lib/odds.ts`, `frontend/src/entities/tag/lib/odds.test.ts`, `frontend/src/entities/tag/ui/TagOddsLine.tsx`
- Modify: `frontend/src/entities/tag/ui/TagPicker.tsx`, `TagsDialog.tsx`, `entities/tag/api/hooks.ts` (`useTagStats` с `enabled`), `entities/tag/index.ts`
- Modify: `frontend/src/widgets/backtest-session/api/hooks.ts` (`useBacktestStats` с `enabled`)
- Create: `frontend/src/widgets/backtest-session/model/useTagOdds.ts`
- Modify: `SessionScreen.tsx` (два `TagsDialog`), `widgets/backtest-session/index.ts`, `views/terminal/components/ExchangeHistory.tsx`
- Modify: `globals.css`, `ru.json`, `en.json` (`tags.odds`)

**Interfaces:**
- Consumes: `expOn('tags')`, `tagStatsFrom` (Task 7); `avgWinR`/`avgLossR` (Task 6).
- Produces: `wilson(hits, n) => { low; high }` (0..100); `TagVerdict`, `TagOdds { n; winRate; need; verdict }`, `tagOddsOf({ trades, wins, avgWin, avgLoss })`; `TagsDialog`/`TagPicker` проп `odds?: Record<string, TagOdds>`; `useTagOdds(source: 'journal' | StatsSource, enabled: boolean) => Record<string, TagOdds> | undefined`.

- [ ] **Step 1: Падающий тест вывода**

```ts
// frontend/src/entities/tag/lib/odds.test.ts
import { describe, expect, it } from 'vitest';
import { tagOddsOf } from './odds';

describe('tagOddsOf', () => {
  it('нет сделок — нет строки', () => {
    expect(tagOddsOf({ trades: 0, wins: 0, avgWin: 0, avgLoss: 0 })).toBeNull();
  });
  it('«нужно» — средний убыток к сумме средних; журнал отдаёт убыток со знаком', () => {
    const o = tagOddsOf({ trades: 22, wins: 9, avgWin: 100, avgLoss: -62.5 })!;
    expect(o.need).toBeCloseTo(38.46, 2);
    expect(o.winRate).toBeCloseTo(40.91, 2);
    expect(o.verdict).toBe('unclear');
  });
  it('интервал целиком выше — в плюсе, ниже — в минусе', () => {
    expect(tagOddsOf({ trades: 100, wins: 70, avgWin: 1, avgLoss: 1 })!.verdict).toBe('plus');
    expect(tagOddsOf({ trades: 100, wins: 20, avgWin: 1, avgLoss: 1 })!.verdict).toBe('minus');
  });
});
```

Run: `cd frontend && npx vitest run src/entities/tag/lib/odds.test.ts` → FAIL.

- [ ] **Step 2: Вильсон и вывод**

```ts
// frontend/src/shared/lib/utils/wilson.ts
const Z = 1.96;

/** 95 % интервал Вильсона доли `hits` из `n`, в процентах; без наблюдений — весь отрезок. */
export function wilson(hits: number, n: number): { low: number; high: number } {
  if (n === 0) return { low: 0, high: 100 };
  const p = hits / n;
  const z2 = Z * Z;
  const den = 1 + z2 / n;
  const mid = (p + z2 / (2 * n)) / den;
  const half = (Z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / den;
  return { low: Math.max(0, mid - half) * 100, high: Math.min(1, mid + half) * 100 };
}
```

```ts
// frontend/src/entities/tag/lib/odds.ts
import { wilson } from '@/shared/lib/utils/wilson';

export type TagVerdict = 'plus' | 'minus' | 'unclear';

export interface TagOdds {
  n: number;
  /** 0..100. */
  winRate: number;
  /** Винрейт безубыточности тега, 0..100. */
  need: number;
  verdict: TagVerdict;
}

/**
 * Винрейт тега против его безубыточности (спека 2026-10-25): «нужно» — средний
 * убыток / (средняя прибыль + средний убыток); вывод — по 95 % интервалу
 * Вильсона: весь выше «нужно» — в плюсе, весь ниже — в минусе, иначе не ясно.
 * Средние — модули, в USDT (журнал) или R (бектест). Сделок нет — null.
 */
export function tagOddsOf({ trades, wins, avgWin, avgLoss }: { trades: number; wins: number; avgWin: number; avgLoss: number }): TagOdds | null {
  if (trades <= 0) return null;
  const w = Math.abs(avgWin);
  const l = Math.abs(avgLoss);
  const need = w + l > 0 ? (l / (w + l)) * 100 : 50;
  const { low, high } = wilson(wins, trades);
  const verdict: TagVerdict = low > need ? 'plus' : high < need ? 'minus' : 'unclear';
  return { n: trades, winRate: (wins / trades) * 100, need, verdict };
}
```

Run: `cd frontend && npx vitest run src/entities/tag/lib/odds.test.ts` → PASS.

- [ ] **Step 3: Строка тега в окне**

```tsx
// frontend/src/entities/tag/ui/TagOddsLine.tsx
'use client';

import { useTranslations } from 'next-intl';
import type { TagOdds } from '../lib/odds';

const TONE = { plus: 'pos', minus: 'neg', unclear: 'muted' } as const;

/** «41 % · нужно 38 % · 22 сд. · не ясно» — у тега в окне разметки, когда индикатор включён. */
export function TagOddsLine({ odds }: { odds: TagOdds }) {
  const t = useTranslations('tags');
  return (
    <span className={`pick-odds ${TONE[odds.verdict]}`}>
      {t('odds.line', { win: Math.round(odds.winRate), need: Math.round(odds.need), n: odds.n })} · {t(`odds.${odds.verdict}`)}
    </span>
  );
}
```

`TagPicker.tsx`: проп `odds?: Record<string, TagOdds>` у `TagPicker` и `TagPickerGroup` (пробросить), внутри кнопки после `{t.name}`:

```tsx
              {t.name}
              {odds?.[t.id] && <TagOddsLine odds={odds[t.id]} />}
```

`TagsDialog.tsx`: проп

```ts
  /** Статистика тегов (экспериментальный индикатор терминала) — по id тега; не задана — окно прежнее. */
  odds?: Record<string, TagOdds>;
```

и `<TagPicker … odds={odds} />`. `entities/tag/index.ts`: `export * from './lib/odds';` и `export * from './ui/TagOddsLine';`.

`globals.css` рядом с `.pick`:

```css
  .pick-odds { margin-left: var(--s2); font-family: var(--font-mono); font-size: 11px; }
```

Тексты, `ru.json` в объект `tags`:

```json
    "odds": {
      "line": "{win} % · нужно {need} % · {n} сд.",
      "plus": "в плюсе",
      "minus": "в минусе",
      "unclear": "не ясно"
    },
```

`en.json`:

```json
    "odds": {
      "line": "{win}% · need {need}% · {n} tr.",
      "plus": "in profit",
      "minus": "losing",
      "unclear": "unclear"
    },
```

- [ ] **Step 4: Данные**

`entities/tag/api/hooks.ts`:

```ts
export const useTagStats = (days: number, enabled = true) =>
  useQuery({
    queryKey: ['tagStats', days],
    queryFn: () => apiJson<TagStatsResponse>(`/api/trades/stats-by-tag?days=${days}`),
    enabled,
  });
```

(сохранить прочие опции, если они у хука есть). `widgets/backtest-session/api/hooks.ts`:

```ts
export const useBacktestStats = (source: StatsSource, enabled = true) =>
  useQuery({
    queryKey: ['backtest', 'stats', source],
    queryFn: () => apiJson<BacktestStats>(`/api/backtest/stats${qs({ source })}`),
    enabled,
  });
```

```ts
// frontend/src/widgets/backtest-session/model/useTagOdds.ts
'use client';

import { useMemo } from 'react';
import { tagOddsOf, useTagStats, type TagOdds } from '@/entities/tag';
import { useBacktestStats } from '../api/hooks';
import type { StatsSource } from '../api/types';

export type TagOddsSource = 'journal' | StatsSource;

/**
 * Статистика тегов для окна разметки терминала (спека 2026-10-25): журнал за всё
 * время — у биржевого терминала, статистика бектеста по источнику — у сессий.
 * Выключено — запросов нет и чисел нет.
 */
export function useTagOdds(source: TagOddsSource, enabled: boolean): Record<string, TagOdds> | undefined {
  const journal = useTagStats(0, enabled && source === 'journal');
  const backtest = useBacktestStats(source === 'journal' ? 'real' : source, enabled && source !== 'journal');
  return useMemo(() => {
    if (!enabled) return undefined;
    const out: Record<string, TagOdds> = {};
    if (source === 'journal') {
      if (!journal.data) return undefined;
      for (const b of journal.data.tags) {
        const o = b.id ? tagOddsOf({ trades: b.trades, wins: b.wins, avgWin: b.avgWin, avgLoss: b.avgLoss }) : null;
        if (b.id && o) out[b.id] = o;
      }
      return out;
    }
    if (!backtest.data) return undefined;
    for (const r of backtest.data.byTag) {
      const o = tagOddsOf({ trades: r.trades, wins: r.wins, avgWin: r.avgWinR, avgLoss: r.avgLossR });
      if (o) out[r.tag.id] = o;
    }
    return out;
  }, [enabled, source, journal.data, backtest.data]);
}
```

`widgets/backtest-session/index.ts`: `export { useTagOdds } from './model/useTagOdds';`.

- [ ] **Step 5: Проводка**

`SessionScreen.tsx` в `Terminal`:

```ts
  const tagOdds = useTagOdds(tagStatsFrom ?? (session.dataSource === 'synthetic' ? 'synthetic' : 'real'), tags && expOn('tags'));
```

и `odds={tagOdds}` у обоих `TagsDialog` (позиция и сделка истории).

`ExchangeHistory.tsx`:

```ts
import { useExpOn, useTagOdds } from '@/widgets/backtest-session';
// …в компоненте:
  const [tagsOn] = useExpOn('tags');
  const tagOdds = useTagOdds('journal', tagsOn);
```

и `odds={tagOdds}` у его `TagsDialog`. (`views` импортирует `widgets` — допустимо по FSD; `ExchangeHistory` и так рендерится внутри терминала.)

- [ ] **Step 6: Проверка**

Run: `cd frontend && npx tsc --noEmit && npx vitest run src/entities/tag src/shared/i18n src/widgets/backtest-session` → PASS.

- [ ] **Step 7: Коммит**

```bash
git add frontend/src
git commit -m "feat(terminal): статистика тегов в окне разметки"
```

---

### Task 10: Плашка дивергенций и деривативов

**Files:**
- Create: `frontend/src/entities/probabilities/api/types.ts`, `api/hooks.ts`, `index.ts`
- Create: `frontend/src/widgets/backtest-session/lib/odds-plaque.ts`, `lib/odds-plaque.test.ts`
- Create: `frontend/src/widgets/backtest-session/components/OddsPlaque.tsx`
- Modify: `SessionScreen.tsx` (монтирование в `.chart-tools-main`), `globals.css`, `ru.json`, `en.json` (`backtest.exp.plaque`)

**Interfaces:**
- Consumes: ответ `GET /api/probabilities` (форма — Task 5); `rsiSeries`, `RSI_DEFAULTS`, `Divergence` из `lib/rsi`; `expOn('signals' | 'derivs')`, `serverStats` (Task 7); `replay.shownTf`, `screenCandles`, `symbol`, `isLive` в `Terminal`.
- Produces: `useProbabilities(enabled)`; `FRESH_BARS = 20`, `freshDivergence(divs, last) => { kind; ago } | null`, `derivValueText(kind, value) => string`; `<OddsPlaque tf candles symbol signals derivs />`.

- [ ] **Step 1: Сущность**

```ts
// frontend/src/entities/probabilities/api/types.ts
/** Форма ответа `GET /api/probabilities` — копия `backend/src/probabilities/types.ts`. */
export type OddsSide = 'up' | 'down';
export type DerivKind = 'funding' | 'ratio' | 'oi';
export type DerivZone = 'high' | 'low' | 'normal';

export interface OddsCount {
  n: number;
  hits: number;
  share: number;
  low: number;
  high: number;
}

export interface OddsStat {
  side: OddsSide;
  train: OddsCount;
  test: OddsCount;
  holds: boolean;
}

export interface DivergenceOdds {
  bull: OddsStat | null;
  bear: OddsStat | null;
}

export interface DerivNow {
  kind: DerivKind;
  value: number | null;
  zone: DerivZone | null;
}

export interface Probabilities {
  /** Ключ — таймфрейм в минутах. */
  divergence: Record<string, DivergenceOdds>;
  /** Ключ — `<ряд>:high` / `<ряд>:low`. */
  derivs: Record<string, OddsStat | null>;
  now: DerivNow[];
  computedAt: string | null;
  nowAt: string | null;
}
```

```ts
// frontend/src/entities/probabilities/api/hooks.ts
'use client';

import { useQuery } from '@tanstack/react-query';
import { apiJson } from '@/shared/api/http';
import type { Probabilities } from './types';

/**
 * Частоты и «сейчас» экспериментальных индикаторов. Частоты сервер пересчитывает
 * раз в сутки, «сейчас» — раз в час: перечитывать чаще получаса незачем.
 */
export const useProbabilities = (enabled: boolean) =>
  useQuery({
    queryKey: ['probabilities'],
    queryFn: () => apiJson<Probabilities>('/api/probabilities'),
    enabled,
    staleTime: 10 * 60_000,
    refetchInterval: enabled ? 30 * 60_000 : false,
  });
```

```ts
// frontend/src/entities/probabilities/index.ts
export * from './api/types';
export * from './api/hooks';
```

- [ ] **Step 2: Падающий тест модели плашки**

```ts
// frontend/src/widgets/backtest-session/lib/odds-plaque.test.ts
import { describe, expect, it } from 'vitest';
import { derivValueText, freshDivergence, FRESH_BARS } from './odds-plaque';
import { RSI_DEFAULTS, type Divergence } from './rsi';

const div = (kind: 'bull' | 'bear', to: number): Divergence => ({
  kind,
  from: to - 10,
  to,
  fromPrice: 1,
  toPrice: 1,
  rsiFrom: to - 10,
  rsiTo: to,
  fromValue: 30,
  toValue: 40,
});

describe('freshDivergence', () => {
  const R = RSI_DEFAULTS.rightBars;
  it('нет дивергенций — null', () => {
    expect(freshDivergence([], 100)).toBeNull();
  });
  it('считает свечи от подтверждения, а не от вершины', () => {
    expect(freshDivergence([div('bull', 90)], 90 + R + 3)).toEqual({ kind: 'bull', ago: 3 });
  });
  it('старше горизонта — не свежая', () => {
    expect(freshDivergence([div('bear', 50)], 50 + R + FRESH_BARS + 1)).toBeNull();
    expect(freshDivergence([div('bear', 50)], 50 + R + FRESH_BARS)).toEqual({ kind: 'bear', ago: FRESH_BARS });
  });
  it('берёт последнюю', () => {
    expect(freshDivergence([div('bull', 40), div('bear', 60)], 60 + R)).toEqual({ kind: 'bear', ago: 0 });
  });
});

describe('derivValueText', () => {
  it('фандинг, доля лонгов, изменение открытого интереса', () => {
    expect(derivValueText('funding', 0.00031)).toBe('0.0310 %');
    expect(derivValueText('ratio', 0.6421)).toBe('64 %');
    expect(derivValueText('oi', 0.0604)).toBe('+6.0 %');
    expect(derivValueText('oi', -0.012)).toBe('−1.2 %');
  });
});
```

Run: `cd frontend && npx vitest run src/widgets/backtest-session/lib/odds-plaque.test.ts` → FAIL.

- [ ] **Step 3: Модель плашки**

```ts
// frontend/src/widgets/backtest-session/lib/odds-plaque.ts
import type { DerivKind } from '@/entities/probabilities';
import { RSI_DEFAULTS, type Divergence } from './rsi';

/** Свежесть дивергенции — горизонт исхода частот на сервере: позже её исход уже решился. */
export const FRESH_BARS = 20;

/**
 * Последняя дивергенция графика, подтверждённая не больше FRESH_BARS свечей
 * назад; `last` — индекс последней свечи. Подтверждение — `to + rightBars`, как
 * у событий, по которым сервер считал частоты.
 */
export function freshDivergence(divs: readonly Divergence[], last: number): { kind: 'bull' | 'bear'; ago: number } | null {
  const d = divs.at(-1);
  if (!d) return null;
  const ago = last - (d.to + RSI_DEFAULTS.rightBars);
  return ago >= 0 && ago <= FRESH_BARS ? { kind: d.kind, ago } : null;
}

/** Значение ряда для плашки: фандинг — 0.0310 %, доля лонг-аккаунтов — 64 %, открытый интерес — +6.0 % за сутки. */
export function derivValueText(kind: DerivKind, value: number): string {
  if (kind === 'funding') return `${(value * 100).toFixed(4)} %`;
  if (kind === 'ratio') return `${Math.round(value * 100)} %`;
  return `${value >= 0 ? '+' : '−'}${Math.abs(value * 100).toFixed(1)} %`;
}
```

Run: `cd frontend && npx vitest run src/widgets/backtest-session/lib/odds-plaque.test.ts` → PASS.

- [ ] **Step 4: Компонент**

```tsx
// frontend/src/widgets/backtest-session/components/OddsPlaque.tsx
'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useProbabilities, type OddsStat } from '@/entities/probabilities';
import type { Candle } from '../lib/candles';
import { derivValueText, freshDivergence } from '../lib/odds-plaque';
import { rsiSeries } from '../lib/rsi';

/**
 * Плашка экспериментальных индикаторов над графиком (спека 2026-10-25):
 * последняя дивергенция RSI и зоны деривативов BTC — с частотой из истории и
 * проверкой вперёд. HTML поверх графика, а не узел его SVG: она не двигается с
 * графиком и перерисовываться с каждым кадром жеста незачем. Нажатий не ловит.
 */
export function OddsPlaque({
  tf,
  candles,
  symbol,
  signals,
  derivs,
}: {
  tf: number;
  candles: readonly Candle[];
  symbol: string;
  signals: boolean;
  derivs: boolean;
}) {
  const t = useTranslations('backtest');
  const btc = symbol === 'BTCUSDT';
  const { data, isLoading } = useProbabilities(btc);
  // Те же дивергенции, что рисует панель RSI: тот же rsiSeries по тем же свечам.
  const divs = useMemo(() => (signals && btc ? rsiSeries(candles).divergences : []), [signals, btc, candles]);

  const stat = (s: OddsStat | null | undefined) =>
    s ? (
      <p className={s.holds ? undefined : 'muted'}>
        {t('exp.plaque.stat', {
          side: t(`exp.plaque.side.${s.side}`),
          share: Math.round(s.train.share),
          n: s.train.n,
          test: Math.round(s.test.share),
          testN: s.test.n,
        })}{' '}
        — {t(s.holds ? 'exp.plaque.holds' : 'exp.plaque.fails')}
      </p>
    ) : (
      <p className="muted">{t('exp.plaque.fewCases')}</p>
    );

  const body = () => {
    if (!btc) return <p className="muted">{t('exp.plaque.onlyBtc')}</p>;
    if (!data) return <p className="muted">{isLoading ? t('exp.plaque.loading') : t('exp.plaque.notYet')}</p>;
    const tfName = t(`tf.${tf}`);
    const byTf = data.divergence[String(tf)];
    const fresh = freshDivergence(divs, candles.length - 1);
    return (
      <>
        {signals &&
          (!byTf ? (
            <p className="muted">{t('exp.plaque.noTf', { tf: tfName })}</p>
          ) : fresh ? (
            <>
              <p>{t(`exp.plaque.div.${fresh.kind}`, { tf: tfName, ago: fresh.ago })}</p>
              {stat(byTf[fresh.kind])}
            </>
          ) : (
            <p className="muted">{t('exp.plaque.noFresh')}</p>
          ))}
        {derivs &&
          (data.now.length === 0 ? (
            <p className="muted">{t('exp.plaque.notYet')}</p>
          ) : (
            data.now.map((d) => (
              <div key={d.kind}>
                <p>
                  {t(`exp.plaque.kind.${d.kind}`)} {d.value != null ? derivValueText(d.kind, d.value) : '—'} —{' '}
                  {t(`exp.plaque.zone.${d.zone ?? 'none'}`)}
                </p>
                {(d.zone === 'high' || d.zone === 'low') && stat(data.derivs[`${d.kind}:${d.zone}`])}
              </div>
            ))
          ))}
      </>
    );
  };

  return (
    <div className="odds-plaque">
      <p className="odds-plaque-head">{t('exp.plaque.title')}</p>
      {body()}
    </div>
  );
}
```

`Candle` — тип из `lib/candles` (`{ t, o, h, l, c }`); `screenCandles` в `Terminal` — массив таких.

- [ ] **Step 5: Монтирование**

`SessionScreen.tsx`, внутри `<div className="chart-tools-main">` сразу после блока `{replay.ready ? (<ReplayChart …/>) : (<ChartSkeleton />)}`:

```tsx
                {/* Пункты 3–4 эксперимента — только живой рынок: в истории плашка выдала бы
                    скрытую монету, у тренажёра статистика BTC ни о чём. */}
                {replay.ready && isLive && (expOn('signals') || expOn('derivs')) && (
                  <OddsPlaque
                    tf={replay.shownTf}
                    candles={screenCandles}
                    symbol={symbol}
                    signals={expOn('signals')}
                    derivs={expOn('derivs')}
                  />
                )}
```

(`expOn` уже учитывает `serverStats` — на главной оба выключены.) Импорт `OddsPlaque` из `./OddsPlaque`.

`globals.css` рядом с `.chart-tools-main`:

```css
  .odds-plaque {
    position: absolute; top: var(--s2); left: var(--s2); z-index: 2;
    max-width: min(380px, calc(100% - 2 * var(--s2)));
    padding: var(--s2) var(--s3);
    background: var(--ground); border: 1px solid var(--hair);
    font-family: var(--font-mono); font-size: 11px; line-height: 1.45;
    pointer-events: none;
  }
  .odds-plaque p { margin: 0; }
  .odds-plaque-head { color: var(--ink-2); }
```

- [ ] **Step 6: Тексты**

`ru.json`, внутрь `backtest.exp` (рядом с `toggle`):

```json
      "plaque": {
        "title": "Эксперимент · BTC",
        "onlyBtc": "Эксперимент считается только по BTC",
        "loading": "Загрузка…",
        "notYet": "Статистика ещё считается",
        "noTf": "Дивергенции: нет статистики для {tf}",
        "noFresh": "Свежих дивергенций RSI нет",
        "div": {
          "bull": "Бычья дивергенция RSI {tf} · {ago, plural, =0 {на этой свече} one {# свеча назад} few {# свечи назад} many {# свечей назад} other {# свечи назад}}",
          "bear": "Медвежья дивергенция RSI {tf} · {ago, plural, =0 {на этой свече} one {# свеча назад} few {# свечи назад} many {# свечей назад} other {# свечи назад}}"
        },
        "stat": "{side} первым {share} % · {n} случаев · на проверке {test} % из {testN}",
        "side": { "up": "вверх", "down": "вниз" },
        "holds": "держится",
        "fails": "не держится",
        "fewCases": "в истории таких случаев нет",
        "kind": { "funding": "Фандинг", "ratio": "Лонг-аккаунты", "oi": "Открытый интерес за сутки" },
        "zone": { "high": "высокий", "low": "низкий", "normal": "обычная зона", "none": "нет данных" }
      }
```

`en.json`:

```json
      "plaque": {
        "title": "Experiment · BTC",
        "onlyBtc": "The experiment covers BTC only",
        "loading": "Loading…",
        "notYet": "Statistics are still being computed",
        "noTf": "Divergences: no statistics for {tf}",
        "noFresh": "No fresh RSI divergences",
        "div": {
          "bull": "Bullish RSI divergence {tf} · {ago, plural, =0 {on this candle} one {# candle ago} other {# candles ago}}",
          "bear": "Bearish RSI divergence {tf} · {ago, plural, =0 {on this candle} one {# candle ago} other {# candles ago}}"
        },
        "stat": "{side} first {share}% · {n} cases · forward test {test}% of {testN}",
        "side": { "up": "up", "down": "down" },
        "holds": "holds",
        "fails": "does not hold",
        "fewCases": "no such cases in history",
        "kind": { "funding": "Funding", "ratio": "Long accounts", "oi": "Open interest, 24h" },
        "zone": { "high": "high", "low": "low", "normal": "normal range", "none": "no data" }
      }
```

- [ ] **Step 7: Проверка**

Run: `cd frontend && npx tsc --noEmit && npx vitest run src/widgets/backtest-session src/shared/i18n && npx eslint src/widgets/backtest-session src/entities/probabilities src/entities/tag`
Expected: без ошибок.

- [ ] **Step 8: Коммит**

```bash
git add frontend/src
git commit -m "feat(terminal): плашка дивергенций и деривативов BTC"
```

---

> **Контрольная точка ревью (B — общий экран трёх терминалов, `Level`/`ReplayChart`, `TagPicker`, стык с API).** Задачи 7–10 одним пакетом, ревьюер Sonnet; сюда же входит стык бэк↔фронт (форма `Probabilities` против `types.ts` сервера, `avgWinR`/`avgLossR`). Отдельный Opus-прогон не нужен: точек две, стык попал во вторую.

---

### Task 11: Живой прогон, сборка, документация

**Files:**
- Modify: `CLAUDE.md` (раздел про эксперимент; `worker` — четырнадцать фоновых сервисов, `probability-stats` в списке)

- [ ] **Step 1: Живой прогон расчёта**

Локальный backend (`ROLE=all`) поднять заново, чтобы модуль вошёл в граф. Дождаться в логе «частоты вероятностей пересчитаны» (первый прогон доливает ряды с 2020 — около 140 запросов через шлюз, затем считает). Проверить:

```bash
cd backend && npx ts-node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  console.log(await p.derivPoint.groupBy({ by: ['kind'], _count: true, _min: { time: true }, _max: { time: true } }));
  for (const r of await p.probabilityStat.findMany()) console.log(r.key, r.computedAt, JSON.stringify(r.data).slice(0, 600));
  await p.\$disconnect();
})();"
```

Expected: три ряда с 2020 года до сегодня; строки `divergence`, `derivs`, `now` с числами (у `divergence` — пять таймфреймов).

- [ ] **Step 2: Ответ API**

Войти тестовым пользователем (`pw-tester@example.com` / `pw-tester-123`) и запросить `GET /api/probabilities` с его токеном — тот же JSON, что в строках. Если сервис не стартовал — смотреть лог `worker`/`all`, а не перезапускать вслепую.

- [ ] **Step 3: Сборки**

Run: `cd backend && npm run build` и `cd frontend && npx next build`
Expected: обе сборки зелёные.

- [ ] **Step 4: CLAUDE.md**

1. В абзаце про роль `worker` («тринадцать фоновых сервисов — …») — «четырнадцать», в список добавить `probability-stats`; «каждого из тринадцати сервисов» — «четырнадцати».
2. Новый раздел после «График терминала: RSI с дивергенциями»:

```markdown
## Терминал: экспериментальные индикаторы вероятностей (2026-10-25)

Четыре выключателя в разделе «Экспериментальные» настроек графика, по умолчанию выключены
(`virex.terminal.exp.*`). Спека — `docs/superpowers/specs/2026-10-25-probability-indicators-design.md`.
Числа — частоты из истории, а не прогноз: индикатор «вероятность роста по времени недели» уже
снимался после проверки вперёд, поэтому у каждого числа — выборка, интервал и проверка.

- **Шанс тейка** — `стоп / (стоп + тейк)` от цены, на подписи тейка (`Level.oddsAt`); планка
  рынка без перекоса, сервер не нужен.
- **Статистика тегов** — в окне тегов терминала: винрейт, «нужно» (безубыточность тега) и вывод
  по интервалу Вильсона. Биржа — журнал (`tagStatsFrom="journal"`), сессии — бектест.
- **Дивергенции RSI и деривативы BTC** — плашка над графиком, только BTC и только живой рынок.
  Считает `worker` (`backend/src/probabilities`): ряды Bybit (фандинг, доля лонгов, открытый
  интерес) доливает в `deriv_points` через шлюз, частоты пересчитывает раз в сутки в
  `probability_stats`. Исход — какую границу ±1 ATR цена коснулась первой за 20 свечей;
  история — до 2023, проверка — с 2023; «держится» — нижняя граница проверки выше 50 %.
- **`rsi.ts` живёт в двух местах** (фронт и `backend/src/probabilities`), `rsi-copy.spec.ts`
  сверяет побайтно; формат — prettier бэкенда. События — `divergenceEventsOf`: подтверждения,
  которые потом удлинились, тоже в выборке.
- Сложения сигналов в одно число нет — это модель, в эксперимент не входит.
```

3. На сервере после деплоя нужен `db push` (две новые таблицы) — записать в итог для владельца, не выполнять самому.

- [ ] **Step 5: Коммит**

```bash
git add CLAUDE.md
git commit -m "docs: экспериментальные индикаторы вероятностей в CLAUDE.md"
```

- [ ] **Step 6: Отчёт владельцу**

Сказать: что посчитано на живых данных (какие сигналы держатся, какие нет — прямо числами из `probability_stats`), что сборки зелёные, что ветка не влита и на сервере после деплоя нужен `db push`.
