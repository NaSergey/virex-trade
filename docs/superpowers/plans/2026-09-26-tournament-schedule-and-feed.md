# Турнир по расписанию, статусы и лента сделок — план

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** время старта турнира с отсчётом, вход в идущий турнир, значки LIVE/OPEN/ENDED и
вкладка «Сделки игроков» с лентой сделок идущих турниров.

**Architecture:** бэкенд — `backend/src/tournaments`: новое поле `startsAt`, шаг `startDue`
у `TournamentRunner` (роль worker), `join` для идущего турнира, эндпоинт `GET feed`.
Фронт — `entities/tournament` (типы, хуки) и `views/trading-tournaments` (значок, отсчёт,
форма, вкладки панели рейтинга).

**Tech Stack:** NestJS + Prisma + PostgreSQL, Jest; Next.js App Router + FSD, react-query,
next-intl, vitest.

**Спека:** `docs/superpowers/specs/2026-09-26-tournament-schedule-and-feed-design.md`.

## Global Constraints

- Турнир с `startsAt` стартует только по времени; двое+ — старт, один — `cancelled` с возвратом.
- Вход в `running` — пока `now < endsAt` и есть места; из идущего не выходят.
- Лента: только `running`, публичные или где смотрящий — участник; 50 строк; опрос 3 с только на открытой вкладке.
- Значки латиницей в обеих локалях: `LIVE` / `OPEN` / `ENDED` / `CANCELLED`.
- Нативной разметки для повторяющихся элементов нет — только `shared/ui`.
- `prisma generate` падает EPERM, пока у владельца крутится `nest --watch`: для tsc — временный клиент (см. память), процессы не убивать.

## Классы риска (гибридное выполнение)

| Задача | Класс |
|---|---|
| 1. Поле `startsAt`, валидация, ошибки | A |
| 2. Старт по времени, отмена, блокировка строки | A |
| 3. Вход в идущий турнир, открытые, доли финала | A |
| 4. Лента сделок (бэкенд) | B |
| — контрольная точка 1: ревью задач 1–4 | |
| 5. Типы и хуки фронта | B |
| 6. Отсчёт, значок, CSS, тексты | C |
| 7. Форма: время старта | C |
| 8. Подвал окна: вход в идущий, без готовности | B |
| 9. Вкладки панели и лента | B |
| — контрольная точка 2: ревью задач 5–9 + стык бэк↔фронт | |
| 10. CLAUDE.md, проверки, `next build` | C |

---

### Task 1: поле `startsAt`, валидация времени, коды ошибок

**Files:**
- Modify: `backend/prisma/schema.prisma` (model Tournament)
- Modify: `backend/src/tournaments/tournament.config.ts`
- Modify: `backend/src/tournaments/tournament-errors.ts`
- Create: `backend/src/tournaments/schedule.ts`, `backend/src/tournaments/schedule.spec.ts`
- Modify: `backend/src/tournaments/dto/tournament.dto.ts`
- Modify: `backend/src/tournaments/tournaments.service.ts` (`create`)
- Test: `backend/src/tournaments/tournaments.service.spec.ts`

**Interfaces — Produces:** `startTimeFrom(iso: string, now: number): Date | null`;
ошибки `tournamentClosed()`, `scheduledStart()`, `badStart()`; конфиг `START_MIN_LEAD_MS`,
`START_MAX_LEAD_MS`, `FEED_LIMIT`; `Tournament.startsAt: Date | null`.

- [ ] Схема: в `model Tournament` после `durationMin`:
  ```prisma
  /// Назначенное время старта. Пусто — турнир стартует, когда готовы все; задано —
  /// только по времени, шагом `startDue` движка турниров (готовность не нужна).
  startsAt       DateTime?
  ```
  и индекс `@@index([status, startsAt])`. Статус: комментарий дополнить `'cancelled'` —
  время пришло, а участник один (взнос возвращён).
- [ ] Конфиг:
  ```ts
  /** Время старта — не раньше чем через минуту: отсчёт должен успеть кому-то показаться. */
  export const START_MIN_LEAD_MS = 60_000;
  /** И не позже чем через 30 дней: лобби на месяцы вперёд держит взносы без дела. */
  export const START_MAX_LEAD_MS = 30 * 24 * 60 * 60_000;
  /** Сколько сделок отдаёт лента идущих турниров. */
  export const FEED_LIMIT = 50;
  ```
