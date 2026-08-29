# Entry/exit Quality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Посчитать и показать пользователю качество входа/выхода каждой закрытой сделки — насколько цена входа/выхода была близка к лучшей возможной цене за время жизни самой сделки — в раскрытой строке журнала и агрегатом на Обзоре.

**Architecture:** Направленное переиспользование уже существующей `rangePos()`-математики, но с окном «от входа до выхода сделки», не «N свечей до входа». Отдельный, изолированный от рабочего `rangePos`/индикаторов проход в `TradeContextService`: свой батчинг свечей по (символ, интервал-по-длительности), свои два новых поля на `TradeContext`, свой флаг «уже посчитано» (`qualityComputed`) — ничего в существующем коде снимка не меняется.

**Tech Stack:** NestJS + Prisma + Jest (бэкенд), Next.js + next-intl + Vitest (фронтенд).

## Global Constraints

- Формула: окно — свечи между входом и выходом сделки; `pos(price) = (price − low) / (high − low) × 100` по экстремумам этого окна. Лонг: `entryQuality = 100 − pos(entry)`, `exitQuality = pos(exit)`. Шорт — зеркально. Клампится в [0, 100] (в отличие от `rangePos`, которая намеренно не клампится).
- Гранулярность окна по длительности: <4ч → 5м, 4ч–3д → 15м, 3д–30д → 1ч, ≥30д → 4ч.
- `QUALITY_MIN_CANDLES = 3` — меньше свечей в окне сделки → `null`.
- Новая метрика получает **полностью независимый** набор запросов свечей — не трогает fetch-диапазоны и константы существующего `computeSymbol()`/`rangePos`.
- Батчинг — по паре (символ, интервал), один фетч на группу, не на сделку.
- Составные позиции (несколько частичных закрытий) — известное, принятое огрубление: `exitQuality` агрегата отражает первую часть, не блендированную цену. Не устраняется в этой задаче.
- Спека: `docs/superpowers/specs/2026-08-29-entry-exit-quality-design.md`.

---

## Task 1: Чистая математика — формула качества и выбор интервала

**Files:**
- Modify: `backend/src/trades/trade-context.service.ts` (новые константы и экспортируемые функции, рядом с `rangePos()`)
- Test: `backend/src/trades/trade-quality.spec.ts` (новый файл)

**Interfaces:**
- Produces: `QUALITY_MIN_CANDLES` (константа), `qualityIntervalFor(holdMs: number): { maxHoldMs: number; interval: string; tfMs: number }`, `withinTrade(candles: Candle[], fromMs: number, toMs: number, tfMs: number): Candle[]`, `computeTradeQuality(direction: string, entryPrice: number, exitPrice: number, windowCandles: Candle[]): { entryQuality: number | null; exitQuality: number | null }` — этими именами их использует Task 2.

- [x] **Step 1: Написать падающий тест**

Создать `backend/src/trades/trade-quality.spec.ts`:

