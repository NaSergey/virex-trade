# Игры — своя роль процесса: план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** вынести покер, блэкджек и джетпак (их рантаймы, сокет и возврат прерванного) в отдельный процесс `ROLE=games`, чтобы `api` не держал игрового состояния.

**Architecture:** четвёртая роль в `role.ts`; свой корневой модуль `GamesAppModule` только с играми; игровые модули в `AppModule` — лишь при `ROLE=all`. Маршрутизация игровых адресов — в Caddy и rewrites Next. Единственность процесса держит `container_name` в compose.

**Tech Stack:** NestJS 11, Prisma, socket.io, Next.js rewrites, Docker Compose, Caddy.

Спека: `docs/superpowers/specs/2026-10-02-games-role-design.md`.

## Global Constraints

- Игровые адреса: `/api/games/*` (включая сокет `/api/games/socket.io`), `/api/jetpack`, `/api/jetpack/*`.
- Процесс игр: `ROLE=games`, порт `8092`, `connection_limit=5`, сервис compose `games`, `container_name: virex-prod-games`.
- `BUDGET.games = 0` в шлюзе Bybit.
- Локальный запуск (`ROLE` не задан → `all`) не меняется.
- Код не коммитить: в тех же файлах лежит незакоммиченная работа 2026-10-02 (`app.module.ts`, `bybit-gate.ts`, `CLAUDE.md`); коммит — по решению владельца.
- Бэк: `npx jest <путь>` из `backend/`. Фронт: `npx next build` из `frontend/`.

## Риски (гибрид)

- Task 1, 2 — **A** (деньги: возврат прерванных раздач и раундов, первая роль с собственным корнем). Контрольная точка ревью после Task 2.
- Task 3 — **B** (стык бэк ↔ прокси ↔ фронт). Контрольная точка после Task 3, вместе с документацией.
- Task 4 — **C** (документация), идёт в точку Task 3.

---

### Task 1: Роль `games` и шлюз Bybit

**Files:**
- Modify: `backend/src/role.ts`
- Modify: `backend/src/admin/usage/usage-tracker.service.ts:11,70-73`
- Modify: `backend/src/bybit/bybit-gate.ts:38,45,133-135`
- Create: `backend/src/role.spec.ts`
- Modify: `backend/src/bybit/bybit-gate.spec.ts` (новый `it` в `describe('BybitGate — окно')`)

**Interfaces:**
- Produces: `type Role = 'api' | 'worker' | 'games' | 'all'`; `runsGames(): boolean` (games | all); `servesHttp(): boolean` (api | games | all); `runsBackgroundJobs()` без изменений; `runsApiJobs` удалён.

- [ ] **Step 1: Тест роли**

`backend/src/role.spec.ts`:

```ts
/** Роль читается из окружения при загрузке модуля — поэтому каждый случай грузит его заново. */
function load(role: string | undefined): typeof import('./role') {
  const prev = process.env.ROLE;
  if (role === undefined) delete process.env.ROLE;
  else process.env.ROLE = role;
  let mod!: typeof import('./role');
  jest.isolateModules(() => {
    mod = jest.requireActual('./role');
  });
  if (prev === undefined) delete process.env.ROLE;
  else process.env.ROLE = prev;
  return mod;
}

describe('роль процесса', () => {
  it.each([
    ['api', true, false, false],
    ['worker', false, true, false],
    ['games', true, false, true],
    ['all', true, true, true],
  ])('%s: HTTP %s, фон %s, игры %s', (role, http, background, games) => {
    const r = load(role);
    expect(r.ROLE).toBe(role);
    expect(r.servesHttp()).toBe(http);
    expect(r.runsBackgroundJobs()).toBe(background);
    expect(r.runsGames()).toBe(games);
  });

  it('незнакомое или пустое значение — all', () => {
    expect(load('gmaes').ROLE).toBe('all');
    expect(load(undefined).ROLE).toBe('all');
  });
});
```

- [ ] **Step 2: Тест шлюза с нулевым бюджетом**

В `bybit-gate.spec.ts`, в `describe('BybitGate — окно')`, и импорт `BUDGET`:

```ts
import { BUDGET, BybitGate, PAUSE_MS, WINDOW_MS } from './bybit-gate';
```

