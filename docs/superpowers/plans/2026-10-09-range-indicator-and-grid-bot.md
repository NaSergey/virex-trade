# Индикатор боковика и грид-бот в бектесте — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** рамка боковика на графике всех терминалов и грид-бот в сессиях бектеста, у которого человек сам задаёт диапазон и стоп.

**Architecture:** индикатор — чистый модуль `lib/ranges.ts` (перенос прототипа) и слой `ReplayChart`; 4ч-свечи для него — своей загрузкой через источник свечей терминала. Бот — строка `BacktestBot` и реакции сервера в тех же транзакциях, где исполняются ордера (`openChecked`, `applyClose`): исполнилась покупка бота — ставится продажа, исполнилась продажа — снова покупка. На фронте — вкладка «Бот» панели ордера с черновиком на графике, как у «Сетки».

**Tech Stack:** NestJS + Prisma (jest с заглушками призмы), Next.js + React Query (vitest).

**Spec:** `docs/superpowers/specs/2026-10-09-range-indicator-and-grid-bot-design.md`.

## Global Constraints

- Правила детектора — ровно из спеки: ATR(14) Уайлдера на 4ч; большой ZigZag 4 ATR; малый 1,5 ATR; импульс от 8 ATR и `размах/(ATR·√свечей) ≥ 1,5`; откат не глубже 60 %; рамка не уже 3 ATR; ретест — в четверти ширины; пробой — 6 закрытий подряд дальше границы на 0,5 ATR.
- Детектор не перерисовывается: результат на свече t зависит только от свечей до t.
- Бот — только лонг; уровни `низ + j·шаг`, j = 0…N−1, N = 2…20; уровни на цене и выше покупаются по рынку при запуске; продажа — на шаг выше покупки; перезапуска после стопа нет.
- Бот только в сессиях бектеста (история, тренажёр, эфир); турнир — 409 `BACKTEST_BOT_TOURNAMENT`; у биржи и на главной вкладки нет.
- Пока бот работает, ручной лонг монеты — 409 `BACKTEST_BOT_SIDE`.
- Сырой разметки нет: `Button`, `Field`/`Input`, `KeyValue`, `Seg`, `Slider`, `ErrorNote` из `shared/ui`; цвета — классами (`.muted`, `.pos`, `.neg`).
- Тексты — через `next-intl` (`backtest` и `errors` в `ru.json` и `en.json`).
- **Коммитов в плане нет**: в рабочем дереве уже лежат незакоммиченные правки владельца, коммитит он или по его просьбе.
- Фронт после крупной правки проверять `npx next build` (не только `tsc`).

## Файлы

| Файл | Что |
|---|---|
| `frontend/src/widgets/backtest-session/lib/ranges.ts` (новый) | ATR, ZigZag, `findRanges`, `visibleAt`, `toChartRanges` |
| `frontend/src/widgets/backtest-session/lib/ranges.test.ts` (новый) | тесты детектора |
| `frontend/src/widgets/backtest-session/lib/__fixtures__/btc-4h-2024.json` (новый) | 4ч BTC 2024-04-01…2024-08-31 |
| `frontend/src/widgets/backtest-session/model/useRangeCandles.ts` (новый) | загрузка закрытых 4ч-свечей до «сейчас» |
| `frontend/src/widgets/backtest-session/model/useChartSettings.ts` | `useRangesOn` |
| `frontend/src/widgets/backtest-session/components/ChartSettingsPanel.tsx` | переключатель «Боковики» |
| `frontend/src/widgets/backtest-session/components/ReplayChart.tsx` | проп `ranges`, слой рамок |
| `frontend/src/widgets/backtest-session/model/useLiveFeed.ts` | экспорт `SESSION_SOURCE` |
| `backend/prisma/schema.prisma` | `BacktestBot`, поля `botId`/`botBuyPrice` |
| `backend/src/backtest/bot-grid.ts` (новый) + `.spec.ts` | расчёт сетки |
| `frontend/src/widgets/backtest-session/lib/bot-grid.ts` (новый) + `.test.ts` | копия расчёта |
| `backend/src/backtest/backtest.service.ts` | `openInTx`, `startBot`, `stopBot`, реакции, замок лонга |
| `backend/src/backtest/dto/backtest.dto.ts`, `backtest.controller.ts` | `StartBotDto`, два маршрута |
| `backend/src/backtest/backtest.service.spec.ts` | тесты бота |
| `frontend/src/widgets/backtest-session/api/types.ts`, `api/hooks.ts`, `model/actions.ts` | `BacktestBot`, `useStartBot`, `useStopBot`, `actions.bot` |
| `frontend/src/widgets/backtest-session/components/BotPanel.tsx` (новый) | вкладка «Бот» |
| `frontend/src/widgets/backtest-session/components/OrderPanel.tsx` | вкладка «Бот», замок лонга |
| `frontend/src/widgets/backtest-session/lib/draft-levels.ts` | линии черновика бота |
| `frontend/src/widgets/backtest-session/components/SessionScreen.tsx` | проводка индикатора и бота |
| `frontend/src/widgets/backtest-session/components/OrdersPanel.tsx` | пометка «бот» |
| `frontend/src/shared/i18n/messages/ru.json`, `en.json` | тексты |
| `CLAUDE.md` | раздел о боте и индикаторе |

Контрольные точки ревью (правило «гибрид»): после задач 1–3 (B — общий виджет всех терминалов), после 4–7 (A — деньги и ордера), после 8–9 (B — стык фронт↔бэк). Точек три — в конце ревью Opus по всей ветке.

---

### Task 1: Детектор боковика `lib/ranges.ts`

**Files:**
- Create: `frontend/src/widgets/backtest-session/lib/ranges.ts`
- Create: `frontend/src/widgets/backtest-session/lib/ranges.test.ts`
- Create: `frontend/src/widgets/backtest-session/lib/__fixtures__/btc-4h-2024.json`

**Interfaces:**
- Consumes: `Candle` из `./candles` (`{ t, o, h, l, c }`, t — открытие, мс).
- Produces:
  - `RANGE_RULES`, `H4 = 4 * 3_600_000`
  - `atrOf(bars: Candle[], n: number): number[]`
  - `zigzagOf(bars: Candle[], atr: number[], k: number): Swing[]`, `Swing = { kind: 'H' | 'L'; price: number; at: number; conf: number }`
  - `findRanges(bars: Candle[]): RangeBox[]`, `RangeBox = { dir: 'up' | 'down'; impFrom: number; impTo: number; seenAt: number; retestAt: number | null; endAt: number | null; end: 'up' | 'down' | null; steps: { at: number; lo: number; hi: number }[] }` (индексы свечей)
  - `visibleAt(boxes: RangeBox[], t: number): RangeBox[]` — что известно на свече t
  - `toChartRanges(boxes: RangeBox[], bars: Candle[], toScreen: (p: number) => number): ChartRange[]`, `ChartRange = { id: string; kind: 'range' | 'bot'; from: number; seen: number; end: number | null; steps: { t: number; lo: number; hi: number }[] }` (время в мс, цены экранные)

- [ ] **Step 1: Фикстура из данных исследования**

Run (scratchpad сессии исследования, данные Binance уже скачаны):
```bash
S="C:/Users/wxtxn/AppData/Local/Temp/claude/e--git-virex-trader/070363cf-a790-4a68-8cf0-7be412aa50fb/scratchpad"
node -e "
const rows=JSON.parse(require('fs').readFileSync('$S/data/4h.json','utf8'));
const a=Date.UTC(2024,3,1),b=Date.UTC(2024,8,1);
const out=rows.filter(r=>r[0]>=a&&r[0]<b).map(([t,o,h,l,c])=>[t,o,h,l,c]);
require('fs').writeFileSync('frontend/src/widgets/backtest-session/lib/__fixtures__/btc-4h-2024.json',JSON.stringify(out));
console.log(out.length);"
```
Expected: около 920 строк. Если scratchpad недоступен — скачать то же самое с `https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=4h&startTime=1711929600000&limit=1000` и обрезать до 2024-09-01.

- [ ] **Step 2: Написать тесты**

```ts
// lib/ranges.test.ts
import { describe, expect, it } from 'vitest';
import type { Candle } from './candles';
import { H4, atrOf, findRanges, toChartRanges, visibleAt, zigzagOf } from './ranges';
import btc from './__fixtures__/btc-4h-2024.json';

const bar = (i: number, c: number, spread = 0.5, o = c): Candle => ({ t: i * H4, o, h: Math.max(o, c) + spread, l: Math.min(o, c) - spread, c });

/** Ряд по закрытиям: каждая свеча открывается закрытием предыдущей. */
function series(closes: number[], spread = 0.5): Candle[] {
  return closes.map((c, i) => bar(i, c, spread, i === 0 ? c : closes[i - 1]));
}

const range = (from: number, to: number, step: number) => {
  const out: number[] = [];
  for (let v = from; step > 0 ? v <= to : v >= to; v += step) out.push(v);
  return out;
};

/** Ровно → импульс вверх → откат → качания в коридоре → пробой вверх. */
function impulseThenRange(): number[] {
  const flat = Array.from({ length: 40 }, (_, i) => 100 + (i % 2 ? 0.3 : -0.3));
  const impulse = range(102, 124, 2); // +24 за 12 свечей
  const pullback = range(122, 112, -2); // откат на ~12, меньше 60 % импульса
  const swings: number[] = [];
  for (let k = 0; k < 4; k++) swings.push(...range(114, 122, 2), ...range(120, 114, -2));
  const breakout = range(126, 150, 3);
  return [...flat, ...impulse, ...pullback, ...swings, ...breakout];
}

describe('atrOf', () => {
  it('у свечей одного размаха без разрывов ATR равен размаху', () => {
    const bars = Array.from({ length: 30 }, (_, i) => ({ t: i * H4, o: 100, h: 101, l: 99, c: 100 }));
    expect(atrOf(bars, 14).at(-1)).toBeCloseTo(2, 6);
  });
});

describe('zigzagOf', () => {
  it('засчитывает вершину, только когда цена отошла от неё на k·ATR, и в момент подтверждения', () => {
    const bars = series([...range(100, 120, 2), ...range(118, 100, -2)], 0.5);
    const atr = bars.map(() => 2);
    const sw = zigzagOf(bars, atr, 4);
    const top = sw.find((s) => s.kind === 'H')!;
    expect(top.price).toBeCloseTo(120.5, 6);
    // Вершина на свече 10, отход на 8 (4·2) — к свече 14.
    expect(top.at).toBe(10);
    expect(top.conf).toBe(14);
  });
});

describe('findRanges', () => {
  it('находит одну рамку после импульса и её пробой вверх', () => {
    const bars = series(impulseThenRange());
    const boxes = findRanges(bars);
    expect(boxes).toHaveLength(1);
    const b = boxes[0];
    expect(b.dir).toBe('up');
    expect(b.steps[0].hi).toBeCloseTo(124.5, 6); // вершина импульса
    expect(b.end).toBe('up');
    expect(b.endAt).not.toBeNull();
    expect(b.seenAt).toBeGreaterThan(b.impTo);
    expect(b.endAt!).toBeGreaterThan(b.seenAt);
  });

  it('откат глубже 60 % импульса — разворот, а не боковик', () => {
    const flat = Array.from({ length: 40 }, (_, i) => 100 + (i % 2 ? 0.3 : -0.3));
    const bars = series([...flat, ...range(102, 124, 2), ...range(122, 100, -2), ...range(102, 110, 2)]);
    expect(findRanges(bars)).toHaveLength(0);
  });

  it('не перерисовывается: на каждой свече t видно ровно то, что по свечам до t', () => {
    const closes: number[] = [];
    let p = 100;
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5;
    for (let i = 0; i < 700; i++) {
      // Режимы: тренд, боковик, тренд — чтобы рамки были.
      const drift = Math.floor(i / 100) % 2 === 0 ? 0.6 : 0;
      p = Math.max(10, p + drift + rnd() * 3);
      closes.push(p);
    }
    const bars = series(closes, 0.8);
    const full = findRanges(bars);
    for (let t = 30; t < bars.length; t += 7) {
      const part = visibleAt(findRanges(bars.slice(0, t + 1)), t);
      expect(part).toEqual(visibleAt(full, t));
    }
  });

  it('на настоящих 4ч BTC находит рамку июля 2024, как прототип исследования', () => {
    const bars = (btc as number[][]).map(([t, o, h, l, c]) => ({ t, o, h, l, c }));
    const at = (iso: string) => bars.findIndex((b) => b.t === Date.parse(iso));
    const july = findRanges(bars).find((b) => b.impTo === at('2024-07-05T00:00:00Z'));
    expect(july).toBeDefined();
    expect(july!.dir).toBe('down');
    expect(Math.round(july!.steps[0].lo)).toBe(53486);
    expect(Math.round(july!.steps[0].hi)).toBe(58475);
    expect(july!.end).toBe('up');
  });
});

describe('toChartRanges', () => {
  it('переводит индексы во время: рамка известна с закрытия своей свечи', () => {
    const bars = series(impulseThenRange());
    const [box] = findRanges(bars);
    const [cr] = toChartRanges([box], bars, (p) => p * 2);
    expect(cr.kind).toBe('range');
    expect(cr.from).toBe(bars[box.impTo].t);
    expect(cr.seen).toBe(bars[box.seenAt].t + H4);
    expect(cr.end).toBe(bars[box.endAt!].t + H4);
    expect(cr.steps[0].hi).toBeCloseTo(box.steps[0].hi * 2, 6);
  });
});
```

