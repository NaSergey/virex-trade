# Эфир: несколько монет — план реализации

> **For agentic workers:** выполнение гибридом (код инлайн, ревью в контрольных
> точках). Шаги — чекбоксы `- [ ]`.

**Goal:** в своей сессии эфира и эфирном турнире торговать несколько монет из
фиксированного списка сразу, с общим депозитом.

**Architecture:** `symbol` у сделки и уровня на вход; `LiveMarketService` и
движок эфира работают по монете; история не-BTC — прокси Binance без хранения;
терминал получает переключатель монеты, таблицы — колонку монеты.

**Tech Stack:** NestJS + Prisma (jest), Next.js App Router + FSD (vitest).

Спека: `docs/superpowers/specs/2026-09-26-live-multi-coin-design.md`.

## Global Constraints

- Монеты: BTCUSDT, ETHUSDT, SOLUSDT, BNBUSDT (2 знака), AVAXUSDT, LINKUSDT (3),
  XRPUSDT, ADAUSDT (4), DOGEUSDT (5). Список — только на сервере.
- Дефолт монеты везде — `BTCUSDT`; прежние строки и прежние клиенты без
  `symbol` работают как раньше.
- История и тренажёр — только BTC (`BACKTEST_SYMBOL_UNAVAILABLE`).
- Одна открытая сделка и одна сетка на (монету, сторону).
- `formatPriceGrouped` без `decimals` ведёт себя как раньше.
- Без Playwright (память владельца); проверка — jest, vitest, tsc, eslint,
  `next build`, живой прогон через API.

## Файлы

| Файл | Что |
|---|---|
| `backend/prisma/schema.prisma` | `symbol` у `BacktestTrade`, `BacktestEntryOrder` |
| `backend/src/market-data/symbols.ts` (новый) | `LIVE_SYMBOLS`, `DEFAULT_SYMBOL`, `isLiveSymbol` |
| `backend/src/market-data/binance-klines.client.ts` | `fetchRange` (endTime), общая пауза после 429/418 |
| `backend/src/market-data/live-market.service.ts` | хвост/кэш по монете, `history` для не-BTC |
| `backend/src/market-data/market-data.controller.ts` | `?symbol=` у `live`/`candles`, `live/symbols`, `live/prices` |
| `backend/src/backtest/dto/backtest.dto.ts` | `symbol` в `OpenTradeDto`, `CreateEntryOrdersDto`, `SetLeverageDto` |
| `backend/src/backtest/backtest.service.ts` | правила по монете, `quote(symbol)`, финал с ценами монет |
| `backend/src/backtest/live-engine.service.ts` | разбор по монетам внутри потока |
| `backend/src/tournaments/tournament-runner.service.ts` | финальные цены по монетам |
| `frontend/src/shared/lib/utils/format.ts` | `decimals` у `formatPriceGrouped` |
| `frontend/src/widgets/backtest-session/api/*` | `symbol` в типах и хуках, `useLiveSymbols`, `useLivePrices` |
| `frontend/src/widgets/backtest-session/model/useLiveFeed.ts` | лента по монете |
| `frontend/src/widgets/backtest-session/components/*` | переключатель, фильтр по монете, колонка монеты, цены сделок |

## Классы риска и контрольные точки

- Задача 1 — **A** (деньги: правила входа, финал турнира).
- Задача 2 — **B** (контракт API, внешний сервис).
- Задача 3 — **A** (движок исполнения, конкурентность тиков).
- **Точка 1** — ревью задач 1–3 (бэкенд).
- Задача 4 — **B** (контракт бэк↔фронт, лента).
- Задача 5 — **B** (терминал, общий с турниром).
- **Точка 2** — ревью задач 4–5 со стыком бэк↔фронт.
- Задача 6 — **C** (документация, `db push`, сборка, живой прогон).

---

### Задача 1: монета у сделки и правила по монете (A)

**Files:** `schema.prisma`, `market-data/symbols.ts`, `backtest/dto/backtest.dto.ts`,
`backtest/backtest.controller.ts`, `backtest/backtest.service.ts`, `backtest/backtest.service.spec.ts`.