```ts
  it('нулевой бюджет — отказ сразу и без похода в сеть', async () => {
    const { gate, send } = makeGate(0, 0);
    const err = await gate.fetch('u').catch((e: unknown) => e);
    expect(codeOf(err)).toBe('BYBIT_BUSY');
    expect(send).not.toHaveBeenCalled();
    expect(gate.rejections()).toBe(1);
  });

  it('процесс игр к Bybit не ходит — бюджет ноль', () => {
    expect(BUDGET.games).toBe(0);
  });
```

- [ ] **Step 3: Прогнать — падают**

Run: `npx jest src/role.spec.ts src/bybit/bybit-gate.spec.ts`
Expected: FAIL — `runsGames is not a function`, `ROLE` для `games` равен `all`; тест нулевого бюджета виснет до таймаута (в `acquire` при пустом журнале `sent[0]` — `undefined`, ожидание — `NaN`, цикл не кончается).

- [ ] **Step 4: `role.ts`**

Заменить файл целиком:

```ts
/**
 * T11 (docs/superpowers/sdd/2026-09-16-backend-optimization) и
 * `docs/superpowers/specs/2026-10-02-games-role-design.md`: один и тот же
 * образ поднимается в нескольких ролях, переменной окружения `ROLE`.
 *
 * - `api` — HTTP без игр, без телеграм-поллинга и без фоновых БИЗНЕС-циклов
 *   (синк, уведомления, снапшоты, ...). Не то же самое, что «без единого
 *   `setInterval`»: в `api` крутится собственная гигиена памяти
 *   (`BybitMarketService.sweepTimer` — чистка process-local кэша рыночных
 *   данных) и сброс учёта посещений. Это память конкретного процесса, а не
 *   общий ресурс, за который дублирующиеся процессы гонялись бы.
 * - `worker` — ровно один процесс: фоновые сервисы и telegram-поллинг, без
 *   HTTP-порта.
 * - `games` — ровно один процесс: покер, блэкджек, джетпак и их сокет. Раздачи
 *   и раунд живут в его памяти, и второй такой процесс на старте вернул бы
 *   ставки в живых раздачах первого. Корень — `GamesAppModule`, не `AppModule`.
 * - `all` (дефолт, локальный запуск) — всё в одном процессе.
 *
 * Фон разделён guard'ом в начале `onApplicationBootstrap()` каждого сервиса, а
 * не условной регистрацией: фоновые сервисы инжектятся в контроллеры и другие
 * сервисы (`TelegramService.sendText` — чекерами уведомлений,
 * `TradeSyncService.syncUser` — контроллером ручного ресинка), и убрать их из
 * графа DI нельзя. Игры — наоборот: их модули не инжектирует никто снаружи,
 * поэтому они регистрируются только там, где идут игры (`runsGames`), и в
 * `api` у них нет ни контроллеров, ни сокета — заблудившийся запрос получает
 * 404, а не заводит второй рантайм стола.
 */
export type Role = 'api' | 'worker' | 'games' | 'all';

function readRole(): Role {
  const raw = process.env.ROLE;
  if (raw === 'api' || raw === 'worker' || raw === 'games') return raw;
  // Незнакомое значение (опечатка, пустая строка) — тоже 'all': это дефолт
  // локального запуска, и молча отключать половину процесса из-за опечатки
  // в .env хуже, чем один раз не заметить, что переменная не подхватилась.
  return 'all';
}

export const ROLE: Role = readRole();

/**
 * Фоновые сервисы и telegram-поллинг стартуют в этой роли.
 * Вызывается первой строкой в их `onApplicationBootstrap()`.
 */
export function runsBackgroundJobs(): boolean {
  return ROLE === 'worker' || ROLE === 'all';
}

/** Игровые модули входят в граф этой роли (`GamesAppModule`, `AppModule` при `all`). */
export function runsGames(): boolean {
  return ROLE === 'games' || ROLE === 'all';
}

/**
 * HTTP слушает в этой роли. Сюда же привязан сброс учёта посещений
 * (`UsageTrackerService`): интерсептор копит его там, где идут запросы, — и в
 * `api`, и в `games`.
 */
export function servesHttp(): boolean {
  return ROLE === 'api' || ROLE === 'games' || ROLE === 'all';
}
```

