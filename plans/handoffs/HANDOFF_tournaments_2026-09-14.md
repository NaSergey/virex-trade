# Турниры (торговля на одном графике против друзей): спека и план готовы, реализация остановлена после Task 3 из 11

**Date:** 2026-09-14
**Status:** IN PROGRESS (остановлено по просьбе владельца)
**Bead(s):** none
**Epic:** Турниры — страница `/tournaments`
**Chain:** `standalone-962092bb` seq `1`
**Parent:** `none — first in chain`
**Prior chain:** none — first in chain

---

## Исходная задача (дословно) и всё, что с ней связано

Владелец попросил записать саму задачу и всё, что к ней относится. Ниже его сообщения за
сессию — дословно, в порядке поступления.

**1. Постановка задачи (первое сообщение):**

> Сделай спеку для странице турнир, где пользователи так же будут торговать между собой.
> Можно будет создать турнир и приглосить пользователей по ссылке на турнир, что бы они
> соревновались между собой. Кто больше заработает с одинаковым депозитом, график
> используется 1 и тот же. Можно торговать на истории или в прямом эфире в жизни графика
> биткойна. от 2 до 10 участников. Так же на странице будет лидерборд со всеми участниками.

**2. Посреди исследования кода (вопросов ещё не задавалось):**

> Не задавай вопросов. Реализуй что я написал, просто мне нужно уходить. Можешь сделать
> спеку, потом перейти к реализации.

**3. Во время Task 4 (чтение тестов бектеста, правок ещё не было):**

> Остановишь и запиши всё что сделал

**4. Во время записи этого файла:**

> И запиши саму задачу, всё что с ней связано

### Требования, извлечённые из постановки

| # | Требование владельца | Как отражено в спеке |
|---|---|---|
| 1 | Отдельная страница «Турнир» | `/tournaments` (список + создание) и `/tournaments/<id>` (турнир) |
| 2 | Пользователи торгуют «так же» | тот же терминал бектеста (`SessionScreen`), турнирная сессия = `BacktestSession` |
| 3 | Турнир можно создать | форма: название, режим, депозит, длительность |
| 4 | Приглашение по ссылке на турнир | ссылка = адрес страницы `/tournaments/<id>` (UUID) |
| 5 | Соревнуются: кто больше заработает | место по эквити = депозит сессии + нереализованный PnL |
| 6 | Одинаковый депозит | `Tournament.startBalance` → у всех сессий один `startBalance` |
| 7 | График один и тот же | история: один `startTime` и один `priceScale` на всех; эфир: живой BTC |
| 8 | Торговля на истории | режим `history`: отрезок истории BTC, каждый в своём темпе |
| 9 | Торговля в прямом эфире на живом графике BTC | режим `live`: реальное время, исполнение на сервере |
| 10 | От 2 до 10 участников | старт от 2, вход закрыт на 11-м (`TOURNAMENT_FULL`, `TOURNAMENT_TOO_FEW`) |
| 11 | На странице лидерборд всех участников | таблица на странице турнира + вкладка «Лидерборд» в терминале |

### Связанные артефакты

- Спека: `docs/superpowers/specs/2026-09-14-tournaments-design.md` (394 строки), коммит `dcb4ca9`.
- План: `docs/superpowers/plans/2026-09-14-tournaments.md` (175 строк, 11 задач), коммит `1af329f`.
- Ветка: `feat/tournaments` (от `feat/backtest-synthetic-market` @ `a440f55`), не запушена.
- Спеки, на которые турнир опирается:
  - `docs/superpowers/specs/2026-09-10-backtest-replay-design.md` — сессия, сделка, правила срабатывания, «защита визуальная»;
  - `docs/superpowers/specs/2026-09-11-backtest-live-chart-design.md` — минутный тик, зум/пан, `HISTORY_CAP_MS`;
  - `docs/superpowers/specs/2026-09-12-backtest-*` и `2026-09-13-backtest-terminal-design.md` — хедж, плечо, частичные закрытия, лимит-ордера на закрытие;
  - `docs/superpowers/specs/2026-09-14-backtest-synthetic-market-design.md` — `dataSource`, эндпоинт свечей сессии, `endTime`-подобная граница у тренажёра;
  - `docs/superpowers/specs/2026-09-10-btc-candles-storage-design.md` — `price_candles`, Binance, «живая цена по вебсокету решается вместе с терминалом»;
  - `docs/superpowers/specs/2026-09-07-referral-invites-design.md` — довод «id — непрозрачный UUID, отдельный код не нужен».
- Не реализованная и конфликтующая по файлам спека: `docs/superpowers/specs/2026-09-14-backtest-limit-grid-orders-design.md` — вверху пометка владельца «НУЖНО ОБСУДИТЬ СРОЧНО !!!», трогает `SessionScreen`, `OrderPanel`, `fills`, `advance`.
- Открытый в IDE файл в начале сессии: `docs/product-direction.md` — «Virex — это платформа для трейдеров, объединяющая торговлю, анализ, тренировку и соревнование в одном пространстве». Турнир и есть «соревнование».

## Reference Documents

- `CLAUDE.md` (корень) — продуктовая рамка, правила фронта (FSD: `views/`, `widgets/` только при
  переиспользовании на 2+ страницах, `shared/ui`), разделы про бектест и тренажёр.
- `C:\Users\wxtxn\.claude\CLAUDE.md` — глобально: отвечать по-русски; крупное изменение →
  билд без вопроса, мелкое → без билда.
- Спека и план турниров (пути выше) — главный источник для продолжения.

## The Goal

Добавить в Virex турниры: пользователь создаёт турнир, зовёт от 1 до 9 человек ссылкой, все
получают одинаковый депозит и один график. Режим «на истории» — один отрезок истории BTC,
каждый проходит в своём темпе до срока. Режим «в прямом эфире» — живой BTC, время одно на
всех. Побеждает наибольшее эквити, на странице — лидерборд. По `docs/product-direction.md`
продукт объединяет «торговлю, анализ, тренировку и соревнование». Турниры закрывают
«соревнование» и приводят новых пользователей по ссылке. Конечное состояние: турнир
проходится с двух аккаунтов в обоих режимах, `next build` и тесты зелёные, раздел
«Турниры» записан в CLAUDE.md.

## Where We Are

