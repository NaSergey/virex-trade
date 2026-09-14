# Турниры — план реализации

> Исполняется в той же сессии, где написана спека (`executing-plans`, без субагентов):
> владелец попросил сразу перейти к реализации. Поэтому шаги фиксируют файлы, интерфейсы,
> тест-кейсы и команды, а код пишется прямо в задаче по TDD, без копии в этом документе.

**Goal:** турниры на 2–10 участников на одном графике с одинаковым депозитом, режимы «на
истории» и «в прямом эфире», лидерборд.

**Architecture:** участник турнира получает обычную `BacktestSession` с `tournamentId`.
История исполняется браузером, как бектест. Эфир исполняет серверный `TournamentRunner` по
живому хвосту минуток из `LiveMarketService`. Терминал переезжает в
`widgets/backtest-session` и переиспользуется страницей турнира.

**Tech Stack:** NestJS + Prisma + PostgreSQL, jest; Next.js App Router + FSD, react-query,
next-intl, vitest.

## Global Constraints

- Участников 2–10; вход только в лобби; старт — только создатель.
- Длительность — одно из `60, 240, 1440, 4320, 10080` минут; депозит 100 – 10 000 000.
- Отрезок истории — 30 дней (`FUTURE_AFTER_MS`); у истории `hideDate = hidePrice = true`.
- Эфир: `endsAt` выровнен по минуте; тик движка — 2 с; хвост — 30 минуток, кэш 1.5 с.
- Турнирные сессии не входят в `listSessions` и `stats` бектеста.
- Повторяющиеся элементы — только `shared/ui`; цвета — классами `globals.css`.
- Тексты — `ru.json` и `en.json`: неймспейс `tournaments`, коды — `errors`.
- Коммиты — на ветке `feat/tournaments`, не пушить.

---

### Task 1: Схема

**Files:** Modify `backend/prisma/schema.prisma`.

- [ ] Модели `Tournament`, `TournamentParticipant`; у `BacktestSession` — `tournamentId`,
  `endTime`, `@@unique([tournamentId, userId])`; обратные связи у `User`.
- [ ] `npx prisma validate`, `npx prisma generate` (остановить `nest watch`, если держит
  движок — EPERM).
- [ ] Commit.

### Task 2: `checkMinute` на бэкенде

**Files:** Create `backend/src/backtest/fills.ts`, `backend/src/backtest/fills.spec.ts`.

**Produces:**
`checkMinute(p: Position, m: Bar, closeOrders?: CloseOrder[]): Exit | null`, где
`Bar = { t, o, h, l, c }` (мс), `Position = { direction, stopLoss, takeProfit }`,
`CloseOrder = { id, price, qty }`, `Exit = { reason: 'stop'|'take'|'limit', price, qty?, closeOrderId? }`.
Время выхода задаёт вызывающий: у отрезка эфира это не закрытие минутки.

- [ ] Тесты — случаи `frontend/.../lib/fills.test.ts` для `checkMinute`.
- [ ] Реализация — перенос правил без изменений.
- [ ] `npx jest src/backtest/fills.spec.ts` — PASS. Commit.

### Task 3: `LiveMarketService` и `/api/market-data/live`

**Files:** Modify `binance-klines.client.ts` (необязательный `startTime`),
`market-data.controller.ts`, `market-data.module.ts`; Create `live-market.service.ts`,
`live-market.service.spec.ts`.

**Produces:**
- `recentMinutes(maxAgeMs = 1500): Promise<{ at: number; minutes: Candle[] }>` — последние 30
  минуток 1m, последняя может быть недоформированной; один запрос в полёте.
- `quote(): Promise<{ time: Date; price: number }>` — хвост не старше 1000 мс; Binance
  недоступен — `ServiceUnavailableException` с кодом `LIVE_PRICE_UNAVAILABLE`.
- `minutesSince(from: number, until: number): Promise<Candle[]>` — `price_candles` (1m) с
  `from`, поверх хвост; только `t < until`; по возрастанию.
- `GET /api/market-data/live` → `{ serverTime: string; minutes: Candle[] }`.

- [ ] Тесты: второй вызов в пределах кэша не ходит в Binance; параллельные вызовы — один
  запрос; `minutesSince` не ходит в базу, когда `from` внутри хвоста, и хвост замещает
  хранилище по времени; `quote` при ошибке сети — 503 с кодом.
- [ ] Реализация. PASS. Commit.

### Task 4: Бектест под турниры

**Files:** Modify `backtest.service.ts`, `backtest.controller.ts` (без изменений маршрутов),
`backtest.module.ts` (экспорт `BacktestService`, провайдер не нужен — `LiveMarketService`
приходит из `MarketDataModule`); Test `backtest.service.spec.ts`.

**Produces:**
- `systemClose(tradeId, { exitTime: Date; exitPrice: number; reason: ExitReason; qty?: number; closeOrderId?: string }): Promise<boolean>`.
- `finishTournamentSession(sessionId: string, time: Date, price: number): Promise<void>`.
- `getSession` → `{ ..., session: { ...endTime }, tournament: { id, name, mode, status, endsAt } | null }`.

- [ ] Тесты: `listSessions`/`stats` фильтруют `tournamentId: null`; эфир — `openTrade` берёт
  цену и время из `quote()`, `closeTrade` с `stop` — `TOURNAMENT_LIVE_EXIT`, с `manual` — цена
  `quote()`; после `endTime` — `TOURNAMENT_ENDED`; `finish` эфира — `TOURNAMENT_LIVE_FINISH`;
  история турнира — вход позже `endTime` — `BACKTEST_TIME_INVALID`, `advance` не дальше
  `endTime`; `sessionCandles` турнирной истории — из `MarketDataService` с `to` не позже
  границы; `systemClose` при проигранном CAS — `false`; `finishTournamentSession` закрывает
  остаток по цене и завершает.