- [ ] **Step 5: Учёт посещений — на `servesHttp`**

`usage-tracker.service.ts`: импорт `import { runsApiJobs } from '../../role';` → `import { servesHttp } from '../../role';`, а в `onApplicationBootstrap`:

```ts
  onApplicationBootstrap() {
    // Интерсептор, вызывающий record(), живёт в каждой HTTP-роли — `api` и
    // `games`, — и сброс копится там же, а не в worker. В worker record()
    // никто не вызовет, и таймер там заводить незачем.
    if (!servesHttp()) return;
```

- [ ] **Step 6: Шлюз**

`bybit-gate.ts`, комментарий над `BUDGET` дополнить строкой и поправить значения:

```ts
 * `all` — локальный запуск одним процессом с домашнего IP.
 *
 * `games` — ноль: процесс игр к Bybit не ходит, и ненулевая доля была бы
 * отнята у `api` и `worker` без причины. Вызов, по ошибке появившийся в его
 * графе, получит отказ сразу, а не тихо съест бюджет.
 */
export const BUDGET: Record<Role, number> = { api: 250, worker: 300, games: 0, all: 500 };
```

```ts
const MAX_WAIT_MS: Record<Role, number> = { api: 8_000, worker: 120_000, games: 0, all: 30_000 };
```

В `acquire()` первой строкой:

```ts
  private async acquire(): Promise<void> {
    // Без бюджета ждать нечего: место в пустом окне не освободится никогда, а
    // расчёт ожидания по пустому журналу дал бы NaN и вечный цикл.
    if (this.deps.budget <= 0) {
      this.rejected++;
      throw busy();
    }
    const deadline = this.now() + this.deps.maxWaitMs;
```

- [ ] **Step 7: Прогнать — проходят**

Run: `npx jest src/role.spec.ts src/bybit/bybit-gate.spec.ts src/admin/usage`
Expected: PASS. `npx tsc --noEmit -p tsconfig.json` падает только на `runsApiJobs` в `games.service.ts` и `jetpack.service.ts` — их снимает Task 2.

---

### Task 2: Граф модулей процесса игр

**Files:**
- Create: `backend/src/admin/usage/usage.module.ts`
- Modify: `backend/src/admin/admin.module.ts`
- Create: `backend/src/games-app.module.ts`
- Modify: `backend/src/app.module.ts` (импорты игровых модулей)
- Modify: `backend/src/main.ts`
- Modify: `backend/src/games/games.service.ts:6,63-72`
- Modify: `backend/src/jetpack/jetpack.service.ts:6,62-68`
- Create: `backend/src/games-app.module.spec.ts`
- Create: `backend/src/app.module.spec.ts`

**Interfaces:**
- Consumes: `runsGames()`, `ROLE` из Task 1.
- Produces: `GamesAppModule`, `GAME_MODULES` (массив классов `GamesModule`, `PokerModule`, `BlackjackModule`, `JetpackModule`) из `games-app.module.ts`; `UsageModule` из `admin/usage/usage.module.ts`.

- [ ] **Step 1: Тест сборки `GamesAppModule`**

`backend/src/games-app.module.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { AppController } from './app.controller';
import { BlackjackController } from './blackjack/blackjack.controller';
import { GamesAppModule } from './games-app.module';
import { GamesController } from './games/games.controller';
import { GamesGateway } from './games/games.gateway';
import { JetpackController } from './jetpack/jetpack.controller';
import { PokerController } from './poker/poker.controller';

/**
 * Корень процесса игр собирается отдельно от `AppModule`, и забытая в нём
 * зависимость проявилась бы только краш-лупом контейнера `games` на проде.
 * `compile()` разрешает весь DI, не вызывая хуков жизненного цикла, — базы не
 * нужно.
 */
describe('GamesAppModule', () => {
  it('собирается и несёт игровые контроллеры, сокет и /health', async () => {
    const ref = await Test.createTestingModule({ imports: [GamesAppModule] }).compile();
    for (const token of [
      AppController,
      GamesController,
      PokerController,
      BlackjackController,
      JetpackController,
      GamesGateway,
    ]) {
      expect(ref.get(token, { strict: false })).toBeInstanceOf(token);
    }
    await ref.close();
  });
});
```

- [ ] **Step 2: Тест состава `AppModule` по ролям**

