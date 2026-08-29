# Цена привычек на Обзоре — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Показать пользователю уже посчитанную на бэкенде «Цену привычек» (тег-независимую диагностику: отыгрыш после убытка, переторговка, разгон размера, время/сессия входа, контекст рынка) на Обзоре — с переводом на язык интерфейса и кликабельным переходом в отфильтрованную Аналитику.

**Architecture:** Бэкенд размечает уже вычисленные `Candidate`/`Habit` двумя новыми полями — `kind` (16 видов) и `params` (значения для подстановки) — не трогая саму статистику (пермутационный тест, поправка Бенджамини–Хохберга, OOS). Фронтенд переводит `kind`+`params` в текст через словарь `habit-labels.ts`, с откатом на сырые русские `label`/`advice` бэкенда для незнакомого `kind`. Новый блок на Обзоре показывает результат. Переход по клику в Аналитику становится рабочим: `useLabFilters` учится читать фильтры из query-строки при маунте (сейчас не читает вовсе).

**Tech Stack:** NestJS + Jest (бэкенд), Next.js App Router + next-intl + @tanstack/react-query + Vitest (фронтенд).

## Global Constraints

- Ответ пользователю — на русском (CLAUDE.md, глобальные правила); самого кода не касается.
- Мелкая правка → билд не гонять; это не мелкая правка (рефактор 5+ файлов через несколько слоёв — бэкенд, entities, views, i18n, globals.css), поэтому финальная задача обязана прогнать `nest build` и `next build`, не спрашивая.
- Слой страниц фронтенда — `frontend/src/views/`, не `src/pages/`; фронт проверяется `npx next build`, а не только `tsc` (dev-сервер и eslint остаются зелёными на поломках, которые ловит только build).
- Никакой сырой разметки для повторяющихся элементов — переиспользовать `shared/ui` (`Money`, `EmptyState`, `Skeleton`/`SkeletonLines`). Цвета — классами из `globals.css`, не инлайновым `style`.
- Спека: `docs/superpowers/specs/2026-08-29-habits-overview-design.md`. При расхождении между этим планом и спекой в мелочах (например, точное число видов `kind`) верен план — он написан позже, по факту чтения кода.

---

## Task 1: Бэкенд — `kind`/`params` на `Habit`/`Candidate`

**Files:**
- Modify: `backend/src/trades/habits.service.ts:46-81` (типы), `:244-476` (`candidates()`), `:511-530` (`evaluate()`)
- Test: `backend/src/trades/habits.service.spec.ts` (новый файл — сейчас у сервиса нет тестов вообще)

**Interfaces:**
- Produces: `HabitKind` (16 литералов), `Habit.kind: HabitKind`, `Habit.params: Record<string, string | number>`, `Candidate.kind`, `Candidate.params` — этими именами и этой формой их читает фронтенд в Task 2.
- Конверт ответа `/trades/habits` (`status`/`positions`/`need`/`tested`/`totalCost`/`habits`/`edges`/`all`) не меняется — `trades.controller.ts` не трогаем.

- [x] **Step 1: Написать падающий тест**

Создать `backend/src/trades/habits.service.spec.ts`:

```ts
import { HabitsService } from './habits.service';
import type { Row } from './trade-rows';

function makeRow(overrides: Partial<Row> = {}): Row {
  return {
    id: 'r1',
    symbol: 'BTCUSDT',
    direction: 'long',
    closedPnl: 0,
    closedAt: new Date('2026-01-01T00:00:00Z'),
    openedAt: new Date('2026-01-01T00:00:00Z'),
    qty: 1,
    avgEntryPrice: 100,
    avgExitPrice: 100,
    parts: 1,
    entryMs: new Date('2026-01-01T00:00:00Z').getTime(),
    entryBasis: 'filled',
    holdMs: 60_000,
    notional: 100,
    tagSet: new Set(),
    session: 'asia',
    weekday: 1,
    hour: 3,
    ctx: null,
    tags: [],
    ...overrides,
  };
}

const emptyFlags = { tilt: new Set<string>(), overtrade: new Set<string>(), medNotional: 0, medHold: null };

// Приватный candidates() зовём напрямую через каст — этот метод не трогает
// this.prisma, поэтому фейковый конструктор безопасен и не тянет за собой
// поднятие Nest/Prisma ради юнит-теста.
describe('HabitsService.candidates — kind/params', () => {
  const service = new HabitsService({} as any);
  const candidates = (rows: Row[] = []) =>
    (service as any).candidates(rows, emptyFlags, null, null) as Array<{
      key: string;
      kind: string;
      params: Record<string, string | number>;
    }>;

  it('помечает поведенческий кандидат своим kind без параметров', () => {
    const tilt = candidates().find((c) => c.key === 'tilt');
    expect(tilt?.kind).toBe('tilt');
    expect(tilt?.params).toEqual({});
  });

  it('переторговка несёт nth и limit, посчитанные из константы', () => {
    const c = candidates().find((c) => c.key === 'overtrading');
    expect(c?.kind).toBe('overtrading');
    expect(c?.params).toEqual({ nth: 3, limit: 2 });
  });

  it('разгон размера несёт множитель', () => {
    const c = candidates().find((c) => c.key === 'size_up');
    expect(c?.kind).toBe('size_up');
    expect(c?.params).toEqual({ mult: 1.5 });
  });

  it('лонг/шорт — общий kind "dir", направление в params', () => {
    const long = candidates().find((c) => c.key === 'dir:long');
    const short = candidates().find((c) => c.key === 'dir:short');
    expect(long?.kind).toBe('dir');
    expect(long?.params).toEqual({ direction: 'long' });
    expect(short?.kind).toBe('dir');
    expect(short?.params).toEqual({ direction: 'short' });
  });

  it('часовое окно несёт числовые границы часа', () => {
    const c = candidates().find((c) => c.key === 'hour:8-11');
    expect(c?.kind).toBe('hour');
    expect(c?.params).toEqual({ hourFrom: 8, hourTo: 11 });
  });

  it('день недели несёт индекс 0..6', () => {
    const c = candidates().find((c) => c.key === 'weekday:3');
    expect(c?.kind).toBe('weekday');
    expect(c?.params).toEqual({ weekday: 3 });
  });

  it('сессия несёт свой ключ строкой', () => {
    const c = candidates().find((c) => c.key === 'session:london');
    expect(c?.kind).toBe('session');
    expect(c?.params).toEqual({ session: 'london' });
  });

  it('режим тренда несёт свой ключ строкой', () => {
    const c = candidates().find((c) => c.key === 'trend4h:trend_up');
    expect(c?.kind).toBe('trend4h');
    expect(c?.params).toEqual({ trend: 'trend_up' });
  });

  it('EMA200 несёт сторону above/below', () => {
    const above = candidates().find((c) => c.key === 'ema200:above');
    expect(above?.kind).toBe('ema200');
    expect(above?.params).toEqual({ side: 'above' });
  });

  it('ATR несёт уровень high/low', () => {
    const high = candidates().find((c) => c.key === 'atr:high');
    expect(high?.kind).toBe('atr');
    expect(high?.params).toEqual({ level: 'high' });
  });

  it('объём несёт уровень high/low', () => {
    const low = candidates().find((c) => c.key === 'vol:low');
    expect(low?.kind).toBe('vol');
    expect(low?.params).toEqual({ level: 'low' });
  });

  it('диапазон 4H несёт корзину low/mid/high', () => {
    const mid = candidates().find((c) => c.key === 'range4h:mid');
    expect(mid?.kind).toBe('range4h');
    expect(mid?.params).toEqual({ bucket: 'mid' });
  });

  it('тег несёт человекочитаемое имя тега в params', () => {
    const rows = Array.from({ length: 12 }, (_, i) =>
      makeRow({ id: `t${i}`, tagSet: new Set(['tag-1']), tags: [{ id: 'tag-1', name: 'Пробой', color: '#fff' }] }),
    );
    const c = candidates(rows).find((x) => x.key === 'tag:tag-1');
    expect(c?.kind).toBe('tag');
    expect(c?.params).toEqual({ tagName: 'Пробой' });
  });

  it('символ несёт тикер в params', () => {
    const rows = Array.from({ length: 12 }, (_, i) => makeRow({ id: `s${i}`, symbol: 'ETHUSDT' }));
    const c = candidates(rows).find((x) => x.key === 'symbol:ETHUSDT');
    expect(c?.kind).toBe('symbol');
    expect(c?.params).toEqual({ symbol: 'ETHUSDT' });
  });
});

describe('HabitsService.evaluate — переносит kind/params в Habit', () => {
  it('kind и params кандидата долетают до итогового Habit', () => {
    const service = new HabitsService({} as any);
    const rows = [
      ...Array.from({ length: 15 }, (_, i) => makeRow({ id: `s${i}`, direction: 'long', closedPnl: -10 })),
      ...Array.from({ length: 30 }, (_, i) => makeRow({ id: `r${i}`, direction: 'short', closedPnl: 5 })),
    ];
    const habit = (service as any).evaluate(
      {
        key: 'dir:long',
        group: 'context',
        kind: 'dir',
        params: { direction: 'long' },
        label: 'Лонги',
        advice: 'Сравнить с шортами в «Аналитике».',
        lab: { direction: 'long' },
        test: (r: Row) => r.direction === 'long',
      },
      rows,
    );
    expect(habit?.kind).toBe('dir');
    expect(habit?.params).toEqual({ direction: 'long' });
  });
});
```