- Ветка `feat/tournaments` создана от HEAD `feat/backtest-synthetic-market` (`a440f55`). `main` отстаёт: он на `07b47b9`, без 7 коммитов тренажёра.
- **Спека** написана и закоммичена (`dcb4ca9`). Ревью владельцем не было — он просил не спрашивать.
- **План** на 11 задач закоммичен (`1af329f`). Формат сокращённый: файлы, интерфейсы, тест-кейсы, команды. Кода в шагах нет — исполнение шло в той же сессии.
- **Task 1 — схема — ГОТОВО** (`04da63a`): `backend/prisma/schema.prisma`:
  - новые модели `Tournament` (`@@map("tournaments")`, `@@index([status, endsAt])`) и `TournamentParticipant` (`@@id([tournamentId, userId])`, `@@index([userId])`, `@@map("tournament_participants")`);
  - у `BacktestSession` — `tournamentId String?` (Cascade), `endTime DateTime?`, `@@unique([tournamentId, userId])`;
  - у `User` — `tournamentsCreated Tournament[] @relation("TournamentCreator")` и `tournamentEntries TournamentParticipant[]`;
  - `npx prisma validate` — valid, `npx prisma generate` — OK (Prisma Client v6.19.3, 206 мс);
  - **в локальную БД схема не применялась** — применится сама при старте api (`docker-compose.yml:51`: `npx prisma db push && npm run start:dev`; `start.bat:44`; прод — `docker-compose.prod.yml:66`).
- **Task 2 — `checkMinute` на бэкенде — ГОТОВО** (`75c1083`):
  - `backend/src/backtest/fills.ts` — перенос правил из `frontend/src/views/backtest/lib/fills.ts`. Отличия: в `Exit` нет `time` (время задаёт вызывающий), `CloseOrder` без `tradeId`, тип свечи называется `Bar`;
  - `backend/src/backtest/fills.spec.ts` — 16 тестов, те же случаи, что на фронте, все PASS.
- **Task 3 — живая цена — ГОТОВО** (`1d1239b`):
  - `backend/src/market-data/binance-klines.client.ts`: цикл запроса вынесен в `private request(url)`, добавлен `fetchRecent(symbol, timeframe, limit)` без `startTime`;
  - `binance-klines.client.spec.ts`: тест «хвост без startTime»;
  - `backend/src/market-data/live-market.service.ts`: `LiveMarketService` — `recentMinutes(maxAgeMs = 1500)`, `snapshot()` (без биржи — 503), `quote()`, `minutesSince(from, until)`;
  - `backend/src/market-data/live-market.service.spec.ts`: 8 тестов;
  - `market-data.module.ts`: провайдер и экспорт `LiveMarketService`;
  - `market-data.controller.ts`: `GET /api/market-data/live` → `{ serverTime, minutes }`;
  - `npx jest src/market-data` — 5 наборов, 40 тестов, все PASS (варнинги 429 в логе — из тестов клиента на ретраи, ожидаемо).
- **Task 4 — бектест под турниры — НЕ НАЧАТ.** Был прочитан `backend/src/backtest/backtest.service.spec.ts` целиком (983 строки), правок нет.
- **Tasks 5–11 — НЕ НАЧАТЫ**: лидерборд и отрезки, модуль турниров, runner, переезд терминала, эфир во фронте, страницы, CLAUDE.md.
- Рабочее дерево чистое, кроме `frontend/next-env.d.ts` — эту правку сделал dev-сервер Next (`./.next/types/routes.d.ts` → `./.next/dev/types/routes.d.ts`) ещё до сессии. Её **не коммитить**.
- Бэкенд целиком (`npx tsc --noEmit`, полный `npx jest`) после Task 3 **не прогонялся** — только наборы `src/backtest/fills.spec.ts` и `src/market-data`.
- Фронт в этой сессии не менялся вообще.
- Ничего не запушено: `push origin` уходит и на VPS (память `virex_server_deploy`).

## What We Tried (Chronological)

Сессия — проектирование и начало реализации. Ниже все развилки: гипотеза → что взвешивалось → итог.

1. **Изучение основы.** Прочитаны спеки бектеста (replay, live chart, synthetic, terminal, limit/grid, storage, referrals), `backtest.service.ts` (650 строк), `backtest.controller.ts`, DTO, `useReplay.ts`, `api/hooks.ts`, `api/types.ts`, `SessionScreen.tsx` (747 строк), `lib/candles.ts`, `lib/fills.ts`, `lib/advance.ts`, `market-data/*`, `proxy.ts`, страница логина, `TopNav.tsx`, `RegisterDto`. Итог: турнир можно построить поверх `BacktestSession` почти без второго кода.
2. **История: асинхронно или «трансляцией».**
   - Асинхронно: каждый в своём темпе, пауза и шаг, срок в реальном времени.
   - Трансляция: серверные часы с фиксированной скоростью, свечи до часов, нельзя подсмотреть.
   - Итог — **асинхронно**. Владелец противопоставил «на истории» и «в прямом эфире», значит историю он представляет как прокрутку бектеста. Трансляция убрала бы паузу и шаг, ради которых реплей и существует.
   - Цена решения: честность держится на доверии (см. Key Decisions).
3. **Эфир: движок в браузере с догоном или серверный.**
   - Браузерный движок с догоном минуток при возвращении во вкладку ломается в трёх местах: у закрытой вкладки стоп не срабатывает, пока человек не вернулся, и лидерборд врёт; финалу всё равно нужен движок на сервере; подделанный запрос мог не сообщить о сработавшем стопе и закрыть позицию позже, по лучшей цене.
   - Итог — **серверный движок** только для эфира.
4. **Модель срабатывания в эфире.**
   - (a) Закрытые минутки из `price_candles` плюс быстрый синк 1m. Задержка 30–90 с. В окне задержки ручное закрытие опережает стоп на «шпильке». Минутку входа или правки уровня проверить нельзя: её экстремумы включают цены до действия. Понадобилась бы колонка `checkFrom` у сделки.
   - (b) **Отрезки цены между тиками** раз в 2 с по хвосту Binance: минутка, которую прошлый тик видел недоформированной, даёт отрезок `o = прошлая цена`, `c = текущая`, `h/l` — они же плюс новые экстремумы. Через тот же `checkMinute`.
   - Итог — **(b)**: стоп закрывается за ~2 с, одна функция правил, нет колонки `checkFrom`.
5. **Цена рыночного ордера в эфире.** Закрытие последней закрытой минутки даёт бесплатный опцион: участник видит живую цену на Binance и входит по устаревшей. Итог — **живая цена сервера** (`quote()`, хвост ≤ 1 с), время — серверное. Цену и время из браузера эфир игнорирует.
6. **Реальные данные или тренажёр для турнира на истории.** Тренажёр нельзя найти в TradingView, но владелец сказал «на истории». Итог — **реальная история** с принудительно скрытыми датой и ценой. Выбор тренажёра создателем в спеку не вошёл: это добавка сверх запроса.
7. **Серверная подмена дат и масштаба в ответах API** (чтобы devtools не выдавали эпоху). Отклонено: браузер и так грузит минутки на 3 дня вперёд (`LOOKAHEAD_MS`), будущее видно во вкладке сети, подмена закрыла бы не ту дыру.
8. **Проверка цены исполнения по свечам на истории**: цена ∈ `[min(low, prevClose), max(high, prevClose)]` минутки, которой кончается время. Диапазон покрывает все правила, включая гэп за тейком. Отклонено как бесполезное против подглядывания; в спеку не вошло.
9. **Лобби или старт при создании; вход после старта.** Итог — **лобби + кнопка старта у создателя, вход только в лобби**. Так обеспечивается «от 2 до 10» и общий момент старта в эфире. Опоздавший ждёт новый турнир.
10. **Как переиспользовать терминал на второй странице.**
    - Импорт `views/backtest` из `views/tournament` — прецедента нет, противоречит FSD.
    - Страница турнира внутри `views/backtest` — ломает «слайс на страницу».
    - Итог — **переезд терминала в `widgets/backtest-session`** по правилу CLAUDE.md: переиспользование на двух страницах подтверждено.