- [ ] Ошибки:
  ```ts
  /** Вход в законченный, отменённый или истёкший турнир: в идущий войти можно, в прошедший — нет. */
  export const tournamentClosed = () =>
    new ConflictException({ message: 'Турнир уже закончился', code: 'TOURNAMENT_CLOSED' });
  /** У турнира по времени готовности нет — он начнётся сам. */
  export const scheduledStart = () =>
    new ConflictException({ message: 'Турнир начнётся по времени — готовность не нужна', code: 'TOURNAMENT_SCHEDULED' });
  export const badStart = () =>
    new BadRequestException({
      message: 'Время старта — не раньше чем через минуту и не позже чем через 30 дней',
      code: 'TOURNAMENT_BAD_START',
    });
  ```
- [ ] Тест `schedule.spec.ts` (падает — файла нет):
  ```ts
  import { startTimeFrom } from './schedule';
  const NOW = Date.UTC(2026, 8, 26, 12, 0, 30);
  describe('startTimeFrom', () => {
    it('отбрасывает секунды', () => {
      expect(startTimeFrom(new Date(NOW + 3_600_000).toISOString(), NOW)).toEqual(new Date(Date.UTC(2026, 8, 26, 13, 0, 0)));
    });
    it('раньше чем через минуту — нет', () => {
      expect(startTimeFrom(new Date(NOW + 30_000).toISOString(), NOW)).toBeNull();
    });
    it('дальше 30 дней — нет', () => {
      expect(startTimeFrom(new Date(NOW + 31 * 86_400_000).toISOString(), NOW)).toBeNull();
    });
    it('мусор — нет', () => {
      expect(startTimeFrom('завтра', NOW)).toBeNull();
    });
  });
  ```
- [ ] `schedule.ts`:
  ```ts
  import { START_MAX_LEAD_MS, START_MIN_LEAD_MS } from './tournament.config';
  const MINUTE_MS = 60_000;
  /**
   * Время старта из формы — по минуте: старт, как и конец, должен быть границей
   * минутки. null — время не годится (прошлое, слишком близко, слишком далеко).
   */
  export function startTimeFrom(iso: string, now: number): Date | null {
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return null;
    const at = Math.floor(t / MINUTE_MS) * MINUTE_MS;
    if (at < now + START_MIN_LEAD_MS || at > now + START_MAX_LEAD_MS) return null;
    return new Date(at);
  }
  ```
- [ ] DTO: `@IsOptional() @IsDateString() startsAt?: string;` с комментарием «нет — по готовности».
- [ ] Тесты `create` в service spec: `startsAt` сохраняется по минуте; плохое время — 400
  `TOURNAMENT_BAD_START` до всякого списания (`h.charges` пуст).
- [ ] `create`: до транзакции
  ```ts
  const startsAt = dto.startsAt != null ? startTimeFrom(dto.startsAt, Date.now()) : null;
  if (dto.startsAt != null && startsAt == null) throw badStart();
  ```
  и `startsAt` в `data`.
- [ ] `npx jest src/tournaments` — зелёные.

### Task 2: старт по времени, отмена, блокировка строки турнира

**Files:** `tournaments.service.ts`, `tournament-runner.service.ts`, оба spec.

**Interfaces — Produces:** `TournamentsService.dueForStart(now: Date): Promise<Tournament[]>`,
`TournamentsService.startScheduled(id: string, now: Date): Promise<'started' | 'cancelled' | null>`.

Гонка, которую закрывает блокировка: `join` прочитал «лобби», старт в это время раздал сессии
и закоммитил, а `join` вставил участника следом — человек заплатил и остался без сессии.
`SELECT … FOR UPDATE` строки турнира в `join`, `setReady`, `leave`, `startScheduled`
сериализует их: либо вход раньше и старт его видит, либо старт раньше и вход идёт по ветке
«идущий турнир» (задача 3).

- [ ] Тесты (service spec; в мок `prisma` добавить `$queryRaw: jest.fn(async () => [])`,
  в `tournament.findMany` — фильтр `where.startsAt?.lte`):
  - `startScheduled` при двух участниках без готовности и при `winnersCount: 1`, `maxPlayers: 3` — `running`, две сессии;
  - при трёх призовых местах и двух участниках — всё равно старт;
  - при одном — `cancelled`, взнос и добавка вернулись (`TOURNAMENT_REFUND`, ключи как у `remove`), сессий нет;
  - раньше времени — ничего (`null`), повторный вызов после старта — `null`;
  - `setReady` у турнира с `startsAt` — 409 `TOURNAMENT_SCHEDULED`;
  - `leave` последнего неготового у турнира с `startsAt` не стартует его (`launchIfReady` пропускает);
  - runner spec: `tick` зовёт `startScheduled` для каждого из `dueForStart`, падение одного не мешает другому.