`backend/src/app.module.spec.ts`:

```ts
import 'reflect-metadata';

const GAME_MODULES = ['GamesModule', 'PokerModule', 'BlackjackModule', 'JetpackModule'];

/** Имена импортов `AppModule`, загруженного заново под ролью `role`. */
function importsUnder(role: string): string[] {
  const prev = process.env.ROLE;
  process.env.ROLE = role;
  let names: string[] = [];
  jest.isolateModules(() => {
    const { AppModule } = jest.requireActual<{ AppModule: object }>('./app.module');
    const imports = Reflect.getMetadata('imports', AppModule) as unknown[];
    names = imports.map((m) =>
      typeof m === 'function' ? m.name : (m as { module: { name: string } }).module.name,
    );
  });
  if (prev === undefined) delete process.env.ROLE;
  else process.env.ROLE = prev;
  return names;
}

describe('AppModule по ролям', () => {
  it.each(['api', 'worker'])('%s: игр в графе нет — 404 вместо второго рантайма', (role) => {
    const names = importsUnder(role);
    expect(names).toContain('AuthModule');
    for (const game of GAME_MODULES) expect(names).not.toContain(game);
  });

  it('all: игры в том же процессе, как локально и раньше', () => {
    const names = importsUnder('all');
    for (const game of GAME_MODULES) expect(names).toContain(game);
  });
});
```

- [ ] **Step 3: Прогнать — падают**

Run: `npx jest src/games-app.module.spec.ts src/app.module.spec.ts`
Expected: FAIL — `Cannot find module './games-app.module'`; для `api` в импортах есть `GamesModule`.

- [ ] **Step 4: `UsageModule`**

`backend/src/admin/usage/usage.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { UsageTrackerService } from './usage-tracker.service';
import { UsageTrackingInterceptor } from './usage-tracking.interceptor';

/**
 * Учёт посещений: трекер и глобальный интерсептор (APP_INTERCEPTOR —
 * учитывать надо все запросы приложения, а не только те, чей контроллер кто-то
 * не забыл пометить).
 *
 * Отдельно от `AdminModule`, потому что учёт нужен каждой HTTP-роли, а отчёты
 * владельца — только `api`: процесс игр (`GamesAppModule`) берёт учёт без
 * аналитики.
 */
@Module({
  providers: [UsageTrackerService, { provide: APP_INTERCEPTOR, useClass: UsageTrackingInterceptor }],
})
export class UsageModule {}
```

`backend/src/admin/admin.module.ts` целиком:

```ts
import { Module } from '@nestjs/common';
import { AdminAnalyticsController } from './admin-analytics.controller';
import { AdminAnalyticsService } from './admin-analytics.service';
import { AdminGuard } from './guards/admin.guard';
import { UsageCleanupService } from './usage/usage-cleanup.service';
import { UsageModule } from './usage/usage.module';

/**
 * Владельческая аналитика по учёту использования. Сам учёт (трекер и
 * глобальный интерсептор) — в `UsageModule`: он нужен и процессу игр, которому
 * отчёты ни к чему.
 */
@Module({
  imports: [UsageModule],
  controllers: [AdminAnalyticsController],
  providers: [AdminAnalyticsService, AdminGuard, UsageCleanupService],
})
export class AdminModule {}
```

- [ ] **Step 5: `GamesAppModule`**

`backend/src/games-app.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { UsageModule } from './admin/usage/usage.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { JwtStrategy } from './auth/strategies/jwt.strategy';
import { BlackjackModule } from './blackjack/blackjack.module';
import { GamesModule } from './games/games.module';
import { JetpackModule } from './jetpack/jetpack.module';
import { PokerModule } from './poker/poker.module';
import { PrismaModule } from './prisma/prisma.module';

/**
 * Игры с состоянием в памяти процесса: столы покера и блэкджека, раунд
 * джетпака, их общий сокет и возврат прерванного на старте. Входят только в
 * граф роли игр (`runsGames`): здесь и в `AppModule` при `ROLE=all`.
 */
export const GAME_MODULES = [GamesModule, PokerModule, BlackjackModule, JetpackModule];

/**
 * Корень процесса `ROLE=games` (спека `2026-10-02-games-role-design.md`).
 * Только игры и то, без чего они не работают: конфиг, база, проверка
 * access-токена (`JwtStrategy` без `AuthModule` — входа и регистрации здесь
 * нет), учёт посещений и `/health` для healthcheck compose. Ни Bybit, ни синка,
 * ни телеграма: процесс не ходит к бирже и не держит их память.
 *
 * Новая зависимость игрового модуля обязана появиться и здесь — иначе DI
 * упадёт на старте контейнера; это ловит `games-app.module.spec.ts`.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    PrismaModule,
    PassportModule,
    UsageModule,
    ...GAME_MODULES,
  ],
  controllers: [AppController],
  providers: [AppService, JwtStrategy],
})
export class GamesAppModule {}
```

