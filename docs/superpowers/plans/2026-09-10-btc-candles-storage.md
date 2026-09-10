# Хранилище свечей BTC — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Завести единственный в проекте источник графика BTCUSDT — таблицу `price_candles` на шести таймфреймах с историей от 2018 года и самодогоняющейся синхронизацией с Binance, — и перевести на него существующую аналитику `market-events`.

**Architecture:** Новый модуль `backend/src/market-data/` единолично владеет таблицей: клиент Binance, сервис синхронизации (один цикл, идущий вперёд от `MAX(time)`, без отдельного режима бэкфилла), сервис чтения и контроллер. Старые `daily_prices` / `hourly_prices` и их два сервиса синка удаляются в конце, после того как новые данные доехали. `market-events` перестаёт ходить в Prisma за свечами и становится потребителем `MarketDataService`.

**Tech Stack:** NestJS, Prisma (PostgreSQL), Jest + ts-jest, публичный REST Binance (`api.binance.com/api/v3/klines`), без новых npm-зависимостей.

Спека: [`docs/superpowers/specs/2026-09-10-btc-candles-storage-design.md`](../specs/2026-09-10-btc-candles-storage-design.md)

## Global Constraints

- **Новых npm-зависимостей нет.** `fetch` глобальный (Node 18+), как в `bybit-market.service.ts`.
- **Начало истории — `Date.UTC(2018, 0, 1)`**, одной константой `START_MS`.
- **Символ — `'BTCUSDT'`**, одной константой `SYMBOL`. Колонка `symbol` в схеме есть, но значение сейчас ровно одно.
- **Шесть таймфреймов, в минутах: `1, 5, 15, 60, 240, 1440`.** Нигде не строки.
- **Порядок синка — от крупного к мелкому: `1440, 240, 60, 15, 5, 1`.**
- **Пауза между запросами к Binance — 300 мс**, размер страницы — 1000 свечей.
- **Интервал дозаливки — 15 минут** (`15 * 60_000`).
- **Миграций в проекте нет.** Схема применяется `npx prisma db push`; на проде это происходит на старте контейнера api (`docker-compose.prod.yml:66`). `prisma migrate` не использовать.
- **Windows: `prisma generate` падает с EPERM, пока запущен `npm run start:dev`.** Перед генерацией остановить backend-процессы, после — поднять обратно. Спрашивать пользователя до остановки: сервер может крутиться в его терминале.
- **Тесты — `*.spec.ts` рядом с кодом**, запуск `npm test` из `backend/`. Сервисы в тестах собираются руками с заглушками (`as never`), без `Test.createTestingModule` — так сделаны `balance-snapshot.service.spec.ts` и остальные.
- **Комментарии и сообщения — по-русски**, как в остальном backend.
- **API слушает `127.0.0.1:8091`**, база — `127.0.0.1:5432` (`virex/virex/virex`). Наружу смотрит только `web` на 8090.

## Подготовка: ветка

Работа не должна лечь на `fix/landing-header-locale-only` — там незакоммиченная работа по лендингу. До Task 1:

```bash
git status --short                    # убедиться, что рабочее дерево чистое
git checkout main && git pull
git checkout -b feat/btc-candles-storage
```

Если в дереве остались правки лендинга — не начинать, пока пользователь не решит, что с ними делать (закоммитить, спрятать в `git stash` или отложить план). Переносить чужой WIP в новую ветку молча нельзя.

Спека уже закоммичена в `fix/landing-header-locale-only` (`0204655`); если её не видно из новой ветки, взять файл оттуда — на реализацию это не влияет.

---

### Task 1: Таймфреймы, константы рынка и арифметика закрытия свечи

Фундамент, от которого зависят все остальные задачи. Чистые функции, никаких зависимостей.

**Files:**
- Create: `backend/src/market-data/timeframes.ts`
- Test: `backend/src/market-data/timeframes.spec.ts`

**Interfaces:**
- Consumes: ничего.
- Produces:
  - `TIMEFRAMES: readonly [1, 5, 15, 60, 240, 1440]`
  - `type Timeframe = (typeof TIMEFRAMES)[number]`
  - `SYNC_ORDER: Timeframe[]`
  - `SYMBOL: string` — `'BTCUSDT'`
  - `START_MS: number` — `Date.UTC(2018, 0, 1)`
  - `isValidTimeframe(tf: number): tf is Timeframe`
  - `timeframeMs(tf: number): number`
  - `toBinanceInterval(tf: number): string`
  - `isClosed(openTimeMs: number, tf: number, nowMs: number): boolean`

`SYMBOL` и `START_MS` живут здесь, а не в сервисе синка: их читают и синк, и сервис чтения, и контроллер, а сервис чтения не должен зависеть от сервиса записи ради константы.

- [ ] **Step 1: Написать падающий тест**

Создать `backend/src/market-data/timeframes.spec.ts`:

```ts
import {
  TIMEFRAMES,
  SYNC_ORDER,
  SYMBOL,
  START_MS,
  isValidTimeframe,
  timeframeMs,
  toBinanceInterval,
  isClosed,
} from './timeframes';

describe('timeframes', () => {
  it('перечисляет ровно шесть поддерживаемых таймфреймов, в минутах', () => {
    expect(TIMEFRAMES).toEqual([1, 5, 15, 60, 240, 1440]);
  });

  it('держит символ и начало истории константами', () => {
    expect(SYMBOL).toBe('BTCUSDT');
    expect(START_MS).toBe(Date.UTC(2018, 0, 1));
  });

  it('синкает от крупного к мелкому — дневной график появляется первым', () => {
    expect(SYNC_ORDER).toEqual([1440, 240, 60, 15, 5, 1]);
  });

  it('отвергает таймфрейм вне списка', () => {
    expect(isValidTimeframe(60)).toBe(true);
    expect(isValidTimeframe(30)).toBe(false);
    expect(isValidTimeframe(0)).toBe(false);
  });

  it('переводит минуты в интервал Binance', () => {
    expect(toBinanceInterval(1)).toBe('1m');
    expect(toBinanceInterval(5)).toBe('5m');
    expect(toBinanceInterval(15)).toBe('15m');
    expect(toBinanceInterval(60)).toBe('1h');
    expect(toBinanceInterval(240)).toBe('4h');
    expect(toBinanceInterval(1440)).toBe('1d');
  });

  it('падает на неизвестном таймфрейме, а не отдаёт undefined в URL', () => {
    expect(() => toBinanceInterval(30)).toThrow(/30/);
  });

  it('переводит таймфрейм в миллисекунды', () => {
    expect(timeframeMs(1)).toBe(60_000);
    expect(timeframeMs(240)).toBe(14_400_000);
  });

  // Главный тест файла. Ошибка здесь даёт вечно недорисованную последнюю
  // свечу на графике — она не падает, её надо заметить глазами.
  it('считает 4h-свечу закрытой ровно в момент закрытия, не раньше', () => {
    const open = Date.UTC(2026, 0, 1, 12, 0, 0);
    const closesAt = Date.UTC(2026, 0, 1, 16, 0, 0);
    expect(isClosed(open, 240, closesAt - 1)).toBe(false);
    expect(isClosed(open, 240, closesAt)).toBe(true);
  });

  it('то же правило для минутки', () => {
    const open = Date.UTC(2026, 0, 1, 12, 0, 0);
    expect(isClosed(open, 1, open + 59_999)).toBe(false);
    expect(isClosed(open, 1, open + 60_000)).toBe(true);
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что падает**

Из `backend/`:
```
npm test -- timeframes.spec.ts
```
Ожидается: FAIL — `Cannot find module './timeframes'`.

- [ ] **Step 3: Написать реализацию**

Создать `backend/src/market-data/timeframes.ts`:

```ts
/**
 * Шесть таймфреймов графика BTC — в МИНУТАХ, а не строками.
 *
 * Строка расползлась бы так же, как расползся бы таймфрейм сделки, будь он
 * тегом: '15m' у Binance, '15' у Bybit, 'M15' у следующего источника. Число
 * даёт ещё и арифметику — правило закрытия свечи получается одно на все
 * шесть, а не шесть частных случаев.
 */
