# Турниры — план реализации

> Исполняется в той же сессии, где написана спека (`executing-plans`, без субагентов):
> владелец попросил сразу перейти к реализации. Поэтому шаги фиксируют файлы, интерфейсы,
> тест-кейсы и команды, а код пишется прямо в задаче по TDD, без копии в этом документе.

**Goal:** страница «Турниры» — каталог игр; первая игра — торговый турнир на 2–10 участников
на одном графике с одинаковым депозитом, только в прямом эфире (реальный BTC), с призовым
фондом из взносов участников и добавки создателя, несколькими победителями с долями,
рейтингом игры и **внутренней валютой** (старт 1000, курс 500 за USDT), которая показана в
шапке и покупается тем же донатом. (Правка 2026-09-18: раньше цель включала режим «на
истории» и лидерборд турнира — их нет в первом этапе; см. спеку, «Что осознанно не
делается».)

**Architecture:** участник турнира получает обычную `BacktestSession` с `tournamentId`.
Серверный `TournamentRunner` исполняет уровни по живому хвосту минуток из
`LiveMarketService`. Терминал переезжает в `widgets/backtest-session` и переиспользуется
страницей турнира. Валюта — модуль `coins` (баланс на пользователе, журнал `CoinTransaction`);
зачёт монет за донат идёт в одной транзакции с уже существующим CAS в `claimByAmount`.

**Tech Stack:** NestJS + Prisma + PostgreSQL, jest; Next.js App Router + FSD, react-query,
next-intl, vitest.

## Global Constraints

- Мест `maxPlayers` 2–10; вход только в лобби; старт — только создатель и только когда
  участников больше `winnersCount`.
- Длительность — одно из `60, 240, 1440, 4320, 10080` минут; депозит 100 – 10 000 000.
- Взнос и добавка — целые `0 … MAX_COINS_AMOUNT` монет; списание — только CAS
  (`coinBalance >= n`), баланс не уходит в минус.
- Победителей `1 … maxPlayers − 1`; доли — целые проценты по местам, сумма 100, не
  возрастают; остаток округления — первому месту.
- Старт — 1000 монет (дефолт колонки), курс — `COINS_PER_USDT = 500`.
- Вывода монет нет; донат без `userId` монет не даёт.
- Таблицы участников внутри турнира нет: после финала — только призёры и своё место.
- Эфир: `endsAt` выровнен по минуте; тик движка — 2 с; хвост — 30 минуток, кэш 1.5 с.
- Турнирные сессии не входят в `listSessions` и `stats` бектеста.
- Повторяющиеся элементы — только `shared/ui`; цвета — классами `globals.css`.
- Тексты — `ru.json` и `en.json`: неймспейс `tournaments`, коды — `errors`.
- Коммиты — на ветке `feat/tournaments`, не пушить.

---

### Task 1: Схема

**Files:** Modify `backend/prisma/schema.prisma`.

- [x] Модели `Tournament`, `TournamentParticipant`; у `BacktestSession` — `tournamentId`,
  `endTime`, `@@unique([tournamentId, userId])`; обратные связи у `User`.
- [x] `npx prisma validate`, `npx prisma generate` (остановить `nest watch`, если держит
  движок — EPERM).
- [x] Commit — `04da63a`.

### Task 2: `checkMinute` на бэкенде

**Files:** Create `backend/src/backtest/fills.ts`, `backend/src/backtest/fills.spec.ts`.

**Produces:**
`checkMinute(p: Position, m: Bar, closeOrders?: CloseOrder[]): Exit | null`, где
`Bar = { t, o, h, l, c }` (мс), `Position = { direction, stopLoss, takeProfit }`,
`CloseOrder = { id, price, qty }`, `Exit = { reason: 'stop'|'take'|'limit', price, qty?, closeOrderId? }`.
Время выхода задаёт вызывающий: у отрезка эфира это не закрытие минутки.

- [x] Тесты — случаи `frontend/.../lib/fills.test.ts` для `checkMinute`.
- [x] Реализация — перенос правил без изменений.
- [x] `npx jest src/backtest/fills.spec.ts` — PASS (16). Commit — `75c1083`.

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

- [x] Тесты: второй вызов в пределах кэша не ходит в Binance; параллельные вызовы — один
  запрос; `minutesSince` не ходит в базу, когда `from` внутри хвоста, и хвост замещает
  хранилище по времени; `quote` при ошибке сети — 503 с кодом.