Значения рукотворного ряда (124,5, число рамок, `impTo` июля) сверяются с прототипом при первом прогоне: если ряд не даёт рамку из-за ATR разгона, поменять длину `flat` или шаг импульса, а не правила детектора.

- [ ] **Step 3: Прогнать — тесты падают**

Run: `cd frontend && npx vitest run src/widgets/backtest-session/lib/ranges.test.ts`
Expected: FAIL — `Cannot find module './ranges'`.

- [ ] **Step 4: Реализация**

```ts
// lib/ranges.ts
import type { Candle } from './candles';

/**
 * Боковик после импульса — перенос прототипа исследования 2026-10-09 (спека
 * `2026-10-09-range-indicator-and-grid-bot-design.md`): правила подобраны на
 * свечах 4ч BTC с 2017 года, длительность боковика в них не задана.
 *
 * Детектор не перерисовывается: всё, что он знает на свече i, посчитано по
 * свечам 0..i. Вершина ZigZag засчитывается в момент подтверждения, рамка
 * появляется на свече, где цена развернулась от дна отката, а не «с начала
 * боковика», — иначе задним числом любая рамка выглядела бы идеально.
 */
export const RANGE_RULES = {
  atrLen: 14,
  /** Порог большого ZigZag — им ищутся импульсы. */
  zz: 4,
  /** Порог малого: разворот от дна отката и касания стороны импульса. */
  zzMinor: 1.5,
  impA: 8,
  impZ: 1.5,
  maxRetr: 0.6,
  minW: 3,
  tol: 0.25,
  brk: 0.5,
  brkN: 6,
} as const;

export const H4 = 4 * 3_600_000;

export interface Swing {
  kind: 'H' | 'L';
  price: number;
  /** Свеча вершины. */
  at: number;
  /** Свеча, на которой вершина засчитана. */
  conf: number;
}

export interface RangeStep {
  at: number;
  lo: number;
  hi: number;
}

export interface RangeBox {
  dir: 'up' | 'down';
  impFrom: number;
  impTo: number;
  seenAt: number;
  retestAt: number | null;
  endAt: number | null;
  end: 'up' | 'down' | null;
  /** Границы, какими их знали: с какой свечи какие. Первая — на `seenAt`. */
  steps: RangeStep[];
}

export interface ChartRange {
  id: string;
  /** `range` — рамка индикатора, `bot` — диапазон работающего бота. */
  kind: 'range' | 'bot';
  /** С какого времени рамку видно задним числом (вершина импульса). */
  from: number;
  /** С какого времени о ней знали. */
  seen: number;
  /** Пробой; null — живёт. */
  end: number | null;
  /** Экранные цены. */
  steps: { t: number; lo: number; hi: number }[];
}

/** ATR Уайлдера; первые n значений — среднее накопленного. */
export function atrOf(bars: Candle[], n: number): number[] {
  const out: number[] = [];
  let a = 0;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const tr = i === 0 ? b.h - b.l : Math.max(b.h - b.l, Math.abs(b.h - bars[i - 1].c), Math.abs(b.l - bars[i - 1].c));
    a = i < n ? (a * i + tr) / (i + 1) : (a * (n - 1) + tr) / n;
    out.push(a);
  }
  return out;
}

/** ZigZag по ATR: вершина засчитывается на свече, где цена отошла от неё на k·ATR. */
export function zigzagOf(bars: Candle[], atr: number[], k: number): Swing[] {
  const out: Swing[] = [];
  if (bars.length === 0) return out;
  let dir: 0 | 1 | -1 = 0;
  let hi = bars[0].h, hiAt = 0, lo = bars[0].l, loAt = 0;
  for (let i = 1; i < bars.length; i++) {
    const b = bars[i];
    if (dir >= 0 && b.h > hi) { hi = b.h; hiAt = i; }
    if (dir <= 0 && b.l < lo) { lo = b.l; loAt = i; }
    if (dir >= 0 && hi - b.l >= k * atr[i] && hiAt < i) {
      if (dir === 0 && loAt < hiAt) out.push({ kind: 'L', price: lo, at: loAt, conf: i });
      out.push({ kind: 'H', price: hi, at: hiAt, conf: i });
      dir = -1; lo = b.l; loAt = i;
    } else if (dir <= 0 && b.h - lo >= k * atr[i] && loAt < i) {
      if (dir === 0 && hiAt < loAt) out.push({ kind: 'H', price: hi, at: hiAt, conf: i });
      out.push({ kind: 'L', price: lo, at: loAt, conf: i });
      dir = 1; hi = b.h; hiAt = i;
    }
  }
  return out;
}

/** Рамки боковиков на закрытых свечах 4ч. */
export function findRanges(bars: Candle[]): RangeBox[] {
  const R = RANGE_RULES;
  const a = atrOf(bars, R.atrLen);
  const major = zigzagOf(bars, a, R.zz);
  const minor = zigzagOf(bars, a, R.zzMinor);
  const out: RangeBox[] = [];
  for (let k = 1; k < major.length; k++) {
    const s = major[k - 1], e = major[k];
    const amp = Math.abs(e.price - s.price);
    const ref = a[s.at];
    const z = amp / (ref * Math.sqrt(Math.max(1, e.at - s.at)));
    if (amp < R.impA * ref || z < R.impZ) continue;
    // Рамка одна за раз: импульс внутри живой рамки — её качание.
    const prev = out.at(-1);
    if (prev && (prev.endAt === null || prev.endAt >= e.conf)) continue;

    // Дно отката (у импульса вниз — вершина отскока): бегущий экстремум после E;
    // рамка известна, когда цена развернулась от него на zzMinor·ATR (закрытием).
    const up = e.kind === 'H';
    let ext = up ? Infinity : -Infinity, extAt = e.at, seen = -1;
    let dead = false;
    for (let i = e.at + 1; i < bars.length; i++) {
      const b = bars[i];
      if (up ? b.l < ext : b.h > ext) { ext = up ? b.l : b.h; extAt = i; }
      if (Math.abs(e.price - ext) / amp > R.maxRetr) { dead = true; break; }
      if (i < e.conf) continue;
      const turn = up ? b.c - ext : ext - b.c;
      if (extAt < i && turn >= R.zzMinor * a[i]) { seen = i; break; }
    }
    if (dead || seen < 0) continue;
    let lo = Math.min(e.price, ext), hi = Math.max(e.price, ext);
    if (hi - lo < R.minW * a[seen]) continue;

    const box: RangeBox = {
      dir: up ? 'up' : 'down', impFrom: s.at, impTo: e.at, seenAt: seen,
      retestAt: null, endAt: null, end: null, steps: [{ at: seen, lo, hi }],
    };
    let mi = minor.findIndex((m) => m.conf > seen);
    let outUp = 0, outDn = 0;
    for (let i = seen + 1; i < bars.length; i++) {
      const b = bars[i];
      // До ретеста рамка ещё складывается: дальняя от импульса граница уходит за откатом.
      if (box.retestAt === null) {
        const lo0 = lo, hi0 = hi;
        if (up && b.l < lo && (e.price - b.l) / amp <= R.maxRetr) lo = b.l;
        if (!up && b.h > hi && (b.h - e.price) / amp <= R.maxRetr) hi = b.h;
        if (lo !== lo0 || hi !== hi0) box.steps.push({ at: i, lo, hi });
      }
      const pad = R.brk * a[i];
      outUp = b.c > hi + pad ? outUp + 1 : 0;
      outDn = b.c < lo - pad ? outDn + 1 : 0;
      if (outUp >= R.brkN || outDn >= R.brkN) {
        box.endAt = i;
        box.end = outUp >= R.brkN ? 'up' : 'down';
        break;
      }
      if (box.retestAt === null && mi >= 0) {
        while (mi < minor.length && minor[mi].conf <= i) {
          const m = minor[mi++];
          if (m.at <= extAt || m.kind !== e.kind) continue;
          const w = hi - lo;
          if (up ? m.price >= hi - R.tol * w : m.price <= lo + R.tol * w) { box.retestAt = m.conf; break; }
        }
      }
    }
    out.push(box);
  }
  return out;
}

/** Что из рамок известно на свече t: будущие ступени, ретест и пробой срезаны. */
export function visibleAt(boxes: RangeBox[], t: number): RangeBox[] {
  return boxes
    .filter((b) => b.seenAt <= t)
    .map((b) => ({
      ...b,
      retestAt: b.retestAt !== null && b.retestAt <= t ? b.retestAt : null,
      endAt: b.endAt !== null && b.endAt <= t ? b.endAt : null,
      end: b.endAt !== null && b.endAt <= t ? b.end : null,
      steps: b.steps.filter((s) => s.at <= t),
    }));
}

/** Рамки — во времени и экранных ценах для графика. Свеча известна с её закрытия. */
export function toChartRanges(boxes: RangeBox[], bars: Candle[], toScreen: (p: number) => number): ChartRange[] {
  return boxes.map((b) => ({
    id: `range-${bars[b.impTo].t}`,
    kind: 'range',
    from: bars[b.impTo].t,
    seen: bars[b.seenAt].t + H4,
    end: b.endAt !== null ? bars[b.endAt].t + H4 : null,
    steps: b.steps.map((s) => ({ t: bars[s.at].t + H4, lo: toScreen(s.lo), hi: toScreen(s.hi) })),
  }));
}
```

Неперерисовка держится на одном месте, которое легко сломать: ретест сверяется с малым ZigZag только по вершинам с `conf ≤ i`, а расширение рамки — только до ретеста. Не «улучшать» это чтением будущих свечей.

- [ ] **Step 5: Прогнать — проходят**

Run: `cd frontend && npx vitest run src/widgets/backtest-session/lib/ranges.test.ts`
Expected: PASS (6 тестов). Если июльская рамка BTC не совпала с прототипом — сравнить с `node range/report.ts data/4h.json '{"extend":true,"zz":4,"brkN":6,"early":true}' --list` в scratchpad исследования: фикстура начинается 2024-04-01, и первая рамка может отличаться разгоном ZigZag; июльская обязана совпасть.

---

### Task 2: Загрузка 4ч-свечей и переключатель «Боковики»

**Files:**
- Create: `frontend/src/widgets/backtest-session/model/useRangeCandles.ts`
- Modify: `frontend/src/widgets/backtest-session/model/useChartSettings.ts`
- Modify: `frontend/src/widgets/backtest-session/components/ChartSettingsPanel.tsx`
- Modify: `frontend/src/widgets/backtest-session/model/useLiveFeed.ts` (экспорт `SESSION_SOURCE`)
- Modify: `frontend/src/shared/i18n/messages/ru.json`, `en.json`

**Interfaces:**
- Consumes: `H4` из `lib/ranges.ts`; `Candle`.
- Produces:
  - `type Load4h = (range: { from?: number; to?: number; limit: number }) => Promise<Candle[]>`
  - `useRangeCandles(enabled: boolean, load: Load4h, key: string, now: number | null): Candle[]` — закрытые 4ч до `now`, ссылка стабильна между свечами
  - `useRangesOn(): [boolean, (on: boolean) => void]`
  - `SESSION_SOURCE: LiveSource` (экспорт)

- [ ] **Step 1: Настройка**

В `model/useChartSettings.ts` дописать:
```ts
/**
 * Рамки боковиков на графике (`lib/ranges.ts`). Включены, пока их не выключили в
 * настройках графика; выбор на устройстве и общий для всех терминалов — как у RSI.
 */
export const useRangesOn = () => usePersistentValue('virex.terminal.ranges', decodeOn, true, encodeOn);
```

- [ ] **Step 2: Хук загрузки**