**Produces:**
- `LIVE_SYMBOLS: readonly { symbol: string; base: string; decimals: number }[]`,
  `DEFAULT_SYMBOL = 'BTCUSDT'`, `isLiveSymbol(s: string): boolean`,
  `LIVE_SYMBOL_IDS: string[]`.
- `OpenTradeInput.symbol?: string`, `CreateEntryOrdersInput.symbol?: string`,
  `setLeverage(userId, sessionId, leverage, symbol = DEFAULT_SYMBOL)`.
- `finishTournamentSession(sessionId, time, prices: Record<string, number>)` —
  нет цены монеты открытой сделки → ошибка, транзакция откатывается.

- [ ] Схема: `symbol String @default("BTCUSDT")` у `BacktestTrade` и
  `BacktestEntryOrder` с комментарием; `prisma generate`.
- [ ] `symbols.ts` со списком и шагом цены из спеки.
- [ ] DTO: `@IsOptional() @IsIn(LIVE_SYMBOL_IDS) symbol?: string` в трёх DTO.
- [ ] Падающие тесты сервиса:
  - открытие ETH-лонга при открытом BTC-лонге — принято, `count` с `symbol: 'ETHUSDT'`;
  - не-BTC в сессии не из эфира — `BACKTEST_SYMBOL_UNAVAILABLE`;
  - в эфире вход берёт `live.quote('ETHUSDT')`, выход — `quote(trade.symbol)`;
  - сетка: проверка «сетка в эту сторону уже стоит» — по монете;
  - полное закрытие снимает уровни `{ sessionId, symbol, direction }`;
  - `systemEnter` ищет открытую сделку той же монеты и открывает с монетой уровня;
  - `finishTournamentSession` закрывает каждую сделку по цене её монеты.
- [ ] Реализация: `symbolFor(s, symbol)` — дефолт BTC, не-BTC вне эфира —
  400; `withServerEntry(s, input, symbol)`, `withServerExit` — `quote(trade.symbol)`;
  `serverPrice(symbol)`; все `count`/`findFirst`/`deleteMany` по стороне — с
  `symbol`; `closeRemaining(…, priceOf: (t: { entryPrice; symbol }) => number)`.
- [ ] `npx jest backtest` зелёный.

### Задача 2: рыночные данные по монете (B)

**Files:** `binance-klines.client.ts` (+spec), `live-market.service.ts` (+spec),
`market-data.controller.ts` (+spec).

**Produces:**
- `BinanceKlinesClient.fetchRange(symbol, tf, { startTime?, endTime?, limit })`.
- `LiveMarketService.recentMinutes(symbol = DEFAULT_SYMBOL, maxAgeMs?)`,
  `snapshot(symbol?)`, `quote(symbol?)`, `minutesSince(symbol, from, until)`,
  `history(symbol, q: { timeframe; from?; to?; limit })` (только закрытые свечи,
  по возрастанию), `prices(symbols: string[]): Promise<Record<string, number>>`.
- Эндпоинты: `GET live?symbol=`, `GET live/symbols`, `GET live/prices?symbols=`,
  `GET candles?symbol=` (BTC → хранилище, список → `history`, иначе 400).

- [ ] Тесты клиента: 429 у одного запроса ставит паузу, второй параллельный
  запрос ждёт её, а не идёт сразу.
- [ ] Тесты сервиса: кэш у каждой монеты свой (`fetchRecent('ETHUSDT', 1, 30)`);
  `minutesSince('ETHUSDT', …)` до хвоста идёт в Binance (`fetchRange` от `from`),
  а не в хранилище; `history` без `from` листает назад от `to`, склеивает страницы,
  отбрасывает незакрытую свечу; с `from` — вперёд до `to`/`limit`.
- [ ] Реализация: кэш — `Map<symbol, { cache, inflight }>`; `older(symbol, from, to)`:
  BTC → `marketData.getCandles`, иначе `fetchRange` с фильтром `< to`.
- [ ] Контроллер + тесты маршрутизации `candles`.
- [ ] `npx jest market-data` зелёный.

### Задача 3: движок эфира и финал по монетам (A)

**Files:** `live-engine.service.ts` (+spec), `tournament-runner.service.ts` (+spec).