export const TIMEFRAMES = [1, 5, 15, 60, 240, 1440] as const;

export type Timeframe = (typeof TIMEFRAMES)[number];

/**
 * Порядок обхода при синхронизации — от крупного к мелкому.
 *
 * На пустой базе дневной график с 2018 года становится доступен через минуту
 * после первого старта, а минутка доезжает последней. В обратном порядке все
 * шесть таймфреймов стояли бы пустыми примерно полчаса.
 */
export const SYNC_ORDER: Timeframe[] = [1440, 240, 60, 15, 5, 1];

/**
 * Символ и начало истории — здесь, а не в сервисе синка: их читают и синк, и
 * сервис чтения, и контроллер. Сервис чтения не должен зависеть от сервиса
 * записи ради константы.
 */
export const SYMBOL = 'BTCUSDT';
export const START_MS = Date.UTC(2018, 0, 1);

const BINANCE_INTERVAL: Record<number, string> = {
  1: '1m',
  5: '5m',
  15: '15m',
  60: '1h',
  240: '4h',
  1440: '1d',
};

export const isValidTimeframe = (tf: number): tf is Timeframe =>
  (TIMEFRAMES as readonly number[]).includes(tf);

export const timeframeMs = (tf: number): number => tf * 60_000;

export const toBinanceInterval = (tf: number): string => {
  const interval = BINANCE_INTERVAL[tf];
  if (!interval) throw new Error(`Неизвестный таймфрейм: ${tf}`);
  return interval;
};

/**
 * Свеча закрыта, когда её окно целиком в прошлом. Незакрытую писать нельзя:
 * она ещё меняется, а в базе значилась бы окончательной.
 */
export const isClosed = (openTimeMs: number, tf: number, nowMs: number): boolean =>
  openTimeMs + timeframeMs(tf) <= nowMs;
```

- [ ] **Step 4: Запустить тест и убедиться, что проходит**

```
npm test -- timeframes.spec.ts
```
Ожидается: PASS, 9 тестов.

- [ ] **Step 5: Коммит**

```bash
git add backend/src/market-data/timeframes.ts backend/src/market-data/timeframes.spec.ts
git commit -m "feat(market-data): таймфреймы графика BTC и правило закрытия свечи

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Клиент Binance

Единственная точка выхода наружу. **Пишется с нуля, а не копией `BybitMarketService.getKlinesRange`:** Bybit на диапазон отдаёт самые новые свечи и листается назад, Binance отдаёт `limit` штук начиная от `startTime` по возрастанию. Скопированный код поедет не в ту сторону и молча.

**Files:**
- Create: `backend/src/market-data/binance-klines.client.ts`
- Test: `backend/src/market-data/binance-klines.client.spec.ts`

**Interfaces:**
- Consumes: `toBinanceInterval` из Task 1.
- Produces:
  - `interface BinanceCandle { time: number; open: number; high: number; low: number; close: number; volume: number }` — `time` в миллисекундах
  - `class BinanceKlinesClient` с методом
    `fetchKlines(symbol: string, timeframe: number, startTimeMs: number, limit?: number): Promise<BinanceCandle[]>`

- [ ] **Step 1: Написать падающий тест**

Создать `backend/src/market-data/binance-klines.client.spec.ts`:

```ts
import { BinanceKlinesClient } from './binance-klines.client';

/** Строка klines у Binance: [openTime, o, h, l, c, v, closeTime, ...]. */
const row = (openTime: number) => [
  openTime,
  '100.5',
  '110.0',
  '90.25',
  '105.75',
  '12.5',
  openTime + 59_999,
  '1312.5',
  42,
  '6.0',
  '630.0',
  '0',
];

function mockFetch(...responses: Array<{ status?: number; body?: unknown; retryAfter?: string }>) {
  const fn = jest.fn();
  for (const r of responses) {
    fn.mockResolvedValueOnce({
      ok: (r.status ?? 200) < 400,
      status: r.status ?? 200,
      json: async () => r.body ?? [],
      headers: { get: (name: string) => (name === 'Retry-After' ? (r.retryAfter ?? null) : null) },
    });
  }
  global.fetch = fn as never;
  return fn;
}

/** Клиент со снятым настоящим сном — иначе тест на 429 ждал бы секунду. */
function makeClient() {
  const client = new BinanceKlinesClient();
  const sleep = jest.fn().mockResolvedValue(undefined);
  (client as unknown as { sleep: unknown }).sleep = sleep;
  return { client, sleep };
}

describe('BinanceKlinesClient', () => {
  afterEach(() => jest.restoreAllMocks());

  it('разбирает строки Binance в свечи', async () => {
    mockFetch({ body: [row(1_700_000_000_000)] });
    const { client } = makeClient();

    const candles = await client.fetchKlines('BTCUSDT', 60, 1_700_000_000_000);

    expect(candles).toEqual([
      { time: 1_700_000_000_000, open: 100.5, high: 110, low: 90.25, close: 105.75, volume: 12.5 },
    ]);
  });

  it('листается ВПЕРЁД: запрашивает startTime, а не end', async () => {
    const fetchMock = mockFetch({ body: [] });
    const { client } = makeClient();

    await client.fetchKlines('BTCUSDT', 240, 1_700_000_000_000, 1000);

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('symbol=BTCUSDT');
    expect(url).toContain('interval=4h');
    expect(url).toContain('startTime=1700000000000');
    expect(url).toContain('limit=1000');
    expect(url).not.toContain('endTime');
  });

  it('на 429 отступает и повторяет, а не теряет страницу', async () => {
    mockFetch({ status: 429 }, { body: [row(1_700_000_000_000)] });
    const { client, sleep } = makeClient();

    const candles = await client.fetchKlines('BTCUSDT', 60, 1_700_000_000_000);

    expect(sleep).toHaveBeenCalledTimes(1);
    expect(candles).toHaveLength(1);
  });

  it('уважает заголовок Retry-After, если он пришёл', async () => {
    mockFetch({ status: 429, retryAfter: '7' }, { body: [] });
    const { client, sleep } = makeClient();

    await client.fetchKlines('BTCUSDT', 60, 1_700_000_000_000);

    expect(sleep).toHaveBeenCalledWith(7000);
  });

  it('сдаётся после трёх повторов, а не крутится вечно', async () => {
    mockFetch({ status: 429 }, { status: 429 }, { status: 429 }, { status: 429 });
    const { client } = makeClient();

    await expect(client.fetchKlines('BTCUSDT', 60, 1)).rejects.toThrow(/429/);
  });

  it('на прочую ошибку HTTP падает сразу, не пряча её пустым массивом', async () => {
    mockFetch({ status: 500 });
    const { client } = makeClient();

    await expect(client.fetchKlines('BTCUSDT', 60, 1)).rejects.toThrow(/500/);
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что падает**

```
npm test -- binance-klines.client.spec.ts
```
Ожидается: FAIL — `Cannot find module './binance-klines.client'`.

- [ ] **Step 3: Написать реализацию**

Создать `backend/src/market-data/binance-klines.client.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { toBinanceInterval } from './timeframes';

