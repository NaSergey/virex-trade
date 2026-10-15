# Ревью неиспользуемого кода (2026-10-11)

Метод: `knip@5` по фронту и бэку (бэк — с `--include classMembers`, конфиг со входами
`src/main.ts`, `src/scripts/*.ts`, `scripts/*.ts`, `*.spec.ts`), затем ручная проверка грепом и
сверка маршрутов бэка с вызовами фронта. Ничего не удалялось, сборка и тесты не запускались.
Всё ниже — **кандидаты**: перед удалением запускать `next build` (фронт) и `jest` (бэк).

## 1. Точно мёртвое

### Фронт — файлы
- `shared/ui/icon/VirexLogo.tsx` — дубль; живой логотип — `shared/ui/VirexLogo.tsx`
  (его импортируют `TourOverlay` и `CardTable`).
- `shared/ui/RewardBurst.tsx`, `shared/ui/RewardItem.tsx`, `shared/lib/hooks/useRollingNumber.ts` —
  остатки окон наград. Вместе с ними мертвы CSS-классы `rw-stage`, `rw-stage-glow`,
  `rw-stage-item`, `rw-stage-sum`, `rw-stage-day`, `rw-stamp`, `rw-note` в `globals.css`.
- `views/profile/components/`: `Achievements`, `GameRadar`, `Panel`, `TrendChart`, `XpBar`,
  `SeasonRewardsDialog`. В `CLAUDE.md` названы «оставленными компонентами» (с 2026-10-02) —
  решение владельца; история останется в git.
- `views/overview/components/HabitsBlock.tsx` — см. раздел 3.

### Фронт — зависимости (`package.json`, затронет lock-файл → нужен `next build`)
- `@radix-ui/react-popover`, `@tanstack/react-table`, `lightweight-charts`
  (последний упомянут только в комментарии `RangeCheckChart.tsx`).

### Фронт — хуки без вызовов
- `useClaimRewards` (`/api/battlepass/claim`) — потребитель только мёртвый `SeasonRewardsDialog`.
- `useSetLeverage` (`PATCH /api/backtest/sessions/:id/leverage`) → на бэке мёртв
  `BacktestController.setLeverage`.
- `useAvatar`, `useOpenPositionTags`, `useLeaveTable` (выход из-за стола делает
  `useLeaveOnExit` напрямую).

### Фронт — CSS
- `globals.css`: `chart-hint`, `chart-settings-menu`, `chart-menu-head`, `chart-menu-check`,
  `chart-menu-mark`, `cg-sub`, `an-v`.
- `landing.css`: `lp-body`, `lp-cta`, `lp-login`.

### Фронт — переводы (`ru.json` / `en.json`, ~60 ключей, поиск эвристический)
- `landing.step1…5Title/Body`, `auth.brand/loginLede/registerLede`, `common.restoringSession`,
  `overview.best/worst`, `analytics.calculating`, `coins.perUsdt`,
  `tournaments.ratingTitle/colTournaments`, `support.qrNote`, `games.soon`,
  `games.coins.season.upTo / buy.per / withdraw.value`, `poker.dealer.winsWith`.
- `backtest.indicators/positionLabel/closeMarket/colDir/marginLabel/liqLabel/botQtyPerLevel`.
- `profile.*`: `tileRank/tilePoints/tileTournaments/tileWins/tileCoins`, `dailyWaiting`,
  `xpChart/xpSeason/xpPerDay/xpEmpty`, `coinChart/coinPerDay/coinEmpty`, `perWeek/perMonth`,
  `weekBefore`, `colWhen/colEvent/colAmount/colBalance`, `notFoundTitle`,
  `avatarChange/avatarRemove/avatarBad`, `seasonNothing`, `shareCopied/shareManual`,
  `recX/recStreak/recPeak/recFav`, `rewardReady`, `feedExpand/feedCollapse`.
- Динамические семейства **не трогать** (ложные срабатывания): `onboarding.*`,
  `backtest.botReason_*`, `profile.kinds.*`, `tournaments.duration.*`, `backtest.tf.*`,
  `blackjack.status.*`, `backtest.drawings.*`, `games.items.*.description` (оставлены намеренно).