11. **Как выбрать `useReplay` или `useLiveFeed` без условного хука.**
    - Флаги `enabled` внутри `useReplay` — правки в 5–6 эффектах.
    - Хук пропом — риск правил React Compiler в eslint (память `virex_eslint_react_compiler_rules`).
    - Итог — **две тонкие обёртки** `ReplaySession`/`LiveSession`: они создают `closeM` и `replay` и передают их в `ActiveSession` пропами.
12. **Вебсокет или опрос.** NestJS websockets не установлен, пришлось бы настраивать Caddy. Итог — **опрос раз в 2 с**, в духе проекта («Мониторинг — опрос, а не вебхук»).
13. **Быстрый синк 1m в `PriceSyncService`.** Не нужен: хвост в 30 минуток перекрывает отставание синка (≤ 15 мин).
14. **Кто подводит финал: чтение страницы или фоновый runner.** Итог — **только runner**: у финала один исполнитель, нет гонок. Страница в окне между `endsAt` и тиком показывает «подводим итоги».
15. **Субагенты.** Харнесс требует не запускать агентов без явной просьбы, поэтому исполнение шло в основной сессии. Память владельца: «без Haiku в субагентах; пол — Sonnet».

## Key Decisions

- **Турнирная сессия — обычная `BacktestSession` с `tournamentId`** (а не отдельные модели сделок): деньги, выходы, лимит-ордера, теги, рисование — без второго кода. Отвергнуто: `TournamentParticipant.sessionId` — вместо него `@@unique([tournamentId, userId])` на сессии.
- **Честность режимов разная — осознанно.** История: браузер исполняет, сервер считает деньги; защита — скрытые дата и цена плюс одинаковый отрезок. Devtools позволяют подсмотреть будущее, и это принятая цена режима между приглашёнными людьми. Эфир: исполняет сервер, потому что время идёт и без вкладки.
- **Лобби → старт создателем → вход закрыт.** `TOURNAMENT_NOT_LOBBY`, `TOURNAMENT_FULL` (10), `TOURNAMENT_TOO_FEW` (<2), `TOURNAMENT_NOT_CREATOR` (403), `TOURNAMENT_CREATOR_LEAVE`. Удаление — только лобби и только создатель.
- **История:** один `pickStart(startWindow(...))` и один `pickPriceScale` на всех, `hideDate = hidePrice = true`, `endTime = startTime + 30 дней` (`FUTURE_AFTER_MS`), свечи — через `GET /api/backtest/sessions/:id/candles`, обрезанные по `endTime`. Прокрутка упирается в конец и завершает сессию существующим путём (`replay.ended` → `finishNow`). Когда все завершили — турнир завершается до срока.
- **Эфир:** `endsAt = начало текущей минуты + длительность` (конец выровнен по минуте). Финальная цена — закрытие минутки `[endsAt − 1м, endsAt)` после её закрытия с запасом 5 с. Отвергнуто: «цена минутки, в которую попал конец» (она позже конца).
- **Результат = эквити**: `balance + Σ знак × (марк − вход) × остаток`. Марк: эфир — живая цена; история — закрытие минутки на моменте сессии каждого участника. Сортировка по эквити, при равенстве — по `joinedAt`.
- **Турнирные сессии исключены из `listSessions` и `stats` бектеста** (`tournamentId: null`): результат под соревнованием смешал бы статистику тегов.
- **Создатель `onDelete: SetNull`**: удаление аккаунта создателя не стирает идущий турнир у остальных. Участники и сессии — Cascade.
- **Имя в лидерборде — `User.name`** (обязательно при регистрации, 2–40 символов). Почта не показывается.
- **Турнир видит любой вошедший пользователь со ссылкой** — ссылка и есть приглашение. UUID не угадать. Смотреть лидерборд могут и не участники: друзья «болеют».
- **`@@unique([tournamentId, userId])` на nullable-колонке безопасен**: Postgres считает NULL различными, и у существующих сессий бектеста (`tournamentId = NULL`) конфликта нет. `db push` применит без потери данных.
- **Ссылка = `/tournaments/<id>`**: `proxy.ts` уводит на `/login?next=<pathname>`, логин и регистрация возвращают на `next` (проверено в `app/login/page.tsx:35-36,72-73`).
- **Длительности:** 60, 240, 1440, 4320, 10080 минут (1 ч, 4 ч, 1 д, 3 д, 7 д). **Депозит** 100 – 10 000 000. **Название** 2–60 символов после обрезки пробелов.
- **Осознанно не делается:** публичный список турниров, вход после старта, отложенный старт, настройки сверх четырёх полей (число мест, длина отрезка, тренажёр), призы и рейтинг, чужие сделки, серверный движок на истории, вебсокет, особые правила для демо.

## Evidence & Data

### Коммиты ветки `feat/tournaments`

| Хэш | Сообщение | Файлы |
|---|---|---|
| `dcb4ca9` | docs(tournaments): спека — турниры на одном графике с лидербордом | spec +394 |
| `1af329f` | docs(tournaments): план реализации турниров | plan +175 |
| `04da63a` | feat(tournaments): схема — турнир, участники, турнирная сессия бектеста | schema.prisma +50 |
| `75c1083` | feat(tournaments): правила срабатывания уровней на сервере для эфира | fills.ts, fills.spec.ts +158 |
| `1d1239b` | feat(market-data): живой хвост минуток BTC и цена ордера для эфира | 6 файлов, +266 −5 |

Базовый коммит ветки: `a440f55` (docs: решения по тренажёру). `main` = `07b47b9`.

### Статус задач плана