```ts
// model/useRangeCandles.ts
'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Candle } from '../lib/candles';
import { H4 } from '../lib/ranges';

export type Load4h = (range: { from?: number; to?: number; limit: number }) => Promise<Candle[]>;

/** ≈166 дней: рамке, прожившей 75 дней, нужен и её импульс, и разгон ATR перед ним. */
const DEPTH = 1000;
/** Дальше этого — не догружать хвост, а взять заново всю глубину. */
const MAX_GAP = 50;

/**
 * Закрытые свечи 4ч монеты графика до «сейчас» терминала — для индикатора
 * боковиков. Своей загрузкой, а не из ленты: живая лента держит только
 * выбранный таймфрейм, а прокрутка — 300 свечей (50 дней).
 *
 * Догружается по одной закрытой свече за раз (диапазоном от последней), а не
 * всей глубиной: на ×60 прокрутки новая свеча 4ч закрывается каждые 4 секунды.
 * Формирующаяся свеча в ряд не входит — рамка мигала бы внутри неё.
 */
export function useRangeCandles(enabled: boolean, load: Load4h, key: string, now: number | null): Candle[] {
  const [state, setState] = useState<{ key: string; rows: Candle[] } | null>(null);
  // Открытие последней закрытой свечи; меняется раз в 4 часа «сейчас» терминала.
  const lastOpen = now == null ? null : Math.floor(now / H4) * H4 - H4;

  useEffect(() => {
    if (!enabled || lastOpen == null) return;
    const have = state?.key === key ? state.rows : null;
    const tail = have?.at(-1)?.t ?? null;
    if (tail != null && tail >= lastOpen) return;
    let alive = true;
    const to = lastOpen + H4 - 1;
    const range =
      tail != null && (lastOpen - tail) / H4 <= MAX_GAP ? { from: tail + H4, to, limit: MAX_GAP + 1 } : { to, limit: DEPTH };
    load(range)
      .then((rows) => {
        if (!alive) return;
        setState((prev) => {
          const base = prev?.key === key && range.from != null ? prev.rows : [];
          const last = base.at(-1)?.t ?? -Infinity;
          return { key, rows: [...base, ...rows.filter((c) => c.t > last)] };
        });
      })
      // Не загрузилось — рамок просто нет; следующая свеча попробует снова.
      .catch(() => undefined);
    return () => {
      alive = false;
    };
    // state читается как «что уже есть», а не как повод перезапуска.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, lastOpen, key, load]);

  return useMemo(
    () => (state?.key === key && lastOpen != null ? state.rows.filter((c) => c.t <= lastOpen) : []),
    [state, key, lastOpen],
  );
}
```

- [ ] **Step 3: Экспорт источника продукта**

В `model/useLiveFeed.ts`: `const SESSION_SOURCE: LiveSource = {` → `export const SESSION_SOURCE: LiveSource = {`.

- [ ] **Step 4: Переключатель в настройках графика**

В `ChartSettingsPanel.tsx` добавить пропы `rangesOn: boolean; onRanges: (on: boolean) => void;` и сразу после кнопки RSI:
```tsx
      <Button variant="none" className="cs-indicator" aria-pressed={rangesOn} onClick={() => onRanges(!rangesOn)}>
        {t('indicatorRanges')}
      </Button>
```

- [ ] **Step 5: Тексты**

`ru.json`, в `backtest` рядом с `indicatorRsi`: `"indicatorRanges": "Боковики после импульса"`.
`en.json`, там же: `"indicatorRanges": "Ranges after an impulse"`.

- [ ] **Step 6: Typecheck**

Run: `cd frontend && npx tsc --noEmit -p .`
Expected: ошибка только в `SessionScreen.tsx` — у `ChartSettingsPanel` не хватает `rangesOn`/`onRanges` (проводка — задача 3).

---

### Task 3: Рамки на графике и проводка индикатора

**Files:**
- Modify: `frontend/src/widgets/backtest-session/components/ReplayChart.tsx`
- Modify: `frontend/src/widgets/backtest-session/components/SessionScreen.tsx`

**Interfaces:**
- Consumes: `ChartRange`, `findRanges`, `toChartRanges`, `H4` (задача 1); `useRangeCandles`, `Load4h`, `useRangesOn`, `SESSION_SOURCE` (задача 2); `fetchCandles` из `api/hooks`.
- Produces: проп `ReplayChart.ranges?: ChartRange[]` (ссылка стабильная).

- [ ] **Step 1: Проп и пути рамок в `ReplayChart`**

В список пропов (после `rsi = false,`) — `ranges,`; в тип — 
```ts
  /**
   * Рамки боковиков (`lib/ranges.ts`) и диапазон бота — во времени и экранных
   * ценах. Ссылка стабильная — см. memo.
   */
  ranges?: ChartRange[];
```
Импорт: `import type { ChartRange } from '../lib/ranges';`.

После `rsiLast` — пути рамок, тем же приёмом, что свечи (несколько узлов на кадр):
```ts
  /**
   * Рамки боковиков: пунктир — задним числом (от вершины импульса до свечи, на
   * которой о рамке узнали), дальше — заливка и границы ступенями, какими их знали.
   * Диапазон бота — без пунктира и без заливки.
   */
  const rangePaths = useMemo(() => {
    if (!ranges || ranges.length === 0 || candles.length === 0) return null;
    const r = (v: number) => Math.round(v * 100) / 100;
    const xAt = (t: number) => (frameAtTime(candles, t) - frameStart) * slot;
    const plotHeight = plotBottom - PT;
    const yOf = (p: number) => PT + ((hi - p) / (hi - lo)) * plotHeight;
    const lastT = candles[candles.length - 1].t + timeframe * 60_000;
    const left = -slot, right = PW + slot;
    let dash = '', edge = '', fill = '', bot = '';
    for (const rg of ranges) {
      const end = rg.end ?? lastT;
      const x0 = xAt(rg.from), x1 = xAt(rg.seen), x2 = xAt(end);
      if (x2 < left || x0 > right) continue;
      const s0 = rg.steps[0];
      if (rg.kind === 'bot') {
        bot += `M${r(x1)} ${r(yOf(s0.hi))}H${r(x2)}M${r(x1)} ${r(yOf(s0.lo))}H${r(x2)}`;
        continue;
      }
      if (x1 > x0) dash += `M${r(x0)} ${r(yOf(s0.hi))}H${r(x1)}V${r(yOf(s0.lo))}H${r(x0)}z`;
      rg.steps.forEach((s, k) => {
        const a = xAt(s.t), b = k + 1 < rg.steps.length ? xAt(rg.steps[k + 1].t) : x2;
        fill += `M${r(a)} ${r(yOf(s.hi))}H${r(b)}V${r(yOf(s.lo))}H${r(a)}z`;
        edge += `M${r(a)} ${r(yOf(s.hi))}H${r(b)}M${r(a)} ${r(yOf(s.lo))}H${r(b)}`;
      });
      edge += `M${r(x1)} ${r(yOf(s0.hi))}V${r(yOf(s0.lo))}`;
      const sl = rg.steps[rg.steps.length - 1];
      if (rg.end != null) edge += `M${r(x2)} ${r(yOf(sl.hi))}V${r(yOf(sl.lo))}`;
    }
    return { dash, edge, fill, bot };
  }, [ranges, candles, frameStart, slot, plotBottom, hi, lo, timeframe, PW]);
```
(`frameAtTime` уже импортирован в `ReplayChart` для `xOfTime`; если нет — `import { frameAtTime } from '../lib/motion'`.)

- [ ] **Step 2: Слой в разметке**

Внутри группы поля цены с `clipPath` — **до** путей свечей (рамка под свечами). Найти первый `<path d={candlePaths.upWicks}` и вставить перед ним:
```tsx
            {rangePaths && (
              <g pointerEvents="none">
                <path d={rangePaths.fill} fill="var(--color-fg)" fillOpacity={0.05} />
                <path d={rangePaths.dash} fill="none" stroke="var(--color-muted)" strokeWidth={px(1)} strokeDasharray={`${px(4)} ${px(4)}`} />
                <path d={rangePaths.edge} fill="none" stroke="var(--color-fg)" strokeOpacity={0.55} strokeWidth={px(1)} />
                <path d={rangePaths.bot} fill="none" stroke="var(--color-muted)" strokeWidth={px(1)} strokeDasharray={`${px(2)} ${px(3)}`} />
              </g>
            )}
```

- [ ] **Step 3: Проводка в `SessionScreen`**

Импорты:
```ts
import { useRangesOn } from '../model/useChartSettings'; // рядом с useRsiOn — объединить в один импорт
import { useRangeCandles, type Load4h } from '../model/useRangeCandles';
import { SESSION_SOURCE } from '../model/useLiveFeed';
import { findRanges, toChartRanges, type ChartRange } from '../lib/ranges';
import { fetchCandles } from '../api/hooks';
```
После `const replay = isLive ? liveFeed : replayFeed;`:
```ts
  // Индикатор боковиков: свои 4ч-свечи до «сейчас» терминала (в прокрутке — курсор).
  const [rangesOn, setRangesOn] = useRangesOn();
  const loadRange4h = useCallback<Load4h>(
    (range) =>
      isLive
        ? (source ?? SESSION_SOURCE).candles(240, range, symbol)
        : fetchCandles({ id: session.id, dataSource: session.dataSource }, 240, range, symbol),
    [isLive, source, session.id, session.dataSource, symbol],
  );
  const candles4h = useRangeCandles(rangesOn, loadRange4h, `${session.id}:${symbol}`, replay.ready ? replay.cursor : null);
  const rangeBoxes = useMemo(() => (rangesOn ? findRanges(candles4h) : []), [rangesOn, candles4h]);
```
Ниже (после `screenCandles`):
```ts
  const chartRanges = useMemo<ChartRange[]>(
    () => toChartRanges(rangeBoxes, candles4h, (p) => toScreen(p, scale)),
    [rangeBoxes, candles4h, scale],
  );
```
В `<ReplayChart …>` добавить `ranges={chartRanges}`. В `<ChartSettingsPanel …>` — `rangesOn={rangesOn} onRanges={setRangesOn}`.

- [ ] **Step 4: Проверка**

Run: `cd frontend && npx tsc --noEmit -p . && npx vitest run src/widgets/backtest-session && npx eslint src/widgets/backtest-session`
Expected: без ошибок.

- [ ] **Step 5: Глазами**

Поднять фронт (`start.bat`), открыть сессию истории BTC за июль 2024 (или эфир), включить «Боковики» в шестерёнке: рамка видна на 15м, 1ч, 4ч; на прокрутке новые рамки появляются только на закрытии 4ч-свечи, прошлые не меняются.

**Контрольная точка 1 (B):** ревью задач 1–3 свежим Sonnet-ревьюером — спека ✅/❌ + качество.

---

### Task 4: Схема и расчёт сетки бота (сервер)

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/src/backtest/bot-grid.ts`
- Create: `backend/src/backtest/bot-grid.spec.ts`

**Interfaces:**
- Produces:
  - модель `BacktestBot { id, sessionId, symbol, lower, upper, stopLoss, levels, riskPct, leverage, status, stopReason, startedAt, stoppedAt, createdAt }`; `BacktestEntryOrder.botId String?`; `BacktestCloseOrder.botId String?`, `botBuyPrice Float?`; `BacktestTrade.botId String?`; `BacktestSession.bots BacktestBot[]`
  - `BOT_MIN_LEVELS = 2`, `BOT_MAX_LEVELS = 20`
  - `interface BotGrid { lower: number; upper: number; levels: number; stopLoss: number }`
  - `botStep(g: BotGrid): number`, `botPrices(g: BotGrid): number[]`
  - `botQty(g: BotGrid, balance: number, riskPct: number): number`
  - `levelRiskPct(g: BotGrid, riskPct: number, price: number): number`
  - `splitAtPrice(prices: number[], price: number): { market: number[]; limit: number[] }`
  - `botGridError(g: BotGrid, price: number): BotGridError | null`, `type BotGridError = 'BACKTEST_BOT_RANGE' | 'BACKTEST_BOT_STOP' | 'BACKTEST_BOT_LEVELS' | 'BACKTEST_BOT_PRICE_OUTSIDE'`

- [ ] **Step 1: Схема**

В `schema.prisma`:
```prisma
/// Грид-бот сессии бектеста (спека 2026-10-09-range-indicator-and-grid-bot-design.md):
/// лонг-сетка в диапазоне, который задал человек. Свои ордера — обычные лимиты
/// на вход и закрытия с `botId`; следующий ордер бота сервер ставит в той же
/// транзакции, где исполнился предыдущий.
model BacktestBot {
  id         String          @id @default(uuid())
  sessionId  String
  session    BacktestSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  symbol     String          @default("BTCUSDT")
  lower      Float
  upper      Float
  stopLoss   Float
  levels     Int
  /// Общий риск сетки, % депозита: потеря, если исполнились все покупки и сработал стоп.
  riskPct    Float
  leverage   Float
  status     String          @default("active") // 'active' | 'stopped'
  /// 'user' — «Остановить»; иначе причина закрытия позиции: 'stop' | 'manual' | 'take' | 'finish' | 'limit'.
  stopReason String?
  /// Время сессии — по нему график рисует диапазон бота.
  startedAt  DateTime
  stoppedAt  DateTime?
  createdAt  DateTime        @default(now())

  @@index([sessionId])
  @@map("backtest_bots")
}
```
В `BacktestSession` — строка `bots BacktestBot[]` рядом с `entryOrders`. В `BacktestEntryOrder` — `/// Ордер грид-бота.` `botId String?`. В `BacktestCloseOrder` — `botId String?` и `/// Куда вернуть покупку, когда эта продажа бота исполнится.` `botBuyPrice Float?`. В `BacktestTrade` — `/// Позиция грид-бота.` `botId String?`.

Run: `cd backend && npx prisma generate`
Expected: `Generated Prisma Client`. (Если EPERM — остановить `nest watch`, см. память `prisma_generate_eperm_windows`.) `db push` — в задаче 10, перед живым прогоном.

- [ ] **Step 2: Тест расчёта**