```ts
import { qualityIntervalFor, withinTrade, computeTradeQuality } from './trade-context.service';
import type { Candle } from './indicators.service';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function candle(time: number, low: number, high: number): Candle {
  return { time, open: (low + high) / 2, high, low, close: (low + high) / 2, volume: 100 };
}

describe('qualityIntervalFor', () => {
  it('меньше 4ч — 5-минутки', () => {
    expect(qualityIntervalFor(2 * HOUR).interval).toBe('5');
  });
  it('4ч–3д — 15 минут', () => {
    expect(qualityIntervalFor(1 * DAY).interval).toBe('15');
  });
  it('3д–30д — час', () => {
    expect(qualityIntervalFor(10 * DAY).interval).toBe('60');
  });
  it('30д и больше — 4 часа', () => {
    expect(qualityIntervalFor(45 * DAY).interval).toBe('240');
  });
  it('границы включительно в сторону более крупного интервала', () => {
    expect(qualityIntervalFor(4 * HOUR).interval).toBe('15');
    expect(qualityIntervalFor(3 * DAY).interval).toBe('60');
    expect(qualityIntervalFor(30 * DAY).interval).toBe('240');
  });
});

describe('withinTrade', () => {
  it('оставляет только свечи, полностью закрытые внутри [fromMs, toMs]', () => {
    const tfMs = HOUR;
    const candles = [candle(0, 1, 2), candle(HOUR, 1, 2), candle(2 * HOUR, 1, 2), candle(3 * HOUR, 1, 2)];
    // Окно [HOUR, 3*HOUR): свеча в HOUR закрывается в 2*HOUR (входит), свеча в
    // 2*HOUR закрывается в 3*HOUR (входит ровно по границе), свеча в 3*HOUR
    // закрывается позже toMs (не входит).
    const result = withinTrade(candles, HOUR, 3 * HOUR, tfMs);
    expect(result.map((c) => c.time)).toEqual([HOUR, 2 * HOUR]);
  });
});

describe('computeTradeQuality', () => {
  it('меньше QUALITY_MIN_CANDLES свечей — null у обоих чисел', () => {
    const window = [candle(0, 90, 120), candle(HOUR, 90, 120)]; // 2 свечи < 3
    expect(computeTradeQuality('long', 100, 110, window)).toEqual({
      entryQuality: null,
      exitQuality: null,
    });
  });

  it('лонг: вход ближе к низу — выше entryQuality, выход ближе к верху — выше exitQuality', () => {
    const window = [candle(0, 90, 120), candle(HOUR, 90, 120), candle(2 * HOUR, 90, 120)];
    // low=90, high=120, span=30. entry=100 → pos=33.33 → entryQuality=66.67.
    // exit=118 → pos=93.33 → exitQuality=93.33.
    expect(computeTradeQuality('long', 100, 118, window)).toEqual({
      entryQuality: 66.67,
      exitQuality: 93.33,
    });
  });

  it('шорт — зеркально лонгу', () => {
    const window = [candle(0, 90, 120), candle(HOUR, 90, 120), candle(2 * HOUR, 90, 120)];
    // low=90, high=120, span=30. entry=112 → pos=73.33 → entryQuality=73.33 (шорт: как есть).
    // exit=93 → pos=10 → exitQuality=90 (шорт: 100-pos).
    expect(computeTradeQuality('short', 112, 93, window)).toEqual({
      entryQuality: 73.33,
      exitQuality: 90,
    });
  });

  it('клампится в [0,100] — не как rangePos', () => {
    const window = [candle(0, 90, 120), candle(HOUR, 90, 120), candle(2 * HOUR, 90, 120)];
    // Цена входа ниже low окна (числовая погрешность/пограничный случай) —
    // pos дал бы отрицательное значение, entryQuality (100-pos) — больше 100.
    const result = computeTradeQuality('long', 80, 110, window);
    expect(result.entryQuality).toBeLessThanOrEqual(100);
    expect(result.entryQuality).toBeGreaterThanOrEqual(0);
  });
});
```

- [x] **Step 2: Запустить тест и убедиться, что он падает**

Run: `cd backend && npx jest trade-quality.spec`
Expected: FAIL — `qualityIntervalFor`/`withinTrade`/`computeTradeQuality` не экспортированы.

- [x] **Step 3: Добавить константы и функции в `trade-context.service.ts`**

Найти блок с `RANGE_MIN_CANDLES` (после константы `RANGE_WINDOW_1D`) и добавить рядом:

```ts
// ── Качество входа/выхода: окно — сама сделка (вход→выход), не история до
// входа, как у rangePos. Свой, независимый от rangePos набор констант и
// запросов свечей — см. docs/superpowers/specs/2026-08-29-entry-exit-quality-design.md.
const QUALITY_SCALP_MS = 4 * H1_MS; // < 4ч — 5-минутки
const QUALITY_INTRADAY_MS = 3 * D1_MS; // 4ч–3д — 15м
const QUALITY_SWING_MS = 30 * D1_MS; // 3д–30д — 1ч, дальше — 4ч
export const QUALITY_MIN_CANDLES = 3; // меньше — окно из 1-2 свечей, не диапазон

export interface QualityInterval {
  maxHoldMs: number;
  interval: string;
  tfMs: number;
}

const QUALITY_INTERVALS: QualityInterval[] = [
  { maxHoldMs: QUALITY_SCALP_MS, interval: '5', tfMs: 5 * 60_000 },
  { maxHoldMs: QUALITY_INTRADAY_MS, interval: '15', tfMs: M15_MS },
  { maxHoldMs: QUALITY_SWING_MS, interval: '60', tfMs: H1_MS },
  { maxHoldMs: Infinity, interval: '240', tfMs: H4_MS },
];

/** Свечная корзина по длительности удержания сделки — см. QUALITY_INTERVALS. */
export function qualityIntervalFor(holdMs: number): QualityInterval {
  return QUALITY_INTERVALS.find((b) => holdMs < b.maxHoldMs) ?? QUALITY_INTERVALS[QUALITY_INTERVALS.length - 1];
}

/** Свечи, полностью закрытые внутри [fromMs, toMs] — окно самой сделки. */
export function withinTrade(candles: Candle[], fromMs: number, toMs: number, tfMs: number): Candle[] {
  return candles.filter((c) => c.time >= fromMs && c.time + tfMs <= toMs);
}

/**
 * Качество входа/выхода относительно диапазона самой сделки. null — меньше
 * QUALITY_MIN_CANDLES свечей в окне. Клампится в [0,100] — в отличие от
 * rangePos, здесь окно задано самой сделкой, и цена входа/выхода физически не
 * может лежать вне свечи, в которую сама попала; выход за границы означал бы
 * только числовую погрешность, а не находку.
 */
export function computeTradeQuality(
  direction: string,
  entryPrice: number,
  exitPrice: number,
  windowCandles: Candle[],
): { entryQuality: number | null; exitQuality: number | null } {
  if (windowCandles.length < QUALITY_MIN_CANDLES) return { entryQuality: null, exitQuality: null };
  let low = Infinity;
  let high = -Infinity;
  for (const c of windowCandles) {
    if (c.low < low) low = c.low;
    if (c.high > high) high = c.high;
  }
  const span = high - low;
  if (!(span > 0)) return { entryQuality: null, exitQuality: null };
  const clamp = (v: number) => Math.max(0, Math.min(100, v));
  const pos = (price: number) => ((price - low) / span) * 100;
  const isLong = direction === 'long';
  return {
    entryQuality: Number(clamp(isLong ? 100 - pos(entryPrice) : pos(entryPrice)).toFixed(2)),
    exitQuality: Number(clamp(isLong ? pos(exitPrice) : 100 - pos(exitPrice)).toFixed(2)),
  };
}
```