- [x] Реализация. PASS (`src/market-data`: 5 наборов, 40 тестов). Commit — `1d1239b`.

> **Остановлено здесь (2026-09-14)** по просьбе владельца. Состояние и заметки к Tasks 4–11 —
> `plans/handoffs/HANDOFF_tournaments_2026-09-14.md`.

> **Предусловие к Tasks 3a–11 (2026-09-18).** Ветка растёт от неслитой
> `feat/backtest-synthetic-market`, а в `main` с точки расхождения (`07b47b9`) ушло 32 коммита,
> в том числе два по бектесту (`6529d89` — своя страница сессии и общий `PositionsTable`,
> `b6710c3` — курсор раз в 10 с) и незакоммиченные правки терминала. Task 8 переносит те же
> файлы, поэтому **сначала закоммитить работу в `main`, потом влить `main` в
> `feat/tournaments`** и только тогда двигаться дальше. После слияния перечитать Tasks 4 и
> 8–9: их файлы могли сдвинуться.

### Task 3.5: Каталог игр `/tournaments` (2026-09-18, первым по просьбе владельца)

**Files:** Create `frontend/src/views/tournaments/{Page.tsx,model/games.ts,model/games.test.ts,components/GameCard.tsx}`,
`frontend/src/app/(app)/tournaments/page.tsx`; Modify `widgets/top-nav/TopNav.tsx`,
`shared/i18n/messages/{ru,en}.json`.

Страница чисто фронтовая: карточки из статического `GAMES`, одна запись — «Торговый турнир»
со ссылкой на `/tournaments/trading`. Сама страница игры появится в Task 10, до тех пор ссылка
ведёт в никуда — поэтому карточка помечена «скоро», пока маршрут не существует, и метка
снимается в Task 10. Пункт «Турниры» в шапке — после «Бектеста».

- [x] `games.ts` — `GAMES: readonly Game[]`, `Game = { id, href, titleKey, descriptionKey, available }`;
  тест: ids уникальны, href начинается с `/tournaments/`, у доступной игры есть ключи текстов
  в обоих языках.
- [x] `Page`, `GameCard`, маршрут, пункт шапки, i18n.
- [x] `npx tsc --noEmit`, `npx eslint`, `npx vitest run`. Commit.

### Task 3a: Схема — валюта, взнос, места (2026-09-18)

**Files:** Modify `backend/prisma/schema.prisma`.

- [x] `Tournament`: `mode` с дефолтом `"live"`, `visibility String @default("private")`,
  `@@index([visibility, status])` под общий список, `maxPlayers Int @default(10)`,
  `entryFee Int @default(0)`, `prizeBonus Int @default(0)`, `winnersCount Int @default(1)`,
  `payoutShares Int[] @default([100])`; `TournamentParticipant`: `finalEquity Float?`,
  `place Int?`, `prizeWon Int?`; `User.coinBalance Int @default(1000)` — стартовые 1000 всем,
  и нынешним аккаунтам тоже; модель `CoinTransaction` с ключом `coin_tx_once (userId, kind, refId)`
  — как в спеке.
- [x] `npx prisma validate`, `npx prisma generate` (`nest watch` держит движок — EPERM).
  На сервере `db push` только добавляет колонки с дефолтом и nullable, `--accept-data-loss`
  не нужен: новая unique-колонка на существующей таблице тут не добавляется.
- [x] Commit.

### Task 3b: Модуль `coins` и зачёт монет за донат (2026-09-18)

**Files:** Create `backend/src/coins/{coins.module.ts,coins.service.ts,coins.controller.ts,coins.service.spec.ts,coins.config.ts}`;
Modify `donations/donation.config.ts` (`COINS_PER_USDT`), `donations.service.ts`
(`claimByAmount`), `donations.module.ts`, `donations.service.spec.ts`, `app.module.ts`.

**Produces:**
- `CoinsService`: `balance(userId)`, `credit(tx, userId, n, kind, refId)`,
  `charge(tx, userId, n, kind, refId)` (бросает `INSUFFICIENT_COINS`), `refund(tx, …)` — все
  пишут строку журнала с `balanceAfter` в переданной транзакции.