export interface BinanceCandle {
  time: number; // миллисекунды, время ОТКРЫТИЯ свечи
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const BASE_URL = 'https://api.binance.com/api/v3/klines';
const MAX_RETRIES = 3;

/**
 * Публичные свечи Binance spot. Ключей не требует, к аккаунтам пользователей
 * отношения не имеет — поэтому живёт здесь, а не среди адаптеров бирж в
 * `exchanges/adapters/`.
 *
 * ВНИМАНИЕ: пагинация здесь противоположна бибитовской. Bybit на диапазон
 * отдаёт самые НОВЫЕ свечи, и `BybitMarketService.getKlinesRange` вынужден
 * листаться назад, двигая `end`. Binance отдаёт `limit` свечей начиная от
 * `startTime`, по возрастанию — двигать надо начало. Код, скопированный
 * оттуда по аналогии, поедет не в ту сторону и не пожалуется.
 */
@Injectable()
export class BinanceKlinesClient {
  private readonly logger = new Logger(BinanceKlinesClient.name);

  /** Вынесено полем, чтобы тест на 429 не спал по-настоящему. */
  protected sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

  async fetchKlines(
    symbol: string,
    timeframe: number,
    startTimeMs: number,
    limit = 1000,
  ): Promise<BinanceCandle[]> {
    const url =
      `${BASE_URL}?symbol=${symbol}&interval=${toBinanceInterval(timeframe)}` +
      `&startTime=${startTimeMs}&limit=${limit}`;

    for (let attempt = 0; ; attempt++) {
      const res = await fetch(url);

      // 429 — превышен вес запросов; 418 — бан за то, что 429 игнорировали.
      if (res.status === 429 || res.status === 418) {
        if (attempt >= MAX_RETRIES) {
          throw new Error(`Binance klines: ${res.status} после ${MAX_RETRIES} повторов`);
        }
        const wait = this.backoffMs(res, attempt);
        this.logger.warn(`Binance ответил ${res.status}, повтор через ${wait} мс`);
        await this.sleep(wait);
        continue;
      }

      if (!res.ok) throw new Error(`Binance klines: HTTP ${res.status}`);

      // [openTime, open, high, low, close, volume, closeTime, ...] — по возрастанию.
      const rows = (await res.json()) as unknown[][];
      return rows.map((k) => ({
        time: Number(k[0]),
        open: parseFloat(String(k[1])),
        high: parseFloat(String(k[2])),
        low: parseFloat(String(k[3])),
        close: parseFloat(String(k[4])),
        volume: parseFloat(String(k[5])),
      }));
    }
  }

  private backoffMs(res: { headers: { get(name: string): string | null } }, attempt: number): number {
    const retryAfter = Number(res.headers.get('Retry-After'));
    if (Number.isFinite(retryAfter) && retryAfter > 0) return retryAfter * 1000;
    return 1000 * 2 ** attempt;
  }
}
```

- [ ] **Step 4: Запустить тест и убедиться, что проходит**

```
npm test -- binance-klines.client.spec.ts
```
Ожидается: PASS, 6 тестов.

- [ ] **Step 5: Коммит**

```bash
git add backend/src/market-data/binance-klines.client.ts backend/src/market-data/binance-klines.client.spec.ts
git commit -m "feat(market-data): клиент публичных свечей Binance spot

Пагинация вперёд по startTime — противоположно бибитовской, поэтому
написан с нуля, а не копией getKlinesRange. 429 отступает и повторяет.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Модель PriceCandle в схеме

Старые `DailyPrice` / `HourlyPrice` **остаются на месте** — они удаляются в Task 7, после того как новые данные доедут и потребители переключатся. Так каждая задача остаётся отдельно работоспособной.

**Files:**
- Modify: `backend/prisma/schema.prisma` (добавить модель рядом с `DailyPrice`, около строки 419)

**Interfaces:**
- Consumes: ничего.
- Produces: Prisma-модель `PriceCandle` → клиент `prisma.priceCandle` с полями `symbol: string`, `timeframe: number`, `time: Date`, `open/high/low/close/volume: number`.

- [ ] **Step 1: Добавить модель в схему**

В `backend/prisma/schema.prisma`, рядом с `model DailyPrice` (строка 419), добавить:

```prisma
/// Свечи BTC для графика и бектеста — единственный источник цены в проекте.
/// Владелец таблицы — MarketDataService; напрямую в неё не ходит больше никто.
model PriceCandle {
  symbol    String // 'BTCUSDT'
  timeframe Int // длительность свечи в МИНУТАХ: 1, 5, 15, 60, 240, 1440
  time      DateTime // время ОТКРЫТИЯ свечи, UTC
  open      Float
  high      Float
  low       Float
  close     Float
  volume    Float

  // Составной первичный ключ вместо uuid: на ~5.9 млн строк суррогатный ключ
  // стоил бы ~220 МБ данных плюс собственный индекс ~265 МБ ради колонки, к
  // которой никто не обращается — свечу адресуют символом, таймфреймом и
  // временем. Этот же ключ и есть индекс диапазонного чтения, и он же
  // запрещает дубли.
  @@id([symbol, timeframe, time])
  @@map("price_candles")
}
```

- [ ] **Step 2: Применить схему — путь зависит от того, где крутится backend**

Сначала выяснить:

```
docker compose ps api
```

**Случай А — backend в Docker (контейнер `api` запущен).** Команда контейнера уже содержит `npx prisma db push` (`docker-compose.yml:51`), поэтому достаточно перезапуска:

```
docker compose restart api
docker compose logs --tail=40 api
```
Ожидается: в логах `Your database is now in sync with your Prisma schema`, дальше обычный старт Nest. Проблемы EPERM тут нет — Windows в это не вовлечён.

**Случай Б — backend на хосте (`npm run start:dev` в терминале пользователя).** На Windows `prisma generate` падает с `EPERM: operation not permitted, rename 'query_engine-windows.dll.node.tmpNNNN'`, пока watcher держит DLL движка открытой.

Сначала **спросить пользователя**, можно ли остановить backend — он может крутиться в его терминале. После разрешения:

```powershell
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -like '*backend*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
```

Проверить остаток — watcher успевает породить нового потомка:

```powershell
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -like '*backend*' } |
  Select-Object ProcessId, CommandLine
```
Ожидается: пустой вывод. Затем из `backend/`:

```
npx prisma db push
npx prisma generate
npm run start:dev
```
Ожидается: `Your database is now in sync with your Prisma schema`, среди изменений — создание `price_candles`. Ничего не удаляется, вопроса про потерю данных быть не должно.

- [ ] **Step 3: Проверить, что таблица создалась**

```
docker compose exec -T db psql -U virex -d virex -c "\d price_candles"
```

Ожидается: семь колонок (`symbol`, `timeframe`, `time`, `open`, `high`, `low`, `close`, `volume`) и **один** индекс — `price_candles_pkey` по `(symbol, timeframe, time)`. Если индексов больше одного, в схему просочился `id` или отдельный `@@unique` — вернуться к шагу 1.

- [ ] **Step 4: Коммит**

```bash
git add backend/prisma/schema.prisma
git commit -m "feat(market-data): модель PriceCandle с составным первичным ключом

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Сервис синхронизации

Главная задача плана. Один цикл на все случаи: на пустой базе он идёт от 2018 и упирается в «сегодня» примерно через 30 минут, на заполненной делает один запрос и выходит. Отдельного кода бэкфилла нет.

**Files:**
- Create: `backend/src/market-data/price-sync.service.ts`
- Test: `backend/src/market-data/price-sync.service.spec.ts`

**Interfaces:**
- Consumes: `SYNC_ORDER`, `SYMBOL`, `START_MS`, `isClosed` из Task 1; `BinanceKlinesClient`, `BinanceCandle` из Task 2; `prisma.priceCandle` из Task 3; `PrismaService` из `../prisma/prisma.service`.
- Produces:
  - `class PriceSyncService` с `sync(): Promise<{ inserted: number }>` и `syncTimeframe(tf: number): Promise<number>`

- [ ] **Step 1: Написать падающий тест**

Создать `backend/src/market-data/price-sync.service.spec.ts`:

```ts
import { PriceSyncService } from './price-sync.service';
import { START_MS } from './timeframes';
import { BinanceCandle } from './binance-klines.client';

const HOUR = 3_600_000;

const candle = (time: number): BinanceCandle => ({
  time,
  open: 100,
  high: 110,
  low: 90,
  close: 105,
  volume: 1,
});

/**
 * Сервис собирается руками с заглушками — тест про то, какие строки попадают
 * в базу и с какого места продолжается курсор, а не про Nest.
 */
function makeService(opts: {
  latestStored?: number; // время последней свечи в базе, мс
  pages: BinanceCandle[][]; // что Binance отдаёт по порядку
  insertedPerPage?: number; // что возвращает createMany.count
}) {
  const written: Array<Record<string, unknown>> = [];
  const prisma = {
    priceCandle: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          opts.latestStored != null ? { time: new Date(opts.latestStored) } : null,
        ),
      createMany: jest.fn().mockImplementation(({ data }) => {
        written.push(...data);
        return { count: opts.insertedPerPage ?? data.length };
      }),
    },
  } as never;

  const fetchKlines = jest.fn();
  for (const page of opts.pages) fetchKlines.mockResolvedValueOnce(page);
  fetchKlines.mockResolvedValue([]); // дальше история кончилась

  const service = new PriceSyncService(prisma, { fetchKlines } as never);
  (service as unknown as { pause: unknown }).pause = jest.fn().mockResolvedValue(undefined);

  return { service, fetchKlines, written };
}