- [ ] **Step 6: `AppModule` — игры только при `all`**

В `app.module.ts` убрать импорты `GamesModule`, `PokerModule`, `BlackjackModule`, `JetpackModule` и добавить:

```ts
import { GAME_MODULES } from './games-app.module';
import { runsGames } from './role';
```

В массиве `imports` строки `GamesModule, PokerModule, BlackjackModule, JetpackModule,` заменить на:

```ts
    // Игры — только где они идут: здесь это `ROLE=all`; у `games` свой корень
    // (`GamesAppModule`). В `api` и `worker` их нет вовсе — ни контроллеров,
    // ни сокета, ни возврата прерванных раздач на старте.
    ...(runsGames() ? GAME_MODULES : []),
```

- [ ] **Step 7: `main.ts` — корень по роли**

```ts
import { AppModule } from './app.module';
import { GamesAppModule } from './games-app.module';
import { ROLE, servesHttp } from './role';

async function bootstrap() {
  // `games` — свой корень: только игры, без биржи и фона.
  const app = await NestFactory.create(ROLE === 'games' ? GamesAppModule : AppModule);
```

и в конце `Logger.log(\`api started (ROLE=${ROLE})\`, 'Bootstrap');` → `Logger.log(\`http started (ROLE=${ROLE})\`, 'Bootstrap');`.

- [ ] **Step 8: Возврат прерванного — без проверки роли**

`games.service.ts`: удалить `import { runsApiJobs } from '../role';`, а начало хука:

```ts
  /**
   * Раздачи, прерванные перезапуском, возвращают вклады. `GameHand` общий у
   * покера и блэкджека: сама раздача живёт в памяти процесса игр, а
   * поставленное в неё уже списано со стеков, и вернуть его — забота слоя
   * столов, а не одной из игр. Проверки роли нет: модуль входит только в граф
   * процесса игр (`runsGames`), а процесс этот ровно один — второй вернул бы
   * ставки в живых раздачах первого.
   */
  async onApplicationBootstrap() {
    const open = await this.prisma.gameHand.findMany({ where: { finishedAt: null } });
```

`jetpack.service.ts`: удалить `import { runsApiJobs } from '../role';` и строку `if (!runsApiJobs()) return;`; в комментарии класса «живёт в памяти процесса `api` — отсюда, как у раздачи покера, требование держать `api` одним процессом» → «живёт в памяти процесса игр (`ROLE=games`) — отсюда, как у раздачи покера, требование держать этот процесс одним».

- [ ] **Step 9: Прогнать**

Run: `npx jest src/games-app.module.spec.ts src/app.module.spec.ts src/games src/jetpack src/poker src/blackjack src/admin src/role.spec.ts src/bybit/bybit-gate.spec.ts && npx tsc --noEmit -p tsconfig.json`
Expected: PASS, `tsc` без ошибок.

- [ ] **Step 10: Весь бэк и сборка**

Run: `npx jest && npx tsc --noEmit -p tsconfig.build.json` (не `nest build`: он пишет в `dist`, который держит запущенный `nest start --watch`).
Expected: все тесты зелёные, сборка без ошибок.

**Контрольная точка ревью (A):** Task 1–2 одним пакетом, фокус — деньги на старте (возврат раздач/раундов только в графе игр), DI корня игр, учёт посещений в обеих HTTP-ролях, шлюз при нулевом бюджете.

---

### Task 3: Compose, Caddy, rewrites Next