| Task | Что | Статус |
|---|---|---|
| 1 | Схема Prisma | ✅ `04da63a` |
| 2 | `checkMinute` на бэкенде | ✅ `75c1083`, 16/16 |
| 3 | `LiveMarketService` + `/api/market-data/live` | ✅ `1d1239b`, market-data 40/40 |
| 4 | Бектест под турниры | ⏸ не начат (прочитан spec-файл) |
| 5 | `leaderboard.ts`, `live-segments.ts` | ⬜ |
| 6 | Модуль `tournaments` (service, controller, DTO) | ⬜ |
| 7 | `TournamentRunner` | ⬜ |
| 8 | Переезд терминала в `widgets/backtest-session` | ⬜ |
| 9 | Терминал: эфир, `useLiveFeed`, пропсы турнира | ⬜ |
| 10 | Страницы, `entities/tournament`, TopNav, i18n | ⬜ |
| 11 | CLAUDE.md | ⬜ |

### Прогоны тестов

| Команда (из `backend/`) | Результат |
|---|---|
| `npx jest src/backtest/fills.spec.ts` (до реализации) | FAIL: `TS2307: Cannot find module './fills'` — ожидаемо |
| `npx jest src/backtest/fills.spec.ts` | PASS, 16 tests, 4.07 s |
| `npx jest src/market-data` | PASS, 5 suites, 40 tests, 4.9 s |
| `npx prisma validate` | «The schema at prisma\schema.prisma is valid» |
| `npx prisma generate` | «Generated Prisma Client (v6.19.3) … in 206ms» |

### Константы, заданные в сессии

| Константа | Значение | Где | Почему |
|---|---|---|---|
| `TAIL_SIZE` | 30 минуток | `live-market.service.ts` | синк `price_candles` отстаёт ≤ 15 мин |
| `CACHE_MS` | 1500 мс | `live-market.service.ts` | ≤ 1 запрос к Binance за тик на весь сервер |
| `QUOTE_MAX_AGE_MS` | 1000 мс | `live-market.service.ts` | свежесть цены ордера |
| `STORED_LIMIT` | 5000 | `live-market.service.ts` | потолок чтения хранилища, как `MAX_LIMIT` |
| тик runner | 2000 мс | план / спека | стоп закрывается за ~2 с |
| запас финала эфира | 5 с | спека | минутка перед `endsAt` должна закрыться у Binance |
| длина отрезка истории | 30 дней | `FUTURE_AFTER_MS` | как у сессии тренажёра |
| опрос лидерборда | 5 с | спека | пока турнир идёт |
| опрос деталей сессии | эфир 3 с / история 15 с | спека | позиции закрывает сервер / финал по сроку |
| опрос хвоста графиком | 2 с | спека | `/api/market-data/live` |

### Эндпоинты (спроектированы)

| Метод | Путь | Статус |
|---|---|---|
| GET | `/api/market-data/live` | ✅ реализован |
| POST | `/api/tournaments` | ⬜ |
| GET | `/api/tournaments` | ⬜ |
| GET | `/api/tournaments/:id` | ⬜ |
| POST | `/api/tournaments/:id/join` | ⬜ |
| POST | `/api/tournaments/:id/leave` | ⬜ |
| POST | `/api/tournaments/:id/start` | ⬜ |
| DELETE | `/api/tournaments/:id` | ⬜ |

### Коды ошибок (спроектированы)

| Код | HTTP | Когда | Статус |
|---|---|---|---|
| `LIVE_PRICE_UNAVAILABLE` | 503 | Binance не ответил на `quote()`/`snapshot()` | ✅ в `LiveMarketService` |
| `TOURNAMENT_NOT_FOUND` | 404 | турнира нет | ⬜ |
| `TOURNAMENT_NOT_LOBBY` | 409 | вход/выход/старт/удаление не в лобби | ⬜ |
| `TOURNAMENT_FULL` | 409 | уже 10 | ⬜ |
| `TOURNAMENT_TOO_FEW` | 409 | старт при одном | ⬜ |
| `TOURNAMENT_NOT_CREATOR` | 403 | старт/удаление не создателем | ⬜ |
| `TOURNAMENT_CREATOR_LEAVE` | 409 | создатель выходит | ⬜ |
| `TOURNAMENT_ENDED` | 409 | правка эфирной сессии после `endTime` | ⬜ |
| `TOURNAMENT_LIVE_EXIT` | 400 | браузер прислал stop/take/limit/finish в эфире | ⬜ |
| `TOURNAMENT_LIVE_FINISH` | 409 | участник завершает эфирную сессию | ⬜ |
| `BACKTEST_NO_HISTORY` | 409 | старт истории без минуток (существующий код) | переиспользуется |

Переводы кодов — неймспейс `errors` в `frontend/src/shared/i18n/messages/{ru,en}.json`: `apiJson` переводит по `code` через `setErrorMessages`.

### Сравнение моделей срабатывания в эфире (развилка 4)

| Свойство | (a) закрытые минутки из хранилища | (b) отрезки между тиками (выбрано) |
|---|---|---|
| Задержка закрытия по стопу | 30–90 с после закрытия минутки | ~2 с |
| Ручное закрытие опережает стоп на «шпильке» | да, в окне задержки | нет (окно ≤ 2 с) |
| Минутка входа/правки | не проверяется или ложный стоп | вход — от цены входа, без экстремумов до него |
| Новая колонка | `BacktestTrade.checkFrom` | не нужна |
| Функция правил | `checkMinute` | тот же `checkMinute` |
| Перезапуск api | без потерь | первая минутка проверяется целиком |
| Запросов к Binance | синк 1m раз в 20–60 с | 1 на тик (кэш 1.5 с), только пока нужно |

### Сравнение подходов к истории (развилка 2)

| Свойство | Асинхронно (выбрано) | Трансляция |
|---|---|---|
| Пауза, шаг, скорости | есть | нет |
| Нужны все онлайн одновременно | нет | да |
| Подглядеть будущее через devtools | можно | нельзя |
| Переиспользование реплея | полное | новый режим терминала |
| Серверный движок для истории | не нужен | нужен |

## Code Analysis

### Бэкенд — бектест (прочитано, Task 4 будет править)