- `coinsForDonation(requestedUnits: bigint): number` — от запрошенной суммы, округление вниз;
  `COINS_PER_USDT = 500` (5.00 USDT → 2500).
- `GET /api/coins` → `{ balance }` под `JwtAuthGuard`; `coinsPerUsdt` добавляется в
  существующий публичный конфиг доната (`publicConfigWithTotal`) — фронту для «≈ N монет».
- `claimByAmount`: CAS-обновление и `credit` — в одной интерактивной `$transaction`; P2002
  по-прежнему ловится снаружи и значит «уже разобран».

- [x] Тесты: `charge` в гонке двух списаний не уводит баланс в минус; два вызова
  `claimByAmount` на один перевод дают одну строку `DONATION`; зачёт от запрошенной суммы, не
  от суммы с хвостом; анонимный донат монет не даёт; падение записи доната откатывает зачёт.
- [x] Реализация. `npx jest src/coins src/donations` — PASS. Commit.

### Task 4: Бектест под турниры

**Files:** Modify `backtest.service.ts`, `backtest.controller.ts` (без изменений маршрутов),
`backtest.module.ts` (экспорт `BacktestService`, провайдер не нужен — `LiveMarketService`
приходит из `MarketDataModule`); Test `backtest.service.spec.ts`.

**Produces:**
- `systemClose(tradeId, { exitTime: Date; exitPrice: number; reason: ExitReason; qty?: number; closeOrderId?: string }): Promise<boolean>`.
- `finishTournamentSession(sessionId: string, time: Date, price: number): Promise<void>`.
- `getSession` → `{ ..., session: { ...endTime }, tournament: { id, name, mode, status, endsAt } | null }`.

- [x] Тесты: `listSessions`/`stats` фильтруют `tournamentId: null`; эфир — `openTrade` берёт
  цену и время из `quote()`, `closeTrade` с `stop` — `TOURNAMENT_LIVE_EXIT`, с `manual` — цена
  `quote()`; после `endTime` — `TOURNAMENT_ENDED`; `finish` эфира — `TOURNAMENT_LIVE_FINISH`;
  `systemClose` при проигранном CAS — `false`; `finishTournamentSession` закрывает
  остаток по цене и завершает. (2026-09-18: снят пункт про историю турнира — `endTime` для
  `BACKTEST_TIME_INVALID`, `advance` и `sessionCandles`.)
- [x] Реализация: общий `applyClose` для `closeTrade` и `systemClose`; `closeRemaining` с
  функцией цены вместо `closeAtEntry`.
- [x] `npx jest src/backtest` — PASS. Commit.

### Task 5: Места, призы, рейтинг и отрезки эфира (чистые функции)

**Files:** Create `backend/src/tournaments/leaderboard.ts`, `leaderboard.spec.ts`,
`prize.ts`, `prize.spec.ts`, `rating.ts`, `rating.spec.ts`, `live-segments.ts`,
`live-segments.spec.ts`.

**Produces:**
- `rankParticipants(input: ParticipantInput[]): RankedParticipant[]`;
  `ParticipantInput = { userId, joinedAt, session: { balance } | null, openTrades: { direction, entryPrice, qty, closedQty }[], mark: number | null }`;
  `RankedParticipant = { userId, equity, place }` — по эквити по убыванию, при равенстве
  раньше вошедший выше. (2026-09-18: вместо `leaderboardRows` — таблицы внутри турнира нет;
  остаются только эквити и место для финала. Убраны `name`, `returnPct`, `trades`, `wins`,
  `openPositions` и всё, что было нужно истории.)
- `prizePool(t: { entryFee, prizeBonus }, participants: number): number` и
  `payouts(pool: number, shares: number[]): number[]` — `floor(pool × доля / 100)` по местам,
  остаток округления — первому; `validateShares(shares, winnersCount): boolean` — длина,
  сумма 100, не возрастают, каждая ≥ 1.
- `ratingRows(input: { tournamentId, userId, name, place }[], viewerId: string): { rows: RatingRow[]; me: RatingRow | null }` —
  `RatingRow = { place, userId, name, points, tournaments, wins }`; очки за турнир —
  `участников в нём − место`; порядок — очки, победы, меньше турниров; `rows` — первые 50,
  `me` — строка вошедшего только если он ниже пятидесятого места. Вход — участники
  завершённых турниров (`place` не пуст).