- [ ] Сервис:
  ```ts
  /** Строка турнира под замок до конца транзакции — см. задачу про гонку входа и старта. */
  private async lock(tx: Prisma.TransactionClient, id: string) {
    await tx.$queryRaw`SELECT id FROM tournaments WHERE id = ${id} FOR UPDATE`;
  }
  ```
  Первой строкой транзакций `join`, `leave`, `setReady`, `startScheduled`.
- [ ] `launch(tx, tournament)` — участники читаются **после** условного перевода статуса (в
  сигнатуре их больше нет); сессия — общим помощником:
  ```ts
  private openSession(tx: Prisma.TransactionClient, t: Tournament, userId: string, startedAt: Date, endsAt: Date) {
    return tx.backtestSession.create({ data: { userId, tournamentId: t.id, startTime: startedAt, cursorTime: startedAt,
      endTime: endsAt, startBalance: t.startBalance, balance: t.startBalance, hideDate: false, hidePrice: false,
      priceScale: 1, status: 'active' } });
  }
  ```
- [ ] `launchIfReady`: `if (!tournament || tournament.status !== 'lobby' || tournament.startsAt) return;`
- [ ] `setReady`: после проверки статуса `if (tournament.startsAt) throw scheduledStart();`
- [ ] `refundLobby(tx, t, participants)` — вынести возвраты из `remove` (взносы по `feeRef`,
  добавка создателю по `${id}:bonus`), `remove` зовёт его.
- [ ] `dueForStart(now)` — `findMany({ where: { status: 'lobby', startsAt: { lte: now } } })`.
- [ ] `startScheduled(id, now)`:
  ```ts
  return this.prisma.$transaction(async (tx) => {
    await this.lock(tx, id);
    const t = await tx.tournament.findUnique({ where: { id } });
    if (!t || t.status !== 'lobby' || !t.startsAt || t.startsAt > now) return null;
    const participants = await tx.tournamentParticipant.findMany({ where: { tournamentId: id } });
    if (participants.length >= MIN_PLAYERS) {
      await this.launch(tx, t);
      return 'started' as const;
    }
    await tx.tournament.update({ where: { id }, data: { status: 'cancelled', finishedAt: now } });
    await this.refundLobby(tx, t, participants);
    return 'cancelled' as const;
  });
  ```
- [ ] Runner: `tick` — `startDue()` первым шагом:
  ```ts
  /** Лобби, чьё время пришло: старт или отмена — см. TournamentsService.startScheduled. */
  private async startDue(): Promise<void> {
    const now = new Date();
    for (const t of await this.tournaments.dueForStart(now)) {
      try { await this.tournaments.startScheduled(t.id, now); }
      catch (e) { this.logger.error(`старт турнира ${t.id} упал`, e as Error); }
    }
  }
  ```
  В мок `tournaments` runner spec — `dueForStart`, `startScheduled`.
- [ ] `npx jest src/tournaments` — зелёные.

### Task 3: вход в идущий турнир, «Открытые» с идущими, доли финала

**Files:** `tournaments.service.ts`, service spec.

- [ ] Тесты:
  - вход в идущий: участник, взнос, сессия `startTime = now`, `endTime = endsAt`;
  - в идущий без мест — `TOURNAMENT_FULL`; после `endsAt` и в `finished`/`cancelled` — `TOURNAMENT_CLOSED`;
  - прежний тест «после старта войти нельзя» переписать на «после конца войти нельзя»;
  - `listPublic` — `status: { in: ['lobby', 'running'] }`, идущий с истёкшим `endsAt` не показывается (мок `findMany` понимает `in`);
  - финал при двух игроках и долях `[50, 30, 20]` (три победителя) — выплачено 70 % и 30 %, сумма = фонд.
- [ ] `join`:
  ```ts
  await this.lock(tx, id);
  const tournament = await tx.tournament.findUnique({ where: { id } });
  if (!tournament) throw tournamentNotFound();
  const now = new Date();
  const running = tournament.status === 'running' && tournament.endsAt != null && tournament.endsAt > now;
  if (tournament.status !== 'lobby' && !running) throw tournamentClosed();
  // …already / full / create / charge как было…
  if (running) await this.openSession(tx, tournament, userId, now, tournament.endsAt!);
  ```
- [ ] `listPublic`: `status: { in: ['lobby', 'running'] }`; после чтения отсеять `running` с
  `endsAt <= now` вместе с заполненными. Комментарий: идущий — потому что в него можно войти.
- [ ] `finalize`: `payouts(pool, tournament.payoutShares.slice(0, participants.length))` с
  комментарием: при старте по времени игроков может быть меньше мест, недостающие доли —
  первому месту (то же правило остатка).