describe('PriceSyncService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('на пустой базе начинает с 2018-01-01', async () => {
    const { service, fetchKlines } = makeService({ pages: [[]] });

    await service.syncTimeframe(60);

    expect(fetchKlines).toHaveBeenCalledWith('BTCUSDT', 60, START_MS, 1000);
  });

  it('на заполненной продолжает со следующей миллисекунды после последней свечи', async () => {
    const stored = Date.UTC(2026, 0, 1, 10, 0, 0);
    const { service, fetchKlines } = makeService({ latestStored: stored, pages: [[]] });

    await service.syncTimeframe(60);

    expect(fetchKlines).toHaveBeenCalledWith('BTCUSDT', 60, stored + 1, 1000);
  });

  it('не пишет незакрытую свечу', async () => {
    const now = Date.UTC(2026, 0, 1, 12, 30, 0);
    jest.spyOn(Date, 'now').mockReturnValue(now);
    const closedOpen = Date.UTC(2026, 0, 1, 11, 0, 0); // закрылась в 12:00
    const formingOpen = Date.UTC(2026, 0, 1, 12, 0, 0); // закроется в 13:00

    const { service, written } = makeService({
      latestStored: closedOpen - HOUR,
      pages: [[candle(closedOpen), candle(formingOpen)]],
    });

    await service.syncTimeframe(60);

    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({ symbol: 'BTCUSDT', timeframe: 60, time: new Date(closedOpen) });
  });

  it('выходит, когда в странице нет ни одной закрытой свечи', async () => {
    const now = Date.UTC(2026, 0, 1, 12, 30, 0);
    jest.spyOn(Date, 'now').mockReturnValue(now);
    const formingOpen = Date.UTC(2026, 0, 1, 12, 0, 0);

    const { service, fetchKlines, written } = makeService({
      latestStored: formingOpen - HOUR,
      pages: [[candle(formingOpen)]],
    });

    await service.syncTimeframe(60);

    expect(written).toHaveLength(0);
    expect(fetchKlines).toHaveBeenCalledTimes(1);
  });

  // Регрессия: если курсор двигать по числу ВСТАВЛЕННЫХ строк, страница,
  // целиком отсеянная skipDuplicates, оставит его на месте — и цикл будет
  // запрашивать одно и то же вечно.
  it('двигает курсор по полученной свече, даже когда вставлено ноль строк', async () => {
    const now = Date.UTC(2026, 0, 2, 0, 0, 0);
    jest.spyOn(Date, 'now').mockReturnValue(now);
    const first = Date.UTC(2026, 0, 1, 10, 0, 0);
    const second = Date.UTC(2026, 0, 1, 11, 0, 0);

    const { service, fetchKlines } = makeService({
      latestStored: first - HOUR,
      pages: [[candle(first)], [candle(second)]],
      insertedPerPage: 0, // всё уже лежит в базе
    });

    await service.syncTimeframe(60);

    expect(fetchKlines).toHaveBeenNthCalledWith(2, 'BTCUSDT', 60, first + 1, 1000);
    expect(fetchKlines).toHaveBeenNthCalledWith(3, 'BTCUSDT', 60, second + 1, 1000);
  });

  it('обходит все шесть таймфреймов от крупного к мелкому', async () => {
    const { service, fetchKlines } = makeService({ pages: [] });

    await service.sync();

    const timeframes = fetchKlines.mock.calls.map((c) => c[1]);
    expect(timeframes).toEqual([1440, 240, 60, 15, 5, 1]);
  });

  it('второй одновременный проход не запускается поверх идущего', async () => {
    const { service, fetchKlines } = makeService({ pages: [] });
    (service as unknown as { syncing: boolean }).syncing = true;

    const result = await service.sync();

    expect(result).toEqual({ inserted: 0 });
    expect(fetchKlines).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что падает**

```
npm test -- price-sync.service.spec.ts
```
Ожидается: FAIL — `Cannot find module './price-sync.service'`.

- [ ] **Step 3: Написать реализацию**

Создать `backend/src/market-data/price-sync.service.ts`:

```ts
import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BinanceKlinesClient } from './binance-klines.client';
import { SYMBOL, START_MS, SYNC_ORDER, isClosed } from './timeframes';

const SYNC_INTERVAL_MS = 15 * 60_000;
const PAGE_LIMIT = 1000;
// ~3.3 запроса в секунду. Вес klines с limit=1000 у Binance равен 5, то есть
// около 1000 единиц веса в минуту при лимите 1200 — запас есть, но небольшой.
const PAGE_DELAY_MS = 300;

/**
 * Держит `price_candles` заполненной свечами BTCUSDT с Binance spot.
 *
 * Отдельного режима первоначальной заливки НЕТ: цикл всегда идёт вперёд от
 * последней сохранённой свечи. На пустой базе он стартует от 2018 года и
 * упирается в «сегодня» примерно через полчаса, на заполненной делает один
 * запрос и выходит — это один и тот же код, разница только в числе итераций.
 *
 * Отсюда три свойства, ради которых так и сделано: курсор нигде не хранится
 * (нечему разъехаться с таблицей), прерывание безопасно в любой момент
 * (следующий старт продолжит с той же свечи), и пробел в истории невозможен,
 * потому что запись всегда идёт строго вперёд от максимума — именно это и
 * делает MAX(time) законным курсором, а не догадкой.
 */
@Injectable()
export class PriceSyncService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(PriceSyncService.name);
  private timer?: NodeJS.Timeout;
  private syncing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly binance: BinanceKlinesClient,
  ) {}

  onApplicationBootstrap() {
    this.sync().catch((e) => this.logger.error('первый прогон синка свечей упал', e));
    this.timer = setInterval(() => {
      this.sync().catch((e) => this.logger.error('периодический синк свечей упал', e));
    }, SYNC_INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Вынесено полем, чтобы тесты не ждали по-настоящему. */
  protected pause = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

  async sync(): Promise<{ inserted: number }> {
    if (this.syncing) return { inserted: 0 };
    this.syncing = true;
    try {
      let inserted = 0;
      for (const timeframe of SYNC_ORDER) {
        inserted += await this.syncTimeframe(timeframe);
      }
      if (inserted > 0) this.logger.log(`записано свечей: ${inserted}`);
      return { inserted };
    } finally {
      this.syncing = false;
    }
  }

  async syncTimeframe(timeframe: number): Promise<number> {
    const latest = await this.prisma.priceCandle.findFirst({
      where: { symbol: SYMBOL, timeframe },
      orderBy: { time: 'desc' },
      select: { time: true },
    });

    // На пустой базе первый запрос уйдёт ровно от START_MS.
    let cursor = latest ? latest.time.getTime() : START_MS - 1;
    let inserted = 0;

    for (;;) {
      const now = Date.now();
      const page = await this.binance.fetchKlines(SYMBOL, timeframe, cursor + 1, PAGE_LIMIT);
      if (page.length === 0) break;

      const closed = page.filter((c) => isClosed(c.time, timeframe, now));
      if (closed.length === 0) break; // догнали хвост: дальше только текущая свеча

      const { count } = await this.prisma.priceCandle.createMany({
        data: closed.map((c) => ({
          symbol: SYMBOL,
          timeframe,
          time: new Date(c.time),
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume,
        })),
        skipDuplicates: true,
      });
      inserted += count;

      // Курсор двигается по ПОЛУЧЕННОЙ свече, а не по числу вставленных:
      // skipDuplicates вернёт ноль на странице, которая уже лежит в базе, и
      // курсор, привязанный к вставкам, застрял бы навсегда.
      cursor = closed[closed.length - 1].time;

      await this.pause(PAGE_DELAY_MS);
    }

    return inserted;
  }
}
```

- [ ] **Step 4: Запустить тест и убедиться, что проходит**

```
npm test -- price-sync.service.spec.ts
```
Ожидается: PASS, 7 тестов.

- [ ] **Step 5: Коммит**

```bash
git add backend/src/market-data/price-sync.service.ts backend/src/market-data/price-sync.service.spec.ts
git commit -m "feat(market-data): синхронизация свечей BTC одним циклом

Отдельного режима бэкфилла нет — цикл всегда идёт вперёд от MAX(time),
поэтому курсор нигде не хранится и прерывание безопасно.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Чтение, контроллер и подключение модуля

После этой задачи бэкфилл впервые пойдёт по-настоящему — модуль попадает в `AppModule`, и `OnApplicationBootstrap` запустит цикл.

**Files:**
- Create: `backend/src/market-data/market-data.service.ts`
- Create: `backend/src/market-data/market-data.controller.ts`
- Create: `backend/src/market-data/market-data.module.ts`
- Test: `backend/src/market-data/market-data.service.spec.ts`
- Modify: `backend/src/app.module.ts` (импорт и запись в `imports`, рядом с `MarketEventsModule`)

**Interfaces:**
- Consumes: `TIMEFRAMES`, `isValidTimeframe`, `SYMBOL` из Task 1; `prisma.priceCandle` из Task 3.
- Produces:
  - `interface Candle { time: Date; open: number; high: number; low: number; close: number; volume: number }` — **`time` здесь `Date`**, в отличие от `BinanceCandle.time: number`
  - `interface CandleQuery { symbol?: string; timeframe: number; from?: Date; to?: Date; limit?: number }`
  - `interface Coverage { timeframe: number; from: Date | null; to: Date | null }`
  - `class MarketDataService` с `getCandles(q: CandleQuery): Promise<Candle[]>` и `getCoverage(symbol?: string): Promise<Coverage[]>`
  - `MarketDataModule`, экспортирующий `MarketDataService`

- [ ] **Step 1: Написать падающий тест**

Создать `backend/src/market-data/market-data.service.spec.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import { MarketDataService } from './market-data.service';

const rowsAsc = [
  { time: new Date('2026-01-01T00:00:00Z'), open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 },
  { time: new Date('2026-01-01T01:00:00Z'), open: 1.5, high: 2.5, low: 1, close: 2, volume: 20 },
];

function makeService() {
  const findMany = jest.fn().mockResolvedValue(rowsAsc.map((r) => ({ ...r })));
  const findFirst = jest.fn().mockResolvedValue(null);
  const prisma = { priceCandle: { findMany, findFirst } } as never;
  return { service: new MarketDataService(prisma), findMany, findFirst };
}

describe('MarketDataService.getCandles', () => {
  it('отвергает таймфрейм вне списка, а не отдаёт пустоту', async () => {
    const { service } = makeService();

    await expect(service.getCandles({ timeframe: 30 })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('фильтрует по символу, таймфрейму и диапазону', async () => {
    const { service, findMany } = makeService();
    const from = new Date('2026-01-01T00:00:00Z');
    const to = new Date('2026-01-02T00:00:00Z');

    await service.getCandles({ timeframe: 60, from, to });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { symbol: 'BTCUSDT', timeframe: 60, time: { gte: from, lte: to } },
        orderBy: { time: 'asc' },
      }),
    );
  });

  it('без limit не ставит take — внутренним потребителям нужен весь диапазон', async () => {
    const { service, findMany } = makeService();

    await service.getCandles({ timeframe: 60, from: new Date('2026-01-01T00:00:00Z') });

    expect(findMany.mock.calls[0][0].take).toBeUndefined();
  });

  // Без from «последние N свечей» — это хвост, а не голова истории.
  it('с limit и без from берёт ПОСЛЕДНИЕ свечи, но отдаёт их по возрастанию', async () => {
    const { service, findMany } = makeService();
    findMany.mockResolvedValue([{ ...rowsAsc[1] }, { ...rowsAsc[0] }]); // desc из базы

    const candles = await service.getCandles({ timeframe: 60, limit: 2 });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { time: 'desc' }, take: 2 }),
    );
    expect(candles.map((c) => c.time)).toEqual([rowsAsc[0].time, rowsAsc[1].time]);
  });

  it('с limit и с from листается вперёд', async () => {
    const { service, findMany } = makeService();

    await service.getCandles({ timeframe: 60, from: new Date('2026-01-01T00:00:00Z'), limit: 2 });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { time: 'asc' }, take: 2 }),
    );
  });
});