- [x] **Step 2: Запустить тест и убедиться, что он падает**

Run: `cd backend && npx jest habits.service.spec`
Expected: FAIL — `kind`/`params` читаются как `undefined`, ассерты вида `expect(undefined).toBe('tilt')` не проходят. Компилируется тест без ошибок: обращение идёт через `any`-каст, TS не проверяет форму объекта на этом пути.

- [x] **Step 3: Добавить `kind`/`params` в типы**

В `backend/src/trades/habits.service.ts` заменить блок `export interface Habit { ... }` / `interface Candidate { ... }` (строки 46-81) на:

```ts
export type Confidence = 'confirmed' | 'likely';
export type Oos = 'pass' | 'fail' | 'na';

/**
 * 16 видов кандидата. По этому значению фронтенд (`habit-labels.ts`) выбирает
 * шаблон подписи/совета — `label`/`advice` ниже остаются как готовый русский
 * текст только на случай незнакомого фронту `kind` (рассинхрон версий).
 */
export type HabitKind =
  | 'tilt'
  | 'overtrading'
  | 'size_up'
  | 'size_up_after_loss'
  | 'hold_long'
  | 'dir'
  | 'hour'
  | 'weekday'
  | 'session'
  | 'trend4h'
  | 'ema200'
  | 'atr'
  | 'vol'
  | 'range4h'
  | 'tag'
  | 'symbol';

export interface Habit {
  key: string;
  group: 'behaviour' | 'time' | 'context' | 'tag' | 'symbol';
  kind: HabitKind;
  /** Подстановки для шаблона label/advice на фронте, см. HabitKind. */
  params: Record<string, string | number>;
  label: string;
  advice: string;
  n: number;
  nRest: number;
  avgPnl: number;
  avgRest: number;
  lift: number;
  /** Отрицательный — привычка стоила денег; положительный — приносила. */
  cost: number;
  /** Сумма P&L среза: «столько было бы, не открывай ты их вовсе» (со знаком минус). */
  absolute: number;
  winRate: number;
  winRateRest: number;
  p: number;
  confidence: Confidence;
  outlierSafe: boolean;
  oos: Oos;
  /** Query-параметры /api/trades/lab, открывающие этот срез в «Аналитике». */
  lab: Record<string, string> | null;
}

export interface Candidate {
  key: string;
  group: Habit['group'];
  kind: HabitKind;
  params: Record<string, string | number>;
  label: string;
  advice: string;
  lab: Record<string, string> | null;
  /** true — в срезе, false — вне, null — строка не участвует (нет данных). */
  test: (r: Row) => boolean | null;
}
```

(Изменения: добавлены `HabitKind`, поля `kind`/`params` на обоих интерфейсах, `interface Candidate` → `export interface Candidate`, комментарий `lab` поправлен на актуальное имя «Аналитика».)

- [x] **Step 4: Проставить `kind`/`params` на каждом кандидате**

Заменить весь метод `private candidates(...)` (строки 244-476) на:

```ts
  private candidates(
    rows: Row[],
    flags: ReturnType<HabitsService['behaviourFlags']>,
    medAtr: number | null,
    medVol: number | null,
  ): Candidate[] {
    const { tilt, overtrade, medNotional, medHold } = flags;
    const big = (r: Row) => medNotional > 0 && r.notional >= medNotional * SIZE_UP_MULT;
    const list: Candidate[] = [
      {
        key: 'tilt',
        group: 'behaviour',
        kind: 'tilt',
        params: {},
        label: 'Вход в течение часа после убытка',
        advice: 'Пауза 60 минут после убыточной сделки.',
        lab: null,
        test: (r) => tilt.has(r.id),
      },
      {
        key: 'overtrading',
        group: 'behaviour',
        kind: 'overtrading',
        params: { nth: OVERTRADE_NTH, limit: OVERTRADE_NTH - 1 },
        label: `${OVERTRADE_NTH}-я и следующие сделки за день`,
        advice: `Лимит ${OVERTRADE_NTH - 1} сделки в день.`,
        lab: null,
        test: (r) => overtrade.has(r.id),
      },
      {
        key: 'size_up',
        group: 'behaviour',
        kind: 'size_up',
        params: { mult: SIZE_UP_MULT },
        label: `Вход крупнее обычного (от ${SIZE_UP_MULT}× медианы)`,
        advice: 'Фиксированный размер позиции.',
        lab: null,
        test: (r) => (medNotional > 0 ? big(r) : null),
      },
      {
        key: 'size_up_after_loss',
        group: 'behaviour',
        kind: 'size_up_after_loss',
        params: {},
        label: 'Увеличенный вход сразу после убытка',
        advice: 'Никогда не повышать размер на просадке.',
        lab: null,
        test: (r) => (medNotional > 0 ? big(r) && tilt.has(r.id) : null),
      },
      {
        key: 'hold_long',
        group: 'behaviour',
        kind: 'hold_long',
        params: {},
        label: 'Позиции, которые держал дольше обычного',
        advice: 'Ограничить время в позиции.',
        lab: null,
        test: (r) => (medHold == null || r.holdMs < 0 ? null : r.holdMs > medHold),
      },
      {
        key: 'dir:long',
        group: 'context',
        kind: 'dir',
        params: { direction: 'long' },
        label: 'Лонги',
        advice: 'Сравнить с шортами в «Аналитике».',
        lab: { direction: 'long' },
        test: (r) => r.direction === 'long',
      },
      {
        key: 'dir:short',
        group: 'context',
        kind: 'dir',
        params: { direction: 'short' },
        label: 'Шорты',
        advice: 'Сравнить с лонгами в «Аналитике».',
        lab: { direction: 'short' },
        test: (r) => r.direction === 'short',
      },
    ];

    // Время входа: блоки по 4 часа (24 отдельных часа — заведомо пустые срезы).
    for (let h = 0; h < 24; h += 4) {
      const to = h + 3;
      list.push({
        key: `hour:${h}-${to}`,
        group: 'time',
        kind: 'hour',
        params: { hourFrom: h, hourTo: to },
        label: `Входы ${String(h).padStart(2, '0')}:00–${String(to).padStart(2, '0')}:59`,
        advice: 'Не открывать в этом окне.',
        lab: { hourFrom: String(h), hourTo: String(to) },
        test: (r) => r.hour >= h && r.hour <= to,
      });
    }

    const WD = ['воскресеньям', 'понедельникам', 'вторникам', 'средам', 'четвергам', 'пятницам', 'субботам'];
    for (let d = 0; d < 7; d++) {
      list.push({
        key: `weekday:${d}`,
        group: 'time',
        kind: 'weekday',
        params: { weekday: d },
        label: `Входы по ${WD[d]}`,
        advice: 'Проверить, что в этот день меняется в подходе.',
        lab: { weekdays: String(d) },
        test: (r) => r.weekday === d,
      });
    }

    const SESSION_RU: Record<string, string> = {
      asia: 'азиатскую сессию',
      london: 'лондонскую сессию',
      ny: 'сессию Нью-Йорка',
      night: 'ночь (21–24 UTC)',
    };
    for (const s of Object.keys(SESSIONS)) {
      list.push({
        key: `session:${s}`,
        group: 'time',
        kind: 'session',
        params: { session: s },
        label: `Входы в ${SESSION_RU[s]}`,
        advice: 'Сместить активность на другую сессию.',
        lab: { sessions: s },
        test: (r) => r.session === s,
      });
    }

    const TREND_RU: Record<string, string> = {
      trend_up: 'в восходящем тренде 4H',
      trend_down: 'в нисходящем тренде 4H',
      range: 'в боковике 4H',
    };
    for (const t of Object.keys(TREND_RU)) {
      list.push({
        key: `trend4h:${t}`,
        group: 'context',
        kind: 'trend4h',
        params: { trend: t },
        label: `Входы ${TREND_RU[t]}`,
        advice: 'Не торговать этот режим рынка.',
        lab: { trend4h: t },
        test: (r) => (r.ctx?.trend4h == null ? null : r.ctx.trend4h === t),
      });
    }

    list.push(
      {
        key: 'ema200:above',
        group: 'context',
        kind: 'ema200',
        params: { side: 'above' },
        label: 'Входы выше EMA200 (1H)',
        advice: 'Проверить направление относительно EMA200.',
        lab: { ema200: 'above' },
        test: (r) => (r.ctx?.ema200Above == null ? null : r.ctx.ema200Above),
      },
      {
        key: 'ema200:below',
        group: 'context',
        kind: 'ema200',
        params: { side: 'below' },
        label: 'Входы ниже EMA200 (1H)',
        advice: 'Проверить направление относительно EMA200.',
        lab: { ema200: 'below' },
        test: (r) => (r.ctx?.ema200Above == null ? null : !r.ctx.ema200Above),
      },
      {
        key: 'atr:high',
        group: 'context',
        kind: 'atr',
        params: { level: 'high' },
        label: 'Входы на повышенной волатильности',
        advice: 'Уменьшать размер на высоком ATR.',
        lab: { atr: 'high' },
        test: (r) =>
          medAtr == null || r.ctx?.atrPct == null ? null : r.ctx.atrPct >= medAtr,
      },
      {
        key: 'atr:low',
        group: 'context',
        kind: 'atr',
        params: { level: 'low' },
        label: 'Входы на низкой волатильности',
        advice: 'Пропускать вялый рынок.',
        lab: { atr: 'low' },
        test: (r) => (medAtr == null || r.ctx?.atrPct == null ? null : r.ctx.atrPct < medAtr),
      },
      {
        key: 'vol:high',
        group: 'context',
        kind: 'vol',
        params: { level: 'high' },
        label: 'Входы на всплеске объёма',
        advice: 'Проверить, не входите ли в кульминацию движения.',
        lab: { vol: 'high' },
        test: (r) => (medVol == null || r.ctx?.volRel == null ? null : r.ctx.volRel >= medVol),
      },
      {
        key: 'vol:low',
        group: 'context',
        kind: 'vol',
        params: { level: 'low' },
        label: 'Входы на низком объёме',
        advice: 'Требовать подтверждения объёмом.',
        lab: { vol: 'low' },
        test: (r) => (medVol == null || r.ctx?.volRel == null ? null : r.ctx.volRel < medVol),
      },
    );

    const RANGE_RU: Record<string, string> = {
      low: 'у нижней границы диапазона 4H',
      mid: 'в середине диапазона 4H',
      high: 'у верхней границы диапазона 4H',
    };
    for (const b of ['low', 'mid', 'high']) {
      list.push({
        key: `range4h:${b}`,
        group: 'context',
        kind: 'range4h',
        params: { bucket: b },
        label: `Входы ${RANGE_RU[b]}`,
        advice: 'Дождаться возврата в свою зону диапазона.',
        lab: { rangeTf: '4h', range: b },
        test: (r) => {
          const v = r.ctx ? storedRangePos(r.ctx, '4h') : null;
          if (v == null) return null;
          return (v < 33 ? 'low' : v < 66 ? 'mid' : 'high') === b;
        },
      });
    }

    // Теги и символы — только те, где среза вообще хватает на проверку.
    const tagNames = new Map<string, string>();
    const tagCount = new Map<string, number>();
    const symCount = new Map<string, number>();
    for (const r of rows) {
      for (const t of r.tags) {
        tagNames.set(t.id, t.name);
        tagCount.set(t.id, (tagCount.get(t.id) ?? 0) + 1);
      }
      symCount.set(r.symbol, (symCount.get(r.symbol) ?? 0) + 1);
    }
    for (const [id, n] of tagCount) {
      if (n < MIN_SEGMENT) continue;
      list.push({
        key: `tag:${id}`,
        group: 'tag',
        kind: 'tag',
        params: { tagName: tagNames.get(id) ?? '' },
        label: `Сделки с тегом «${tagNames.get(id)}»`,
        advice: 'Пересмотреть или отказаться от этого сетапа.',
        lab: { tags: id },
        test: (r) => r.tagSet.has(id),
      });
    }
    for (const [sym, n] of symCount) {
      if (n < MIN_SEGMENT) continue;
      list.push({
        key: `symbol:${sym}`,
        group: 'symbol',
        kind: 'symbol',
        params: { symbol: sym },
        label: `Сделки по ${sym}`,
        advice: 'Убрать инструмент из списка или пересмотреть подход к нему.',
        lab: { symbols: sym },
        test: (r) => r.symbol === sym,
      });
    }

    return list;
  }
```