```ts
// backend/src/backtest/bot-grid.spec.ts
import { botGridError, botPrices, botQty, botStep, levelRiskPct, splitAtPrice } from './bot-grid';

const g = { lower: 100, upper: 140, levels: 4, stopLoss: 90 };

describe('bot-grid', () => {
  it('уровни — низ и N−1 над ним с равным шагом; верхняя продажа на верхней границе', () => {
    expect(botStep(g)).toBe(10);
    expect(botPrices(g)).toEqual([100, 110, 120, 130]);
  });

  it('объём одинаковый: потеря при всех покупках и стопе — ровно риск', () => {
    const q = botQty(g, 1500, 2);
    const loss = botPrices(g).reduce((a, p) => a + q * (p - g.stopLoss), 0);
    expect(loss).toBeCloseTo(30, 9);
  });

  it('риск уровня даёт тот же объём, что и общий расчёт', () => {
    const q = botQty(g, 1500, 2);
    for (const p of botPrices(g)) {
      const qty = (1500 * levelRiskPct(g, 2, p)) / 100 / (p - g.stopLoss);
      expect(qty).toBeCloseTo(q, 9);
    }
    const sum = botPrices(g).reduce((a, p) => a + levelRiskPct(g, 2, p), 0);
    expect(sum).toBeCloseTo(2, 9);
  });

  it('уровни на цене и выше — по рынку, ниже — лимитами', () => {
    expect(splitAtPrice([100, 110, 120, 130], 120)).toEqual({ market: [120, 130], limit: [100, 110] });
    expect(splitAtPrice([100, 110, 120, 130], 141)).toEqual({ market: [], limit: [100, 110, 120, 130] });
  });

  it('проверки', () => {
    expect(botGridError(g, 115)).toBeNull();
    expect(botGridError({ ...g, upper: 100 }, 100)).toBe('BACKTEST_BOT_RANGE');
    expect(botGridError({ ...g, stopLoss: 100 }, 115)).toBe('BACKTEST_BOT_STOP');
    expect(botGridError({ ...g, levels: 1 }, 115)).toBe('BACKTEST_BOT_LEVELS');
    expect(botGridError({ ...g, levels: 21 }, 115)).toBe('BACKTEST_BOT_LEVELS');
    expect(botGridError(g, 99)).toBe('BACKTEST_BOT_PRICE_OUTSIDE');
    expect(botGridError(g, 141)).toBe('BACKTEST_BOT_PRICE_OUTSIDE');
  });
});
```

- [ ] **Step 3: Прогнать — падает**

Run: `cd backend && npx jest src/backtest/bot-grid.spec.ts`
Expected: FAIL — `Cannot find module './bot-grid'`.

- [ ] **Step 4: Реализация**

```ts
// backend/src/backtest/bot-grid.ts
/**
 * Расчёт сетки грид-бота — серверная копия
 * `frontend/src/widgets/backtest-session/lib/bot-grid.ts`, те же правила и те
 * же тесты (приём `fills.ts`): панель показывает то, что сервер выставит.
 *
 * Уровни покупок — `низ + j·шаг`, j = 0…N−1, `шаг = (верх − низ) / N`; продажа
 * каждой покупки — на шаг выше, поэтому верхняя стоит на верхней границе.
 * Объём на всех уровнях один: если исполнились все покупки и сработал стоп,
 * потеря — ровно риск.
 */
export const BOT_MIN_LEVELS = 2;
export const BOT_MAX_LEVELS = 20;

export interface BotGrid {
  lower: number;
  upper: number;
  levels: number;
  stopLoss: number;
}

export type BotGridError = 'BACKTEST_BOT_RANGE' | 'BACKTEST_BOT_STOP' | 'BACKTEST_BOT_LEVELS' | 'BACKTEST_BOT_PRICE_OUTSIDE';

export const botStep = (g: BotGrid) => (g.upper - g.lower) / g.levels;

export const botPrices = (g: BotGrid) => Array.from({ length: g.levels }, (_, j) => g.lower + j * botStep(g));

/** Σ(уровень − стоп): во сколько раз потеря на стопе больше объёма уровня. */
const spread = (g: BotGrid) => botPrices(g).reduce((a, p) => a + (p - g.stopLoss), 0);

export const botQty = (g: BotGrid, balance: number, riskPct: number) => (balance * riskPct) / 100 / spread(g);

/**
 * Риск уровня: лимит на вход сервер исполняет объёмом `депозит · риск / (цена − стоп)`,
 * и с этой долей общего риска выходит тот же объём, что у всех уровней.
 */
export const levelRiskPct = (g: BotGrid, riskPct: number, price: number) => (riskPct * (price - g.stopLoss)) / spread(g);

/**
 * Уровни на цене и выше покупаются при запуске по рынку — как у сеточного бота
 * Bybit в режиме «лонг»: лимит на покупку выше цены биржа исполнила бы сразу, а
 * прокрутка бектеста — на касании снизу, покупкой на росте.
 */
export function splitAtPrice(prices: number[], price: number): { market: number[]; limit: number[] } {
  return { market: prices.filter((p) => p >= price), limit: prices.filter((p) => p < price) };
}

export function botGridError(g: BotGrid, price: number): BotGridError | null {
  if (!(g.lower > 0) || !(g.upper > g.lower)) return 'BACKTEST_BOT_RANGE';
  if (!(g.stopLoss > 0) || g.stopLoss >= g.lower) return 'BACKTEST_BOT_STOP';
  if (!Number.isInteger(g.levels) || g.levels < BOT_MIN_LEVELS || g.levels > BOT_MAX_LEVELS) return 'BACKTEST_BOT_LEVELS';
  if (price < g.lower || price > g.upper) return 'BACKTEST_BOT_PRICE_OUTSIDE';
  return null;
}
```

- [ ] **Step 5: Прогнать — проходит**

Run: `cd backend && npx jest src/backtest/bot-grid.spec.ts`
Expected: PASS (5 тестов).

---

### Task 5: Вход внутри транзакции — подготовка сервиса (поведение не меняется)

**Files:**
- Modify: `backend/src/backtest/backtest.service.ts` (`openChecked`, `takeEntryOrder`, `addChecked`, `addInTx`)
- Modify: `backend/src/backtest/backtest.service.spec.ts` (заглушка `backtestEntryOrder.findFirst`, `backtestBot`)

**Interfaces:**
- Produces:
  - `protected takeEntryOrder(tx, sessionId, entryOrderId, requireOrder): Promise<BacktestEntryOrder | null>` — снятая строка (null — снимать было нечего)
  - `protected openInTx(tx, sessionId, symbol, input: OpenTradeInput & { botId?: string }): Promise<{ trade: TradeWithRelations; filledQty: number }>`
  - `protected addCore(tx, trade, input): Promise<{ trade: TradeWithRelations; filledQty: number }>`; `addInTx` остаётся обёрткой `{ trade: tradeView(...) }`

- [ ] **Step 1: Заглушки в тесте**

В `makeService()` у `backtestEntryOrder` добавить `findFirst: jest.fn().mockResolvedValue(null),`; добавить блок
```ts
    backtestBot: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(({ data }) => ({ id: 'b1', status: 'active', ...data })),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
```
и у `backtestTradeExit` — ничего (уже есть `findMany`).

- [ ] **Step 2: Прогнать весь файл до правок**

Run: `cd backend && npx jest src/backtest/backtest.service.spec.ts`
Expected: PASS — точка отсчёта.

- [ ] **Step 3: Правка**

`takeEntryOrder`:
```ts
  protected async takeEntryOrder(
    tx: Prisma.TransactionClient,
    sessionId: string,
    entryOrderId: string | undefined,
    requireOrder: boolean,
  ) {
    if (!entryOrderId) return null;
    // Строка читается до снятия: ордер бота несёт `botId`, и продажа после
    // покупки ставится по нему (`openChecked`). Замок сессии уже взят — между
    // чтением и снятием строку никто не тронет.
    const order = await tx.backtestEntryOrder.findFirst({ where: { id: entryOrderId, sessionId } });
    const { count } = await tx.backtestEntryOrder.deleteMany({ where: { id: entryOrderId, sessionId } });
    if (requireOrder && count === 0) throw new EntryOrderGone();
    return count > 0 ? order : null;
  }
```
`addInTx` → переименовать тело в `addCore`, которое возвращает `{ trade: updated!, filledQty: addQty }`, и оставить
```ts
  protected async addInTx(tx: Prisma.TransactionClient, trade: TradeForAdd, input: EntryInput) {
    const { trade: updated } = await this.addCore(tx, trade, input);
    return { trade: tradeView(updated) };
  }
```
`openInTx` — тело транзакции `openChecked` после `takeEntryOrder`:
```ts
  /**
   * Вход под уже взятым замком сессии: долив открытой позиции той же монеты и
   * стороны или новая позиция. Общий у человека, движка эфира и запуска бота.
   */
  protected async openInTx(
    tx: Prisma.TransactionClient,
    sessionId: string,
    symbol: string,
    input: OpenTradeInput & { botId?: string },
  ): Promise<{ trade: TradeWithRelations; filledQty: number }> {
    const open = await tx.backtestTrade.findFirst({ where: { sessionId, symbol, exitTime: null, direction: input.direction } });
    if (open) return this.addCore(tx, open, input);
    const balance = await this.balanceForEntry(tx, sessionId);
    const { riskUsdt, qty } = positionSize(balance, input.riskPct, input.entryPrice, input.stopLoss);
    const margin = (qty * input.entryPrice) / input.leverage;
    if (margin > balance) {
      throw new BadRequestException({ message: 'Маржа больше депозита', code: 'BACKTEST_MARGIN_EXCEEDS_BALANCE' });
    }
    const trade = await tx.backtestTrade.create({
      data: {
        sessionId,
        symbol,
        direction: input.direction,
        entryTime: input.entryTime,
        entryPrice: input.entryPrice,
        stopLoss: input.stopLoss,
        takeProfit: input.takeProfit ?? null,
        riskPct: input.riskPct,
        riskUsdt,
        qty,
        leverage: input.leverage,
        botId: input.botId ?? null,
        entries: { create: { qty, price: input.entryPrice, time: input.entryTime } },
      },
      include: TRADE_INCLUDE,
    });
    return { trade, filledQty: qty };
  }
```
и транзакция `openChecked`:
```ts
    return this.prisma.$transaction(async (tx) => {
      const bumped = await this.bumpCursor(tx, sessionId, input.entryTime);
      if (bumped === 0) throw sessionFinished();
      const order = await this.takeEntryOrder(tx, sessionId, input.entryOrderId, requireOrder);
      const { trade } = await this.openInTx(tx, sessionId, symbol, { ...input, botId: order?.botId ?? undefined });
      return { trade: tradeView(trade) };
    });
```
`addChecked` — `await this.takeEntryOrder(...)` без изменений по смыслу (результат пока не нужен).

Тип: `TradeWithRelations` уже объявлен в файле; если не экспортирован наружу — использовать внутри.

- [ ] **Step 4: Прогнать**

Run: `cd backend && npx jest src/backtest`
Expected: PASS — поведение то же. Тест, сверяющий `backtestTrade.create` через `toHaveBeenCalledWith(expect.objectContaining(...))`, не ломается от `botId: null`; если какой-то сверяет `data` целиком через `toEqual` — дописать в ожидание `botId: null`.

---

### Task 6: Запуск и остановка бота

**Files:**
- Modify: `backend/src/backtest/backtest.service.ts` (`startBot`, `stopBot`, `getSession`)
- Modify: `backend/src/backtest/dto/backtest.dto.ts` (`StartBotDto`)
- Modify: `backend/src/backtest/backtest.controller.ts`
- Modify: `backend/src/backtest/backtest.service.spec.ts`

**Interfaces:**
- Consumes: `bot-grid.ts` (задача 4), `openInTx` (задача 5).
- Produces:
  - `POST /api/backtest/sessions/:id/bots` → `{ bot }`; `POST /api/backtest/bots/:id/stop` → `{ bot }`
  - `startBot(userId, sessionId, input: StartBotInput)`, `StartBotInput = { symbol?: string; lower: number; upper: number; stopLoss: number; levels: number; riskPct: number; leverage: number; entryTime: Date; entryPrice: number }`
  - `stopBot(userId, botId)`
  - `protected haltBot(tx, botId, reason: string, time: Date)` — статус, причина, снятие покупок бота
  - `getSession(...).bots: (BacktestBot & { closedPnl: number })[]`

- [ ] **Step 1: Тесты запуска**