describe('MarketDataService.getCoverage', () => {
  it('отдаёт границы по каждому из шести таймфреймов', async () => {
    const { service, findFirst } = makeService();
    findFirst.mockResolvedValue({ time: new Date('2026-01-01T00:00:00Z') });

    const coverage = await service.getCoverage();

    expect(coverage.map((c) => c.timeframe)).toEqual([1, 5, 15, 60, 240, 1440]);
    expect(coverage[0].from).toEqual(new Date('2026-01-01T00:00:00Z'));
  });

  it('на пустом таймфрейме отдаёт null, а не выдумывает даты', async () => {
    const { service } = makeService(); // findFirst → null

    const coverage = await service.getCoverage();

    expect(coverage[0]).toEqual({ timeframe: 1, from: null, to: null });
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что падает**

```
npm test -- market-data.service.spec.ts
```
Ожидается: FAIL — `Cannot find module './market-data.service'`.

- [ ] **Step 3: Написать сервис**

Создать `backend/src/market-data/market-data.service.ts`:

```ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SYMBOL, TIMEFRAMES, isValidTimeframe } from './timeframes';

export interface Candle {
  time: Date; // время ОТКРЫТИЯ свечи
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface CandleQuery {
  symbol?: string;
  timeframe: number;
  from?: Date;
  to?: Date;
  /** Не задан — вернуть весь диапазон. Верхнюю границу ставит контроллер. */
  limit?: number;
}

export interface Coverage {
  timeframe: number;
  from: Date | null;
  to: Date | null;
}

/**
 * Единственный читатель таблицы `price_candles` в проекте. Все остальные —
 * market-events сегодня, терминал бектеста завтра — ходят сюда, а не в Prisma.
 */
@Injectable()
export class MarketDataService {
  constructor(private readonly prisma: PrismaService) {}

  /** Всегда отдаёт свечи ПО ВОЗРАСТАНИЮ времени, независимо от параметров. */
  async getCandles(q: CandleQuery): Promise<Candle[]> {
    if (!isValidTimeframe(q.timeframe)) {
      throw new BadRequestException(
        `Неизвестный таймфрейм: ${q.timeframe}. Допустимы: ${TIMEFRAMES.join(', ')}`,
      );
    }

    // Без from «последние N свечей» надо брать с хвоста: asc + take отдал бы
    // начало истории, то есть 2018 год вместо свежего графика.
    const newestFirst = q.limit != null && q.from == null;

    const rows = await this.prisma.priceCandle.findMany({
      where: {
        symbol: q.symbol ?? SYMBOL,
        timeframe: q.timeframe,
        ...(q.from || q.to ? { time: { gte: q.from, lte: q.to } } : {}),
      },
      orderBy: { time: newestFirst ? 'desc' : 'asc' },
      take: q.limit ?? undefined,
      select: { time: true, open: true, high: true, low: true, close: true, volume: true },
    });

    return newestFirst ? rows.reverse() : rows;
  }

  /**
   * Границы имеющейся истории по каждому таймфрейму. Нужен терминалу бектеста:
   * чтобы выдать случайный отрезок, надо знать, между какими датами бросать
   * кубик — и знать это отдельно по каждому ТФ, потому что пока идёт первый
   * прогон синка, у 1d история уже с 2018, а у 1m ещё на середине пути.
   */
  async getCoverage(symbol = SYMBOL): Promise<Coverage[]> {
    return Promise.all(
      TIMEFRAMES.map(async (timeframe) => {
        const [first, last] = await Promise.all([
          this.prisma.priceCandle.findFirst({
            where: { symbol, timeframe },
            orderBy: { time: 'asc' },
            select: { time: true },
          }),
          this.prisma.priceCandle.findFirst({
            where: { symbol, timeframe },
            orderBy: { time: 'desc' },
            select: { time: true },
          }),
        ]);
        return { timeframe, from: first?.time ?? null, to: last?.time ?? null };
      }),
    );
  }
}
```

- [ ] **Step 4: Запустить тест и убедиться, что проходит**

```
npm test -- market-data.service.spec.ts
```
Ожидается: PASS, 7 тестов.

- [ ] **Step 5: Написать контроллер и модуль**

Создать `backend/src/market-data/market-data.controller.ts`:

```ts
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MarketDataService } from './market-data.service';
import { SYMBOL } from './timeframes';

// Потолок отдачи наружу. Внутренние потребители (market-events) лимит не
// передают и получают весь диапазон — им нужно 17 тысяч часовых свечей за два
// года, и резать их этим числом было бы ошибкой.
const MAX_LIMIT = 5000;

const asDate = (raw?: string): Date | undefined => {
  if (!raw) return undefined;
  const ms = Number(raw);
  return Number.isFinite(ms) ? new Date(ms) : undefined;
};

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
    const requested = Number(limit);
    return this.marketData.getCandles({
      symbol: symbol ?? SYMBOL,
      timeframe: Number(tf),
      from: asDate(from),
      to: asDate(to),
      limit: Number.isFinite(requested) && requested > 0 ? Math.min(requested, MAX_LIMIT) : MAX_LIMIT,
    });
  }

  @Get('coverage')
  async getCoverage(@Query('symbol') symbol?: string) {
    return this.marketData.getCoverage(symbol ?? SYMBOL);
  }
}
```

Создать `backend/src/market-data/market-data.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { BinanceKlinesClient } from './binance-klines.client';
import { MarketDataController } from './market-data.controller';
import { MarketDataService } from './market-data.service';
import { PriceSyncService } from './price-sync.service';

@Module({
  controllers: [MarketDataController],
  providers: [MarketDataService, PriceSyncService, BinanceKlinesClient],
  exports: [MarketDataService],
})
export class MarketDataModule {}
```

- [ ] **Step 6: Подключить модуль в AppModule**

В `backend/src/app.module.ts` добавить импорт рядом с существующим импортом `MarketEventsModule`:

```ts
import { MarketDataModule } from './market-data/market-data.module';
```

и запись в массив `imports`, строкой выше `MarketEventsModule`:

```ts
    MarketDataModule,
    MarketEventsModule,
```

- [ ] **Step 7: Проверить, что бэкфилл пошёл**

Перезапустить backend (`docker compose restart api` либо перезапуск `npm run start:dev` на хосте) — `OnApplicationBootstrap` запустит цикл. В логах появится `PriceSyncService`.

Маршрут есть, если под гвардом отвечает 401, а не 404:

```
curl -s -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:8091/api/market-data/coverage"
```
Ожидается: `401`. `404` означает, что модуль не попал в `AppModule`.

Само наполнение смотреть в базе:

```
docker compose exec -T db psql -U virex -d virex -c "SELECT timeframe, count(*), min(time), max(time) FROM price_candles GROUP BY timeframe ORDER BY timeframe;"
```

Ожидается: через минуту — строка `timeframe = 1440` с `min` около 2018-01-01 и порядка трёх тысяч свечей. Остальные таймфреймы дозаполняются следующие полчаса, минутка приходит последней — это норма, а не сбой.

- [ ] **Step 8: Коммит**

```bash
git add backend/src/market-data/market-data.service.ts backend/src/market-data/market-data.service.spec.ts backend/src/market-data/market-data.controller.ts backend/src/market-data/market-data.module.ts backend/src/app.module.ts
git commit -m "feat(market-data): чтение свечей, эндпоинты и подключение модуля

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Перевод market-events на MarketDataService

**Не начинать, пока `timeframe: 60` и `timeframe: 1440` не докачаются до сегодняшнего дня** — иначе аналитика уедет в пустоту. Проверить тем же запросом, что в Task 5, шаг 7: у обоих `max(time)` должен быть в пределах последних суток.

**Files:**
- Modify: `backend/src/market-events/market-events.service.ts` (три метода: строки 34, 65, 103)
- Modify: `backend/src/market-events/market-events.module.ts`
- Test: `backend/src/market-events/market-events.service.spec.ts` (создать — сейчас его нет)

**Interfaces:**
- Consumes: `MarketDataService.getCandles`, `Candle` из Task 5.
- Produces: те же `WeekdayBucket`, `WeekdayHourBucket`, `HourlyBucket` и те же сигнатуры трёх методов — снаружи ничего не меняется.

- [ ] **Step 1: Написать падающий тест**

Создать `backend/src/market-events/market-events.service.spec.ts`:

```ts
import { MarketEventsService } from './market-events.service';
import { Candle } from '../market-data/market-data.service';

const candle = (iso: string, open: number, close: number, high = close, low = open): Candle => ({
  time: new Date(iso),
  open,
  high,
  low,
  close,
  volume: 1,
});

function makeService(candles: Candle[]) {
  const getCandles = jest.fn().mockResolvedValue(candles);
  return { service: new MarketEventsService({ getCandles } as never), getCandles };
}

describe('MarketEventsService', () => {
  it('берёт дневные свечи из MarketDataService, а не из prisma.dailyPrice', async () => {
    const { service, getCandles } = makeService([]);

    await service.getCorrelation(730);

    expect(getCandles).toHaveBeenCalledWith(
      expect.objectContaining({ timeframe: 1440, from: expect.any(Date) }),
    );
  });

  it('берёт часовые свечи таймфреймом 60', async () => {
    const { service, getCandles } = makeService([]);

    await service.getHourlyStats(730);

    expect(getCandles).toHaveBeenCalledWith(
      expect.objectContaining({ timeframe: 60, from: expect.any(Date) }),
    );
  });

  // changePct больше не колонка — он считается на месте, и это единственное
  // место, где ошибка знака или деления прошла бы незамеченной.
  it('считает changePct из open и close', async () => {
    // 2026-01-01 — четверг (getUTCDay() === 4)
    const { service } = makeService([candle('2026-01-01T00:00:00Z', 100, 110)]);

    const { weekday } = await service.getCorrelation(730);

    expect(weekday[4].days).toBe(1);
    expect(weekday[4].upDays).toBe(1);
    expect(weekday[4].avgChangePct).toBeCloseTo(10, 6);
  });

  it('считает убыточный день как down', async () => {
    const { service } = makeService([candle('2026-01-01T00:00:00Z', 100, 90)]);

    const { weekday } = await service.getCorrelation(730);

    expect(weekday[4].upDays).toBe(0);
    expect(weekday[4].avgChangePct).toBeCloseTo(-10, 6);
  });

  it('считает часовой размах как (high-low)/open', async () => {
    const { service } = makeService([candle('2026-01-01T05:00:00Z', 100, 105, 120, 100)]);

    const { hourly } = await service.getHourlyStats(730);

    expect(hourly[5].samples).toBe(1);
    expect(hourly[5].avgVolatilityPct).toBeCloseTo(20, 6);
  });

  it('раскладывает свечи по 168 клеткам «день недели × час»', async () => {
    const { service } = makeService([candle('2026-01-01T05:00:00Z', 100, 105, 120, 100)]);

    const { cells, totalSamples } = await service.getWeekdayHourStats(730);

    expect(cells).toHaveLength(168);
    expect(totalSamples).toBe(1);
    const cell = cells.find((c) => c.weekday === 4 && c.hour === 5);
    expect(cell?.samples).toBe(1);
    expect(cell?.avgVolatilityPct).toBeCloseTo(20, 6);
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что падает**

```
npm test -- market-events.service.spec.ts
```
Ожидается: FAIL — конструктор `MarketEventsService` сейчас принимает `PrismaService` и обращается к `this.prisma.dailyPrice`, поэтому тесты упадут на `Cannot read properties of undefined`.

- [ ] **Step 3: Переписать три метода**

В `backend/src/market-events/market-events.service.ts` заменить импорт и конструктор:

```ts
import { Injectable } from '@nestjs/common';
import { Candle, MarketDataService } from '../market-data/market-data.service';
```

(строка `import { PrismaService } from '../prisma/prisma.service';` удаляется)

```ts
@Injectable()
export class MarketEventsService {
  constructor(private readonly marketData: MarketDataService) {}
```

Добавить рядом с интерфейсами вверху файла:

```ts
/** changePct больше не колонка — свечи хранят только OHLCV. */
const changePct = (c: Candle): number => (c.open > 0 ? ((c.close - c.open) / c.open) * 100 : 0);
```

В `getCorrelation` заменить запрос:

```ts
    const since = new Date(Date.now() - days * 86_400_000);
    const prices = await this.marketData.getCandles({ timeframe: 1440, from: since });
```

и внутри цикла `for (const p of prices)`:

```ts
      const wd = p.time.getUTCDay();
      const change = changePct(p);
      weekdayAgg[wd].days++;
      if (change >= 0) weekdayAgg[wd].upDays++;
      weekdayAgg[wd].sum += change;
```

В `getHourlyStats` заменить запрос:

```ts
    const since = new Date(Date.now() - days * 86_400_000);
    const candles = await this.marketData.getCandles({ timeframe: 60, from: since });
```

и внутри цикла `for (const c of candles)`:

```ts
      const h = c.time.getUTCHours();
      hourAgg[h].samples++;
      const change = changePct(c);
      if (change >= 0) hourAgg[h].upSamples++;
      hourAgg[h].changeSum += change;
      if (c.open > 0) hourAgg[h].volSum += ((c.high - c.low) / c.open) * 100;
```

В `getWeekdayHourStats` заменить запрос:

```ts
    const since = new Date(Date.now() - days * 86_400_000);
    const candles = await this.marketData.getCandles({ timeframe: 60, from: since });
```

и строку доступа к клетке:

```ts
      const cell = agg[c.time.getUTCDay()][c.time.getUTCHours()];
```

- [ ] **Step 4: Подключить MarketDataModule к market-events**

В `backend/src/market-events/market-events.module.ts` заменить импорт `BybitModule` на `MarketDataModule` в `imports` — `BybitModule` был нужен только двум сервисам синка, которые удаляются в Task 7. Пока они ещё на месте, оставить оба:

```ts
import { Module } from '@nestjs/common';
import { BybitModule } from '../bybit/bybit.module';
import { MarketDataModule } from '../market-data/market-data.module';
import { MarketEventsController } from './market-events.controller';
import { MarketEventsService } from './market-events.service';
import { DailyPriceSyncService } from './daily-price-sync.service';
import { HourlyPriceSyncService } from './hourly-price-sync.service';

@Module({
  imports: [BybitModule, MarketDataModule],
  controllers: [MarketEventsController],
  providers: [MarketEventsService, DailyPriceSyncService, HourlyPriceSyncService],
  exports: [MarketEventsService],
})
export class MarketEventsModule {}
```

- [ ] **Step 5: Запустить тесты и убедиться, что проходят**

```
npm test -- market-events.service.spec.ts
```
Ожидается: PASS, 6 тестов.

Затем весь набор — переключение конструктора могло задеть чужие тесты:
```
npm test
```
Ожидается: PASS целиком.

- [ ] **Step 6: Проверить живьём, что аналитика не опустела**

Открыть в приложении раздел с «Вероятностями» (панель дней недели) и убедиться, что числа на месте, а не нули. Либо, если backend запущен и есть кука сессии, дёрнуть `/api/market-events/correlation` и проверить, что `totalDays` больше нуля.

- [ ] **Step 7: Коммит**

```bash
git add backend/src/market-events/market-events.service.ts backend/src/market-events/market-events.service.spec.ts backend/src/market-events/market-events.module.ts
git commit -m "refactor(market-events): читать свечи через MarketDataService

changePct больше не колонка — считается из open/close на месте.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Удаление старых таблиц, сервисов и сверка порогов mkt.hour

**Files:**
- Delete: `backend/src/market-events/daily-price-sync.service.ts`
- Delete: `backend/src/market-events/hourly-price-sync.service.ts`
- Modify: `backend/src/market-events/market-events.module.ts`
- Modify: `backend/src/scripts/volatile-hour-preview.ts:16,35-38,40,48`
- Modify: `backend/prisma/schema.prisma` (удалить `model DailyPrice` и `model HourlyPrice`)

**Interfaces:**
- Consumes: `prisma.priceCandle` из Task 3.
- Produces: ничего нового; `prisma.dailyPrice` и `prisma.hourlyPrice` перестают существовать.

- [ ] **Step 1: Снять эталон порогов ДО смены источника**

Пока `hourly_prices` ещё жива (её наполняет `HourlyPriceSyncService`, который удаляется только на следующем шаге), записать, что сигнал говорит сейчас:

```
cd backend
npx ts-node -r tsconfig-paths/register src/scripts/volatile-hour-preview.ts > ../before-bybit.txt
```

Если на хосте нет `node_modules` (backend живёт только в Docker) — то же самое изнутри контейнера:

```
docker compose exec -T api npx ts-node -r tsconfig-paths/register src/scripts/volatile-hour-preview.ts > before-bybit.txt
```

Файл временный, в git не добавлять.

- [ ] **Step 2: Удалить два сервиса синка**

```bash
git rm backend/src/market-events/daily-price-sync.service.ts backend/src/market-events/hourly-price-sync.service.ts
```

И привести `backend/src/market-events/market-events.module.ts` к виду:

```ts
import { Module } from '@nestjs/common';
import { MarketDataModule } from '../market-data/market-data.module';
import { MarketEventsController } from './market-events.controller';
import { MarketEventsService } from './market-events.service';

@Module({
  imports: [MarketDataModule],
  controllers: [MarketEventsController],
  providers: [MarketEventsService],
  exports: [MarketEventsService],
})
export class MarketEventsModule {}
```

`BybitModule` уходит: он был нужен только удалённым сервисам. Сам `BybitMarketService` остаётся жить — его держат `trades/trade-context.service.ts` и `trades/indicators.service.ts` по произвольным символам пользователя.

- [ ] **Step 3: Перевести скрипт превью на новую таблицу**

В `backend/src/scripts/volatile-hour-preview.ts`:

строка 16 — заменить `на живой таблице hourly_prices.` на `на живой таблице price_candles.`;

строки 35-38 заменить на:

```ts
    const candles = await prisma.priceCandle.findMany({
      where: { symbol: 'BTCUSDT', timeframe: 60, time: { gte: since } },
      orderBy: { time: 'asc' },
    });
```

строка 40 — заменить `'В hourly_prices нет свечей за период'` на `'В price_candles нет часовых свечей за период'`;

строка 48 заменить на:

```ts
      const cell = agg[c.time.getUTCDay()][c.time.getUTCHours()];
```

- [ ] **Step 4: Снять срез ПОСЛЕ и сравнить**

```
npx ts-node -r tsconfig-paths/register src/scripts/volatile-hour-preview.ts > ../after-binance.txt
diff ../before-bybit.txt ../after-binance.txt
```

**Это не автоматическая проверка, а решение владельца.** Смотреть надо на то, меняется ли для каждого пресета набор дней, в которые сигнал «молчит», и не переехал ли выбранный час. Мелкие сдвиги процентов — ожидаемый шум (на клетке «день × час» за два года около сотни свечей, шум порядка десяти процентов). Если же пресет начал молчать во все дни или, наоборот, срабатывать каждый день — показать вывод пользователю и спросить, править ли пороги в `backend/src/notifications/registry.ts`. Самостоятельно пороги не менять.

- [ ] **Step 5: Удалить старые таблицы из базы руками**

`prisma db push` откажется дропать таблицу с данными без `--accept-data-loss`, а на проде команда идёт неинтерактивно на старте контейнера — то есть api просто не поднимется. Поэтому таблицы удаляются заранее и явно, а `db push` потом не находит, что дропать.

Локально:
```
docker compose exec -T db psql -U virex -d virex -c "DROP TABLE IF EXISTS daily_prices, hourly_prices;"
```

- [ ] **Step 6: Удалить модели из схемы и применить**

В `backend/prisma/schema.prisma` удалить целиком `model DailyPrice` (строки ~419-430) и `model HourlyPrice` (строки ~437-450).

Остановить backend (та же процедура с EPERM, что в Task 3, шаг 2), затем:

```
npx prisma db push
npx prisma generate
```

Ожидается: `Your database is now in sync`, без вопроса про потерю данных — таблиц уже нет.

Поднять backend обратно: `npm run start:dev`.

- [ ] **Step 7: Прогнать тесты и сборку**

```
npm test
npm run build
```

Ожидается: оба зелёные. Изменение крупное (схема, новый модуль, удалённые сервисы), поэтому сборка обязательна.

- [ ] **Step 8: Коммит**

```bash
git add -A backend/prisma/schema.prisma backend/src/market-events backend/src/scripts/volatile-hour-preview.ts
git commit -m "refactor(market-data): убрать daily_prices и hourly_prices

Свечи BTC теперь только в price_candles, источник один — Binance spot.
Два сервиса синка с Bybit удалены, скрипт превью переведён на новую таблицу.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Деплой на прод

**Files:** изменений в коде нет.

**Interfaces:**
- Consumes: всё предыдущее.
- Produces: работающий бэкфилл на VPS.

- [ ] **Step 1: Проверить место на диске VPS ДО деплоя**

Таблица займёт ~750-800 МБ плюс WAL на вставке 5.9 млн строк. Узнать, что места нет, надо до бэкфилла, а не на 70% его.

```
ssh -p 3333 -i ~/.ssh/traders_vps root@93.187.64.13 "df -h /var/lib/docker"
```

Нужно не меньше 3 ГБ свободного. Если меньше — остановиться и показать пользователю.

- [ ] **Step 2: Удалить старые таблицы на проде**

Тем же порядком, что локально, и **до** того, как приедет код без моделей — иначе `prisma db push` на старте api откажется и контейнер не поднимется.

```
ssh -p 3333 -i ~/.ssh/traders_vps root@93.187.64.13 \
  "cd /opt/virex-trader && docker compose --env-file .env.prod -f docker-compose.prod.yml exec -T db psql -U virex -d virex -c 'DROP TABLE IF EXISTS daily_prices, hourly_prices;'"
```

- [ ] **Step 3: Влить в main и запушить**

У `origin` два push-URL — GitHub и сервер, — поэтому `git push origin main` уезжает сразу в оба места. Ветка `feat/btc-candles-storage` на сервер не поедет: `post-receive` разворачивает `main`.

```bash
git checkout main
git merge --no-ff feat/btc-candles-storage
git push origin main
```

Пуш доставляет код, но контейнеры не трогает — образы собранные, исходники внутрь не монтируются.

```
ssh -p 3333 -i ~/.ssh/traders_vps root@93.187.64.13 \
  "cd /opt/virex-trader && docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build"
```

Без `--profile edge`: 80/443 на этом сервере держит nginx хоста, поднятый профиль устроит конфликт за порты.

- [ ] **Step 4: Убедиться, что api поднялся и бэкфилл пошёл**

```
ssh -p 3333 -i ~/.ssh/traders_vps root@93.187.64.13 \
  "cd /opt/virex-trader && docker compose --env-file .env.prod -f docker-compose.prod.yml logs --tail=80 api"
```

Ожидается: `db push` отработал без вопроса про потерю данных, дальше строки `PriceSyncService`. Ошибки `Cannot find module` или падение на схеме означают, что шаг 2 не выполнен.

- [ ] **Step 5: Проверить наполнение через полчаса**

```
ssh -p 3333 -i ~/.ssh/traders_vps root@93.187.64.13 \
  "cd /opt/virex-trader && docker compose --env-file .env.prod -f docker-compose.prod.yml exec -T db psql -U virex -d virex -c 'SELECT timeframe, count(*), min(time), max(time) FROM price_candles GROUP BY timeframe ORDER BY timeframe;'"
```

Ожидается: шесть строк, у каждой `min` около 2018-01-01, `max` в пределах последнего часа. Если `timeframe = 1` ещё не дошёл до сегодня — подождать, полный проход занимает около получаса.

- [ ] **Step 6: Проверить, что аналитика на проде жива**

Открыть на проде раздел с «Вероятностями» и часовой статистикой. Числа должны быть на месте. Отдельно убедиться, что уведомление `mkt.hour` не начало сыпаться каждый час — это первый признак, что пороги поехали и шаг 4 Task 7 был прочитан слишком оптимистично.

---

## Что этот план сознательно не делает

- **Не строит терминал бектеста.** Случайный отрезок, симуляция сделок, интерфейс, режим живой торговли через вебсокет — отдельный дизайн, отдельный план. Здесь только данные, на которых он будет работать.
- **Не добирает 2017 год.** Цикл ходит только вперёд от `MAX(time)`; уменьшения `START_MS` для этого не хватит, понадобится разовый обратный проход. Отдельная маленькая работа, если когда-нибудь понадобится.
- **Не заводит второй символ.** Колонка `symbol` в схеме есть, но синк ходит за одним `BTCUSDT`.