- [ ] `npx jest src/tournaments` — зелёные.

### Task 4: лента сделок (бэкенд)

**Files:** `tournaments.service.ts`, `tournaments.controller.ts`, service spec.

**Interfaces — Produces:** `GET /api/tournaments/feed` →
```ts
{ id: string; tournamentId: string; tournamentName: string; userId: string; playerName: string | null;
  symbol: string; direction: 'long' | 'short'; leverage: number; entryTime: Date; entryPrice: number;
  stopLoss: number; takeProfit: number | null; exitTime: Date | null; pnl: number | null }[]
```

- [ ] Тест: `feed('u9')` зовёт `backtestTrade.findMany` с
  `where: { session: { tournament: { is: { status: 'running', OR: [{ visibility: 'public' }, { participants: { some: { userId: 'u9' } } }] } } } }`,
  `orderBy: { entryTime: 'desc' }`, `take: FEED_LIMIT`; строки разворачиваются в плоский вид.
- [ ] Сервис `feed(userId)` — `select` нужных полей и `session: { select: { userId, user: { select: { name } }, tournament: { select: { id, name } } } }`; map в плоскую строку.
  Комментарий: открытые сделки видны всем (решение владельца 2026-09-26), закрытые
  турниры в ленту не попадают — «только по ссылке».
- [ ] Контроллер: `@Get('feed')` рядом с `rating`, до `:id`.
- [ ] Комментарий `get()` о подглядывании переписать: сводка по закрытым — потому что это
  результат, а открытые видны в ленте.
- [ ] `npx jest src/tournaments` — зелёные.

**Контрольная точка 1** — ревью задач 1–4 (Sonnet, фокус: деньги в отмене и входе, гонка
входа и старта, фильтр приватности ленты).

### Task 5: типы и хуки фронта

**Files:** `frontend/src/entities/tournament/api/types.ts`, `api/hooks.ts`, `index.ts`.

- [ ] `TournamentStatus` += `'cancelled'`; `TournamentBase.startsAt: string | null`;
  `CreateTournamentInput.startsAt?: string`; `FeedTrade` — по интерфейсу задачи 4 (даты строками).
- [ ] Комментарий у `TournamentPlayerStats` про подглядывание — переписать.
- [ ] Хуки: `useTournamentFeed(enabled: boolean)` — ключ `['tournaments', 'feed']`,
  `refetchInterval: 3000`, `enabled`; `refresh` сбрасывает и его. Списки «мои» и «открытые» —
  `refetchInterval: 10_000`: отсчёт доходит до нуля, и статус в строке должен смениться сам.
- [ ] Экспорт из `index.ts`.

### Task 6: отсчёт, значок, стили, тексты

**Files:**
- Create: `frontend/src/views/trading-tournaments/lib/countdown.ts`, `countdown.test.ts`
- Create: `frontend/src/views/trading-tournaments/model/useCountdown.ts`
- Create: `frontend/src/views/trading-tournaments/components/TournamentBadge.tsx`
- Modify: `frontend/src/app/globals.css`, `ru.json`, `en.json`

- [ ] Тест `countdown.test.ts`:
  ```ts
  import { countdown } from './countdown';
  const S = 1000, M = 60 * S, H = 60 * M, D = 24 * H;
  it('минуты', () => expect(countdown(14 * M + 33 * S)).toBe('14:33'));
  it('часы', () => expect(countdown(3 * H + 14 * M + 33 * S)).toBe('03:14:33'));
  it('сутки', () => expect(countdown(2 * D + 3 * H + 14 * M + 33 * S)).toEqual({ days: 2, clock: '03:14:33' }));
  it('ноль и прошлое — null', () => { expect(countdown(0)).toBeNull(); expect(countdown(-5)).toBeNull(); });
  ```
  (сутки возвращают число дней отдельно — слово «д» переводится в компоненте).
- [ ] `countdown(ms): string | { days: number; clock: string } | null` — секунды вверх (`Math.ceil`).
- [ ] `useCountdown(target: string | null): number | null` — остаток в мс, тик `setInterval` 1 с,
  `null` без цели.
- [ ] `TournamentBadge({ status, startsAt })` — `<span className="tbadge" data-s={status}>{t(`badge.${status}`)}</span>`
  и для `lobby` со `startsAt` — `<span className="tcount">` с `t('startsIn', { time })` или
  `t('starting')` на нуле.