В `backtest.service.spec.ts` (вспомогательные `makeService`, `T0`, сессия-заглушка — как в соседних `describe`; активная сессия истории: `{ id: 's1', userId: 'u1', status: 'active', dataSource: 'real', startTime: new Date(T0), cursorTime: new Date(T0 + DAY), balance: 1500, tournamentId: null, tournament: null, endTime: null }`):
```ts
describe('startBot', () => {
  const input = { lower: 100, upper: 140, stopLoss: 90, levels: 4, riskPct: 2, leverage: 1, entryTime: new Date(T0 + DAY), entryPrice: 120 };

  function setup() {
    const { service, prisma } = makeService();
    prisma.backtestSession.findUnique.mockResolvedValue({ ...SESSION });
    return { service, prisma };
  }

  it('уровни на цене и выше — покупка по рынку и продажи, ниже — лимиты бота', async () => {
    const { service, prisma } = setup();
    await service.startBot('u1', 's1', input);
    // Рынок: 120 и 130 — одна позиция объёмом двух уровней, с ботом и стопом бота.
    const created = prisma.backtestTrade.create.mock.calls[0][0].data;
    expect(created).toMatchObject({ direction: 'long', stopLoss: 90, botId: 'b1', entryPrice: 120 });
    const q = (1500 * 0.02) / (10 + 20 + 30 + 40);
    expect(created.qty).toBeCloseTo(2 * q, 9);
    // Продажи на шаг выше уровней рынка: 130 и 140, вернуть покупки на 120 и 130.
    const sells = prisma.backtestCloseOrder.create.mock.calls.map((c: any[]) => c[0].data);
    expect(sells.map((s: any) => [s.price, s.botBuyPrice, s.botId])).toEqual([[130, 120, 'b1'], [140, 130, 'b1']]);
    sells.forEach((s: any) => expect(s.qty).toBeCloseTo(q, 9));
    // Лимиты: 100 и 110, риск уровня — доля общего риска.
    const buys = prisma.backtestEntryOrder.create.mock.calls.map((c: any[]) => c[0].data);
    expect(buys.map((b: any) => [b.price, b.botId, b.stopLoss, b.direction])).toEqual([[100, 'b1', 90, 'long'], [110, 'b1', 90, 'long']]);
    expect(buys[0].riskPct).toBeCloseTo((2 * 10) / 100, 9);
  });

  it('отказы: сетка, турнир, занятый лонг, второй бот', async () => {
    let { service, prisma } = setup();
    await expect(service.startBot('u1', 's1', { ...input, stopLoss: 100 })).rejects.toMatchObject({ response: { code: 'BACKTEST_BOT_STOP' } });

    ({ service, prisma } = setup());
    prisma.backtestSession.findUnique.mockResolvedValue({ ...SESSION, tournamentId: 't1', tournament: { id: 't1' } });
    await expect(service.startBot('u1', 's1', input)).rejects.toMatchObject({ response: { code: 'BACKTEST_BOT_TOURNAMENT' } });

    ({ service, prisma } = setup());
    prisma.backtestTrade.findFirst.mockResolvedValue({ id: 't9', direction: 'long' });
    await expect(service.startBot('u1', 's1', input)).rejects.toMatchObject({ response: { code: 'BACKTEST_BOT_SIDE_BUSY' } });

    ({ service, prisma } = setup());
    prisma.backtestEntryOrder.count.mockResolvedValue(1);
    await expect(service.startBot('u1', 's1', input)).rejects.toMatchObject({ response: { code: 'BACKTEST_BOT_SIDE_BUSY' } });

    ({ service, prisma } = setup());
    prisma.backtestBot.findFirst.mockResolvedValue({ id: 'b0', status: 'active' });
    await expect(service.startBot('u1', 's1', input)).rejects.toMatchObject({ response: { code: 'BACKTEST_BOT_EXISTS' } });
  });

  it('цена выше верха — только лимиты, без входа по рынку', async () => {
    const { service, prisma } = setup();
    await expect(service.startBot('u1', 's1', { ...input, entryPrice: 141 })).rejects.toMatchObject({
      response: { code: 'BACKTEST_BOT_PRICE_OUTSIDE' },
    });
    expect(prisma.backtestTrade.create).not.toHaveBeenCalled();
  });
});

describe('stopBot', () => {
  it('снимает покупки бота и помечает его остановленным человеком', async () => {
    const { service, prisma } = makeService();
    prisma.backtestBot.findUnique.mockResolvedValue({ id: 'b1', sessionId: 's1', status: 'active', session: { ...SESSION } });
    await service.stopBot('u1', 'b1');
    expect(prisma.backtestBot.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'b1', status: 'active' }, data: expect.objectContaining({ status: 'stopped', stopReason: 'user' }) }),
    );
    expect(prisma.backtestEntryOrder.deleteMany).toHaveBeenCalledWith({ where: { botId: 'b1' } });
  });
});
```
`SESSION` — константа в начале `describe`-блоков (вынести наверх файла, если её там нет).

- [ ] **Step 2: Прогнать — падают**

Run: `cd backend && npx jest src/backtest/backtest.service.spec.ts -t "startBot|stopBot"`
Expected: FAIL — `service.startBot is not a function`.

- [ ] **Step 3: DTO**

В `dto/backtest.dto.ts`:
```ts
export class StartBotDto {
  /** Монета; не задана — BTC. */
  @IsOptional()
  @IsIn(LIVE_SYMBOL_IDS)
  symbol?: string;

  @IsPositive()
  lower: number;

  @IsPositive()
  upper: number;

  @IsPositive()
  stopLoss: number;

  @IsInt()
  @Min(2)
  @Max(20)
  levels: number;

  /** Общий риск сетки: потеря, если исполнились все покупки и сработал стоп. */
  @IsNumber()
  @Min(0.01)
  @Max(100)
  riskPct: number;

  @IsNumber()
  @Min(1)
  @Max(100)
  leverage: number;

  /** Момент и цена запуска — как у входа по рынку; в эфире их ставит сервер. */
  @IsISO8601()
  entryTime: string;

  @IsPositive()
  entryPrice: number;
}
```
(`IsInt` добавить в импорт `class-validator`.)

- [ ] **Step 4: Контроллер**

```ts
  @Post('sessions/:id/bots')
  startBot(@CurrentUser('userId') userId: string, @Param('id') id: string, @Body() dto: StartBotDto) {
    return this.backtest.startBot(userId, id, { ...dto, entryTime: new Date(dto.entryTime) });
  }

  @Post('bots/:id/stop')
  stopBot(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.backtest.stopBot(userId, id);
  }
```
(`StartBotDto` — в импорт из `./dto/backtest.dto`.)

- [ ] **Step 5: Сервис**

Импорт: `import { botGridError, botPrices, botQty, botStep, levelRiskPct, splitAtPrice } from './bot-grid';`.
```ts
  /**
   * Запуск грид-бота: строка бота, вход по рынку на уровни на цене и выше (с
   * продажами на шаг выше), лимиты на остальные — одной транзакцией под замком
   * сессии. Лонг монеты обязан быть свободен: позиция бота одна, и ручная
   * покупка, доливая её, развела бы продажи бота с позицией.
   */
  async startBot(userId: string, sessionId: string, raw: StartBotInput) {
    const s = await this.ownedSession(userId, sessionId);
    if (s.status !== 'active') throw sessionFinished();
    if (s.tournamentId) {
      throw new ConflictException({ message: 'В турнире бота нет', code: 'BACKTEST_BOT_TOURNAMENT' });
    }
    const symbol = symbolFor(s, raw.symbol);
    const input = await this.withServerEntry(s, raw, symbol);
    const grid = { lower: input.lower, upper: input.upper, levels: input.levels, stopLoss: input.stopLoss };
    const err = botGridError(grid, input.entryPrice);
    if (err) throw new BadRequestException({ message: 'Сетка бота задана неверно', code: err });

    return this.prisma.$transaction(async (tx) => {
      const bumped = await this.bumpCursor(tx, sessionId, input.entryTime);
      if (bumped === 0) throw sessionFinished();
      if (await tx.backtestBot.findFirst({ where: { sessionId, symbol, status: 'active' } })) {
        throw new ConflictException({ message: 'На этой монете бот уже работает', code: 'BACKTEST_BOT_EXISTS' });
      }
      const busy =
        (await tx.backtestTrade.findFirst({ where: { sessionId, symbol, direction: 'long', exitTime: null } })) != null ||
        (await tx.backtestEntryOrder.count({ where: { sessionId, symbol, direction: 'long' } })) > 0;
      if (busy) {
        throw new ConflictException({ message: 'Лонг этой монеты занят', code: 'BACKTEST_BOT_SIDE_BUSY' });
      }
      const bot = await tx.backtestBot.create({
        data: {
          sessionId,
          symbol,
          lower: grid.lower,
          upper: grid.upper,
          stopLoss: grid.stopLoss,
          levels: grid.levels,
          riskPct: input.riskPct,
          leverage: input.leverage,
          startedAt: input.entryTime,
        },
      });
      const step = botStep(grid);
      const { market, limit } = splitAtPrice(botPrices(grid), input.entryPrice);
      if (market.length > 0) {
        const balance = await this.balanceForEntry(tx, sessionId);
        const q = botQty(grid, balance, input.riskPct);
        // Один вход объёмом всех верхних уровней: риск входа — тот, что даёт этот объём от его цены.
        const riskPct = (q * market.length * (input.entryPrice - grid.stopLoss) * 100) / balance;
        const { trade } = await this.openInTx(tx, sessionId, symbol, {
          symbol,
          direction: 'long',
          entryTime: input.entryTime,
          entryPrice: input.entryPrice,
          stopLoss: grid.stopLoss,
          riskPct,
          leverage: input.leverage,
          botId: bot.id,
        });
        for (const price of market) {
          await tx.backtestCloseOrder.create({
            data: { tradeId: trade.id, price: price + step, qty: q, botId: bot.id, botBuyPrice: price },
          });
        }
      }
      for (const price of limit) {
        await tx.backtestEntryOrder.create({
          data: {
            sessionId,
            symbol,
            direction: 'long',
            price,
            riskPct: levelRiskPct(grid, input.riskPct, price),
            stopLoss: grid.stopLoss,
            takeProfit: null,
            leverage: input.leverage,
            botId: bot.id,
          },
        });
      }
      return { bot };
    });
  }

  /** «Остановить»: снимаются покупки бота; позиция и её продажи остаются человеку. */
  async stopBot(userId: string, botId: string) {
    const bot = await this.prisma.backtestBot.findUnique({ where: { id: botId }, include: { session: true } });
    if (!bot || bot.session.userId !== userId) {
      throw new NotFoundException({ message: 'Бот не найден', code: 'BACKTEST_BOT_NOT_FOUND' });
    }
    const s = bot.session;
    return this.prisma.$transaction(async (tx) => {
      const bumped = await this.bumpCursor(tx, s.id, s.cursorTime);
      if (bumped === 0) throw sessionFinished();
      await this.haltBot(tx, botId, 'user', isLive(s) ? new Date() : s.cursorTime);
      return { bot: await tx.backtestBot.findUnique({ where: { id: botId } }) };
    });
  }

  /** Бот перестаёт работать: статус, причина и его покупки, которые больше никто не поведёт. */
  protected async haltBot(tx: Prisma.TransactionClient, botId: string, reason: string, time: Date) {
    const { count } = await tx.backtestBot.updateMany({
      where: { id: botId, status: 'active' },
      data: { status: 'stopped', stopReason: reason, stoppedAt: time },
    });
    if (count > 0) await tx.backtestEntryOrder.deleteMany({ where: { botId } });
  }
```
Тип `StartBotInput` — рядом с остальными `*Input` в начале файла:
```ts
export interface StartBotInput {
  symbol?: string;
  lower: number;
  upper: number;
  stopLoss: number;
  levels: number;
  riskPct: number;
  leverage: number;
  entryTime: Date;
  entryPrice: number;
}
```
В тесте `stopBot` проверка `deleteMany({ where: { botId: 'b1' } })` совпадает с `haltBot`.

`getSession`: после `entryOrders`
```ts
    const botRows = await this.prisma.backtestBot.findMany({ where: { sessionId: id }, orderBy: { createdAt: 'asc' } });
    // Результат бота — по выходам его позиций, частичные тоже: тейки бота закрывают позицию частями.
    const botExits = botRows.length
      ? await this.prisma.backtestTradeExit.findMany({
          where: { trade: { sessionId: id, botId: { not: null } } },
          select: { pnl: true, trade: { select: { botId: true } } },
        })
      : [];
    const bots = botRows.map((b) => ({
      ...b,
      closedPnl: botExits.filter((e) => e.trade.botId === b.id).reduce((a, e) => a + e.pnl, 0),
    }));
```
и `bots,` в возвращаемый объект.

- [ ] **Step 6: Прогнать**

Run: `cd backend && npx jest src/backtest`
Expected: PASS.

---

### Task 7: Реакции бота на исполнения, замок лонга, завершение и перенос

**Files:**
- Modify: `backend/src/backtest/backtest.service.ts` (`openChecked`, `applyClose`, `openTrade`, `addToTrade`, `createEntryOrders`, `finish`, `moveEntryOrder`)
- Modify: `backend/src/backtest/backtest.service.spec.ts`

**Interfaces:**
- Consumes: `haltBot`, `openInTx`, `levelRiskPct`, `botStep` (задачи 4–6).
- Produces: `protected ensureLongFree(sessionId: string, symbol: string, direction: string): Promise<void>` — 409 `BACKTEST_BOT_SIDE`.

- [ ] **Step 1: Тесты**