- `BacktestService` (`backend/src/backtest/backtest.service.ts`): конструктор `(prisma, marketData: MarketDataService, synthetic: SyntheticMarketService)`, поле `protected rnd = Math.random`. **Task 4 добавит 4-й параметр `live: LiveMarketService`** → поправить `makeService()` в spec (строка ~62: `new BacktestService(prisma, marketData, synthetic)`).
- `bumpCursor(db, id, t)` (стр. 646–648): `UPDATE backtest_sessions SET cursorTime = GREATEST(...) WHERE id AND status='active'` — это одновременно замок строки сессии и защита статуса. Возвращает число строк; 0 значит «сессия завершена».
- `openTrade` (263–320): проверка `entryTime < startTime` → `BACKTEST_TIME_INVALID`; сторона стопа и тейка от `entryPrice`; в транзакции `bumpCursor`, гвард по направлению (хедж), `balance <= 0` → `BACKTEST_NO_BALANCE`, маржа `qty*entry/leverage > balance` → `BACKTEST_MARGIN_EXCEEDS_BALANCE`.
- `closeTrade` (437–521): повтор полного закрытия с тем же `exitTime`/`exitPrice` — успех; `exitTime <= entryTime` → `BACKTEST_TIME_INVALID`; `qty > remaining + QTY_EPS` → отказ; CAS `updateMany({ where: { id, closedQty: trade.closedQty } })`; при проигрыше CAS сверка последнего `BacktestTradeExit`; пишет exit, удаляет `closeOrderId`, `balance += pnl`; при полном закрытии агрегирует fee/pnl/r и чистит close orders. **План:** вынести транзакцию в `applyClose(trade, input)` для `closeTrade` и `systemClose`.
- `closeAtEntry(tx, sessionId, time)` (583–617): закрывает остаток по `entryPrice` с причиной `finish` и чистит close orders. **План:** обобщить до `closeRemaining(tx, sessionId, time, priceOf: (trade) => number)`.
- `finish` (238–261): у устаревшего тренажёра — `closeAtEntry`, иначе при открытых сделках `BACKTEST_OPEN_TRADE`.
- `sessionCandles` (175–193): у нетренажёра `BACKTEST_NOT_SYNTHETIC`; `isSynthOutdated` → 409; неизвестный ТФ → 400.
- `listSessions` (195–204) и `stats` (545–576): фильтры по `userId` (+`dataSource`). Существующие тесты проверяют **точные** `where` (`spec:835-837`, `965-968`) — после добавления `tournamentId: null` их надо обновить.
- `BacktestModule` сейчас без `exports` — Task 4/6 добавят `exports: [BacktestService]`.
- Стиль тестов: prisma-мок руками (`jest.fn`), `$transaction` исполняет функцию с тем же объектом, хелпер `rejection(p)`, фикстуры `SESSION`, `TRADE`, `SYNTH`, `T0 = Date.UTC(2020,0,1)`, `DAY`.

### Бэкенд — market-data (прочитано и частично изменено)

- `MarketDataService.getCandles({ timeframe, from?, to?, limit? })`: при `limit` без `from` — последние N (desc + reverse), с `from` — первые N от `from`; `to` включительно по времени открытия.
- `PriceSyncService`: раз в 15 мин, порядок `1440→240→60→15→5→1`, флаг `syncing`, `isClosed(t, tf, now)` с `CLOSE_GRACE_MS = 30 000`.
- `backtest-math.ts`: `MINUTE_MS`, `DAY_MS`, `HISTORY_BEFORE_MS = 200 д`, `MINUTES_BEFORE_MS = 1 д`, `FUTURE_AFTER_MS = 30 д`, `SCALED_MIN/MAX = 100/1000`, `positionSize`, `tradeResult` (комиссия `FEE_RATE` 0.055%), `startWindow`, `pickStart`, `pickPriceScale`, `summarize`, `maxDrawdownPct`, `averageIn`.

### Алгоритм отрезков эфира (Task 5; в спеке словами, здесь точно)

```ts
// minutes — по возрастанию, t < until; MIN = 60_000
for (const m of minutes) {
  if (snap && m.t < snap.minuteT) continue;            // уже проверено
  const to = Math.min(m.t + MIN, until);
  if (snap && m.t === snap.minuteT) {                   // продолжение недоформированной
    const extHigh = m.h > snap.high ? m.h : null;
    const extLow = m.l < snap.low ? m.l : null;
    bar = { t: m.t, o: snap.last, c: m.c,
            h: Math.max(snap.last, m.c, extHigh ?? -Infinity),
            l: Math.min(snap.last, m.c, extLow ?? Infinity) };
    from = snap.at;
  } else { bar = { t: m.t, o: m.o, h: m.h, l: m.l, c: m.c }; from = m.t; extHigh = extLow = null; }
  segments.push({ from, to, bar, extHigh, extLow });
}
next = last ? { at: until, minuteT: last.t, high: last.h, low: last.l, last: last.c } : snap;

// barForTrade(seg, { entryTime, entryPrice: e })
if (entryTime > seg.to) return null;
if (entryTime <= seg.from) return seg.bar;
return { t: seg.bar.t, o: e, c: seg.bar.c,
         h: Math.max(e, seg.bar.c, seg.extHigh ?? -Infinity),
         l: Math.min(e, seg.bar.c, seg.extLow ?? Infinity) };
```

Цикл runner на отрезок: `checkMinute(position, bar, orders.filter(o => o.createdAt <= seg.to))`. Выход записывается `systemClose(trade.id, { exitTime: new Date(seg.to), exitPrice, reason, qty, closeOrderId })`, сделка перечитывается. Если это `limit` и остаток есть, ордер убирается из списка и тот же `bar` проверяется снова; при полном закрытии или проигранном CAS — дальше. После всех отрезков: `snapshots.set(t.id, next)` (в памяти) и `tournament.update({ processedUntil: new Date(next.minuteT) })`.

### Фронт — терминал (прочитано, Tasks 8–9 будут менять)

- `SessionScreen({ id, onLeave })` → `ActiveSession({ detail, onLeave })`. Внутри `closeM = useCloseTrade(session.id)` и `replay = useReplay(detail, onExit)`, `onExit` зовёт `closeTrade`. Автозавершение: `useEffect(() => { if (replay.ended) void finishRef.current(); }, [replay.ended])`. Кнопка возврата — `t('backToList')`, вкладки `open`/`history` через `Seg className="view-switch"`.
- Интерфейс `Replay` (`useReplay.ts:42-71`): `cursor, tf, shownTf, setTf, candles, glide, loadMoreHistory, historyLoading, price, ready, step, speed, setSpeed, ended, error, flush`. Константы: `LOOKAHEAD_MS = 3 д`, `CHUNK = 5000`, `CLOSED_LIMIT = 300`, `HISTORY_CAP_MS = 365 д`, `HISTORY_CHUNK = 500`, `SAVE_EVERY_MS = 3000`, `SPEEDS = [1, 4, 16, 32]`.
- `OrderPanel`: `onFinish: () => void` и `finishDisabled: boolean` обязательны, кнопка `variant="risk"` на стр. 260. **План:** сделать `onFinish` необязательным и в эфире не рисовать кнопку.
- `lib/candles.ts`: `candlesPath(s)` — synthetic → `/api/backtest/sessions/:id/candles`, иначе `/api/market-data/candles`; `visibleCandles({ closed, anchor, minutes, tf, cursor })`; `lastPrice(minutes, cursor)`; `currentBucket`, `bucketStart`, `dayNumber`.
- `lib/fills.ts` — эталон правил; `lib/advance.ts` — `advanceTo({ from, target, minutes, loadedUntil, positions, closeOrders })`.
- В `views/backtest/components/` только странице нужны `SessionsList`, `StartSession`, `StatsBlock`. `SummaryCells` используют и `SessionSummary` (терминал), и `StatsBlock` → переезжает с терминалом и экспортируется.
- vitest: `include: ['src/**/*.test.ts']`, alias `@` → `src`.
- Роуты: `app/(app)/<name>/page.tsx` реэкспортирует `@/views/<name>/Page`. Динамических `[id]` в проекте нет → страница турнира читает `useParams()` в клиентском view.
- `TopNav.tsx`: `type Tab = 'overview' | 'tags' | 'analytics' | 'market' | 'backtest' | 'settings' | 'admin'`, массив `NAV` (5 пунктов), подписи `nav.<id>`.
- i18n: `frontend/src/shared/i18n/messages/ru.json` — неймспейсы `nav` (стр. 36), `backtest` (449), `errors` (811), `onboarding` (857).
- Образец сущности: `frontend/src/entities/tag/{api/hooks.ts, api/types.ts, ui/*, index.ts}`.