**Files:**
- Modify: `docker-compose.prod.yml` (новый сервис `games`; `api` — комментарии про роль и пул; `web` — build-arg, env, depends_on; `caddy` — depends_on)
- Modify: `deploy/Caddyfile`
- Modify: `frontend/next.config.ts`
- Modify: `frontend/Dockerfile.prod`

**Interfaces:**
- Consumes: `ROLE=games`, `GamesAppModule` слушает `PORT`; `/health` из Task 2.

- [ ] **Step 1: Сервис `games`**

В `docker-compose.prod.yml` после сервиса `worker`:

```yaml
  # Игры: раздачи покера и блэкджека, раунд джетпака и их сокет — из того же
  # образа, ролью ROLE=games (корень backend/src/games-app.module.ts). Сюда
  # Caddy и rewrites Next ведут /api/games/* и /api/jetpack.
  #
  # ВАЖНО: ровно один процесс. Раздачи и раунд живут в его памяти, а на старте
  # он возвращает ставки во всех раздачах и раундах без `finishedAt`, считая их
  # прерванными перезапуском. Второй такой процесс вернул бы ставки в живых
  # раздачах первого — и первый потом разыграл бы их ещё раз: монеты
  # печатались бы. Поэтому `container_name` здесь не украшение: Compose
  # отказывается масштабировать сервис с фиксированным именем, и
  # `--scale games=2` падает до старта (проверено на compose v5). Не убирать.
  games:
    build:
      context: ./backend
      dockerfile: Dockerfile.prod
    container_name: virex-prod-games
    restart: unless-stopped
    # Та же причина, что у `api`: PID 1 без tini не получает дефолтное
    # действие на сигнал после enableShutdownHooks.
    init: true
    # Схему раскатывает `api` (`prisma db push`), как и для `worker`.
    depends_on:
      api:
        condition: service_healthy
    environment:
      NODE_ENV: production
      ROLE: games
      PORT: "8092"
      # Вместе с api (10) и worker (5) — 20 из max_connections=100.
      DATABASE_URL: postgresql://${POSTGRES_USER:-virex}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB:-virex}?schema=public&connection_limit=5&pool_timeout=20
      # CORS HTTP и сокета игр.
      FRONTEND_URL: https://${APP_DOMAIN:?set APP_DOMAIN in .env.prod}
      # Проверка access-токена — того же, что выдаёт api.
      JWT_ACCESS_SECRET: ${JWT_ACCESS_SECRET:?set JWT_ACCESS_SECRET in .env.prod}
    command: sh -c "node dist/main"
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:8092/health"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 15s
    deploy:
      resources:
        limits:
          cpus: "1"
          memory: 512M
```

В `api`: комментарий к `ROLE: api` дополнить — «и без игр: они в сервисе `games`»; в комментарии к пулу «10 (api) + 5 (worker) = 15» → «10 (api) + 5 (worker) + 5 (games) = 20». В комментарии над `worker` про пул — «Вместе с api (10) и games (5) — 20».

В `web`:

```yaml
      args:
        API_INTERNAL_URL: http://api:8091
        # Игровые адреса — в процесс игр (rewrites в next.config.ts).
        GAMES_INTERNAL_URL: http://games:8092
    ...
    depends_on:
      - api
      - games
    environment:
      API_INTERNAL_URL: http://api:8091
      GAMES_INTERNAL_URL: http://games:8092
```