```ts
describe('реакции бота', () => {
  const BOT = { id: 'b1', sessionId: 's1', symbol: 'BTCUSDT', lower: 100, upper: 140, stopLoss: 90, levels: 4, riskPct: 2, leverage: 1, status: 'active' };

  it('исполнилась покупка бота — встаёт продажа на шаг выше на исполненный объём', async () => {
    const { service, prisma } = makeService();
    prisma.backtestSession.findUnique.mockResolvedValue({ ...SESSION });
    prisma.backtestEntryOrder.findFirst.mockResolvedValue({ id: 'eo1', price: 110, botId: 'b1', sessionId: 's1' });
    prisma.backtestEntryOrder.deleteMany.mockResolvedValue({ count: 1 });
    prisma.backtestBot.findUnique.mockResolvedValue(BOT);
    await service.openTrade('u1', 's1', {
      direction: 'long', entryTime: new Date(T0 + DAY), entryPrice: 110, stopLoss: 90, riskPct: 0.2, leverage: 1, entryOrderId: 'eo1',
    });
    const sell = prisma.backtestCloseOrder.create.mock.calls[0][0].data;
    expect(sell).toMatchObject({ price: 120, botBuyPrice: 110, botId: 'b1', tradeId: 't1' });
    expect(sell.qty).toBeCloseTo(prisma.backtestTrade.create.mock.calls[0][0].data.qty, 9);
    expect(prisma.backtestTrade.create.mock.calls[0][0].data.botId).toBe('b1');
  });

  it('исполнилась продажа бота — снова покупка по botBuyPrice с риском уровня', async () => {
    const { service, prisma } = makeService();
    const trade = { id: 't1', sessionId: 's1', symbol: 'BTCUSDT', direction: 'long', entryPrice: 110, riskUsdt: 4, qty: 0.2, closedQty: 0, botId: 'b1', exitTime: null, entryTime: new Date(T0), session: { ...SESSION } };
    prisma.backtestTrade.findUnique.mockResolvedValue(trade);
    prisma.backtestCloseOrder.findUnique.mockResolvedValue({ stopAfter: null, botId: 'b1', botBuyPrice: 110 });
    prisma.backtestBot.findUnique.mockResolvedValue(BOT);
    await service.closeTrade('u1', 't1', { exitTime: new Date(T0 + DAY), exitPrice: 120, reason: 'limit', qty: 0.1, closeOrderId: 'o1' });
    const buy = prisma.backtestEntryOrder.create.mock.calls[0][0].data;
    expect(buy).toMatchObject({ price: 110, botId: 'b1', stopLoss: 90, direction: 'long', symbol: 'BTCUSDT' });
    expect(buy.riskPct).toBeCloseTo((2 * 20) / 100, 9);
  });

  it('позиция бота закрылась стопом — бот остановлен, его покупки сняты', async () => {
    const { service, prisma } = makeService();
    const trade = { id: 't1', sessionId: 's1', symbol: 'BTCUSDT', direction: 'long', entryPrice: 110, riskUsdt: 4, qty: 0.2, closedQty: 0, botId: 'b1', exitTime: null, entryTime: new Date(T0), session: { ...SESSION } };
    prisma.backtestTrade.findUnique.mockResolvedValue(trade);
    await service.closeTrade('u1', 't1', { exitTime: new Date(T0 + DAY), exitPrice: 90, reason: 'stop' });
    expect(prisma.backtestBot.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'b1', status: 'active' }, data: expect.objectContaining({ stopReason: 'stop' }) }),
    );
    expect(prisma.backtestEntryOrder.deleteMany).toHaveBeenCalledWith({ where: { botId: 'b1' } });
  });

  it('частичное ручное закрытие позиции бота — бот остановлен и его продажи сняты', async () => {
    const { service, prisma } = makeService();
    const trade = { id: 't1', sessionId: 's1', symbol: 'BTCUSDT', direction: 'long', entryPrice: 110, riskUsdt: 4, qty: 0.2, closedQty: 0, botId: 'b1', exitTime: null, entryTime: new Date(T0), session: { ...SESSION } };
    prisma.backtestTrade.findUnique.mockResolvedValue(trade);
    await service.closeTrade('u1', 't1', { exitTime: new Date(T0 + DAY), exitPrice: 115, reason: 'manual', qty: 0.05 });
    expect(prisma.backtestBot.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ stopReason: 'manual' }) }),
    );
    expect(prisma.backtestCloseOrder.deleteMany).toHaveBeenCalledWith({ where: { tradeId: 't1', botId: 'b1' } });
  });

  it('пока бот работает, ручной лонг монеты — 409; шорт свободен', async () => {
    const { service, prisma } = makeService();
    prisma.backtestSession.findUnique.mockResolvedValue({ ...SESSION });
    prisma.backtestBot.findFirst.mockResolvedValue(BOT);
    const open = { entryTime: new Date(T0 + DAY), entryPrice: 120, riskPct: 1, leverage: 1 };
    await expect(service.openTrade('u1', 's1', { ...open, direction: 'long', stopLoss: 100 })).rejects.toMatchObject({
      response: { code: 'BACKTEST_BOT_SIDE' },
    });
    await expect(
      service.createEntryOrders('u1', 's1', { direction: 'long', stopLoss: 90, riskPct: 1, leverage: 1, prices: [100] }),
    ).rejects.toMatchObject({ response: { code: 'BACKTEST_BOT_SIDE' } });
    prisma.backtestBot.findFirst.mockResolvedValue(null);
    await expect(service.openTrade('u1', 's1', { ...open, direction: 'short', stopLoss: 130 })).resolves.toBeDefined();
  });

  it('перенос покупки бота сохраняет botId', async () => {
    const { service, prisma } = makeService();
    prisma.backtestEntryOrder.findUnique = jest.fn().mockResolvedValue({
      id: 'eo1', sessionId: 's1', symbol: 'BTCUSDT', direction: 'long', price: 110, riskPct: 0.4, stopLoss: 90, takeProfit: null, leverage: 1, botId: 'b1', session: { ...SESSION },
    });
    prisma.backtestEntryOrder.deleteMany.mockResolvedValue({ count: 1 });
    await service.moveEntryOrder('u1', 'eo1', 105);
    expect(prisma.backtestEntryOrder.create.mock.calls[0][0].data).toMatchObject({ price: 105, botId: 'b1' });
  });
});
```
Если в последнем шорт-входе заглушки не хватает (`balanceForEntry` читает `backtestSession.findUnique`) — `SESSION` уже с `balance: 1500`.

- [ ] **Step 2: Прогнать — падают**

Run: `cd backend && npx jest src/backtest/backtest.service.spec.ts -t "реакции бота"`
Expected: FAIL.

- [ ] **Step 3: Покупка бота → продажа (`openChecked`)**

В транзакции `openChecked` после `openInTx`:
```ts
      const { trade, filledQty } = await this.openInTx(tx, sessionId, symbol, { ...input, botId: order?.botId ?? undefined });
      if (order?.botId) await this.sellAfterBotBuy(tx, order.botId, trade.id, order.price, filledQty);
      return { trade: tradeView(trade) };
```
и в `addChecked` — тем же приёмом (`const order = await this.takeEntryOrder(...)`; `const { trade: updated, filledQty } = await this.addCore(tx, trade, input)`; при `order?.botId` — `sellAfterBotBuy(tx, order.botId, trade.id, order.price, filledQty)`; вернуть `{ trade: tradeView(updated) }`).
```ts
  /** Покупка бота исполнилась — продажа на шаг выше на исполненный объём, если бот ещё работает. */
  protected async sellAfterBotBuy(tx: Prisma.TransactionClient, botId: string, tradeId: string, buyPrice: number, qty: number) {
    const bot = await tx.backtestBot.findUnique({ where: { id: botId } });
    if (!bot || bot.status !== 'active') return;
    await tx.backtestCloseOrder.create({
      data: { tradeId, price: buyPrice + botStep(bot), qty, botId, botBuyPrice: buyPrice },
    });
  }
```

- [ ] **Step 4: Продажа бота → покупка; иное закрытие → остановка (`applyClose`)**

Тип параметра `trade` у `applyClose` — дописать `botId?: string | null;`. Чтение сработавшего лимита:
```ts
    let stopAfter: number | null = null;
    let botSell: { botId: string; botBuyPrice: number } | null = null;
    if (input.closeOrderId) {
      const order = await tx.backtestCloseOrder.findUnique({
        where: { id: input.closeOrderId },
        select: { stopAfter: true, botId: true, botBuyPrice: true },
      });
      stopAfter = order?.stopAfter ?? null;
      if (order?.botId && order.botBuyPrice != null) botSell = { botId: order.botId, botBuyPrice: order.botBuyPrice };
      await tx.backtestCloseOrder.deleteMany({ where: { id: input.closeOrderId, tradeId: trade.id } });
    }
```
Перед `return { balance: session.balance };`:
```ts
    if (botSell) {
      await this.buyAfterBotSell(tx, botSell.botId, trade.symbol, botSell.botBuyPrice);
    } else if (trade.botId) {
      // Позицию бота закрыло не его продажа: стоп, тейк, рука, финал. Целиком —
      // бот кончился; частью — тоже, и его продажи снимаются: их сумма больше не
      // сходится с остатком, дальше позицию ведёт человек.
      await this.haltBot(tx, trade.botId, input.reason, input.exitTime);
      if (newClosedQty < trade.qty - QTY_EPS) {
        await tx.backtestCloseOrder.deleteMany({ where: { tradeId: trade.id, botId: trade.botId } });
      }
    }
```
```ts
  /** Продажа бота исполнилась — покупка снова встаёт там, откуда был куплен этот объём. */
  protected async buyAfterBotSell(tx: Prisma.TransactionClient, botId: string, symbol: string, price: number) {
    const bot = await tx.backtestBot.findUnique({ where: { id: botId } });
    if (!bot || bot.status !== 'active') return;
    await tx.backtestEntryOrder.create({
      data: {
        sessionId: bot.sessionId,
        symbol,
        direction: 'long',
        price,
        riskPct: levelRiskPct(bot, bot.riskPct, price),
        stopLoss: bot.stopLoss,
        takeProfit: null,
        leverage: bot.leverage,
        botId,
      },
    });
  }
```
`levelRiskPct(bot, …)` принимает строку бота — поля `lower`, `upper`, `levels`, `stopLoss` у неё те же, что у `BotGrid`.

- [ ] **Step 5: Замок лонга**

```ts
  /** Пока бот работает, лонг его монеты — его: ручная покупка долила бы позицию бота. */
  protected async ensureLongFree(sessionId: string, symbol: string, direction: string) {
    if (direction !== 'long') return;
    const bot = await this.prisma.backtestBot.findFirst({ where: { sessionId, symbol, status: 'active' } });
    if (bot) throw new ConflictException({ message: 'Лонг этой монеты ведёт бот', code: 'BACKTEST_BOT_SIDE' });
  }
```
Вызовы:
- `openTrade`, после `const symbol = …`: `if (!rawInput.entryOrderId) await this.ensureLongFree(sessionId, symbol, rawInput.direction);` (ордер бота исполняется с `entryOrderId`; ручных лимитов в лонг при работающем боте нет — их не даёт поставить `createEntryOrders`).
- `addToTrade`, после проверок статуса: `await this.ensureLongFree(trade.sessionId, trade.symbol, trade.direction);`
- `createEntryOrders`, после `const symbol = …`: `await this.ensureLongFree(sessionId, symbol, input.direction);`

- [ ] **Step 6: Завершение сессии и перенос ордера**

`finish`, в транзакции перед `backtestSession.update`:
```ts
      await tx.backtestBot.updateMany({
        where: { sessionId: id, status: 'active' },
        data: { status: 'stopped', stopReason: 'finish', stoppedAt: s.cursorTime },
      });
```
`moveEntryOrder`, в `create` новой строки — `botId: order.botId,`.

- [ ] **Step 7: Прогнать**

Run: `cd backend && npx jest src/backtest && npx tsc --noEmit -p tsconfig.json`
Expected: PASS, без ошибок типов.

Движок эфира (`live-engine.service.ts`) правок не требует: покупку он исполняет через `systemEnter` → `openChecked`, продажу и стоп — через `systemClose` → `applyClose`, и реакции бота срабатывают там же. Прогнать `npx jest src/backtest/live-engine.service.spec.ts` — должен пройти без изменений.

**Контрольная точка 2 (A):** ревью задач 4–7 свежим Sonnet-ревьюером — спека ✅/❌ + качество; отдельный вопрос ревьюеру — гонки: два исполнения подряд, продажа бота, закрывшая позицию целиком, и покупка, исполнившаяся в той же минутке.

---

### Task 8: Фронт — типы, расчёт сетки, мутации и ожидание перечитки

**Files:**
- Create: `frontend/src/widgets/backtest-session/lib/bot-grid.ts`, `lib/bot-grid.test.ts`
- Modify: `frontend/src/widgets/backtest-session/api/types.ts`, `api/hooks.ts`, `model/actions.ts`