### Заметки к реализации оставшихся задач (продумано, в спеке только словами)

**Task 6 — `TournamentsService`:**

- `create(userId, dto)`: `tournament.create({ data: { name, mode, startBalance, durationMin, creatorId: userId, participants: { create: { userId } } } })`.
- `listMine(userId)`: `tournament.findMany({ where: { participants: { some: { userId } } }, orderBy: { createdAt: 'desc' }, include: { _count: { select: { participants: true } } } })`.
- `get(userId, id)`: турнир + участники (`user: { select: { name } }`) + сессии с открытыми сделками (`direction, entryPrice, qty, closedQty`) и закрытыми (`pnl`) → `leaderboardRows(...)`; плюс `me: { joined, isCreator, sessionId }`. Марк-цена: эфир — `live.recentMinutes()` (последнее закрытие); история — `marketData.getCandles({ timeframe: 1, to: new Date(cursor − 60 000), limit: 1 })` на участника с открытыми позициями.
- `join`: транзакция; замок строки турнира `UPDATE tournaments SET status = status WHERE id = ? AND status = 'lobby'` (0 строк → `TOURNAMENT_NOT_LOBBY`); уже участник → успех; `count >= 10` → `TOURNAMENT_FULL`; `participant.create`.
- `leave`: только лобби; создатель → `TOURNAMENT_CREATOR_LEAVE`; `participant.deleteMany`.
- `start`: создатель, лобби, `count >= 2`.
  - История: `marketData.getCoverage()` → `startWindow(daily, minute)` (null → `BACKTEST_NO_HISTORY`) → `pickStart(win, rnd)` → цена `getCandles({ timeframe: 1, to: start − 1м, limit: 1 })` → `pickPriceScale(price, rnd)`. Сессии: `startTime = cursorTime = start`, `endTime = start + FUTURE_AFTER_MS`, `startBalance = balance = t.startBalance`, `hideDate = hidePrice = true`, `priceScale`, `dataSource: 'real'`, `status: 'active'`, `tournamentId`. `endsAt = now + duration`.
  - Эфир: `startedAt = now`, `endsAt = floorMinute(now) + duration`; сессии `startTime = cursorTime = now`, `endTime = endsAt`, `hideDate = hidePrice = false`, `priceScale = 1`.
  - Статус — `updateMany({ where: { id, status: 'lobby' }, data: { status: 'running', startedAt, endsAt } })`: 0 строк → `TOURNAMENT_NOT_LOBBY` (гонка двух стартов).
  - `rnd` — полем, как у `BacktestService`, чтобы тесты задавали случай.
- `remove`: создатель, лобби, `tournament.delete`.
- `finalizeHistory(t)`: по каждой `active`-сессии цена = закрытие минутки на `cursorTime` (тот же запрос, что у старта). Если цены нет, а открытые сделки есть — цена входа (`closeRemaining` с `t => t.entryPrice`, как у устаревшего тренажёра). Затем `backtest.finishTournamentSession(id, cursorTime, price)` и `tournament.updateMany({ where: { id, status: 'running' }, data: { status: 'finished', finishedAt } })`.
- `dueForFinal(now)`: `findMany({ where: { status: 'running', OR: [{ endsAt: { lte: now } }, { mode: 'history', sessions: { none: { status: 'active' } } }] } })`.

**Task 9 — `useLiveFeed`:**

- Минутки: первая загрузка — `fetchCandles({ dataSource: 'real' }, 1, { from: полночь UTC вчера, limit: 5000 })` (≤ 2880 минут, один запрос). Дальше опрос `/api/market-data/live` раз в 2 с → `mergeMinutes(prev, tail)` (замена по `t`, дописывание, сортировка). Если `tail[0].t > loadedUntil(prev)` — разрыв (вкладка спала): сначала `fetchCandles(..., { from: loadedUntil, limit: 5000 })`.
- Закрытые свечи ТФ: `fetchCandles(real, tf, { to: currentBucket(now, tf) − 1, limit: 300 })`. Якорь — `liveAnchor(closed, tf, now) = min(currentBucket(now, tf), last.t + tf·60 000)`: если синк не записал прошлую свечу ТФ, недоформированная собирается из минуток раньше, и дыры нет.
- `cursor = Date.now() + offset`, `offset = serverTime − Date.now()` при каждом ответе хвоста.
- `price` = закрытие последней минутки (недоформированной); `ready` = есть закрытые свечи выбранного ТФ и цена.
- `ended = cursor >= endTime`. `step`, `setSpeed`, `flush` — пустые, `speed = null`, `glide = null`. `loadMoreHistory` — как у `useReplay`.
- В `SessionScreen`: `ReplaySession` и `LiveSession` создают `closeM` и `replay`, `ActiveSession` берёт их пропами. В эфире:
  - не рисовать «Шаг», скорости и `onFinish`;
  - автозавершение по `replay.ended` не звать — финал подводит сервер;
  - метка `backtest.liveBadge` («Прямой эфир»).
- `useBacktestSession(id)`: `refetchInterval: (q) => q.state.data?.tournament?.mode === 'live' ? 3000 : q.state.data?.tournament ? 15000 : false`, только пока `session.status === 'active'`.
- `candlesPath`: турнирная история (`session.tournamentId != null` и режим истории) → свечи сессии; эфир свечи через `candlesPath` не берёт.
- `SessionSummary` и кнопка возврата — подпись из `leaveLabel ?? t('backToList')`.

**Task 10 — фронт турниров:**