В `caddy.depends_on` добавить `- games`, комментарий: «Caddyfile шлёт /api/* и /auth/* прямо в api, а игровые адреса — в games».

- [ ] **Step 2: Caddyfile**

Перед `handle /api/* {`:

```
	# Игры — в своём процессе (ROLE=games): раздачи и раунд джетпака живут в
	# его памяти. Сюда же едет сокет игр (/api/games/socket.io), Caddy
	# проксирует апгрейд сам. Блоки с одиночным путём Caddy сортирует по длине
	# пути, поэтому они срабатывают раньше /api/* при любом порядке в файле.
	handle /api/games/* {
		reverse_proxy games:8092
	}
	handle /api/jetpack {
		reverse_proxy games:8092
	}
	handle /api/jetpack/* {
		reverse_proxy games:8092
	}
```

- [ ] **Step 3: rewrites Next**

`frontend/next.config.ts` — после `BACKEND_INTERNAL_URL`:

```ts
// Процесс игр (ROLE=games в docker-compose.prod.yml): раздачи и раунд
// джетпака живут в его памяти. Без переменной — тот же backend: локально
// (start.bat, dev-compose) игры идут в одном процессе вместе с остальным.
// На проде nginx хоста шлёт всё в web, поэтому разводят именно эти правила.
const GAMES_INTERNAL_URL =
  process.env.GAMES_INTERNAL_URL || BACKEND_INTERNAL_URL;
```

и в `rewrites()` первыми:

```ts
    return [
      // Игровые адреса — раньше общего /api: Next берёт первое совпавшее
      // правило. `:path*` совпадает и с пустым хвостом (`/api/jetpack`).
      { source: "/api/games/:path*", destination: `${GAMES_INTERNAL_URL}/api/games/:path*` },
      { source: "/api/jetpack/:path*", destination: `${GAMES_INTERNAL_URL}/api/jetpack/:path*` },
      { source: "/api/:path*", destination: `${BACKEND_INTERNAL_URL}/api/:path*` },
      { source: "/auth/:path*", destination: `${BACKEND_INTERNAL_URL}/auth/:path*` },
    ];
```

- [ ] **Step 4: `frontend/Dockerfile.prod`**

После `ENV API_INTERNAL_URL=$API_INTERNAL_URL`:

```dockerfile
# Та же грабля для процесса игр: rewrites игровых адресов запекаются на сборке.
ARG GAMES_INTERNAL_URL=http://games:8092
ENV GAMES_INTERNAL_URL=$GAMES_INTERNAL_URL
```

- [ ] **Step 5: Проверка конфигов**

Run (из корня):
- `docker compose --env-file <временный .env с заглушками> -f docker-compose.prod.yml config --quiet` → без ошибок;
- `docker compose ... -f docker-compose.prod.yml up --dry-run --scale games=2 --no-deps games` → отказ с предупреждением о `container_name`;
- `docker run --rm -v <deploy>:/etc/caddy caddy:2-alpine caddy adapt --config /etc/caddy/Caddyfile` с `APP_DOMAIN=example.com` → валидный JSON, маршруты `/api/games/*`, `/api/jetpack*` стоят раньше `/api/*`;
- `npx next build` (frontend, с `GAMES_INTERNAL_URL=http://games:8092`) → зелёный; в `.next/routes-manifest.json` регэксп `/api/jetpack/:path*` совпадает с `/api/jetpack`. После проверки пересобрать без переменной не нужно: локальный `next dev` читает конфиг заново.

---

### Task 4: Документация

**Files:**
- Modify: `CLAUDE.md` — «Стек и структура» (третья роль `games`, исключение из схемы guard'ов, маршрутизация), «Лимит Bybit на IP» (`games` 0), «Столы карточных игр» (возврат прерванного — при старте процесса игр), «Покер» и «Джетпак» («`api` обязан оставаться одним процессом» → процесс игр, `container_name`).
- Modify: `docs/deploy/vps-domain.md` — схема контейнеров: строка про `games`.

- [ ] **Step 1:** найти все упоминания: `grep -n "памяти процесса .api\|одним процессом\|при старте .api\|ROLE\|двух ролях" CLAUDE.md docs/deploy/vps-domain.md` и поправить каждое по спеке.

**Контрольная точка ревью (B):** Task 3–4 одним пакетом, фокус — маршрутизация игровых адресов на всех трёх входах (Caddy, rewrites, nginx → web), сокет, единственность `games`, согласованность документации с кодом.

---

### Живой прогон (в конце)

Локально, из `backend/`, если открытых раздач и раундов в локальной базе нет (`finishedAt IS NULL` у `game_hands` и `jetpack_rounds` — ноль строк; иначе процесс игр их вернёт):

1. `npx tsc -p tsconfig.build.json --outDir dist-role-check`.
2. `ROLE=api PORT=18091 node dist-role-check/main` и `ROLE=games PORT=18092 node dist-role-check/main`.
3. Токен — вход `pw-tester@example.com` через `:18091/auth/login`.
4. `:18091/api/jetpack` → 404; `:18092/api/jetpack` → 200; `:18092/api/games/socket.io/?EIO=4&transport=polling` → `0{"sid":…`; `:18092/health` → 200; `:18092/api/trades` → 404.
5. Остановить процессы, удалить `dist-role-check`.