- [x] **Step 4: Запустить тест и убедиться, что он проходит**

Run: `cd backend && npx jest trade-quality.spec`
Expected: PASS — все `it(...)` зелёные.

- [x] **Step 5: Прогнать полный набор тестов бэкенда**

Run: `cd backend && npx jest`
Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add backend/src/trades/trade-context.service.ts backend/src/trades/trade-quality.spec.ts
git commit -m "feat(context): формула качества входа/выхода (чистые функции)"
```

---

## Task 2: Схема + батч-вычисление в `TradeContextService`

**Files:**
- Modify: `backend/prisma/schema.prisma` (модель `TradeContext`)
- Modify: `backend/src/trades/trade-context.service.ts` (новый метод `computeMissingQuality`, вызов из `computeMissing`)
- Test: `backend/src/trades/trade-context.quality.spec.ts` (новый файл)

**Interfaces:**
- Consumes: `qualityIntervalFor`, `withinTrade`, `computeTradeQuality`, `QUALITY_INTERVALS`-эквивалент через `qualityIntervalFor` (Task 1).
- Produces: `TradeContext.entryQuality: Float?`, `TradeContext.exitQuality: Float?`, `TradeContext.qualityComputed: Boolean` — этими именами их читает Task 3 (`list()`/`stats()`).

- [x] **Step 1: Добавить поля в Prisma-схему**

В `backend/prisma/schema.prisma`, в модели `TradeContext`, сразу после `rangePos1d Float?` добавить:

```prisma
  rangePos1d Float?

  /// Качество входа/выхода относительно диапазона самой сделки (вход→выход),
  /// не относительно истории до входа, как rangePos. 0..100, клампится.
  /// null — меньше QUALITY_MIN_CANDLES свечей в окне сделки.
  entryQuality Float?
  exitQuality  Float?
  /// true — попытка расчёта уже была (успешная или нет). Отличает «посчитан
  /// null, потому что данных мало» от «ещё не пытались» — без этого пустые
  /// пересчитывались бы на каждом тике синка.
  qualityComputed Boolean @default(false)
```

- [x] **Step 2: Прогнать миграцию**

Run: `cd backend && npx prisma migrate dev --name add_trade_quality`
Expected: миграция создаётся и применяется без ошибок, `npx prisma generate` отрабатывает как часть команды.

- [x] **Step 3: Написать падающий тест**

Создать `backend/src/trades/trade-context.quality.spec.ts`:

```ts
import { TradeContextService } from './trade-context.service';
import type { Candle } from './indicators.service';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function flatCandles(fromMs: number, toMs: number, low: number, high: number): Candle[] {
  const out: Candle[] = [];
  for (let t = fromMs; t <= toMs; t += HOUR) {
    out.push({ time: t, open: (low + high) / 2, high, low, close: (low + high) / 2, volume: 100 });
  }
  return out;
}