- [ ] CSS `.tbadge` (заменяет `.tstate`): моно, капитель, рамка 1px, фон — 12 % цвета, точка
  6px у `running`/`lobby`, у `running` бьётся (`tstate-beat`). Цвета: `running` —
  `--g-a-green`, `lobby` — новый `--g-a-amber: #d9a14f` в палитре раздела (комментарий: цвет
  состояния «набор», не игры), `finished`/`cancelled` — `--g-ink-3` без точки. `.tcount` —
  моно, `--ink-2`, tabular-nums.
- [ ] Тексты (ru/en): `badge.{running:'LIVE',lobby:'OPEN',finished:'ENDED',cancelled:'CANCELLED'}`,
  `status.cancelled` («Отменён»/«Cancelled»), `startsIn` («Старт через {time}»),
  `startsInShort` («через {time}»), `days` («{n} д»), `starting` («Старт…»), `colStart`
  («Старт»); `errors.TOURNAMENT_CLOSED/SCHEDULED/BAD_START`; `publicLead` — про идущие.
- [ ] Значок в «Моих турнирах» (колонка статуса), в «Открытых» (новая первая колонка) и в
  шапке окна вместо `.tstate`.

### Task 7: форма — время старта

**Files:** `CreateTournamentDialog.tsx`, тексты.

- [ ] Состояние `startMode: 'ready' | 'time'` (`Seg` в группе «Условия»: «По готовности» /
  «По времени») и `startLocal` — строка `datetime-local`, по умолчанию «через час, по 5 минут».
- [ ] При `time` — `<Field label={t('startLabel')}>` с `<Input type="datetime-local" min=… />`.
  Валидность: `new Date(startLocal).getTime() >= Date.now() + 2 * 60_000`; иначе подсказка
  `startTooSoon`. В `submit` — `startsAt: new Date(startLocal).toISOString()`.
- [ ] Подсказка под переключателем: при `time` — `startHintTime` («Турнир начнётся сам, если
  к этому времени войдут двое. Один — взнос вернётся»).

### Task 8: подвал окна

**Files:** `TournamentActions.tsx`, `TournamentHead.tsx`, тексты.

- [ ] `canJoin = (lobby || (running && endsAt > now)) && !isParticipant`; подпись при входе в
  идущий — `joinLate` («Турнир уже идёт — времени на сделки меньше, депозит тот же»).
- [ ] У лобби со `startsAt` нет кнопки готовности и подписей о ней; вместо — `startsAtNote`
  («Старт {date} — начнётся сам, готовность не нужна»).
- [ ] `TournamentHead`: у лобби со `startsAt` подпись под длительностью — «Старт {date}».

### Task 9: вкладки панели и лента

**Files:**
- Create: `frontend/src/views/trading-tournaments/components/TradesFeed.tsx`
- Create: `frontend/src/views/trading-tournaments/components/PlayersPanel.tsx`
- Modify: `Rating.tsx` (без своего `SectionHead`-заголовка — его рисует панель), `Page.tsx`

- [ ] `PlayersPanel({ viewerId, onOpen })`: `SectionHead` с `Seg` «Рейтинг игроков / Сделки
  игроков» (`tab` в `useState`), ниже `Rating` или `TradesFeed`.
- [ ] `TradesFeed({ onOpen })`: `useTournamentFeed(true)` (монтируется только на своей
  вкладке); `LedgerTable` `minWidth={300}`, колонки: время входа (ЧЧ:ММ), игрок + турнир
  подписью, сделка (`BTC LONG ×10`, цвет стороны — `.pos`/`.neg`, под ней «вход · SL · TP»),
  результат (`Money` у закрытой, «в позиции» у открытой). `onRowClick` → `onOpen(tournamentId)`.
  Пусто — `EmptyState` «Сейчас никто не торгует».
- [ ] `Page.tsx`: `<PlayersPanel viewerId={user?.id} onOpen={openTournament} />` вместо `Rating`.

**Контрольная точка 2** — ревью задач 5–9 и стыка с бэкендом (типы ответа ленты, статусы,
`startsAt` ISO).

### Task 10: документация и проверки

- [ ] CLAUDE.md: раздел готовности — старт по времени, отмена при одном, вход в идущий;
  пункт «Таблица участников…» — запрет на открытые сделки снят владельцем 2026-09-26, лента;
  страница игры — панель с вкладками.
- [ ] Бэкенд: `npx jest src/tournaments src/backtest`, `tsc --noEmit` на временном клиенте Prisma.
- [ ] Фронт: `npx tsc --noEmit`, `npx eslint src/views/trading-tournaments src/entities/tournament`,
  `npx vitest run`, `npx next build`.
- [ ] Сказать владельцу: нужны `prisma db push` и `prisma generate` (новое поле), в браузере
  не проверялось.