- [x] **Step 5: Перенести `kind`/`params` в `evaluate()`**

В том же файле, в методе `private evaluate(...)`, в объекте, который он возвращает (сейчас строки ~511-530), добавить два поля сразу после `group: c.group,`:

```ts
    return {
      key: c.key,
      group: c.group,
      kind: c.kind,
      params: c.params,
      label: c.label,
      advice: c.advice,
      n: S.length,
      nRest: R.length,
      avgPnl: round(avgS),
      avgRest: round(avgR),
      lift: round(lift),
      cost: round(cost),
      absolute: round(-sp.reduce((a, b) => a + b, 0)),
      winRate: round(winRate(sp), 1),
      winRateRest: round(winRate(rp), 1),
      p: round(p, 4),
      confidence: 'likely',
      outlierSafe,
      oos: this.outOfSample(S, R, lift),
      lab: c.lab,
    };
```

- [x] **Step 6: Запустить тест и убедиться, что он проходит**

Run: `cd backend && npx jest habits.service.spec`
Expected: PASS — все `it(...)` из Step 1 зелёные.

- [x] **Step 7: Прогнать полный набор тестов бэкенда — не сломалось ли что-то ещё**

Run: `cd backend && npx jest`
Expected: PASS (в частности `trade-sync.stoploss.spec.ts` не задет этими правками).

- [x] **Step 8: Commit**

```bash
git add backend/src/trades/habits.service.ts backend/src/trades/habits.service.spec.ts
git commit -m "feat(habits): kind и params для привычек на бэкенде"
```

---

## Task 2: Фронтенд — типы, хук, словарь подписей

**Files:**
- Modify: `frontend/src/entities/trade/api/types.ts` (добавить типы в конец файла)
- Modify: `frontend/src/entities/trade/api/hooks.ts` (добавить `useHabits`)
- Create: `frontend/src/views/overview/lib/habit-labels.ts`
- Test: `frontend/src/views/overview/lib/habit-labels.test.ts`
- Modify: `frontend/src/shared/i18n/messages/ru.json`, `frontend/src/shared/i18n/messages/en.json`

**Interfaces:**
- Consumes: ничего нового с бэкенда, кроме формы ответа `/api/trades/habits` из Task 1 (`Habit.kind`, `Habit.params`).
- Produces: `Habit`, `HabitKind`, `HabitsResponse` из `@/entities/trade`; `useHabits(params?: { days?: number })` из `@/entities/trade`; `habitLabel(h: Habit, t: TFunc): string`, `habitAdvice(h: Habit, t: TFunc): string`, `habitSearchParams(lab: Record<string,string>|null): string | null`, `type TFunc` из `frontend/src/views/overview/lib/habit-labels.ts` — этими именами их использует Task 4.

- [x] **Step 1: Добавить типы `Habit`/`HabitKind`/`HabitsResponse`**

В конец `frontend/src/entities/trade/api/types.ts` дописать:

```ts
// ── Habits: диагностика поведения без тегов ("Цена привычек") ──
export type HabitKind =
  | 'tilt'
  | 'overtrading'
  | 'size_up'
  | 'size_up_after_loss'
  | 'hold_long'
  | 'dir'
  | 'hour'
  | 'weekday'
  | 'session'
  | 'trend4h'
  | 'ema200'
  | 'atr'
  | 'vol'
  | 'range4h'
  | 'tag'
  | 'symbol';

export interface Habit {
  key: string;
  group: 'behaviour' | 'time' | 'context' | 'tag' | 'symbol';
  kind: HabitKind;
  params: Record<string, string | number>;
  // Сырые русские текст с бэкенда — запасной вариант для незнакомого kind,
  // см. habit-labels.ts.
  label: string;
  advice: string;
  n: number;
  nRest: number;
  avgPnl: number;
  avgRest: number;
  lift: number;
  cost: number;
  absolute: number;
  winRate: number;
  winRateRest: number;
  p: number;
  confidence: 'confirmed' | 'likely';
  outlierSafe: boolean;
  oos: 'pass' | 'fail' | 'na';
  // Query-параметры /api/trades/lab — открывают этот срез в Аналитике. null у
  // поведенческих привычек (tilt/overtrading/…) — там нечего фильтровать.
  lab: Record<string, string> | null;
}

export interface HabitsResponse {
  success: boolean;
  status: 'need_more' | 'ok';
  positions: number;
  need?: number; // только при status: 'need_more'
  tested?: number; // только при status: 'ok'
  totalCost: number;
  habits: Habit[];
  edges: Habit[];
  all: Habit[];
}
```