- `buildSegments(snap: Snapshot | null, minutes: Bar[], until: number): { segments: Segment[]; next: Snapshot | null }`;
  `Snapshot = { at, minuteT, high, low, last }`;
  `Segment = { from, to, bar: Bar, extHigh: number | null, extLow: number | null }`.
- `barForTrade(seg: Segment, trade: { entryTime: number; entryPrice: number }): Bar | null`.

- [x] Тесты — по списку спеки. Реализация. PASS. Commit.

### Task 6: Модуль `tournaments`

**Files:** Create `tournaments.module.ts`, `tournaments.controller.ts`,
`tournaments.service.ts`, `tournaments.service.spec.ts`, `dto/tournament.dto.ts`,
`tournament-errors.ts`; Modify `app.module.ts`.

**Produces:** `TournamentsService`: `create(userId, dto)`, `listMine(userId)`,
`get(userId, id)`, `join`, `leave`, `start`, `remove`, `finalize(tournament)`,
`dueForFinal(now)`, `rating(userId)`, `listPublic()` (2026-09-18: публичные лобби с местами,
новые сверху, не больше 50). Маршруты `GET /public` и `GET /rating` объявлены раньше `:id`.

- [x] Тесты — по списку спеки, включая взнос и добавку (создание, вход, выход, удаление,
  повторный вход), дуэль на два места, старт при нескольких победителях, финал с местами и
  призами по долям и рейтинг. Маршрут `GET /rating` объявлен раньше `:id`.
- [x] Реализация: `create` — валидация долей (`TOURNAMENT_BAD_PAYOUT`), `charge` взноса и
  добавки, `join` — `charge` взноса, оба в одной транзакции со строкой участника;
  `leave`/`remove` — `refund` (при удалении — взносы всем и добавка создателю);
  `finalize` — CAS статуса, `finalEquity`, `place`, `prizeWon` и `TOURNAMENT_PRIZE`
  победителям в одной транзакции. `CoinsModule` в импортах. PASS. Commit.

### Task 7: `TournamentRunner`

**Files:** Create `tournament-runner.service.ts`, `tournament-runner.service.spec.ts`.

**Consumes:** `buildSegments`, `barForTrade`, `checkMinute`, `systemClose`,
`finishTournamentSession`, `minutesSince`, `TournamentsService.finalize`.

- [x] Тесты: стоп в отрезке; лимитка, затем стоп в одном отрезке; позиция не проверяется до
  входа; `processedUntil` сохраняется; финал ждёт закрытия последней минутки; ошибка
  турнира не останавливает остальные. Реализация. PASS.
- [x] Бэкенд целиком: `tsc` и `jest` — PASS (77 наборов, 743 теста). Commit `c164b4e`.

> **Правка правила при реализации.** `barForTrade` НЕ засчитывает экстремумы отрезка позиции,
> открытой внутри него (в спеке было «плюс новые экстремумы»). Экстремумы во времени не
> расположены, и после перезапуска, когда отрезком становится целая минутка, сделка с её
> пятидесятой секунды ловила бы стоп по минимуму десятой. Пропущенное касание наверстает
> следующий тик через две секунды; выдуманное закрытие отменить было бы нечем.
>
> Ещё: «лимитка, затем стоп в одном отрезке» из спеки невозможно — `checkMinute` отдаёт стопу
> приоритет над лимиткой в той же свече. Вместо этого проверяются две лимитки подряд (второй
> проход видит уже снятую первую) и сам приоритет стопа.

### Task 8: Переезд терминала в `widgets/backtest-session`

**Files:** `git mv frontend/src/views/backtest/{api,lib,model,components}`
→ `frontend/src/widgets/backtest-session/`; обратно в `views/backtest/components/` —
`SessionsList`, `StartSession`, `StatsBlock`; Create `widgets/backtest-session/index.ts`.

- [x] Переезд без правок кода — отдельный коммит `56fa8c6` (чистые переименования).
- [x] Импорты страницы бектеста и её блоков — через `@/widgets/backtest-session`. `SummaryCells`
  остался в виджете: он общий у итога сессии и статистики страницы.
- [x] `tsc` и `vitest` (22 набора, 271 тест) — PASS. Commit `a9972a0`.

> Восемь ошибок eslint в коде терминала (`react-hooks/set-state-in-effect` и соседние правила
> React Compiler) — не из этой работы: переезд был чистым переименованием, и они были там
> раньше. `next build` ими не гейтится.