**Interfaces:**
- Produces:
  - `lib/bot-grid.ts` — те же экспорты, что у серверного (задача 4)
  - `BacktestBot` (`id, sessionId, symbol, lower, upper, stopLoss, levels, riskPct, leverage, status: 'active' | 'stopped', stopReason: string | null, startedAt, stoppedAt: string | null, createdAt, closedPnl: number`)
  - `SessionDetail.bots?: BacktestBot[]`; `botId?: string | null` у `BacktestTrade`, `BacktestEntryOrder`, `BacktestCloseOrder`
  - `StartBotVars = { symbol?: string; lower: number; upper: number; stopLoss: number; levels: number; riskPct: number; leverage: number; entryTime: string; entryPrice: number }`
  - `useStartBot(id)`, `useStopBot(id)`; `TerminalActions.bot?: { start: TerminalAction<StartBotVars>; stop: TerminalAction<string> }`

- [ ] **Step 1: Копия расчёта и её тест**

`lib/bot-grid.ts` — содержимое `backend/src/backtest/bot-grid.ts` дословно, с заголовком «копия `backend/src/backtest/bot-grid.ts`, те же правила и тесты». `lib/bot-grid.test.ts` — содержимое `bot-grid.spec.ts` с первой строкой `import { describe, expect, it } from 'vitest';`.

Run: `cd frontend && npx vitest run src/widgets/backtest-session/lib/bot-grid.test.ts`
Expected: PASS (5 тестов).

- [ ] **Step 2: Типы**

В `api/types.ts`:
```ts
/** Грид-бот сессии (спека 2026-10-09-range-indicator-and-grid-bot-design.md). */
export interface BacktestBot {
  id: string;
  sessionId: string;
  symbol: string;
  lower: number;
  upper: number;
  stopLoss: number;
  levels: number;
  riskPct: number;
  leverage: number;
  status: 'active' | 'stopped';
  /** 'user' — «Остановить»; иначе причина закрытия его позиции. */
  stopReason: string | null;
  /** Время сессии. */
  startedAt: string;
  stoppedAt: string | null;
  createdAt: string;
  /** Результат его закрытых тейков и выходов. */
  closedPnl: number;
}
```
`SessionDetail`: `/** Боты сессии; у счёта биржи их нет. */ bots?: BacktestBot[];`. В `BacktestTrade`, `BacktestEntryOrder`, `BacktestCloseOrder` — `/** Ордер (позиция) грид-бота. */ botId?: string | null;`.

- [ ] **Step 3: Мутации**

В `api/hooks.ts`:
```ts
export const useStartBot = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: StartBotVars) => apiJson<{ bot: BacktestBot }>(`/api/backtest/sessions/${id}/bots`, json('POST', body)),
    // Дожидаемся перечитки: прокрутка стоит, пока запуск в полёте, и следующий
    // её шаг обязан видеть ордера бота.
    onSettled: async () => {
      refresh(qc);
      await qc.invalidateQueries({ queryKey: sessionKey(id) });
    },
  });
};

export const useStopBot = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (botId: string) => apiJson<{ bot: BacktestBot }>(`/api/backtest/bots/${botId}/stop`, json('POST')),
    onSettled: async () => {
      refresh(qc);
      await qc.invalidateQueries({ queryKey: sessionKey(id) });
    },
  });
};
```
`useOpenTrade` и `useAddToTrade`: `onSettled: () => refresh(qc, id)` →
```ts
    // Перечитку дожидаемся, как у закрытия: исполнение ордера бота ставит на
    // сервере следующий ордер, и прокрутка, пока он не приехал, могла бы пройти
    // его уровень (спека 2026-10-09).
    onSettled: async () => {
      refresh(qc);
      await qc.invalidateQueries({ queryKey: sessionKey(id) });
    },
```
`StartBotVars` — в `model/actions.ts` (экспорт) и импортом в `api/hooks.ts`.

- [ ] **Step 4: Набор действий**

`model/actions.ts`:
```ts
export interface StartBotVars {
  symbol?: string;
  lower: number;
  upper: number;
  stopLoss: number;
  levels: number;
  riskPct: number;
  leverage: number;
  entryTime: string;
  entryPrice: number;
}
```
в `TerminalActions` — 
```ts
  /** Грид-бот — только у сессии бектеста; нет набора — нет вкладки «Бот». */
  bot?: { start: TerminalAction<StartBotVars>; stop: TerminalAction<string> };
```
в `useSessionActions` — `bot: { start: useStartBot(sessionId), stop: useStopBot(sessionId) },` (турнир отсекает экран по `detail.tournament`, задача 9).

- [ ] **Step 5: Проверка**

Run: `cd frontend && npx tsc --noEmit -p . && npx vitest run src/widgets/backtest-session`
Expected: без ошибок.

---

### Task 9: Вкладка «Бот», черновик на графике, замок лонга

**Files:**
- Create: `frontend/src/widgets/backtest-session/components/BotPanel.tsx`
- Modify: `components/OrderPanel.tsx`, `lib/draft-levels.ts`, `components/SessionScreen.tsx`, `components/OrdersPanel.tsx`
- Modify: `frontend/src/shared/i18n/messages/ru.json`, `en.json`

**Interfaces:**
- Consumes: `lib/bot-grid.ts`, `BacktestBot`, `actions.bot` (задача 8); `ChartRange` (задача 1); `findRanges`/`atrOf` результат `rangeBoxes`, `candles4h` (задача 3).
- Produces:
  - `BotDraft = { risk: string; upper: string; lower: string; stop: string; count: string }` (экранные цены строками)
  - `OrderTab = 'market' | 'limit' | 'scaled' | 'bot'`
  - `OrderPanel` пропсы `bot?: ReactNode` (есть — есть вкладка), `longLocked?: boolean`
  - `draftLevels` — поле `bot` во входе

- [ ] **Step 1: Тексты**

`ru.json`, `backtest`:
```json
"orderTabBot": "Бот",
"botUpper": "Верх диапазона",
"botLower": "Низ диапазона",
"botStopLabel": "Стоп",
"botLevels": "Уровней",
"botStep": "Шаг",
"botQtyPerLevel": "Объём на уровень",
"botAtMarket": "Сразу по рынку",
"botLossAtStop": "Потеря на стопе",
"botStart": "Запустить бота",
"botStopButton": "Остановить бота",
"botRunning": "Бот работает",
"botRange": "Диапазон",
"botClosedPnl": "Закрыто",
"botStoppedTitle": "Бот остановлен: {reason}",
"botReason_user": "вручную",
"botReason_stop": "сработал стоп",
"botReason_manual": "позиция закрыта вручную",
"botReason_take": "сработал тейк позиции",
"botReason_finish": "сессия завершена",
"botReason_limit": "позиция закрыта лимитом",
"botOwnsLong": "Лонг этой монеты ведёт бот",
"orderBotMark": "бот"
```
`errors`:
```json
"BACKTEST_BOT_RANGE": "Низ диапазона должен быть ниже верха",
"BACKTEST_BOT_STOP": "Стоп должен стоять под низом диапазона",
"BACKTEST_BOT_LEVELS": "Уровней — от 2 до 20",
"BACKTEST_BOT_PRICE_OUTSIDE": "Цена вне диапазона бота",
"BACKTEST_BOT_EXISTS": "На этой монете бот уже работает",
"BACKTEST_BOT_SIDE_BUSY": "Лонг этой монеты занят: закройте позицию и снимите лимиты на покупку",
"BACKTEST_BOT_SIDE": "Лонг этой монеты ведёт бот",
"BACKTEST_BOT_TOURNAMENT": "В турнире бота нет",
"BACKTEST_BOT_NOT_FOUND": "Бот не найден"
```
`en.json` — те же ключи: "Bot", "Range top", "Range bottom", "Stop", "Levels", "Step", "Size per level", "Bought at market now", "Loss at stop", "Start bot", "Stop bot", "Bot is running", "Range", "Closed", "Bot stopped: {reason}", "manually", "stop hit", "position closed manually", "position take hit", "session finished", "position closed by limit", "This coin's long side belongs to the bot", "bot"; ошибки: "Range bottom must be below the top", "Stop must be below the range bottom", "Levels: 2 to 20", "Price is outside the bot range", "A bot is already running on this coin", "This coin's long side is busy: close the position and cancel buy limits", "This coin's long side belongs to the bot", "No bots in tournaments", "Bot not found".

- [ ] **Step 2: `BotPanel`**

```tsx
// components/BotPanel.tsx
'use client';

import type { ChangeEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/shared/ui/Button';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { Field, Input } from '@/shared/ui/Field';
import { KeyValue } from '@/shared/ui/Lookup';
import { Slider } from '@/shared/ui/Slider';
import { formatPriceGrouped, formatQty } from '@/shared/lib/utils/format';
import type { BacktestBot } from '../api/types';
import { botGridError, botPrices, botQty, botStep, splitAtPrice } from '../lib/bot-grid';
import { curvedSliderPos, curvedSliderValue, fromScreen, riskAmount, toInput } from '../lib/money';

/** Черновик бота — строками, в экранных ценах, как остальные черновики панели. */
export interface BotDraft {
  risk: string;
  upper: string;
  lower: string;
  stop: string;
  count: string;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Вкладка «Бот» панели ордера: грид-бот в диапазоне, который задаёт человек
 * (спека 2026-10-09). Верх, низ и стоп — ещё и линиями на графике (черновик
 * живёт у `SessionScreen`). Работающий бот показывается вместо полей.
 */
export function BotPanel({
  draft,
  onDraft,
  price,
  scale,
  balance,
  maxRisk,
  priceDecimals,
  bot,
  error,
  busy,
  onStart,
  onStop,
}: {
  draft: BotDraft;
  onDraft: (d: BotDraft) => void;
  /** Настоящая цена; null — ещё нет. */
  price: number | null;
  scale: number;
  balance: number;
  maxRisk: number;
  priceDecimals?: number;
  /** Работающий бот этой монеты или последний остановленный. */
  bot: BacktestBot | null;
  error: unknown;
  busy: boolean;
  onStart: () => void;
  onStop: (botId: string) => void;
}) {
  const t = useTranslations('backtest');
  const te = useTranslations('errors');
  const set = (key: keyof BotDraft) => (e: ChangeEvent<HTMLInputElement>) => onDraft({ ...draft, [key]: e.target.value });

  if (bot?.status === 'active') {
    return (
      <div className="bot-card">
        <p>{t('botRunning')}</p>
        <KeyValue label={t('botRange')}>
          {formatPriceGrouped(bot.lower, priceDecimals)}–{formatPriceGrouped(bot.upper, priceDecimals)}
        </KeyValue>
        <KeyValue label={t('botLevels')}>{bot.levels}</KeyValue>
        <KeyValue label={t('botStopLabel')}>{formatPriceGrouped(bot.stopLoss, priceDecimals)}</KeyValue>
        <KeyValue label={t('botClosedPnl')} valueClassName={bot.closedPnl >= 0 ? 'pos' : 'neg'}>
          {formatPriceGrouped(bot.closedPnl)} USDT
        </KeyValue>
        <ErrorNote error={error} fallback={t('actionFailed')} />
        <div className="order-actions">
          <Button variant="bare" onClick={() => onStop(bot.id)} disabled={busy}>
            {t('botStopButton')}
          </Button>
        </div>
      </div>
    );
  }

  const risk = Number(draft.risk) || 0;
  const g = {
    lower: fromScreen(Number(draft.lower), scale),
    upper: fromScreen(Number(draft.upper), scale),
    levels: Math.round(Number(draft.count)),
    stopLoss: fromScreen(Number(draft.stop), scale),
  };
  const invalid = price == null ? null : botGridError(g, price);
  const step = invalid ? null : botStep(g);
  const q = invalid ? null : botQty(g, balance, risk);
  const atMarket = invalid || price == null ? null : splitAtPrice(botPrices(g), price).market.length;

  return (
    <>
      {bot && (
        <p className="muted">
          {t('botStoppedTitle', { reason: t(`botReason_${bot.stopReason ?? 'user'}`) })} · {formatPriceGrouped(bot.closedPnl)} USDT
        </p>
      )}
      <Field
        label={
          <span className="fld-head">
            <span>
              {t('risk')} {risk.toFixed(1)}%
            </span>
            {riskAmount(balance, risk) != null && <span className="fld-val">{formatPriceGrouped(riskAmount(balance, risk)!)} USDT</span>}
          </span>
        }
      >
        {() => (
          <Slider
            value={curvedSliderPos(clamp(risk, 0, maxRisk), 0, maxRisk, 0)}
            min={0}
            max={100}
            step={0.25}
            onChange={(pos) => onDraft({ ...draft, risk: toInput(curvedSliderValue(pos, 0, maxRisk, 0)) })}
            aria-label={t('risk')}
          />
        )}
      </Field>
      <Field label={t('botUpper')}>{(id) => <Input id={id} inputMode="decimal" value={draft.upper} onChange={set('upper')} />}</Field>
      <Field label={t('botLower')}>{(id) => <Input id={id} inputMode="decimal" value={draft.lower} onChange={set('lower')} />}</Field>
      <Field label={t('botStopLabel')}>{(id) => <Input id={id} inputMode="decimal" value={draft.stop} onChange={set('stop')} />}</Field>
      <div className="size-preview">
        <KeyValue label={t('botLevels')} control valueClassName="">
          <Input className="order-count" inputMode="numeric" value={draft.count} onChange={set('count')} aria-label={t('botLevels')} />
        </KeyValue>
        <KeyValue label={t('botStep')}>
          {step != null ? `${formatPriceGrouped(step, priceDecimals)} · ${((step / g.lower) * 100).toFixed(2)}%` : '—'}
        </KeyValue>
      </div>
      <div className="size-preview">
        <KeyValue label={t('botQtyPerLevel')}>{q != null ? formatQty(Number(q.toFixed(4))) : '—'}</KeyValue>
        <KeyValue label={t('botAtMarket')}>{atMarket ?? '—'}</KeyValue>
        <KeyValue label={t('botLossAtStop')}>
          {riskAmount(balance, risk) != null ? `${formatPriceGrouped(riskAmount(balance, risk)!)} USDT` : '—'}
        </KeyValue>
      </div>
      {invalid && <p className="neg">{te(invalid)}</p>}
      <ErrorNote error={error} fallback={t('actionFailed')} />
      <div className="order-actions">
        <Button variant="long" onClick={onStart} disabled={busy || invalid != null || price == null || balance <= 0}>
          {t('botStart')}
        </Button>
      </div>
    </>
  );
}
```
Перед написанием сверить с `shared/ui`: сигнатуру `Field` (рендер-функция получает `id` или нет — у панели ордера вызывается `{() => …}`; если `id` не передаётся, писать `{() => <Input … aria-label={…} />}`), наличие `valueClassName` у `KeyValue`, вариант `'bare'` у `Button`. Класс `.bot-card` добавить в `globals.css` рядом с `.order-panel`: `display: grid; gap: var(--s2);`.