- `entities/tournament/api/hooks.ts`: `useTournaments()`, `useTournament(id)` (`refetchInterval` 5000, пока `status !== 'finished'`), `useCreateTournament()`, `useJoinTournament(id)`, `useLeaveTournament(id)`, `useStartTournament(id)`, `useDeleteTournament(id)`. Инвалидация `['tournaments']` и `['tournament', id]`.
- Лидерборд (`views/tournament/components/Leaderboard.tsx`, `LedgerTable`): Место · Участник («вы» у своей строки) · Результат, % (`.pos`/`.neg`) · Депозит (`Money`) · Сделок · Статус (история: «день N из 30» / «завершил»; эфир: «в позиции» / «без позиции»). В лобби — Участник · Вошёл.
- Ссылка: `${window.location.origin}/tournaments/${id}` в readonly `Input` + «Копировать» (как `ReferralDialog`).
- Новый турнир (`views/tournaments/components/CreateTournament.tsx`): `Field`/`Input` «Название», `Seg` режима («На истории» / «В прямом эфире»), `Input` депозита (по умолчанию 10 000), `Seg` длительности (1 ч · 4 ч · 1 день · 3 дня · 7 дней, по умолчанию 1 день). После создания — `router.push('/tournaments/<id>')`.
- Ключи i18n: `nav.tournaments`; `tournaments.*` (заголовки, поля формы, режимы, длительности, статусы, действия, колонки, подсказки честности режимов); `errors.TOURNAMENT_*`, `errors.LIVE_PRICE_UNAVAILABLE`; `backtest.liveBadge`, `backtest.leaderboardTab` (если вкладку подписывает терминал) — или подпись передаёт турнир через `extraTab.label`.
- `TopNav`: `'tournaments'` в `Tab` и в `NAV` после `backtest`.

**Task 11 — CLAUDE.md:**

- Раздел «Бектест: панель ордера не знает об открытых сделках» ссылается на `frontend/src/views/backtest/components/SessionScreen.tsx` → новый путь `frontend/src/widgets/backtest-session/components/SessionScreen.tsx`.
- Новый раздел «Турниры»: сессия = `BacktestSession` с `tournamentId`; честность режимов; движок эфира и одна функция правил на режим; финал только в runner; турнирные сессии вне статистики бектеста; ссылка = адрес страницы.

### Окружение и грабли, встреченные в сессии

- PowerShell-инструмент **запоминает `Set-Location`** между вызовами: после `Set-Location backend` следующая команда шла из `backend/`. Использовать абсолютные пути.
- Git ругается `LF will be replaced by CRLF` на каждый новый файл — безвредно.
- `docker ps` в начале реализации: `virex-trader-db-1 Up 3 hours (healthy)`, контейнеры api и web не запущены, процессов `node` нет → `prisma generate` прошёл без EPERM.
- В репозитории нет `plans/` в корне — этот файл создал `plans/handoffs/` (скилл handoff).

## Files Changed

### Source code
- `backend/prisma/schema.prisma` — `Tournament`, `TournamentParticipant`; `BacktestSession.tournamentId/endTime/@@unique`; обратные связи у `User`.
- `backend/src/backtest/fills.ts` — `checkMinute(p: Position, m: Bar, closeOrders?: CloseOrder[]): Exit | null`, типы `Bar`, `Position`, `CloseOrder`, `Exit`.
- `backend/src/market-data/binance-klines.client.ts` — `fetchRecent(symbol, timeframe, limit)`, общий `private request(url)`.
- `backend/src/market-data/live-market.service.ts` — `LiveMarketService`: `recentMinutes(maxAgeMs = 1500): Promise<LiveSnapshot>`, `snapshot()`, `quote(): Promise<{ time: Date; price: number }>`, `minutesSince(from: number, until: number): Promise<Candle[]>`; `LiveSnapshot = { at: number; minutes: Candle[] }`; `protected now = Date.now`.
- `backend/src/market-data/market-data.module.ts` — `LiveMarketService` в providers и exports.
- `backend/src/market-data/market-data.controller.ts` — конструктор `(marketData, live)`, `@Get('live') getLive()`.

### Tests
- `backend/src/backtest/fills.spec.ts` — 16 случаев: касание/гэп стопа и тейка, стоп важнее тейка, шорт зеркально, без тейка, лимитки (цена/объём, приоритет стопа и тейка, ближайший к открытию, не задетый диапазон).
- `backend/src/market-data/binance-klines.client.spec.ts` — «хвост запрашивается без startTime».
- `backend/src/market-data/live-market.service.spec.ts` — кэш 1.5 с, устаревший кэш, один запрос в полёте, `quote` (цена хвоста + время сервера), 503 с кодом, `minutesSince` без базы внутри хвоста, хвост поверх хранилища и `until` не включительно, лимит хранилища без склейки через дыру.

### Docs
- `docs/superpowers/specs/2026-09-14-tournaments-design.md` — спека.
- `docs/superpowers/plans/2026-09-14-tournaments.md` — план (чекбоксы Tasks 1–3 отмечены в этой же записи).
- `plans/handoffs/HANDOFF_tournaments_2026-09-14.md` — этот файл.

### Не трогать
- `frontend/next-env.d.ts` — правка dev-сервера, была до сессии.

## User Feedback & Preferences (REQUIRED — never omit)

- «Не задавай вопросов. Реализуй что я написал, просто мне нужно уходить. Можешь сделать спеку, потом перейти к реализации.» — продуктовые развилки решать самому и записывать в спеку; ревью спеки не ждать.
- «Остановишь и запиши всё что сделал» — остановиться на чистой границе коммита и записать состояние.
- «И запиши саму задачу, всё что с ней связано» — постановка дословно и все связанные артефакты (раздел в начале файла).
- Глобально: весь текст пользователю — по-русски; код, пути, git — как принято в проекте.
- Глобально: мелкая правка → без билда; крупная (новый роут, модель, эндпоинт, рефактор на 5+ файлов) → билд без вопроса. Турниры — крупная, `next build` обязателен.
- Память `feedback_brevity`: отвечать кратко, 1–5 строк, таблицы и планы только по запросу.
- Память `feedback_brainstorm_pace`: не утверждать дизайн по секциям; технический дизайн решать самому; **не добавлять фичи сверх названных** (однажды разозлила добавка «сумма в USDT у long/short»).
- Память `feedback_no_browser_checks`: Playwright не запускать; хватает tsc/eslint/vitest, в браузере владелец смотрит сам.
- Память `feedback_no_haiku_subagents`: если субагенты — не ниже Sonnet; Opus — для брейнсторма, плана, финального ревью.
- Память `feedback_ground_trading_mechanics`: механику биржи выводить самому, не спрашивать.
- Память `feedback_fsd_layering`: в `widgets/` — только подтверждённое грепом переиспользование на 2+ страницах.
- Память `virex_server_deploy`: `push origin` уходит и на GitHub, и на VPS; хук не перезапускает контейнеры → без просьбы не пушить.
- Память `prisma_generate_eperm_windows`: при запущенном `nest watch` `prisma generate` падает EPERM → остановить процессы.

## Where We're Going