**Consumes:** `minutesSince(symbol, from, until)`, `finishTournamentSession(…, prices)`.

- [ ] Тесты движка: две монеты в одном потоке — каждая читает свои минутки
  (`minutesSince('ETHUSDT', …)`), стоп ETH исполняется по минуткам ETH, сделки
  BTC по ним не проверяются; снимок монеты без позиций снимается; `forget`
  снимает снимки всех монет потока; поток без позиций к бирже не ходит.
- [ ] Тесты раннера: финал с позициями BTC и ETH берёт две цены; нет цены
  хоть одной — ждёт; без открытых позиций — итоги без цены.
- [ ] Реализация движка: монеты = `distinct symbol` открытых сделок и уровней
  потока; снимки `поток|монета`; неактивные монеты потока — снимок удаляется;
  запросы сделок и уровней — с `symbol`.
- [ ] Реализация раннера: `finalPrices(tournamentId, endsAt)` → `Record | null`.
- [ ] `npx jest backtest tournaments` зелёный.

**Точка 1: ревью задач 1–3.**

### Задача 4: данные фронта по монете (B)

**Files:** `shared/lib/utils/format.ts` (+test), `widgets/backtest-session/api/types.ts`,
`api/hooks.ts`, `lib/candles.ts`, `model/useLiveFeed.ts`, `lib/live.ts` (+test).

**Produces:**
- `formatPriceGrouped(value, decimals?: number)`.
- `BacktestTrade.symbol`, `BacktestEntryOrder.symbol`, `LiveSymbol { symbol; base; decimals }`.
- `useLiveSymbols()`, `useLivePrices(symbols: string[], enabled)` → `Record<string, number>`.
- `fetchLiveTail(symbol)`, `fetchCandles(session, tf, range, symbol?)`.
- `useLiveFeed(detail, enabled, symbol)` — при смене монеты состояние ленты
  пустое, ответы прежней монеты не смешиваются (состояние помечено монетой).
- `useOpenTrade`/`useCreateEntryOrders` принимают `symbol`.

- [ ] Тест формата: `formatPriceGrouped(2.51347, 4) === '2.5135'`, без
  `decimals` — прежние ответы.
- [ ] Тест чистой функции ленты `forSymbol(state, symbol)`.
- [ ] Реализация; `npx vitest run` зелёный, `npx tsc --noEmit` на фронте.

### Задача 5: терминал (B)

**Files:** `SessionScreen.tsx`, `OrderPanel.tsx`, `OpenPositionsPanel.tsx`,
`OrdersPanel.tsx`, `SessionTrades.tsx`, `TradeDetails.tsx`, `ReplayChart.tsx`,
модалки, `useDrawingTools.ts`, `i18n/messages/{ru,en}.json`, `views/backtest/components/StartSession.tsx`.

- [ ] `Select` монеты в `.h2row` (только эфир); смена чистит уровни черновиков
  и подсказки.
- [ ] Уровни, лимитки, сетки, отметки — текущей монеты; рисунки — ключ
  `sessionId` у BTC, `sessionId:SYMBOL` у остальных.
- [ ] Позиции — все монеты, цена отметки: график для своей монеты,
  `useLivePrices` для остальных; модалки — цена монеты своей сделки.
- [ ] Колонка монеты — из `trade.symbol` вместо `SESSION_SYMBOL`; сетки в
  «Ордерах» — по (монета, сторона).
- [ ] Цены графика и таблиц — `decimals` монеты.
- [ ] Тексты эфира — про монеты (ru/en).
- [ ] `npx eslint` по файлам виджета, `npx vitest run`, `npx tsc --noEmit`.

**Точка 2: ревью задач 4–5 со стыком бэк↔фронт.**

### Задача 6: документация, схема, сборка (C)

- [ ] CLAUDE.md: раздел эфира — монеты, прокси истории, правила по монете.
- [ ] `db push` локально (остановив backend, если держит движок Prisma).
- [ ] `npx next build`, `npm run build` бэкенда.
- [ ] Живой прогон через API: сессия эфира, лонг BTC + лонг ETH, стоп ETH
  исполнен движком.
- [ ] Память: `virex_backtest_live_mode.md` — выбор монеты сделан.