- [x] **Step 2: Добавить `useHabits`**

В `frontend/src/entities/trade/api/hooks.ts` расширить импорт типов и дописать хук после `useTimeStats`:

```ts
import type {
  EquityPoint,
  HabitsResponse,
  TimeStatsResponse,
  TradeStats,
  TradesPage,
} from './types';
```

```ts
export const useHabits = (params?: { days?: number }) =>
  useQuery({
    queryKey: ['habits', params?.days ?? 0],
    queryFn: () =>
      apiJson<HabitsResponse>(
        `/api/trades/habits${qs({
          days: params?.days || undefined,
          tz: new Date().getTimezoneOffset(),
        })}`,
      ),
    ...LIVE,
  });
```

- [x] **Step 3: Написать падающий тест словаря подписей**

Создать `frontend/src/views/overview/lib/habit-labels.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { habitAdvice, habitLabel, habitSearchParams } from './habit-labels';
import type { Habit } from '@/entities/trade';

// Фейковый t(): возвращает сам ключ (плюс JSON подставленных значений) — тест
// проверяет, какой ключ и с какими params выбрала функция, а не текст
// перевода из каталога (его сверяет messages.test.ts).
const t = (key: string, values?: Record<string, string | number>) =>
  values ? `${key}:${JSON.stringify(values)}` : key;

function makeHabit(overrides: Partial<Habit>): Habit {
  return {
    key: 'k',
    group: 'behaviour',
    kind: 'tilt',
    params: {},
    label: 'RAW_LABEL',
    advice: 'RAW_ADVICE',
    n: 20,
    nRest: 40,
    avgPnl: -10,
    avgRest: 5,
    lift: -15,
    cost: -150,
    absolute: 150,
    winRate: 30,
    winRateRest: 50,
    p: 0.01,
    confidence: 'confirmed',
    outlierSafe: true,
    oos: 'pass',
    lab: null,
    ...overrides,
  };
}

describe('habitLabel', () => {
  it('tilt — без параметров', () => {
    expect(habitLabel(makeHabit({ kind: 'tilt' }), t)).toBe('habitLabelTilt');
  });

  it('overtrading — подставляет nth', () => {
    const h = makeHabit({ kind: 'overtrading', params: { nth: 3, limit: 2 } });
    expect(habitLabel(h, t)).toBe('habitLabelOvertrading:{"nth":3}');
  });

  it('size_up — подставляет mult', () => {
    const h = makeHabit({ kind: 'size_up', params: { mult: 1.5 } });
    expect(habitLabel(h, t)).toBe('habitLabelSizeUp:{"mult":1.5}');
  });

  it('dir long/short — разные ключи на одном kind', () => {
    expect(habitLabel(makeHabit({ kind: 'dir', params: { direction: 'long' } }), t)).toBe('habitLabelDirLong');
    expect(habitLabel(makeHabit({ kind: 'dir', params: { direction: 'short' } }), t)).toBe('habitLabelDirShort');
  });

  it('dir — незнакомое значение направления откатывается на сырой label', () => {
    const h = makeHabit({ kind: 'dir', params: { direction: 'sideways' }, label: 'RAW_LABEL' });
    expect(habitLabel(h, t)).toBe('RAW_LABEL');
  });

  it('hour — часы дополняются нулём слева', () => {
    const h = makeHabit({ kind: 'hour', params: { hourFrom: 8, hourTo: 11 } });
    expect(habitLabel(h, t)).toBe('habitLabelHour:{"hourFrom":"08","hourTo":"11"}');
  });

  it('weekday — индекс выбирает один из семи ключей', () => {
    expect(habitLabel(makeHabit({ kind: 'weekday', params: { weekday: 0 } }), t)).toBe('habitLabelWeekday0');
    expect(habitLabel(makeHabit({ kind: 'weekday', params: { weekday: 6 } }), t)).toBe('habitLabelWeekday6');
  });

  it('session — по имени сессии', () => {
    expect(habitLabel(makeHabit({ kind: 'session', params: { session: 'london' } }), t)).toBe(
      'habitLabelSessionLondon',
    );
  });

  it('trend4h — по режиму тренда', () => {
    expect(habitLabel(makeHabit({ kind: 'trend4h', params: { trend: 'trend_up' } }), t)).toBe('habitLabelTrendUp');
  });

  it('ema200 — above/below', () => {
    expect(habitLabel(makeHabit({ kind: 'ema200', params: { side: 'above' } }), t)).toBe('habitLabelEma200Above');
    expect(habitLabel(makeHabit({ kind: 'ema200', params: { side: 'below' } }), t)).toBe('habitLabelEma200Below');
  });

  it('atr — high/low', () => {
    expect(habitLabel(makeHabit({ kind: 'atr', params: { level: 'high' } }), t)).toBe('habitLabelAtrHigh');
    expect(habitLabel(makeHabit({ kind: 'atr', params: { level: 'low' } }), t)).toBe('habitLabelAtrLow');
  });

  it('vol — high/low', () => {
    expect(habitLabel(makeHabit({ kind: 'vol', params: { level: 'high' } }), t)).toBe('habitLabelVolHigh');
    expect(habitLabel(makeHabit({ kind: 'vol', params: { level: 'low' } }), t)).toBe('habitLabelVolLow');
  });

  it('range4h — low/mid/high', () => {
    expect(habitLabel(makeHabit({ kind: 'range4h', params: { bucket: 'mid' } }), t)).toBe('habitLabelRange4hMid');
  });

  it('tag — подставляет имя тега', () => {
    const h = makeHabit({ kind: 'tag', params: { tagName: 'Пробой' } });
    expect(habitLabel(h, t)).toBe('habitLabelTag:{"tagName":"Пробой"}');
  });

  it('symbol — подставляет тикер', () => {
    const h = makeHabit({ kind: 'symbol', params: { symbol: 'BTCUSDT' } });
    expect(habitLabel(h, t)).toBe('habitLabelSymbol:{"symbol":"BTCUSDT"}');
  });

  it('незнакомый kind откатывается на сырой label с бэкенда', () => {
    const h = makeHabit({ kind: 'future_kind' as unknown as Habit['kind'], label: 'RAW_LABEL' });
    expect(habitLabel(h, t)).toBe('RAW_LABEL');
  });
});

describe('habitAdvice', () => {
  it('overtrading — подставляет limit, а не nth', () => {
    const h = makeHabit({ kind: 'overtrading', params: { nth: 3, limit: 2 } });
    expect(habitAdvice(h, t)).toBe('habitAdviceOvertrading:{"limit":2}');
  });

  it('atr high/low — разные советы', () => {
    expect(habitAdvice(makeHabit({ kind: 'atr', params: { level: 'high' } }), t)).toBe('habitAdviceAtrHigh');
    expect(habitAdvice(makeHabit({ kind: 'atr', params: { level: 'low' } }), t)).toBe('habitAdviceAtrLow');
  });

  it('ema200 above/below — общий совет на оба', () => {
    expect(habitAdvice(makeHabit({ kind: 'ema200', params: { side: 'above' } }), t)).toBe('habitAdviceEma200');
    expect(habitAdvice(makeHabit({ kind: 'ema200', params: { side: 'below' } }), t)).toBe('habitAdviceEma200');
  });

  it('незнакомый kind откатывается на сырой advice с бэкенда', () => {
    const h = makeHabit({ kind: 'future_kind' as unknown as Habit['kind'], advice: 'RAW_ADVICE' });
    expect(habitAdvice(h, t)).toBe('RAW_ADVICE');
  });
});

describe('habitSearchParams', () => {
  it('null lab — не кликабельно', () => {
    expect(habitSearchParams(null)).toBeNull();
  });

  it('сериализует словарь lab как query-строку', () => {
    expect(habitSearchParams({ direction: 'long' })).toBe('direction=long');
  });

  it('сохраняет все ключи многосоставного словаря (range4h)', () => {
    const qs = habitSearchParams({ rangeTf: '4h', range: 'low' });
    const params = new URLSearchParams(qs ?? '');
    expect(params.get('rangeTf')).toBe('4h');
    expect(params.get('range')).toBe('low');
  });
});
```

- [x] **Step 4: Запустить тест и убедиться, что он падает**

Run: `cd frontend && npx vitest run src/views/overview/lib/habit-labels.test.ts`
Expected: FAIL — `Cannot find module './habit-labels'` (файл ещё не создан).

- [x] **Step 5: Написать `habit-labels.ts`**

Создать `frontend/src/views/overview/lib/habit-labels.ts`:

```ts
import type { Habit } from '@/entities/trade';

export type TFunc = (key: string, values?: Record<string, string | number>) => string;

const pad2 = (n: number) => String(n).padStart(2, '0');

const DIR_LABEL_KEYS: Record<string, string> = { long: 'habitLabelDirLong', short: 'habitLabelDirShort' };
const DIR_ADVICE_KEYS: Record<string, string> = { long: 'habitAdviceDirLong', short: 'habitAdviceDirShort' };
const WEEKDAY_LABEL_KEYS = [
  'habitLabelWeekday0',
  'habitLabelWeekday1',
  'habitLabelWeekday2',
  'habitLabelWeekday3',
  'habitLabelWeekday4',
  'habitLabelWeekday5',
  'habitLabelWeekday6',
];
const SESSION_LABEL_KEYS: Record<string, string> = {
  asia: 'habitLabelSessionAsia',
  london: 'habitLabelSessionLondon',
  ny: 'habitLabelSessionNy',
  night: 'habitLabelSessionNight',
};
const TREND_LABEL_KEYS: Record<string, string> = {
  trend_up: 'habitLabelTrendUp',
  trend_down: 'habitLabelTrendDown',
  range: 'habitLabelTrendRange',
};
const EMA200_LABEL_KEYS: Record<string, string> = { above: 'habitLabelEma200Above', below: 'habitLabelEma200Below' };
const ATR_LABEL_KEYS: Record<string, string> = { high: 'habitLabelAtrHigh', low: 'habitLabelAtrLow' };
const ATR_ADVICE_KEYS: Record<string, string> = { high: 'habitAdviceAtrHigh', low: 'habitAdviceAtrLow' };
const VOL_LABEL_KEYS: Record<string, string> = { high: 'habitLabelVolHigh', low: 'habitLabelVolLow' };
const VOL_ADVICE_KEYS: Record<string, string> = { high: 'habitAdviceVolHigh', low: 'habitAdviceVolLow' };
const RANGE_LABEL_KEYS: Record<string, string> = {
  low: 'habitLabelRange4hLow',
  mid: 'habitLabelRange4hMid',
  high: 'habitLabelRange4hHigh',
};

/**
 * Подпись привычки на языке интерфейса. Незнакомый `kind` (новый бэкенд
 * поверх старого фронта или наоборот) откатывается на сырой `label` с
 * бэкенда напрямую, БЕЗ похода в `t()` — это уже готовый текст, а не ключ
 * перевода. Тот же принцип, что был в удалённом `metric-labels.ts`: лучше
 * нелокализованная строка, чем пустое место.
 */
export function habitLabel(h: Habit, t: TFunc): string {
  const p = h.params;
  switch (h.kind) {
    case 'tilt':
      return t('habitLabelTilt');
    case 'overtrading':
      return t('habitLabelOvertrading', { nth: p.nth });
    case 'size_up':
      return t('habitLabelSizeUp', { mult: p.mult });
    case 'size_up_after_loss':
      return t('habitLabelSizeUpAfterLoss');
    case 'hold_long':
      return t('habitLabelHoldLong');
    case 'dir': {
      const key = DIR_LABEL_KEYS[String(p.direction)];
      return key ? t(key) : h.label;
    }
    case 'hour':
      return t('habitLabelHour', { hourFrom: pad2(Number(p.hourFrom)), hourTo: pad2(Number(p.hourTo)) });
    case 'weekday': {
      const key = WEEKDAY_LABEL_KEYS[Number(p.weekday)];
      return key ? t(key) : h.label;
    }
    case 'session': {
      const key = SESSION_LABEL_KEYS[String(p.session)];
      return key ? t(key) : h.label;
    }
    case 'trend4h': {
      const key = TREND_LABEL_KEYS[String(p.trend)];
      return key ? t(key) : h.label;
    }
    case 'ema200': {
      const key = EMA200_LABEL_KEYS[String(p.side)];
      return key ? t(key) : h.label;
    }
    case 'atr': {
      const key = ATR_LABEL_KEYS[String(p.level)];
      return key ? t(key) : h.label;
    }
    case 'vol': {
      const key = VOL_LABEL_KEYS[String(p.level)];
      return key ? t(key) : h.label;
    }
    case 'range4h': {
      const key = RANGE_LABEL_KEYS[String(p.bucket)];
      return key ? t(key) : h.label;
    }
    case 'tag':
      return t('habitLabelTag', { tagName: String(p.tagName) });
    case 'symbol':
      return t('habitLabelSymbol', { symbol: String(p.symbol) });
    default:
      return h.label;
  }
}

/** Совет привычки — тот же принцип отката, что у `habitLabel`. */
export function habitAdvice(h: Habit, t: TFunc): string {
  const p = h.params;
  switch (h.kind) {
    case 'tilt':
      return t('habitAdviceTilt');
    case 'overtrading':
      return t('habitAdviceOvertrading', { limit: p.limit });
    case 'size_up':
      return t('habitAdviceSizeUp');
    case 'size_up_after_loss':
      return t('habitAdviceSizeUpAfterLoss');
    case 'hold_long':
      return t('habitAdviceHoldLong');
    case 'dir': {
      const key = DIR_ADVICE_KEYS[String(p.direction)];
      return key ? t(key) : h.advice;
    }
    case 'hour':
      return t('habitAdviceHour');
    case 'weekday':
      return t('habitAdviceWeekday');
    case 'session':
      return t('habitAdviceSession');
    case 'trend4h':
      return t('habitAdviceTrend4h');
    case 'ema200':
      return t('habitAdviceEma200');
    case 'atr': {
      const key = ATR_ADVICE_KEYS[String(p.level)];
      return key ? t(key) : h.advice;
    }
    case 'vol': {
      const key = VOL_ADVICE_KEYS[String(p.level)];
      return key ? t(key) : h.advice;
    }
    case 'range4h':
      return t('habitAdviceRange4h');
    case 'tag':
      return t('habitAdviceTag');
    case 'symbol':
      return t('habitAdviceSymbol');
    default:
      return h.advice;
  }
}

/**
 * Ссылка-дрилдаун в Аналитику: `lab` уже несёт query-параметры с теми же
 * именами, которых ждёт `useLab` (см. views/analytics/api/hooks.ts) — здесь
 * достаточно сериализовать словарь как есть. `null` — у поведенческих
 * привычек (tilt/overtrading/size_up/size_up_after_loss/hold_long), для них
 * строка на Обзоре не кликабельна: там нет измерения «Аналитики», в которое
 * можно провалиться.
 */
export function habitSearchParams(lab: Record<string, string> | null): string | null {
  if (!lab) return null;
  return new URLSearchParams(lab).toString();
}
```

- [x] **Step 6: Запустить тест и убедиться, что он проходит**

Run: `cd frontend && npx vitest run src/views/overview/lib/habit-labels.test.ts`
Expected: PASS — все `it(...)` зелёные.

- [x] **Step 7: Добавить переводы в оба каталога**

В `frontend/src/shared/i18n/messages/ru.json`, внутри объекта `"overview": { ... }`, найти последнюю строку `"rangeTfAllTitle": "Все три горизонта"` и заменить на неё же с запятой в конце плюс новый блок перед закрывающей `}`:

```json
    "rangeTfAllTitle": "Все три горизонта",
    "habitLabelTilt": "Вход в течение часа после убытка",
    "habitAdviceTilt": "Пауза 60 минут после убыточной сделки.",
    "habitLabelOvertrading": "{nth}-я и следующие сделки за день",
    "habitAdviceOvertrading": "Лимит {limit} сделки в день.",
    "habitLabelSizeUp": "Вход крупнее обычного (от {mult}× медианы)",
    "habitAdviceSizeUp": "Фиксированный размер позиции.",
    "habitLabelSizeUpAfterLoss": "Увеличенный вход сразу после убытка",
    "habitAdviceSizeUpAfterLoss": "Никогда не повышать размер на просадке.",
    "habitLabelHoldLong": "Позиции, которые держал дольше обычного",
    "habitAdviceHoldLong": "Ограничить время в позиции.",
    "habitLabelDirLong": "Лонги",
    "habitAdviceDirLong": "Сравнить с шортами в «Аналитике».",
    "habitLabelDirShort": "Шорты",
    "habitAdviceDirShort": "Сравнить с лонгами в «Аналитике».",
    "habitLabelHour": "Входы {hourFrom}:00–{hourTo}:59",
    "habitAdviceHour": "Не открывать в этом окне.",
    "habitLabelWeekday0": "Входы по воскресеньям",
    "habitLabelWeekday1": "Входы по понедельникам",
    "habitLabelWeekday2": "Входы по вторникам",
    "habitLabelWeekday3": "Входы по средам",
    "habitLabelWeekday4": "Входы по четвергам",
    "habitLabelWeekday5": "Входы по пятницам",
    "habitLabelWeekday6": "Входы по субботам",
    "habitAdviceWeekday": "Проверить, что в этот день меняется в подходе.",
    "habitLabelSessionAsia": "Входы в азиатскую сессию",
    "habitLabelSessionLondon": "Входы в лондонскую сессию",
    "habitLabelSessionNy": "Входы в сессию Нью-Йорка",
    "habitLabelSessionNight": "Входы в ночь (21–24 UTC)",
    "habitAdviceSession": "Сместить активность на другую сессию.",
    "habitLabelTrendUp": "Входы в восходящем тренде 4H",
    "habitLabelTrendDown": "Входы в нисходящем тренде 4H",
    "habitLabelTrendRange": "Входы в боковике 4H",
    "habitAdviceTrend4h": "Не торговать этот режим рынка.",
    "habitLabelEma200Above": "Входы выше EMA200 (1H)",
    "habitLabelEma200Below": "Входы ниже EMA200 (1H)",
    "habitAdviceEma200": "Проверить направление относительно EMA200.",
    "habitLabelAtrHigh": "Входы на повышенной волатильности",
    "habitAdviceAtrHigh": "Уменьшать размер на высоком ATR.",
    "habitLabelAtrLow": "Входы на низкой волатильности",
    "habitAdviceAtrLow": "Пропускать вялый рынок.",
    "habitLabelVolHigh": "Входы на всплеске объёма",
    "habitAdviceVolHigh": "Проверить, не входите ли в кульминацию движения.",
    "habitLabelVolLow": "Входы на низком объёме",
    "habitAdviceVolLow": "Требовать подтверждения объёмом.",
    "habitLabelRange4hLow": "Входы у нижней границы диапазона 4H",
    "habitLabelRange4hMid": "Входы в середине диапазона 4H",
    "habitLabelRange4hHigh": "Входы у верхней границы диапазона 4H",
    "habitAdviceRange4h": "Дождаться возврата в свою зону диапазона.",
    "habitLabelTag": "Сделки с тегом «{tagName}»",
    "habitAdviceTag": "Пересмотреть или отказаться от этого сетапа.",
    "habitLabelSymbol": "Сделки по {symbol}",
    "habitAdviceSymbol": "Убрать инструмент из списка или пересмотреть подход к нему."
```

В `frontend/src/shared/i18n/messages/en.json`, тем же способом, после `"rangeTfAllTitle": "All three horizons"`:

```json
    "rangeTfAllTitle": "All three horizons",
    "habitLabelTilt": "Entry within an hour of a loss",
    "habitAdviceTilt": "Pause 60 minutes after a losing trade.",
    "habitLabelOvertrading": "{nth}th and later trades of the day",
    "habitAdviceOvertrading": "Limit: {limit} trades a day.",
    "habitLabelSizeUp": "Larger-than-usual entry (from {mult}× median)",
    "habitAdviceSizeUp": "Fixed position size.",
    "habitLabelSizeUpAfterLoss": "Bigger entry right after a loss",
    "habitAdviceSizeUpAfterLoss": "Never size up during a drawdown.",
    "habitLabelHoldLong": "Positions held longer than usual",
    "habitAdviceHoldLong": "Cap time in the position.",
    "habitLabelDirLong": "Longs",
    "habitAdviceDirLong": "Compare with shorts in Analytics.",
    "habitLabelDirShort": "Shorts",
    "habitAdviceDirShort": "Compare with longs in Analytics.",
    "habitLabelHour": "Entries {hourFrom}:00–{hourTo}:59",
    "habitAdviceHour": "Don't open in this window.",
    "habitLabelWeekday0": "Entries on Sundays",
    "habitLabelWeekday1": "Entries on Mondays",
    "habitLabelWeekday2": "Entries on Tuesdays",
    "habitLabelWeekday3": "Entries on Wednesdays",
    "habitLabelWeekday4": "Entries on Thursdays",
    "habitLabelWeekday5": "Entries on Fridays",
    "habitLabelWeekday6": "Entries on Saturdays",
    "habitAdviceWeekday": "Check what's different about this day.",
    "habitLabelSessionAsia": "Entries in the Asia session",
    "habitLabelSessionLondon": "Entries in the London session",
    "habitLabelSessionNy": "Entries in the New York session",
    "habitLabelSessionNight": "Entries at night (21–24 UTC)",
    "habitAdviceSession": "Shift activity to another session.",
    "habitLabelTrendUp": "Entries in a 4H uptrend",
    "habitLabelTrendDown": "Entries in a 4H downtrend",
    "habitLabelTrendRange": "Entries in a 4H range",
    "habitAdviceTrend4h": "Don't trade this market regime.",
    "habitLabelEma200Above": "Entries above EMA200 (1H)",
    "habitLabelEma200Below": "Entries below EMA200 (1H)",
    "habitAdviceEma200": "Check direction relative to EMA200.",
    "habitLabelAtrHigh": "Entries in elevated volatility",
    "habitAdviceAtrHigh": "Reduce size on high ATR.",
    "habitLabelAtrLow": "Entries in low volatility",
    "habitAdviceAtrLow": "Skip a sluggish market.",
    "habitLabelVolHigh": "Entries on a volume spike",
    "habitAdviceVolHigh": "Check whether you're entering a blow-off move.",
    "habitLabelVolLow": "Entries on low volume",
    "habitAdviceVolLow": "Require volume confirmation.",
    "habitLabelRange4hLow": "Entries near the 4H range low",
    "habitLabelRange4hMid": "Entries mid-range (4H)",
    "habitLabelRange4hHigh": "Entries near the 4H range high",
    "habitAdviceRange4h": "Wait for price to return to your zone of the range.",
    "habitLabelTag": "Trades tagged “{tagName}”",
    "habitAdviceTag": "Revisit or drop this setup.",
    "habitLabelSymbol": "Trades on {symbol}",
    "habitAdviceSymbol": "Drop the instrument or rethink your approach to it."
```

- [x] **Step 8: Проверить, что каталоги остались в паре, и прогнать все фронтовые тесты**

Run: `cd frontend && npx vitest run`
Expected: PASS, включая `src/shared/i18n/messages.test.ts` (ключи en/ru совпадают) и новый `habit-labels.test.ts`.

- [x] **Step 9: Commit**

```bash
git add frontend/src/entities/trade/api/types.ts frontend/src/entities/trade/api/hooks.ts \
  frontend/src/views/overview/lib/habit-labels.ts frontend/src/views/overview/lib/habit-labels.test.ts \
  frontend/src/shared/i18n/messages/ru.json frontend/src/shared/i18n/messages/en.json
git commit -m "feat(habits): подписи и совет привычки на языке интерфейса"
```

---

## Task 3: Дрилдаун — `useLabFilters` читает query-строку

**Files:**
- Modify: `frontend/src/views/analytics/model/useLabFilters.ts` (весь файл)
- Modify: `frontend/src/app/(app)/analytics/page.tsx` (весь файл)

**Interfaces:**
- Consumes: `LabFilters`, `emptyLabFilters`, `RangeTf` из `../api/hooks` (уже существуют, без изменений).
- Produces: `useLabFilters()` возвращает то же самое, что и раньше (`{ filters, set, toggleMulti, toggleWeekday, toggleSingle, reset, activeCount }`) — сигнатура не меняется, меняется только то, чем инициализируется `filters` при первом рендере.

- [x] **Step 1: Переписать `useLabFilters.ts`**

Заменить весь файл `frontend/src/views/analytics/model/useLabFilters.ts` на:

```ts
'use client';

import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { emptyLabFilters, type LabFilters, type RangeTf } from '../api/hooks';

/** Множественные измерения: набор выбранных строковых значений. */
type MultiKey = 'tagIds' | 'symbols' | 'sessions' | 'trend4h';
/** Одиночные измерения: выбрано одно значение либо ничего. */
type SingleKey = 'direction' | 'ema200' | 'atr' | 'vol' | 'range';

const toggled = <T,>(list: T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

/** Сколько фильтров реально сужают выборку — цифра на кнопке «Сбросить». */
const countActive = (f: LabFilters) =>
  f.tagIds.length +
  f.symbols.length +
  f.weekdays.length +
  f.sessions.length +
  f.trend4h.length +
  (f.direction ? 1 : 0) +
  (f.ema200 ? 1 : 0) +
  (f.atr ? 1 : 0) +
  (f.vol ? 1 : 0) +
  // rangeTf не считаем: он лишь выбирает, какой ТФ читают чипы диапазона,
  // и сам по себе выборку не сужает.
  (f.range ? 1 : 0) +
  (f.hourFrom != null || f.hourTo != null ? 1 : 0);

/**
 * Начальные фильтры из query-строки — дрилдаун из «Цены привычек» на Обзоре
 * (см. `overview/lib/habit-labels.ts`, `habitSearchParams`) кладёт туда те же
 * имена, которых ждёт `useLab` (см. `../api/hooks.ts`). Единственное
 * расхождение имён — `tags` в query против `tagIds` в `LabFilters`.
 */
function filtersFromSearchParams(sp: URLSearchParams): LabFilters {
  const base = emptyLabFilters(0);
  const str = (key: string) => sp.get(key) ?? undefined;
  const csv = (key: string) => {
    const v = sp.get(key);
    return v ? v.split(',') : [];
  };
  const num = (key: string) => {
    const v = sp.get(key);
    return v != null && v !== '' ? Number(v) : undefined;
  };
  return {
    ...base,
    tagIds: csv('tags'),
    symbols: csv('symbols'),
    weekdays: csv('weekdays').map(Number),
    sessions: csv('sessions'),
    trend4h: csv('trend4h'),
    direction: str('direction') as LabFilters['direction'],
    hourFrom: num('hourFrom'),
    hourTo: num('hourTo'),
    ema200: str('ema200') as LabFilters['ema200'],
    atr: str('atr') as LabFilters['atr'],
    vol: str('vol') as LabFilters['vol'],
    rangeTf: (str('rangeTf') as RangeTf | undefined) ?? base.rangeTf,
    range: str('range') as LabFilters['range'],
  };
}

/**
 * Состояние фильтров Аналитики и все способы его менять. Отделено от
 * разметки: у страницы одна причина меняться (как это выглядит), у этого хука
 * другая (что значит «переключить измерение»).
 *
 * `days` здесь всегда 0 — период живёт в usePeriodFilter и подставляется
 * перед запросом, чтобы не заводить второй источник истины.
 *
 * Начальное состояние читается из query-строки один раз при маунте (лениво,
 * через `useState(() => ...)`) — переход по ссылке из привычки Обзора этим и
 * работает. Дальнейшие правки URL руками фильтры не меняют: это не
 * двусторонняя синхронизация, а разовая точка входа.
 */
export function useLabFilters() {
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<LabFilters>(() => filtersFromSearchParams(searchParams));
  const set = (patch: Partial<LabFilters>) => setFilters((f) => ({ ...f, ...patch }));

  return {
    filters,
    set,
    /** Множественный выбор: клик добавляет значение либо убирает его. */
    toggleMulti: (key: MultiKey, value: string) =>
      set({ [key]: toggled(filters[key], value) } as Partial<LabFilters>),
    toggleWeekday: (day: number) => set({ weekdays: toggled(filters.weekdays, day) }),
    /** Одиночный выбор: клик по уже выбранному значению снимает фильтр. */
    toggleSingle: <K extends SingleKey>(key: K, value: LabFilters[K]) =>
      set({ [key]: filters[key] === value ? undefined : value } as Partial<LabFilters>),
    // rangeTf переживает сброс: это не фильтр, а выбор шкалы, на которую
    // смотришь — сбрасывать его вместе с фильтрами было бы неожиданно.
    reset: () => setFilters((f) => ({ ...emptyLabFilters(0), rangeTf: f.rangeTf })),
    activeCount: countActive(filters),
  };
}

export type LabFiltersState = ReturnType<typeof useLabFilters>;
```

(Изменения относительно текущего файла: импорт `useSearchParams` и `RangeTf`, новая функция `filtersFromSearchParams`, и `useState<LabFilters>(() => emptyLabFilters(0))` → `useState<LabFilters>(() => filtersFromSearchParams(searchParams))`. Всё остальное — дословно как было.)

- [x] **Step 2: Обернуть роут в `Suspense`**

`useSearchParams()` — клиентский хук Next; без `Suspense` вокруг компонента, который его вызывает, маршрут не собирается статически (`next build` останавливается на «useSearchParams() should be wrapped in a suspense boundary»). Заменить весь файл `frontend/src/app/(app)/analytics/page.tsx` на:

```tsx
import { Suspense } from 'react';
import { AnalyticsPage } from '@/views/analytics/Page';

/**
 * Аналитика — /analytics (была «Выборка» на /lab)
 *
 * Файл роута — только объявление адреса. Сама страница живёт в слое `views`
 * (`src/views`, не `src/pages`: `src/pages` — служебный каталог Pages Router,
 * и Next пытался бы собрать каждый файл оттуда как отдельный роут).
 *
 * Suspense здесь — не состояние ожидания (useLabFilters читает URL синхронно
 * на клиенте, реального асинхронного разрыва нет), а требование Next:
 * маршрут с useSearchParams вне Suspense не собирается статически. fallback
 * пустой — ждать нечего.
 */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <AnalyticsPage />
    </Suspense>
  );
}
```

- [x] **Step 3: Собрать фронтенд и убедиться, что билд проходит**

Run: `cd frontend && npx next build`
Expected: PASS, без предупреждения про `useSearchParams()`/Suspense на `/analytics`.

- [x] **Step 4: Ручная проверка дрилдауна**

Run: `cd frontend && npm run dev` (или использовать уже поднятый dev-сервер), открыть в браузере `http://localhost:8090/analytics?direction=long&hourFrom=8&hourTo=11`.
Expected: на странице Аналитики сразу активен фильтр «Long» и диапазон часов 8–11 — то же самое, как если бы их выставили руками через `LabFilters`. Остановить dev-сервер после проверки.

- [x] **Step 5: Commit**

```bash
git add frontend/src/views/analytics/model/useLabFilters.ts "frontend/src/app/(app)/analytics/page.tsx"
git commit -m "feat(analytics): читать фильтры из query-строки при маунте"
```

---

## Task 4: Блок «Цена привычек» на Обзоре

**Files:**
- Modify: `frontend/src/app/globals.css` (новая секция стилей)
- Create: `frontend/src/views/overview/components/HabitsBlock.tsx`
- Modify: `frontend/src/views/overview/Page.tsx`
- Modify: `frontend/src/shared/i18n/messages/ru.json`, `frontend/src/shared/i18n/messages/en.json` (ключи хрома блока)

**Interfaces:**
- Consumes: `useHabits`, `Habit`, `HabitsResponse` из `@/entities/trade` (Task 2); `habitLabel`, `habitAdvice`, `habitSearchParams`, `TFunc` из `../lib/habit-labels` (Task 2).
- Produces: `HabitsBlock({ data, isLoading }: { data?: HabitsResponse; isLoading: boolean })` — используется только в `overview/Page.tsx`, наружу из `views/overview` не отдаётся (см. правило CLAUDE.md про `widgets/` — блок одной страницы живёт в `views/<page>/components/`).

- [x] **Step 1: Добавить CSS**

В `frontend/src/app/globals.css` найти строку `/* ═══════════════ ДОВЕРИТЕЛЬНАЯ ШКАЛА ═══════════════ */` (идёт сразу после правила `.hrs-x span { ... }`) и вставить перед ней новую секцию:

```css
  /* ═══════════════ ПРИВЫЧКИ ═══════════════ */
  .habits-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--s3);
  }
  .habit-group {
    margin-top: var(--s3);
  }
  .habit-group h3 {
    font-family: var(--font-mono);
    font-size: var(--t-xs);
    text-transform: uppercase;
    letter-spacing: 0.14em;
    color: var(--ink-3);
    font-weight: 400;
    margin-bottom: var(--s2);
  }
  .habit-list {
    display: flex;
    flex-direction: column;
  }
  .habit-row {
    display: grid;
    grid-template-columns: 10px minmax(0, 1fr) minmax(84px, auto) minmax(104px, auto);
    align-items: center;
    gap: var(--s3);
    min-height: 44px;
    border-bottom: 1px solid var(--hair);
    color: inherit;
    text-decoration: none;
  }
  .habit-row-link:hover .habit-label-text {
    text-decoration: underline;
  }
  .habit-conf {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex: none;
  }
  /* confirmed — сплошная точка; likely — приглушённый пунктирный контур:
     форма несёт разницу, а не только title-подсказка. */
  .habit-conf-confirmed {
    background: var(--ink);
  }
  .habit-conf-likely {
    background: transparent;
    border: 1px dashed var(--ink-3);
  }
  .habit-label {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .habit-advice {
    font-size: var(--t-xs);
    color: var(--ink-3);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .habit-cost {
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
    text-align: right;
    white-space: nowrap;
  }
  .habit-wr {
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
    font-size: var(--t-xs);
    color: var(--ink-2);
    text-align: right;
    white-space: nowrap;
  }

```

- [x] **Step 2: Добавить ключи хрома блока в оба каталога**