Порядок — по плану `docs/superpowers/plans/2026-09-14-tournaments.md`.

1. **Task 4 — бектест под турниры** (`backend/src/backtest/backtest.service.ts` + spec):
   - 4-й параметр конструктора `live: LiveMarketService`; `BacktestModule` → `exports: [BacktestService]`;
   - `listSessions`/`stats` + `tournamentId: null`; поправить тесты с точными `where`;
   - `getSession` → `tournament: { id, name, mode, status, endsAt } | null`;
   - эфир (сессия с турниром `mode = 'live'`):
     - `openTrade` и `addToTrade` берут `quote()` до проверок стороны стопа;
     - `closeTrade` — только `manual`, иначе `TOURNAMENT_LIVE_EXIT`;
     - после `endTime` — `TOURNAMENT_ENDED`;
     - `finish` → `TOURNAMENT_LIVE_FINISH`;
     - `advance` ничего не делает;
   - история турнира: вход и выход позже `endTime` → `BACKTEST_TIME_INVALID`; `advance` не дальше `endTime`; `sessionCandles` для турнирной истории → `marketData.getCandles` с `to ≤ endTime − tf·60 000`;
   - `applyClose` + `systemClose(): Promise<boolean>` (CAS проигран → `false`, `exitTime ≥ entryTime` разрешён); `closeRemaining(priceOf)`; `finishTournamentSession(sessionId, time, price)`.
2. **Task 5** — `backend/src/tournaments/leaderboard.ts` и `live-segments.ts` с тестами (алгоритм — в Code Analysis).
3. **Task 6** — модуль `tournaments`: service, controller, DTO, `app.module.ts`. Вход — под замком строки турнира (`UPDATE tournaments SET status = status WHERE id AND status = 'lobby'`, приём `bumpCursor`), чтобы гонка не пустила 11-го. Старт — `updateMany({ where: { id, status: 'lobby' } })`.
4. **Task 7** — `TournamentRunner` (интервал 2 с, флаг занятости): финалы, эфир. Затем полный бэкенд: `npx tsc --noEmit` и `npx jest`.
5. **Task 8** — `git mv` терминала в `widgets/backtest-session` отдельным коммитом, потом импорты, `index.ts`, `tsc`, `vitest`.
6. **Task 9** — `useLiveFeed`, `lib/live.ts` (`mergeMinutes`, `liveAnchor`) и тесты; `ReplaySession`/`LiveSession`, пропсы `leaveLabel`, `extraTab`; `OrderPanel.onFinish?`; опрос деталей (эфир 3 с / история турнира 15 с); `candlesPath` для турнирной истории.
7. **Task 10** — `entities/tournament`, `views/tournaments`, `views/tournament` (шапка, ссылка с «Копировать», действия лобби, «Торговать», лидерборд), роуты, `TopNav`, `ru.json`/`en.json`. Проверка: `tsc`, `eslint`, `vitest`, `npx next build`.
8. **Task 11** — CLAUDE.md: раздел «Турниры»; пути терминала → `widgets/backtest-session`.

## Risks & Blockers

- **Binance с VPS не проверен.** Хранилища свечей на проде ещё нет («деплой отложен», спека storage). Хостинг может блокировать `api.binance.com` по гео — тогда эфир на проде не заработает (503 `LIVE_PRICE_UNAVAILABLE`). Локально проверять эфир можно.
- **Конфликт со спекой лимиток и сетки** (`2026-09-14-backtest-limit-grid-orders-design.md`, «НУЖНО ОБСУДИТЬ СРОЧНО»): она правит те же `SessionScreen`, `OrderPanel`, `advance`, `fills`, а переезд в `widgets/` меняет все пути. Если её начнут параллельно — сливать будет больно.
- **Слияние ветки**: `feat/tournaments` стоит на неслитой `feat/backtest-synthetic-market`. В `main` сначала должна попасть она.
- **`SessionScreen` уже 747 строк** — эфирные условия надо держать в обёртках и пропсах, иначе файл расползётся.
- **Движок эфира — самое тонкое место**: `live-segments.ts` покрывать тестами до runner. После перезапуска api первая минутка проверяется целиком — может сработать стоп, передвинутый после последнего тика до рестарта. Это известное и принятое.
- **Повтор ручного закрытия в эфире**: у `useCloseTrade` `retry: 3`, а сервер в эфире ставит свои цену и время. Если ответ на успешное закрытие потерялся, повтор не совпадёт с записанным выходом, и вместо «того же повтора» придёт `BACKTEST_TRADE_CLOSED` (409). Деньги не задвоятся — CAS по `closedQty`, — но пользователь увидит ошибку при закрытой сделке. Принять или дать эфиру признак повтора — решить в Task 4/9.
- **Эфирный турнир держит api занятым**: пока идёт хоть один, раз в 2 с — запрос к Binance (вес 2) и выборка открытых сделок. Для 2–10 участников это копейки; при сотне одновременных эфирных турниров проверить.

## Open Questions

- Согласен ли владелец с решениями, принятыми без него: асинхронная история на доверии, лобби без входа после старта, реальная история вместо тренажёра, исключение турнирных сессий из статистики бектеста.
- Теги на турнирных сделках: UI остаётся (переиспользование), но нигде не считаются — оставить или прятать в турнире.
- Колонка «мой результат» в списке турниров сознательно не делалась (нужен расчёт лидерборда на каждый турнир) — нужна ли.
- Демо-аккаунт (общий у всех гостей) может создавать турниры и входить в них — особых правил нет.

## Quick Start for Next Session

```bash
# Ветка и состояние
git switch feat/tournaments
git log --oneline -6          # верх: 1d1239b, 75c1083, 04da63a, 1af329f, dcb4ca9
git status -s                 # только frontend/next-env.d.ts — не коммитить

# Прочитать первым
docs/superpowers/specs/2026-09-14-tournaments-design.md
docs/superpowers/plans/2026-09-14-tournaments.md
backend/src/backtest/backtest.service.ts
backend/src/backtest/backtest.service.spec.ts
backend/src/market-data/live-market.service.ts

# Проверить, что сделанное зелёное (из backend/)
npx jest src/backtest/fills.spec.ts src/market-data
npx tsc --noEmit

# Следующее действие
Task 4: написать падающие тесты в backend/src/backtest/backtest.service.spec.ts
(список — в плане и в «Where We're Going» п.1), затем править backtest.service.ts.
```

## Session Closed
**Closed at:** 2026-09-14
**Commit:** коммит `session: tournaments-impl [standalone-962092bb]` — хэш: `git log -1 --format=%h -- plans/handoffs/HANDOFF_tournaments_2026-09-14.md`
**Session status:** Handed off to next session
**Память:** `virex_tournaments_in_progress.md` в auto-memory проекта указывает на этот файл.