### Task 9: Терминал — эфир и турнирные пропсы

**Files:** Create `widgets/backtest-session/lib/live.ts`, `lib/live.test.ts`,
`model/useLiveFeed.ts`; Modify `components/SessionScreen.tsx`, `api/types.ts`,
`api/hooks.ts`, `components/OrderPanel.tsx` (кнопка «Завершить» необязательна).
(2026-09-18: `lib/candles.ts` и его тест из списка убраны — адрес свечей турнирной истории
больше не нужен.)

**Produces:**
- `mergeMinutes(prev: Candle[], tail: Candle[]): Candle[]`; `liveAnchor(closed: Candle[], tf: number, now: number): number`.
- `useLiveFeed(detail: SessionDetail): Replay`.
- `SessionScreen({ id, onLeave, leaveLabel? })` (2026-09-18: `extraTab` убран — вкладки с
  лидербордом нет).

- [x] Тесты `live.ts`. Реализация. `npx vitest run`, `npx tsc --noEmit`. Commit.

### Task 10: Каталог игр, торговый турнир, рейтинг (2026-09-18: переписан под каталог)

**Files:** Create `entities/tournament/{api/hooks.ts,api/types.ts,index.ts}`,
`views/trading-tournaments/{Page.tsx,components/CreateTournament.tsx,components/TournamentsList.tsx,components/PublicTournaments.tsx,components/Rating.tsx}`,
`views/tournament/{Page.tsx,components/Winners.tsx,components/Participants.tsx,components/InviteLink.tsx,components/TournamentHead.tsx}`,
`views/trading-tournaments/model/payout-shares.ts` (+ тест: подстановка долей по числу победителей, сумма 100),
`app/(app)/tournaments/trading/page.tsx` (каталог `/tournaments` уже в Task 3.5),
`app/(app)/tournaments/trading/[id]/page.tsx`; Modify `widgets/top-nav/TopNav.tsx`,
`shared/i18n/messages/{ru,en}.json`.

- [x] `/tournaments` — каталог из `GAMES` (одна запись); `/tournaments/trading` — мои
  турниры, форма (место, депозит, длительность, взнос, добавка, победители и доли — без
  режима; итоговый фонд под формой), рейтинг; `/tournaments/trading/<id>` — состав и фонд с
  разбивкой по местам, после финала — призёры (`Winners`), таблицы участников нет.
- [x] `proxy.ts`: `next=` возвращает на `/tournaments/trading/<id>`; проверить, что путь не
  режется белым списком.
- [x] i18n, пункт «Турниры» в навигации.
- [x] `npx tsc --noEmit`, `npx eslint`, `npx vitest run`, `npx next build`. Commit.

### Task 10a: Баланс монет в шапке (2026-09-18)

**Files:** Create `entities/coins/{api/hooks.ts,ui/CoinBalance.tsx,index.ts}`; Modify
`widgets/top-nav/TopNav.tsx`, `features/donation/ui/DonateDialog.tsx` (строка «≈ N монет»),
`features/donation/ui/PaymentStep.tsx` (сброс `['coins']` при `PAID`),
`views/trading-tournaments`/`views/tournament` (сброс `['coins']` после взноса, выхода,
удаления), `shared/i18n/messages/{ru,en}.json`.

- [x] `useCoinBalance` — `GET /api/coins`, `refetchInterval` 30 с; `CoinBalance` — чип в
  правой части шапки слева от меню профиля, клик открывает `DonateDialog`; на мобильной
  раскладке шапки в две строки чип остаётся в правой части.
- [x] Тест «≈ N монет» — курс и округление вниз.
- [x] `npx tsc --noEmit`, `npx eslint`, `npx vitest run`, `npx next build`. Commit.

### Task 11: CLAUDE.md

- [x] Раздел «Турниры» (каталог игр, торговый турнир только в эфире, валюта: 1000 на старте
  и 500 за USDT, призовой фонд и доли, рейтинг игры; таблицы внутри турнира нет); пути
  терминала в разделе про бектест → `widgets/backtest-session`.
- [x] Раздел «Донаты»: донат теперь ещё и покупка монет — зачёт в одной транзакции с CAS
  `claimByAmount`; вывода монет пока нет.
- [x] Commit.