- [ ] **Step 3: `OrderPanel`**

- `export type OrderTab = 'market' | 'limit' | 'scaled' | 'bot';`
- пропсы `bot?: ReactNode;` и `longLocked?: boolean;` (импорт `type ReactNode` из `react`);
- в `Seg` опции: `...(bot ? [{ value: 'bot' as const, label: t('orderTabBot') }] : [])`;
- после блока `{tab === 'scaled' && (…)}`: `{tab === 'bot' && bot}`;
- у кнопок «Лонг» всех трёх вкладок: `disabled={… || longLocked}`; под `Seg`: `{longLocked && tab !== 'bot' && <p className="muted">{t('botOwnsLong')}</p>}`.

- [ ] **Step 4: Линии черновика бота (`draft-levels.ts`)**

Во вход `DraftLevelsInput` — `bot: { upper: number | null; lower: number | null; stop: number; count: number } | null;` (null — бот работает или вкладки нет). В конец `draftLevels` перед `return list;`:
```ts
  // Черновик бота: верх и низ тянутся, промежуточные покупки — без захвата, стоп тянется.
  if (tab === 'bot' && bot && livePrice != null) {
    const { upper, lower, stop, count } = bot;
    if (upper != null && upper > 0) list.push({ id: 'draft-bot-upper', kind: 'gridUpper', price: upper, draggable: true });
    if (lower != null && lower > 0) list.push({ id: 'draft-bot-lower', kind: 'gridLower', price: lower, draggable: true });
    if (upper != null && lower != null && upper > lower && count >= 2) {
      const step = (upper - lower) / count;
      for (let j = 1; j < count; j++) {
        list.push({ id: `draft-bot-step-${j}`, kind: 'gridStep', price: lower + j * step, draggable: false });
      }
    }
    if (stop > 0) list.push({ id: 'draft-bot-stop', kind: 'stop', price: stop, draggable: true });
  }
```
и `bot` в деструктуризацию параметров.

- [ ] **Step 5: `SessionScreen` — черновик, линии, жесты, запуск**

Состояние рядом с `scaledDraft`:
```ts
  const [botDraft, setBotDraft] = useState<BotDraft>({ risk: '1', upper: '', lower: '', stop: '', count: '4' });
```
Бот монеты графика и возможность вкладки:
```ts
  const botActions = detail.tournament == null && detail.bots !== undefined ? actions.bot : undefined;
  const chartBots = useMemo(() => (detail.bots ?? []).filter((b) => b.symbol === symbol), [detail.bots, symbol]);
  const activeBot = chartBots.find((b) => b.status === 'active') ?? null;
  const shownBot = activeBot ?? chartBots.at(-1) ?? null;
```
Заполнение черновика при открытии вкладки (в обработчике `onTab`, а не эффектом):
```ts
  const openTab = (next: OrderTab) => {
    if (next === 'bot' && !botDraft.upper && screenPrice != null) {
      // По умолчанию — живая рамка индикатора на этой монете, иначе ±5 % от цены;
      // стоп — на 0,5 ATR(4ч) под низом (как в исследовании), без ATR — на 1 % ниже.
      const live = rangeBoxes.at(-1);
      const box = live && live.endAt === null ? live.steps.at(-1)! : null;
      const lo = box ? toScreen(box.lo, scale) : screenPrice * 0.95;
      const hi = box ? toScreen(box.hi, scale) : screenPrice * 1.05;
      const atr = candles4h.length > 14 ? atrOf(candles4h, 14).at(-1)! : null;
      const stop = atr != null ? lo - toScreen(atr, scale) * 0.5 : lo * 0.99;
      setBotDraft((d) => ({ ...d, upper: toInputPrice(hi), lower: toInputPrice(lo), stop: toInputPrice(stop) }));
    }
    setOrderTab(next);
  };
```
и `onTab={openTab}` у `OrderPanel` вместо `setOrderTab` (импорт `atrOf` из `../lib/ranges`; если `toScreen` масштабирует цену, а не разницу, — для ATR `atr * scale`, сверить с `lib/money`).

В `draftLevels({...})` — 
```ts
          bot:
            botActions && !activeBot
              ? {
                  upper: botDraft.upper.trim() ? Number(botDraft.upper) : null,
                  lower: botDraft.lower.trim() ? Number(botDraft.lower) : null,
                  stop: Number(botDraft.stop),
                  count: Math.round(Number(botDraft.count)) || 0,
                }
              : null,
```
и `botDraft`, `botActions`, `activeBot` — в зависимости `useMemo(levels)`.

Жесты в `onDragLevel`: ветку `gridUpper`/`gridLower` заменить на
```ts
    if (kind === 'gridUpper' || kind === 'gridLower') {
      const key = kind === 'gridUpper' ? 'upper' : 'lower';
      if (dragCtxRef.current.orderTab === 'bot') setBotDraft((prev) => ({ ...prev, [key]: toInputPrice(price) }));
      else setScaledDraft((prev) => ({ ...prev, [key]: toInputPrice(price) }));
      return;
    }
```
и рядом с веткой `activeTab === 'scaled'`:
```ts
    if (tradeId == null && activeTab === 'bot') {
      if (kind === 'stop') setBotDraft((prev) => ({ ...prev, stop: toInputPrice(price) }));
      return;
    }
```
Запуск и остановка:
```ts
  const startBot = () => {
    if (!botActions || replay.price == null) return;
    botActions.start.mutate({
      symbol,
      lower: fromScreen(Number(botDraft.lower), scale),
      upper: fromScreen(Number(botDraft.upper), scale),
      stopLoss: fromScreen(Number(botDraft.stop), scale),
      levels: Math.round(Number(botDraft.count)),
      riskPct: Number(botDraft.risk),
      leverage: draftLeverage,
      entryTime: new Date(replay.cursor).toISOString(),
      entryPrice: replay.price,
    });
  };
```
В `<OrderPanel …>`:
```tsx
                  bot={
                    botActions ? (
                      <BotPanel
                        draft={botDraft}
                        onDraft={setBotDraft}
                        price={replay.price}
                        scale={scale}
                        balance={balance}
                        maxRisk={maxRisk}
                        priceDecimals={chartDecimals}
                        bot={shownBot}
                        error={botActions.start.error ?? botActions.stop.error}
                        busy={botActions.start.isPending || botActions.stop.isPending}
                        onStart={startBot}
                        onStop={(id) => botActions.stop.mutate(id)}
                      />
                    ) : undefined
                  }
                  longLocked={activeBot != null}
```
В `pending` у `useReplay` — дописать `|| (actions.bot?.start.isPending ?? false)`.

Диапазон работающего бота на графике — в `chartRanges`:
```ts
  const chartRanges = useMemo<ChartRange[]>(() => {
    const list = toChartRanges(rangeBoxes, candles4h, (p) => toScreen(p, scale));
    for (const b of chartBots) {
      const from = Date.parse(b.startedAt);
      list.push({
        id: `bot-${b.id}`,
        kind: 'bot',
        from,
        seen: from,
        end: b.stoppedAt ? Date.parse(b.stoppedAt) : null,
        steps: [{ t: from, lo: toScreen(b.lower, scale), hi: toScreen(b.upper, scale) }],
      });
    }
    return list;
  }, [rangeBoxes, candles4h, chartBots, scale]);
```

- [ ] **Step 6: Пометка «бот» во вкладке «Ордера»**

В `OrdersPanel.tsx`, в строке лимита на вход рядом с ценой: `{o.botId && <span className="muted"> · {t('orderBotMark')}</span>}`.

- [ ] **Step 7: Проверка**

Run: `cd frontend && npx tsc --noEmit -p . && npx vitest run src/widgets/backtest-session && npx eslint src/widgets/backtest-session && npx next build`
Expected: без ошибок, сборка проходит.

**Контрольная точка 3 (B, стык фронт↔бэк):** ревью задач 8–9 вместе с контрактом задач 6–7 (форма `bots` в снимке, коды ошибок, `entryTime`/`entryPrice` запуска, ожидание перечитки в прокрутке).

---

### Task 10: База, живой прогон, документация

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Схема в базу**

Поднять локальное окружение (`start.bat`), затем:
Run: `cd backend && npx prisma db push`
Expected: `Your database is now in sync with your Prisma schema` (таблица и столбцы только добавлены).

- [ ] **Step 2: Живой прогон (пути класса A)**

Сессия истории BTC (тестовый пользователь `pw-tester@example.com` / `pw-tester-123`, см. память), цена внутри будущего диапазона:
1. Вкладка «Бот»: поля заполнены по рамке индикатора или ±5 %; линии верха, низа, стопа и уровней на графике; потянуть низ — поле меняется.
2. «Запустить бота»: верхние уровни куплены по рынку (позиция в таблице, продажи плашками), нижние — лимиты с пометкой «бот»; кнопка «Лонг» выключена с подписью.
3. Прокрутка ×60: исполнилась покупка — встала продажа на шаг выше; исполнилась продажа — снова покупка на том же уровне; результат «Закрыто» растёт.
4. Стоп: прокрутить до пробоя вниз (или перетащить стоп позиции вверх к цене) — позиция закрыта стопом, бот «остановлен: сработал стоп», его покупки сняты.
5. Новый бот, «Остановить» — покупки сняты, позиция с продажами осталась; лонг снова доступен.
6. Эфир: запуск бота на живой цене, движок исполняет покупку — продажа появляется после следующего тика.

Найденное — чинить в задаче, к которой оно относится, и повторить шаг.

- [ ] **Step 3: `CLAUDE.md`**

Раздел после «Бектест: панель ордера не знает об открытых сделках»:
```markdown
## Бектест: индикатор боковика и грид-бот (2026-10-09)

Спека — `docs/superpowers/specs/2026-10-09-range-indicator-and-grid-bot-design.md`; правила
подобраны исследованием на 4ч BTC с 2017 года.

- **Индикатор — `lib/ranges.ts`, на закрытых 4ч-свечах монеты графика при любом таймфрейме**
  (своя загрузка `useRangeCandles`, 1000 свечей): живая лента держит только выбранный ТФ.
  Рамка — пунктир задним числом от вершины импульса до свечи, где о ней узнали, дальше
  сплошная ступенями. **Детектор не перерисовывается** — это держит тест; будущих свечей ему
  не давать. Вероятности продолжения нет: на 80 рамках за 9 лет она проверку вперёд не пройдёт.
- **Бот — только в сессиях бектеста, только лонг.** Уровни `низ + j·шаг`, объём один на всех
  уровнях (потеря при всех покупках и стопе — риск). **Уровни на цене и выше покупаются по
  рынку при запуске** (как у Bybit в режиме «лонг»): лимит на покупку выше цены прокрутка
  исполнила бы на касании снизу.
- **Следующий ордер бота ставит сервер в той же транзакции, где исполнился предыдущий**
  (`sellAfterBotBuy` в `openChecked`/`addChecked`, `buyAfterBotSell` в `applyClose`) — поэтому
  бот одинаково работает у прокрутки браузера и у движка эфира. Вход по ордеру теперь ждёт
  перечитки сессии (`useOpenTrade`): иначе прокрутка проходила бы уровень ещё не приехавшей продажи.
- **Пока бот работает, лонг его монеты — его** (`ensureLongFree`, 409 `BACKTEST_BOT_SIDE`).
  Позицию бота закрыло не его продажа — бот остановлен; частичное ручное закрытие снимает и его
  продажи. Перезапуска после стопа нет — в исследовании он стоил больше, чем приносил.
```

- [ ] **Step 4: Финальное ревью**

Контрольных точек было три — ревью Opus по всей ветке (спека, план, дифф).