- [ ] Реализация: общий `applyClose` для `closeTrade` и `systemClose`; `closeRemaining` с
  функцией цены вместо `closeAtEntry`.
- [ ] `npx jest src/backtest` — PASS. Commit.

### Task 5: Лидерборд и отрезки эфира (чистые функции)

**Files:** Create `backend/src/tournaments/leaderboard.ts`, `leaderboard.spec.ts`,
`live-segments.ts`, `live-segments.spec.ts`.

**Produces:**
- `leaderboardRows(input: ParticipantInput[]): LeaderboardRow[]`;
  `ParticipantInput = { userId, name, joinedAt, startBalance, session: { balance, status, startTime, cursorTime, endTime } | null, openTrades: { direction, entryPrice, qty, closedQty }[], closedTrades: { pnl }[], mark: number | null }`;
  `LeaderboardRow = { place, userId, name, equity, returnPct, trades, wins, openPositions, progressDay, totalDays, finished }`.
- `buildSegments(snap: Snapshot | null, minutes: Bar[], until: number): { segments: Segment[]; next: Snapshot | null }`;
  `Snapshot = { at, minuteT, high, low, last }`;
  `Segment = { from, to, bar: Bar, extHigh: number | null, extLow: number | null }`.
- `barForTrade(seg: Segment, trade: { entryTime: number; entryPrice: number }): Bar | null`.

- [ ] Тесты — по списку спеки. Реализация. PASS. Commit.

### Task 6: Модуль `tournaments`

**Files:** Create `tournaments.module.ts`, `tournaments.controller.ts`,
`tournaments.service.ts`, `tournaments.service.spec.ts`, `dto/tournament.dto.ts`,
`tournament-errors.ts`; Modify `app.module.ts`.

**Produces:** `TournamentsService`: `create(userId, dto)`, `listMine(userId)`,
`get(userId, id)`, `join`, `leave`, `start`, `remove`, `finalize(tournament)`,
`dueForFinal(now)`.

- [ ] Тесты — по списку спеки. Реализация. PASS. Commit.

### Task 7: `TournamentRunner`

**Files:** Create `tournament-runner.service.ts`, `tournament-runner.service.spec.ts`.

**Consumes:** `buildSegments`, `barForTrade`, `checkMinute`, `systemClose`,
`finishTournamentSession`, `minutesSince`, `TournamentsService.finalize`.

- [ ] Тесты: стоп в отрезке; лимитка, затем стоп в одном отрезке; позиция не проверяется до
  входа; `processedUntil` сохраняется; финал эфира ждёт закрытия последней минутки; ошибка
  турнира не останавливает остальные. Реализация. PASS.
- [ ] Бэкенд целиком: `npx tsc --noEmit`, `npx jest`. Commit.

### Task 8: Переезд терминала в `widgets/backtest-session`

**Files:** `git mv frontend/src/views/backtest/{api,lib,model,components}`
→ `frontend/src/widgets/backtest-session/`; обратно в `views/backtest/components/` —
`SessionsList`, `StartSession`, `StatsBlock`; Create `widgets/backtest-session/index.ts`.

- [ ] Переезд без правок кода — отдельный коммит.
- [ ] Импорты страницы бектеста и трёх её блоков — через `@/widgets/backtest-session`.
- [ ] `npx tsc --noEmit`, `npx vitest run`. Commit.

### Task 9: Терминал — эфир и турнирные пропсы

**Files:** Create `widgets/backtest-session/lib/live.ts`, `lib/live.test.ts`,
`model/useLiveFeed.ts`; Modify `components/SessionScreen.tsx`, `api/types.ts`,
`api/hooks.ts`, `lib/candles.ts` (+ тест), `components/OrderPanel.tsx` (кнопка «Завершить»
необязательна).

**Produces:**
- `mergeMinutes(prev: Candle[], tail: Candle[]): Candle[]`; `liveAnchor(closed: Candle[], tf: number, now: number): number`.
- `useLiveFeed(detail: SessionDetail): Replay`.
- `SessionScreen({ id, onLeave, leaveLabel?, extraTab? })`.

- [ ] Тесты `live.ts` и `candlesPath`. Реализация. `npx vitest run`, `npx tsc --noEmit`. Commit.

### Task 10: Страницы турниров

**Files:** Create `entities/tournament/{api/hooks.ts,api/types.ts,index.ts}`,
`views/tournaments/{Page.tsx,components/CreateTournament.tsx,components/TournamentsList.tsx}`,
`views/tournament/{Page.tsx,components/Leaderboard.tsx,components/InviteLink.tsx,components/TournamentHead.tsx}`,
`app/(app)/tournaments/page.tsx`, `app/(app)/tournaments/[id]/page.tsx`; Modify
`widgets/top-nav/TopNav.tsx`, `shared/i18n/messages/{ru,en}.json`.

- [ ] Реализация, i18n, пункт навигации.
- [ ] `npx tsc --noEmit`, `npx eslint`, `npx vitest run`, `npx next build`. Commit.

### Task 11: CLAUDE.md

- [ ] Раздел «Турниры»; пути терминала в разделе про бектест → `widgets/backtest-session`.
- [ ] Commit.