describe('TradeContextService.computeMissingQuality', () => {
  it('группирует по (символ, интервал) — один фетч на группу, не на сделку', async () => {
    const base = Date.UTC(2026, 0, 1);
    // A и B — один символ, обе длительности попадают в корзину '60' (3-30д) —
    // должны уйти одним фетчем. C — другой символ, отдельный фетч.
    const tradeA = {
      id: 'a', symbol: 'BTCUSDT', direction: 'long', positionId: null,
      openedAt: new Date(base), closedAt: new Date(base + 10 * DAY),
      avgEntryPrice: 100, avgExitPrice: 118,
    };
    const tradeB = {
      id: 'b', symbol: 'BTCUSDT', direction: 'short', positionId: null,
      openedAt: new Date(base + DAY), closedAt: new Date(base + 15 * DAY),
      avgEntryPrice: 112, avgExitPrice: 93,
    };
    const tradeC = {
      id: 'c', symbol: 'ETHUSDT', direction: 'long', positionId: null,
      openedAt: new Date(base), closedAt: new Date(base + 10 * DAY),
      avgEntryPrice: 52, avgExitPrice: 58,
    };

    const findManyMock = jest.fn().mockResolvedValue([tradeA, tradeB, tradeC]);
    const updateMock = jest.fn().mockResolvedValue(undefined);
    const prisma = { trade: { findMany: findManyMock }, tradeContext: { update: updateMock } } as any;

    const getKlinesRangeMock = jest.fn().mockImplementation((symbol: string, _interval: string, fromMs: number, toMs: number) => {
      const [low, high] = symbol === 'BTCUSDT' ? [90, 120] : [48, 60];
      return Promise.resolve(flatCandles(fromMs, toMs, low, high));
    });
    const market = { getKlinesRange: getKlinesRangeMock } as any;

    const service = new TradeContextService(prisma, market, {} as any);
    const written = await (service as any).computeMissingQuality('u1');

    expect(written).toBe(3);
    // Группировка: BTCUSDT+'60' — один фетч на A и B, ETHUSDT+'60' — отдельный.
    expect(getKlinesRangeMock).toHaveBeenCalledTimes(2);
    expect(getKlinesRangeMock).toHaveBeenCalledWith('BTCUSDT', '60', expect.any(Number), expect.any(Number));
    expect(getKlinesRangeMock).toHaveBeenCalledWith('ETHUSDT', '60', expect.any(Number), expect.any(Number));

    expect(updateMock).toHaveBeenCalledTimes(3);
    expect(updateMock).toHaveBeenCalledWith({
      where: { tradeId: 'a' },
      data: { entryQuality: 66.67, exitQuality: 93.33, qualityComputed: true },
    });
    expect(updateMock).toHaveBeenCalledWith({
      where: { tradeId: 'b' },
      data: { entryQuality: 73.33, exitQuality: 90, qualityComputed: true },
    });
    expect(updateMock).toHaveBeenCalledWith({
      where: { tradeId: 'c' },
      data: { entryQuality: 66.67, exitQuality: 83.33, qualityComputed: true },
    });
  });

  it('ничего не делает, если нет сделок, ожидающих расчёта', async () => {
    const findManyMock = jest.fn().mockResolvedValue([]);
    const updateMock = jest.fn();
    const prisma = { trade: { findMany: findManyMock }, tradeContext: { update: updateMock } } as any;
    const getKlinesRangeMock = jest.fn();
    const market = { getKlinesRange: getKlinesRangeMock } as any;

    const service = new TradeContextService(prisma, market, {} as any);
    const written = await (service as any).computeMissingQuality('u1');

    expect(written).toBe(0);
    expect(getKlinesRangeMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });
});
```

- [x] **Step 4: Запустить тест и убедиться, что он падает**

Run: `cd backend && npx jest trade-context.quality.spec`
Expected: FAIL — `computeMissingQuality` не существует на сервисе (`TypeError: ... is not a function`).

- [x] **Step 5: Добавить `computeMissingQuality` и вызвать её из `computeMissing`**

В `backend/src/trades/trade-context.service.ts`, после метода `computeMissing` (перед `dropStale`), добавить новый приватный метод:

```ts
  /**
   * Качество входа/выхода — второй, независимый проход. Нужен закрытый выход
   * (avgExitPrice/closedAt), которого нет у ещё открытой позиции — поэтому не
   * может жить в buildSnapshot(), общем с snapshotNow(). Свой набор запросов
   * свечей, сгруппированных по (символ, интервал-по-длительности) — не
   * переиспользует диапазоны m15/h1/h4/d1 основного снимка: не рискуем уже
   * работающим rangePos/индикаторами ради экономии запросов к Bybit.
   */
  private async computeMissingQuality(userId: string): Promise<number> {
    const pending = await this.prisma.trade.findMany({
      where: { userId, context: { qualityComputed: false, ok: true } },
      orderBy: { closedAt: 'desc' },
      take: BATCH_LIMIT,
      select: {
        id: true,
        symbol: true,
        direction: true,
        positionId: true,
        openedAt: true,
        closedAt: true,
        avgEntryPrice: true,
        avgExitPrice: true,
      },
    });
    if (pending.length === 0) return 0;

    const anchors = pending.map((row) => ({ row, entryMs: entryTimeOf(row).ms }));
    const groups = new Map<string, typeof anchors>();
    for (const a of anchors) {
      const holdMs = a.row.closedAt.getTime() - a.entryMs;
      const { interval } = qualityIntervalFor(holdMs);
      const key = `${a.row.symbol}:${interval}`;
      const list = groups.get(key);
      if (list) list.push(a);
      else groups.set(key, [a]);
    }

    let written = 0;
    for (const [key, items] of groups) {
      const interval = key.slice(key.lastIndexOf(':') + 1);
      const symbol = key.slice(0, key.lastIndexOf(':'));
      const spec = QUALITY_INTERVALS_BY_KEY.get(interval)!;
      const minMs = Math.min(...items.map((a) => a.entryMs));
      const maxMs = Math.max(...items.map((a) => a.row.closedAt.getTime()));
      try {
        const candles = await this.market.getKlinesRange(symbol, interval, minMs, maxMs);
        for (const { row, entryMs } of items) {
          const window = withinTrade(candles, entryMs, row.closedAt.getTime(), spec.tfMs);
          const { entryQuality, exitQuality } = computeTradeQuality(
            row.direction,
            row.avgEntryPrice,
            row.avgExitPrice,
            window,
          );
          await this.prisma.tradeContext.update({
            where: { tradeId: row.id },
            data: { entryQuality, exitQuality, qualityComputed: true },
          });
          written++;
        }
      } catch (e) {
        this.logger.warn(`quality compute failed for ${symbol}/${interval}: ${e}`);
      }
    }
    return written;
  }
```

Добавить лукап по интервалу (рядом с `QUALITY_INTERVALS`, объявленным в Task 1):

```ts
const QUALITY_INTERVALS_BY_KEY = new Map(QUALITY_INTERVALS.map((q) => [q.interval, q]));
```

В методе `computeMissing` заменить

```ts
  async computeMissing(userId: string): Promise<number> {
    await this.dropStale(userId);

    const pending = await this.prisma.trade.findMany({
      where: { userId, context: null },
      orderBy: { closedAt: 'desc' },
      take: BATCH_LIMIT,
      select: {
        id: true,
        symbol: true,
        positionId: true,
        openedAt: true,
        closedAt: true,
        avgEntryPrice: true,
      },
    });
    if (pending.length === 0) return 0;

    const bySymbol = new Map<string, typeof pending>();
    for (const t of pending) {
      const list = bySymbol.get(t.symbol);
      if (list) list.push(t);
      else bySymbol.set(t.symbol, [t]);
    }

    let written = 0;
    for (const [symbol, rows] of bySymbol) {
      try {
        written += await this.computeSymbol(symbol, rows);
      } catch (e) {
        this.logger.warn(`context compute failed for ${symbol}: ${e}`);
      }
    }
    return written;
  }
```

на

```ts
  async computeMissing(userId: string): Promise<number> {
    await this.dropStale(userId);

    const pending = await this.prisma.trade.findMany({
      where: { userId, context: null },
      orderBy: { closedAt: 'desc' },
      take: BATCH_LIMIT,
      select: {
        id: true,
        symbol: true,
        positionId: true,
        openedAt: true,
        closedAt: true,
        avgEntryPrice: true,
      },
    });

    let written = 0;
    if (pending.length > 0) {
      const bySymbol = new Map<string, typeof pending>();
      for (const t of pending) {
        const list = bySymbol.get(t.symbol);
        if (list) list.push(t);
        else bySymbol.set(t.symbol, [t]);
      }

      for (const [symbol, rows] of bySymbol) {
        try {
          written += await this.computeSymbol(symbol, rows);
        } catch (e) {
          this.logger.warn(`context compute failed for ${symbol}: ${e}`);
        }
      }
    }

    written += await this.computeMissingQuality(userId);
    return written;
  }
```

(Изменение: старый ранний `if (pending.length === 0) return 0;` убирал бы и возможность досчитать качество для уже существующих контекстов, когда новых «сырых» контекстов в этот тик нет — поэтому досчёт качества теперь не зависит от того, было ли что досчитывать в основном снимке.)

- [x] **Step 6: Запустить тест и убедиться, что он проходит**

Run: `cd backend && npx jest trade-context.quality.spec`
Expected: PASS — оба `it(...)` зелёные.

- [x] **Step 7: Прогнать полный набор тестов бэкенда**

Run: `cd backend && npx jest`
Expected: PASS.

- [x] **Step 8: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations backend/src/trades/trade-context.service.ts \
  backend/src/trades/trade-context.quality.spec.ts
git commit -m "feat(context): батч-расчёт качества входа/выхода закрытых сделок"
```

---

## Task 3: Наружу — `list()` и агрегат в `stats()`

**Files:**
- Modify: `backend/src/trades/trades.service.ts` (`list()` allowlist, `stats()`, `TradeStats`)
- Test: `backend/src/trades/trade-quality-average.spec.ts` (новый файл)

**Interfaces:**
- Consumes: `TradeContext.entryQuality`/`exitQuality` (Task 2).
- Produces: `averageQuality(values: Array<number | null | undefined>): number | null` (экспортируемая чистая функция), `TradeStats.avgEntryQuality: number | null`, `TradeStats.avgExitQuality: number | null` — этими именами их использует Task 4 на фронте.

- [ ] **Step 1: Написать падающий тест**

Создать `backend/src/trades/trade-quality-average.spec.ts`:

```ts
import { averageQuality } from './trades.service';

describe('averageQuality', () => {
  it('пустой список — null', () => {
    expect(averageQuality([])).toBeNull();
  });

  it('все значения null/undefined — null', () => {
    expect(averageQuality([null, undefined, null])).toBeNull();
  });

  it('считает среднее только по непустым значениям', () => {
    expect(averageQuality([80, null, 60, undefined, 40])).toBe(60);
  });

  it('округляет до двух знаков', () => {
    expect(averageQuality([66.666, 33.333])).toBe(50);
    expect(averageQuality([100, 33.333, 0])).toBe(44.44);
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `cd backend && npx jest trade-quality-average.spec`
Expected: FAIL — `averageQuality` не экспортирована из `trades.service.ts`.

- [ ] **Step 3: Добавить `averageQuality`, поля `TradeStats` и правки `list()`/`stats()`**

В `backend/src/trades/trades.service.ts` добавить рядом с `wilsonLower` (после неё):

```ts
/** Среднее по непустым значениям; null — если ни одной сделки периода не считалось. */
export function averageQuality(values: Array<number | null | undefined>): number | null {
  const present = values.filter((v): v is number => v != null);
  if (present.length === 0) return null;
  return Number((present.reduce((a, b) => a + b, 0) / present.length).toFixed(2));
}
```

В интерфейсе `TradeStats` (после поля `sqn`, добавленного Edge Score) добавить:

```ts
  /** Среднее качество входа по сделкам периода с посчитанным контекстом. null — ни у одной нет. */
  avgEntryQuality: number | null;
  avgExitQuality: number | null;
```

В `list()` allowlist контекста заменить

```ts
        context: context
          ? {
              ok: context.ok,
              basis: context.basis,
              atrPct: context.atrPct,
              rsi: context.rsi,
              volRel: context.volRel,
              ema200Above: context.ema200Above,
              trend4h: context.trend4h,
              rangePos1h: context.rangePos1h,
              rangePos4h: context.rangePos4h,
              rangePos1d: context.rangePos1d,
            }
          : null,
```

на

```ts
        context: context
          ? {
              ok: context.ok,
              basis: context.basis,
              atrPct: context.atrPct,
              rsi: context.rsi,
              volRel: context.volRel,
              ema200Above: context.ema200Above,
              trend4h: context.trend4h,
              rangePos1h: context.rangePos1h,
              rangePos4h: context.rangePos4h,
              rangePos1d: context.rangePos1d,
              entryQuality: context.entryQuality,
              exitQuality: context.exitQuality,
            }
          : null,
```

В `stats()` заменить запрос

```ts
    const trades = collapseToPositions(
      await this.prisma.trade.findMany({
        where: this.buildWhere(userId, params),
        orderBy: { closedAt: 'asc' },
      }),
    );
```

на

```ts
    const trades = collapseToPositions(
      await this.prisma.trade.findMany({
        where: this.buildWhere(userId, params),
        orderBy: { closedAt: 'asc' },
        include: { context: true },
      }),
    );
```

и добавить в возвращаемый объект `stats` (после `sqn`, добавленного Edge Score):

```ts
      avgEntryQuality: averageQuality(trades.map((t) => t.context?.entryQuality)),
      avgExitQuality: averageQuality(trades.map((t) => t.context?.exitQuality)),
```

- [ ] **Step 4: Запустить тест и убедиться, что он проходит**

Run: `cd backend && npx jest trade-quality-average.spec`
Expected: PASS.

- [ ] **Step 5: Прогнать полный набор тестов бэкенда**

Run: `cd backend && npx jest`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/trades/trades.service.ts backend/src/trades/trade-quality-average.spec.ts
git commit -m "feat(trades): качество входа/выхода в журнале и своде периода"
```

---

## Task 4: Фронтенд — типы, `SummaryStrip`, раскрытая строка журнала

**Files:**
- Modify: `frontend/src/entities/trade/api/types.ts` (`TradeContext`, `TradeStats`)
- Modify: `frontend/src/views/overview/components/SummaryStrip.tsx`
- Modify: `frontend/src/widgets/trades-table/TradeOrders.tsx`
- Modify: `frontend/src/shared/i18n/messages/ru.json`, `frontend/src/shared/i18n/messages/en.json`

**Interfaces:**
- Consumes: `TradeContext.entryQuality`/`exitQuality`, `TradeStats.avgEntryQuality`/`avgExitQuality` (Task 3).

- [ ] **Step 1: Добавить поля в типы**

В `frontend/src/entities/trade/api/types.ts` заменить `TradeContext`

```ts
export interface TradeContext {
  ok: boolean;
  // basis и rsi отдаёт только /api/trades: Выборка присылает тот же снимок,
  // но без служебной привязки к моменту и без RSI — их там нечем показывать.
  basis?: 'opened' | 'closed';
  rsi?: number | null;
  atrPct: number | null;
  volRel: number | null;
  ema200Above: boolean | null;
  trend4h: string | null;
  rangePos15m: number | null;
  rangePos30m: number | null;
  rangePos1h: number | null;
  rangePos4h: number | null;
  rangePos1d: number | null;
}
```

на

```ts
export interface TradeContext {
  ok: boolean;
  // basis и rsi отдаёт только /api/trades: Выборка присылает тот же снимок,
  // но без служебной привязки к моменту и без RSI — их там нечем показывать.
  basis?: 'opened' | 'closed';
  rsi?: number | null;
  atrPct: number | null;
  volRel: number | null;
  ema200Above: boolean | null;
  trend4h: string | null;
  rangePos15m: number | null;
  rangePos30m: number | null;
  rangePos1h: number | null;
  rangePos4h: number | null;
  rangePos1d: number | null;
  /** Качество входа/выхода относительно диапазона самой сделки, 0..100. null — мало свечей в окне. */
  entryQuality: number | null;
  exitQuality: number | null;
}
```

и `TradeStats` (после `sqn`, добавленного Edge Score) добавить:

```ts
  /** Среднее качество входа/выхода по сделкам периода с посчитанным контекстом. */
  avgEntryQuality: number | null;
  avgExitQuality: number | null;
```

- [ ] **Step 2: Добавить переводы в оба каталога**

В `frontend/src/shared/i18n/messages/ru.json`, внутри `"overview"`, последняя строка сейчас — восемь ключей `edgeScoreTier*`, последний из них `"edgeScoreTierHolyGrail": "Грааль"` — заменить на неё же с запятой плюс:

```json
    "edgeScoreTierHolyGrail": "Грааль",
    "entryQualityMetric": "Качество входа",
    "exitQualityMetric": "Качество выхода"
```

В `frontend/src/shared/i18n/messages/en.json`, тем же способом, после `"edgeScoreTierHolyGrail": "Holy grail"`:

```json
    "edgeScoreTierHolyGrail": "Holy grail",
    "entryQualityMetric": "Entry quality",
    "exitQualityMetric": "Exit quality"
```

В `frontend/src/shared/i18n/messages/ru.json`, внутри `"tradesTable"`, последняя строка сейчас `"contextNotComputed": "Контекст этой сделки пока не посчитан."` — заменить на неё же с запятой плюс:

```json
    "contextNotComputed": "Контекст этой сделки пока не посчитан.",
    "entryQualityLabel": "Качество входа",
    "exitQualityLabel": "Качество выхода"
```

В `frontend/src/shared/i18n/messages/en.json`, тем же способом, после `"contextNotComputed": "This trade's context hasn't been computed yet."`:

```json
    "contextNotComputed": "This trade's context hasn't been computed yet.",
    "entryQualityLabel": "Entry quality",
    "exitQualityLabel": "Exit quality"
```

- [ ] **Step 3: Прогнать тест каталогов сообщений**

Run: `cd frontend && npx vitest run src/shared/i18n/messages.test.ts`
Expected: PASS — en/ru в паре.

- [ ] **Step 4: Добавить две ячейки в `SummaryStrip`**

В `frontend/src/views/overview/components/SummaryStrip.tsx` заменить

```ts
    {
      label: 'Edge Score',
      value: stats.sqn == null ? '—' : String(sqnToScore(stats.sqn)),
      gauge: stats.sqn == null ? undefined : { fill: sqnToScore(stats.sqn), threshold: 40 },
      title: stats.sqn == null ? undefined : tierLabels[sqnTier(stats.sqn)],
    },
    { label: t('trades'), value: String(stats.totalTrades) },
```

на

```ts
    {
      label: 'Edge Score',
      value: stats.sqn == null ? '—' : String(sqnToScore(stats.sqn)),
      gauge: stats.sqn == null ? undefined : { fill: sqnToScore(stats.sqn), threshold: 40 },
      title: stats.sqn == null ? undefined : tierLabels[sqnTier(stats.sqn)],
    },
    {
      label: t('entryQualityMetric'),
      value: stats.avgEntryQuality == null ? '—' : `${Math.round(stats.avgEntryQuality)} %`,
      gauge: stats.avgEntryQuality == null ? undefined : { fill: stats.avgEntryQuality, threshold: 50 },
    },
    {
      label: t('exitQualityMetric'),
      value: stats.avgExitQuality == null ? '—' : `${Math.round(stats.avgExitQuality)} %`,
      gauge: stats.avgExitQuality == null ? undefined : { fill: stats.avgExitQuality, threshold: 50 },
    },
    { label: t('trades'), value: String(stats.totalTrades) },
```

Заменить комментарий и скелет — теперь двенадцать ячеек:

```ts
/**
 * Свод периода — десять величин одной строкой, без карточек.
```

на

```ts
/**
 * Свод периода — двенадцать величин одной строкой, без карточек.
```

```tsx
/** Скелет свода: те же десять слотов, чтобы шапка не прыгала при загрузке. */
export function SummaryStripSkeleton() {
  return (
    <div className="metrics" aria-hidden>
      {Array.from({ length: 10 }, (_, i) => (
```

на

```tsx
/** Скелет свода: те же двенадцать слотов, чтобы шапка не прыгала при загрузке. */
export function SummaryStripSkeleton() {
  return (
    <div className="metrics" aria-hidden>
      {Array.from({ length: 12 }, (_, i) => (
```

- [ ] **Step 5: Добавить две строки в раскрытую запись журнала**

В `frontend/src/widgets/trades-table/TradeOrders.tsx` заменить

```tsx
              <KeyValue label={t('colRange', { tf: '1H' })}>{formatRangePos(ctx.rangePos1h, locale)}</KeyValue>
              <KeyValue label={t('colRange', { tf: '4H' })}>{formatRangePos(ctx.rangePos4h, locale)}</KeyValue>
```

на

```tsx
              <KeyValue label={t('colRange', { tf: '1H' })}>{formatRangePos(ctx.rangePos1h, locale)}</KeyValue>
              <KeyValue label={t('colRange', { tf: '4H' })}>{formatRangePos(ctx.rangePos4h, locale)}</KeyValue>
              <KeyValue label={t('entryQualityLabel')}>
                {ctx.entryQuality != null ? `${Math.round(ctx.entryQuality)} %` : '—'}
              </KeyValue>
              <KeyValue label={t('exitQualityLabel')}>
                {ctx.exitQuality != null ? `${Math.round(ctx.exitQuality)} %` : '—'}
              </KeyValue>
```

- [ ] **Step 6: Проверка типов фронтенда**

Run: `cd frontend && npx tsc --noEmit`
Expected: без ошибок.

- [ ] **Step 7: Полный прогон тестов фронтенда**

Run: `cd frontend && npx vitest run`
Expected: PASS.

- [ ] **Step 8: Полная сборка фронтенда**

Run: `cd frontend && npx next build`
Expected: PASS, без ошибок и предупреждений.

- [ ] **Step 9: Контрольный прогон бэкенда**

Run: `cd backend && npx jest && npx nest build`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/entities/trade/api/types.ts frontend/src/views/overview/components/SummaryStrip.tsx \
  frontend/src/widgets/trades-table/TradeOrders.tsx frontend/src/shared/i18n/messages/ru.json \
  frontend/src/shared/i18n/messages/en.json
git commit -m "feat(overview): качество входа/выхода на Обзоре и в журнале"
```

---

## Итог

После Task 4 каждая закрытая сделка с достаточной историей свечей несёт `entryQuality`/`exitQuality` — насколько цена входа/выхода была близка к лучшей возможной цене за время жизни самой сделки, направленно (лонг/шорт) и в клампе [0,100]. Видно в раскрытой строке журнала рядом с диапазоном входа и двумя новыми ячейками свода на Обзоре — раздельно от Edge Score и раздельно друг от друга, без слияния в одну цифру.