В `frontend/src/shared/i18n/messages/ru.json`, внутри `"overview"`, после последней добавленной в Task 2 строки (`"habitAdviceSymbol": "Убрать инструмент из списка или пересмотреть подход к нему."`) добавить запятую и:

```json
    "habitsTitle": "Цена привычек",
    "habitsNeedMoreTitle": "Нужно больше сделок",
    "habitsNeedMoreBody": "Сейчас {positions} из {need} — здесь появится статистика, когда наберётся достаточно.",
    "habitsNoneFound": "Пока не нашлось значимых закономерностей.",
    "habitsCostly": "Дорого стоило",
    "habitsWorking": "Работает",
    "habitsConfirmed": "подтверждено",
    "habitsLikely": "похоже на закономерность"
```

В `frontend/src/shared/i18n/messages/en.json`, тем же способом после `"habitAdviceSymbol": "Drop the instrument or rethink your approach to it."`:

```json
    "habitsTitle": "Cost of habits",
    "habitsNeedMoreTitle": "Need more trades",
    "habitsNeedMoreBody": "{positions} of {need} so far — stats will show up once there's enough.",
    "habitsNoneFound": "No significant patterns yet.",
    "habitsCostly": "Cost you",
    "habitsWorking": "Working for you",
    "habitsConfirmed": "confirmed",
    "habitsLikely": "looks like a pattern"
```

- [x] **Step 3: Написать `HabitsBlock.tsx`**

Создать `frontend/src/views/overview/components/HabitsBlock.tsx`:

```tsx
'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import type { Habit, HabitsResponse } from '@/entities/trade';
import { Money } from '@/shared/ui/Money';
import { EmptyState } from '@/shared/ui/EmptyState';
import { SkeletonLines } from '@/shared/ui/Skeleton';
import { habitAdvice, habitLabel, habitSearchParams, type TFunc } from '../lib/habit-labels';

/**
 * «Цена привычек»: то, что уже посчитано на бэкенде (HabitsService.scan) без
 * единого тега — отыгрыш, переторговка, время входа, контекст рынка — здесь
 * впервые доходит до пользователя. Место на Обзоре выбрано ровно за это:
 * первый экран, который видит человек, ещё не поставивший ни одного тега.
 *
 * Два списка, а не один: продукт ловит и на чём человек ошибается, и что он
 * делает правильно (CLAUDE.md) — «Работает» показывает подтверждённые плюсы
 * той же процедурой, что и «Дорого стоило» минусы.
 */
export function HabitsBlock({ data, isLoading }: { data?: HabitsResponse; isLoading: boolean }) {
  const t = useTranslations('overview');

  if (isLoading) {
    return (
      <div className="habits">
        <h2>{t('habitsTitle')}</h2>
        <SkeletonLines widths={[92, 78, 100, 64]} />
      </div>
    );
  }

  if (!data || data.status === 'need_more') {
    return (
      <div className="habits">
        <h2>{t('habitsTitle')}</h2>
        <EmptyState title={t('habitsNeedMoreTitle')}>
          {t('habitsNeedMoreBody', { positions: data?.positions ?? 0, need: data?.need ?? 0 })}
        </EmptyState>
      </div>
    );
  }

  const { habits, edges, totalCost } = data;
  const nothingFound = habits.length === 0 && edges.length === 0;

  return (
    <div className="habits">
      <div className="habits-head">
        <h2>{t('habitsTitle')}</h2>
        {totalCost !== 0 && <Money value={totalCost} large />}
      </div>

      {nothingFound ? (
        <p className="foot">{t('habitsNoneFound')}</p>
      ) : (
        <>
          {habits.length > 0 && (
            <div className="habit-group">
              <h3>{t('habitsCostly')}</h3>
              <HabitRows items={habits} t={t} />
            </div>
          )}
          {edges.length > 0 && (
            <div className="habit-group">
              <h3>{t('habitsWorking')}</h3>
              <HabitRows items={edges} t={t} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function HabitRows({ items, t }: { items: Habit[]; t: TFunc }) {
  return (
    <div className="habit-list">
      {items.map((h) => {
        const qs = habitSearchParams(h.lab);
        const content = (
          <>
            <span
              className={`habit-conf ${h.confidence === 'confirmed' ? 'habit-conf-confirmed' : 'habit-conf-likely'}`}
              title={h.confidence === 'confirmed' ? t('habitsConfirmed') : t('habitsLikely')}
            />
            <span className="habit-label">
              <span className="habit-label-text">{habitLabel(h, t)}</span>
              <span className="habit-advice">{habitAdvice(h, t)}</span>
            </span>
            <Money value={h.cost} className="habit-cost" />
            <span className="habit-wr">
              {h.winRate.toFixed(0)} % / {h.winRateRest.toFixed(0)} %
            </span>
          </>
        );
        return qs ? (
          <Link key={h.key} href={`/analytics?${qs}`} className="habit-row habit-row-link">
            {content}
          </Link>
        ) : (
          <div key={h.key} className="habit-row">
            {content}
          </div>
        );
      })}
    </div>
  );
}
```

Примечание: `useTranslations('overview')` из `next-intl` типом шире, чем `TFunc` (поддерживает больше, чем два параметра), но совместим по вызову — тот же приём уже работал в удалённом `metric-labels.ts` (`t: (key: string) => string`, вызывался с реальным `next-intl` `t`).

- [x] **Step 4: Подключить блок на Обзоре**

В `frontend/src/views/overview/Page.tsx` заменить существующую строку импорта

```ts
import { useTradeStats, useTimeStats, useTrades, type Trade } from '@/entities/trade';
```

на

```ts
import { useTradeStats, useTimeStats, useTrades, useHabits, type Trade } from '@/entities/trade';
```

и добавить рядом с остальными импортами компонентов новую строку:

```ts
import { HabitsBlock } from './components/HabitsBlock';
```

Заменить существующие две строки запросов

```ts
  const { data: statsData } = useTradeStats({ days: effectiveDays });
  const { data: timeData } = useTimeStats({ days: effectiveDays });
```

на те же две плюс новый запрос:

```ts
  const { data: statsData } = useTradeStats({ days: effectiveDays });
  const { data: timeData } = useTimeStats({ days: effectiveDays });
  const { data: habitsData, isLoading: habitsLoading } = useHabits({ days: effectiveDays });
```

Вставить блок между `<OpenPositions />` и секцией «по дням/часам» — заменить

```tsx
      <OpenPositions />

      <Wrap style={{ marginTop: 'var(--s5)' }}>
        <div className="asym">
```

на

```tsx
      <OpenPositions />

      <Wrap style={{ marginTop: 'var(--s5)' }}>
        <HabitsBlock data={habitsData} isLoading={habitsLoading && !habitsData} />
      </Wrap>

      <Wrap style={{ marginTop: 'var(--s5)' }}>
        <div className="asym">
```

- [x] **Step 5: Проверка типов фронтенда**

Run: `cd frontend && npx tsc --noEmit`
Expected: без ошибок.

- [x] **Step 6: Полная сборка фронтенда**

Run: `cd frontend && npx next build`
Expected: PASS, без ошибок и предупреждений про Suspense/useSearchParams на затронутых маршрутах.

- [x] **Step 7: Полный прогон тестов фронтенда**

Run: `cd frontend && npx vitest run`
Expected: PASS (messages.test.ts, habit-labels.test.ts и все прежние тесты).

- [x] **Step 8: Полный прогон бэкенда — контрольная проверка, что бэкенд не задет задачами 2-4**

Run: `cd backend && npx jest && npx nest build`
Expected: PASS.

- [x] **Step 9: Ручная проверка на живых данных**

Run: `cd frontend && npm run dev`, открыть `http://localhost:8090/overview`.
Expected: под открытыми позициями — блок «Цена привычек». Если сделок меньше 60 позиций — пустое состояние «Нужно больше сделок» с текущим/нужным числом; иначе — списки «Дорого стоило» / «Работает» (или заметка «Пока не нашлось значимых закономерностей», если оба пусты) с суммой в шапке. Клик по строке с фильтром (не по поведенческой) уводит в `/analytics` с применённым фильтром. Остановить dev-сервер после проверки.

- [x] **Step 10: Commit**

```bash
git add frontend/src/app/globals.css frontend/src/views/overview/components/HabitsBlock.tsx \
  frontend/src/views/overview/Page.tsx frontend/src/shared/i18n/messages/ru.json frontend/src/shared/i18n/messages/en.json
git commit -m "feat(habits): «Цена привычек» на Обзоре"
```

---

## Итог

После Task 4 фича целиком на месте: бэкенд размечает привычки видом и параметрами, фронтенд переводит их на язык интерфейса, блок на Обзоре показывает и «дорого стоило», и «работает» — до первого тега, и клик по любому фильтруемому срезу уводит в Аналитику с уже применёнными фильтрами.