- Перед удалением перепроверить каждый ключ грепом и удалять в обоих каталогах сразу
  (паритет ru/en проверяется тестом).

### Фронт — ассеты
- `public/assets/games/poker.webp`, `blackjack.webp` — не используются (карточки теперь сцены).
- `jetpack.webp` — «лежит для сравнения» по `CLAUDE.md`; `trading.webp` в коде не подключён.

### Бэкенд
- `IndicatorsService`: `getSnapshot`, `entryGate`, `evaluateFilters`, `suggestRange` без вызовов
  (живой только `computeSnapshot`, его зовёт `TradeContextService`). Вместе с ними мёртвы
  `trades/dca-filters.ts` (остаток ветки DCA-бота) и типы `IndicatorSnapshot`-обвязки
  `EntryGate`, `RangeSuggestion`. Проверить, нужен ли после этого `BybitMarketService` в
  `IndicatorsService`.
- `TournamentsService.markPrice()` — без вызовов.
- `BacktestController.setLeverage` + сервисный метод (см. `useSetLeverage` выше).
- `package.json`: `@types/bcryptjs`, `@types/supertest`, `supertest`, `source-map-support`, `ts-loader`.
- Экспорты без потребителей (сделать неэкспортируемыми или убрать): `benjaminiHochberg`,
  `isNatural`, `categoryOf`, `MINUTE_MS`, `FEE_RATE`, `STARTING_COINS` и др. — полный список
  в выводе knip. Дубли констант: `DAY_MS` / `MINUTES_BEFORE_MS` (`backtest-math.ts`),
  `MINUTES_PER_DAY` / `LOG_VOL_MEMORY_MIN` (`synthetic/params.ts`).
- Мёртвых провайдеров NestJS нет. Эндпоинтов без вызова с фронта только `GET /health`
  (healthcheck) и `GET /api/donations/unmatched` (для владельца) — оба оставить.

### Корень репозитория
- Закоммичены пустые `Docker` и `local` (0 байт) и `dis.md` (20 КБ, обрывок CSS) — похоже на мусор.
- `cookies.txt` содержит живой `refresh_token` локального входа. В `.gitignore`, не отслеживается,
  но лучше удалить с диска.

## 2. Решения владельца (не удалять без ответа)

- **«Цена привычек»**: блок отключён закомментированным кодом в `views/overview/Page.tsx`
  (строки 13, 45, 92), но живы `HabitsService` (660 строк), `GET /api/trades/habits`,
  `backend/scripts/habits-report.ts` (+ запись в `tsconfig.build.json`), `useHabits`,
  `HabitsBlock`, `habit-labels`, `RangeScale` и логика демо `TILT_TRADES` в `seed-demo.ts`,
  подогнанная под этот блок. Вернуть в обзор или удалить целиком?
- **`widgets/card-table/index.ts`**: неиспользуемые публичные экспорты (`Dealer`, `CardBack`,
  `CHIP_COLORS`, `SUIT_COLORS`, `TableDefs`, `chipsFor`, `initials`, `seatPoint`, `slotOf`,
  `STAGE_*`, `CENTER`, `standUp`, `useStageAspect`). Модули живые, чистить только экспорты.
- **Профиль**: если ветка достижений / карты активности не возвращается — проверить на
  использование `backend/src/profile/achievements.ts` и часть рядов `series.ts`.

## 3. План выполнения (предложение)

1. Один коммит с разделом 1: фронт (файлы, хуки, CSS, переводы, ассеты, зависимости) и бэк
   (`IndicatorsService`-методы, `dca-filters`, `markPrice`, `setLeverage`, зависимости, экспорты).
2. Проверки: `npx next build`, `vitest run`, `nest build`, `jest`; повторный `knip` — должен
   стать чище. Зависимости и конфиги — по правилу крупных изменений из глобального CLAUDE.md.
3. Раздел 2 — отдельно, после решений.

Воспроизвести отчёт: `cd frontend && npx knip@5 --no-progress --reporter compact`;
бэк — тем же, с конфигом выше и `--include classMembers`.
