# Общая инфраструктура игр (покер/блэкджек) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** дать покеру и блэкджеку общий бэкенд-слой — столы с эскроу фишек в
монетах и WebSocket-канал реалтайма, — на который позже лягут отдельные
модули с правилами самих игр.

**Architecture:** новый модуль `backend/src/games` по образцу `tournaments/`
(controller → service → prisma), но с казино-логикой ставок вместо турнирного
жизненного цикла: постоянные столы, посадка/уход в любой момент, эскроу через
существующий `CoinsService`. Первый WebSocket-гейтвей в проекте рассылает
снимок стола после каждой мутации — клиенты не поллят.

**Tech Stack:** NestJS 10, Prisma (PostgreSQL), `@nestjs/websockets` +
`@nestjs/platform-socket.io` + `socket.io` (новые зависимости), Jest.

Спек: `docs/superpowers/specs/2026-09-20-games-shared-infrastructure-design.md`.

## Global Constraints

- Только бэкенд. Фронтенд/ассеты — не в этом плане (карточки покера/блэкджека
  на `/games` остаются `available: false`).
- Правила самой игры (раздача, ставки, side-pot, hit/stand) — вне рамок,
  отдельные планы позже (сначала блэкджек, потом покер).
- Статусы/тип игры/видимость — обычные строки (`String` в Prisma), не enum, —
  как у `Tournament`.
- `GameSeat` — строка живёт, только пока игрок сидит; уход удаляет строку.
  История не теряется — она в `CoinTransaction` (`GAME_BUYIN`/`GAME_CASHOUT`).
- Эскроу — только через существующий `CoinsService.charge`/`credit`, внутри
  той же транзакции, что и изменение места. Новый rebuy/довнос не делаем.
- WS-аутентификация — access-токеном в `socket.handshake.auth.token`,
  проверяется тем же секретом, что `JwtStrategy` (`resolveJwtAccessSecret()`).
- Гейтинг по роли (`role.ts`) не нужен — модуль регистрируется безусловно, как
  остальные фичевые модули.
- Создатель стола не садится автоматически (в отличие от турнира).
- Все денежные операции — compare-and-set/уникальный индекс, никогда
  «прочитал → проверил → записал» отдельными запросами.

---

## Task 1: Модель данных — `GameTable`, `GameSeat`

**Files:**
- Modify: `backend/prisma/schema.prisma` (модель `User`, конец файла)
- Modify: `backend/src/coins/coins.service.ts` (тип `CoinTxKind`)

**Interfaces:**
- Produces: Prisma-модели `GameTable` (`id, gameType, name, visibility, status, minBuyIn, maxBuyIn, maxSeats, creatorId, createdAt, closedAt, seats`) и `GameSeat` (`id, tableId, userId, seatIndex, stack, joinedAt`); `CoinTxKind` включает `'GAME_BUYIN' | 'GAME_CASHOUT'`.

- [ ] **Step 1: Добавить связи в `User`**

В `backend/prisma/schema.prisma` найти блок:

```prisma
  tournamentsCreated Tournament[]            @relation("TournamentCreator")
  tournamentEntries  TournamentParticipant[]
```

и добавить сразу за ним:

```prisma
  /// Столы покера/блэкджека, которые я создал, и места, которые я занимаю.
  /// GameSeat живёт, только пока я сижу, — это не история, а текущее место.
  gameTablesCreated GameTable[] @relation("GameTableCreator")
  gameSeats         GameSeat[]
```

- [ ] **Step 2: Добавить модели в конец `schema.prisma`**

После последней модели файла (`TronScanCursor`) добавить:

```prisma

/// Стол покера/блэкджека — общая инфраструктура обеих игр. Казино-логика
/// ставок, не турнирная: постоянный стол, на который садятся со своим buy-in
/// и с которого встают когда угодно, забирая остаток стека. Правила самой
/// раздачи (карты, ставки, вскрытие) здесь не живут — предмет отдельных
/// модулей поверх этого стола.
model GameTable {
  id         String     @id @default(uuid())
  /// "blackjack" | "poker" — строкой, как остальные статусы этой схемы:
  /// новый тип игры не требует миграции.
  gameType   String
  name       String
  /// 'public' — виден в общем списке, пока открыт; 'private' — только по
  /// ссылке. Умолчание закрытое: публикация — осознанный выбор создателя.
  visibility String     @default("private")
  /// 'open' — можно сесть; 'closed' — стола больше нет в лобби.
  status     String     @default("open")
  minBuyIn   Int
  maxBuyIn   Int
  maxSeats   Int
  /// SetNull: удаление аккаунта создателя не должно стирать стол у тех, кто
  /// за ним сидит.
  creatorId  String?
  creator    User?      @relation("GameTableCreator", fields: [creatorId], references: [id], onDelete: SetNull)
  createdAt  DateTime   @default(now())
  closedAt   DateTime?
  seats      GameSeat[]

  @@index([visibility, status, createdAt])
  @@map("game_tables")
}

/// Место за столом. Живёт, только пока игрок сидит — уход строку удаляет, а
/// не помечает статусом: история и так лосслесно лежит в CoinTransaction
/// (GAME_BUYIN/GAME_CASHOUT), а живая строка на выбывшего навсегда занимала
/// бы номер места под `@@unique([tableId, seatIndex])`.
model GameSeat {
  id        String    @id @default(uuid())
  tableId   String
  table     GameTable @relation(fields: [tableId], references: [id], onDelete: Cascade)
  userId    String
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  seatIndex Int
  /// Стек фишек в монетах. Меняется игровой логикой раздач (вне этого
  /// сервиса); при посадке равен buy-in, при уходе целиком уходит в кэшаут.
  stack     Int
  joinedAt  DateTime  @default(now())

  @@unique([tableId, seatIndex])
  @@unique([tableId, userId])
  @@map("game_seats")
}
```

- [ ] **Step 3: Расширить `CoinTxKind`**

В `backend/src/coins/coins.service.ts` заменить:

```ts
export type CoinTxKind =
  | 'DONATION'
  | 'TOURNAMENT_FEE'
  | 'TOURNAMENT_BONUS'
  | 'TOURNAMENT_REFUND'
  | 'TOURNAMENT_PRIZE';
```

на:

```ts
export type CoinTxKind =
  | 'DONATION'
  | 'TOURNAMENT_FEE'
  | 'TOURNAMENT_BONUS'
  | 'TOURNAMENT_REFUND'
  | 'TOURNAMENT_PRIZE'
  | 'GAME_BUYIN'
  | 'GAME_CASHOUT';
```

- [ ] **Step 4: Сгенерировать клиент и применить схему к локальной БД**

Если запущен `npm run start:dev`/`nest start --watch` — сначала остановить
его (на Windows `prisma generate` падает `EPERM`, пока движок держит файл
открытым запущенным бэкендом). Локальная база должна быть поднята
(`start.bat` / `docker compose up -d db`).

Run (из `backend/`):
```
npx prisma generate
npx prisma db push
```
Expected: обе команды завершаются без ошибок; `db push` сообщает про две
новые таблицы (`game_tables`, `game_seats`).

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/schema.prisma backend/src/coins/coins.service.ts
git commit -m "feat(games): модель GameTable/GameSeat и новые виды монетных транзакций"
```

---

## Task 2: Конфиг, ошибки, DTO

**Files:**
- Create: `backend/src/games/games.config.ts`
- Create: `backend/src/games/game-errors.ts`
- Create: `backend/src/games/dto/game-table.dto.ts`

**Interfaces:**
- Consumes: `MAX_COINS_AMOUNT` из `backend/src/coins/coins.config.ts`.
- Produces: `GameType`, `SEATS_RANGE: Record<GameType, [number, number]>`, `GAME_TYPES: GameType[]`, `PUBLIC_LIST_LIMIT` (`games.config.ts`); фабрики ошибок `gameTableNotFound()`, `gameTableClosed()`, `gameTableFull()`, `gameAlreadySeated()`, `gameNotSeated()`, `gameTableNotEmpty()`, `gameBuyInOutOfRange()`, `gameBadBuyInRange()`, `gameSeatRace()`, `gameNotCreatorOrAdmin()`, `gameBadSeats()` (`game-errors.ts`); `CreateGameTableDto`, `JoinGameTableDto` (`dto/game-table.dto.ts`).

- [ ] **Step 1: `games.config.ts`**

```ts
/**
 * Границы столов покера/блэкджека. Числа держатся здесь, а не в DTO и не в
 * сервисе по месту: их одновременно проверяет сервер и будущая форма
 * создания стола.
 */

export type GameType = 'blackjack' | 'poker';

/** Один живой игрок за столом — уже блэкджек; дуэль покера — от двух. */
export const SEATS_RANGE: Record<GameType, [min: number, max: number]> = {
  blackjack: [1, 7],
  poker: [2, 9],
};

export const GAME_TYPES = Object.keys(SEATS_RANGE) as GameType[];

/** Сколько строк отдаёт общий список открытых столов. */
export const PUBLIC_LIST_LIMIT = 50;
```

- [ ] **Step 2: `game-errors.ts`**

```ts
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';

/**
 * Отказы стола — в одном месте: их коды видит фронт и переводит по ключу, и
 * разъехавшиеся формулировки одного и того же случая читались бы как разные
 * причины (тот же приём, что `tournament-errors.ts`).
 */
export const gameTableNotFound = () =>
  new NotFoundException({ message: 'Стол не найден', code: 'GAME_TABLE_NOT_FOUND' });

export const gameTableClosed = () =>
  new ConflictException({ message: 'Стол закрыт', code: 'GAME_TABLE_CLOSED' });

export const gameTableFull = () =>
  new ConflictException({ message: 'Все места заняты', code: 'GAME_TABLE_FULL' });

export const gameAlreadySeated = () =>
  new ConflictException({ message: 'Вы уже сидите за этим столом', code: 'GAME_ALREADY_SEATED' });

export const gameNotSeated = () =>
  new ConflictException({ message: 'Вы не сидите за этим столом', code: 'GAME_NOT_SEATED' });

export const gameTableNotEmpty = () =>
  new ConflictException({ message: 'За столом ещё есть игроки', code: 'GAME_TABLE_NOT_EMPTY' });

export const gameBuyInOutOfRange = () =>
  new BadRequestException({ message: 'Сумма не входит в диапазон стола', code: 'GAME_BUY_IN_OUT_OF_RANGE' });

export const gameBadBuyInRange = () =>
  new BadRequestException({
    message: 'Минимальная ставка не может быть больше максимальной',
    code: 'GAME_BAD_BUYIN_RANGE',
  });

/** Гонка за один и тот же seatIndex — не 500, а понятная просьба повторить попытку. */
export const gameSeatRace = () =>
  new ConflictException({ message: 'Место уже заняли, попробуйте другое', code: 'GAME_SEAT_RACE' });

export const gameNotCreatorOrAdmin = () =>
  new ForbiddenException({
    message: 'Закрыть стол может его создатель или владелец сервиса',
    code: 'GAME_NOT_CREATOR_OR_ADMIN',
  });

export const gameBadSeats = () =>
  new BadRequestException({ message: 'Недопустимое число мест для этого типа игры', code: 'GAME_BAD_SEATS' });
```

- [ ] **Step 3: `dto/game-table.dto.ts`**

```ts
import { IsIn, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { MAX_COINS_AMOUNT } from '../../coins/coins.config';
import { GAME_TYPES, GameType } from '../games.config';

export class CreateGameTableDto {
  @IsIn(GAME_TYPES)
  gameType: GameType;

  @IsString()
  @Length(2, 60)
  name: string;

  /** Закрытый по умолчанию: попасть в общий список — осознанный выбор. */
  @IsOptional()
  @IsIn(['public', 'private'])
  visibility?: 'public' | 'private';

  @IsInt()
  @Min(1)
  @Max(MAX_COINS_AMOUNT)
  minBuyIn: number;

  @IsInt()
  @Min(1)
  @Max(MAX_COINS_AMOUNT)
  maxBuyIn: number;

  /**
   * Внешняя граница — 9 (максимум среди SEATS_RANGE). Точный диапазон под
   * конкретный gameType (нельзя проверить одним декоратором на два поля
   * сразу) проверяет `GamesService.create`.
   */
  @IsInt()
  @Min(1)
  @Max(9)
  maxSeats: number;
}

export class JoinGameTableDto {
  @IsInt()
  @Min(1)
  @Max(MAX_COINS_AMOUNT)
  buyIn: number;
}
```

- [ ] **Step 4: Проверить компиляцию**

Run (из `backend/`): `npx tsc --noEmit`
Expected: без ошибок.

- [ ] **Step 5: Commit**

```bash
git add backend/src/games/games.config.ts backend/src/games/game-errors.ts backend/src/games/dto/game-table.dto.ts
git commit -m "feat(games): границы столов, коды ошибок и DTO создания/посадки"
```

---

## Task 3: `GamesService` — создание и чтение

**Files:**
- Create: `backend/src/games/games.service.ts`
- Test: `backend/src/games/games.service.spec.ts`

**Interfaces:**
- Consumes: `PrismaService` (`backend/src/prisma/prisma.service.ts`), `CoinsService` (`backend/src/coins/coins.service.ts`), `CreateGameTableDto` (Task 2), `SEATS_RANGE`/`GameType`/`PUBLIC_LIST_LIMIT` (Task 2), ошибки из `game-errors.ts` (Task 2).
- Produces: `GamesService.create(userId, dto)`, `GamesService.listMine(userId)`, `GamesService.listPublic(userId, gameType?)`, `GamesService.get(userId, id)` — используются контроллером (Task 7) и следующими шагами сервиса (Task 5, 6).

- [ ] **Step 1: Написать падающий тест**

Создать `backend/src/games/games.service.spec.ts`:

```ts
import { GamesService } from './games.service';

const TABLE = {
  gameType: 'blackjack' as const,
  name: 'Стол 1',
  minBuyIn: 100,
  maxBuyIn: 1000,
  maxSeats: 3,
};

function makeService() {
  const tables = new Map<string, any>();
  const seats: any[] = [];
  let nextTableId = 1;

  const prisma: any = {
    gameTable: {
      create: jest.fn(async ({ data }: any) => {
        const row = {
          id: `gt${nextTableId++}`,
          status: 'open',
          visibility: 'private',
          closedAt: null,
          createdAt: new Date(),
          ...data,
        };
        tables.set(row.id, row);
        return row;
      }),
      findUnique: jest.fn(async ({ where, include }: any) => {
        const row = tables.get(where.id) ?? null;
        if (!row || !include) return row;
        return {
          ...row,
          ...(include.seats ? { seats: seats.filter((s) => s.tableId === row.id) } : {}),
          ...(include.creator ? { creator: { name: (row.creatorId ?? '').toUpperCase() } } : {}),
        };
      }),
      findMany: jest.fn(async ({ where }: any) =>
        [...tables.values()]
          .filter(
            (t) =>
              (!where?.visibility || t.visibility === where.visibility) &&
              (!where?.status || t.status === where.status) &&
              (!where?.gameType || t.gameType === where.gameType) &&
              (!where?.OR ||
                where.OR.some(
                  (cond: any) =>
                    (cond.creatorId && t.creatorId === cond.creatorId) ||
                    (cond.seats?.some &&
                      seats.some((s) => s.tableId === t.id && s.userId === cond.seats.some.userId)),
                )) &&
              (!where?.seats?.none ||
                !seats.some((s) => s.tableId === t.id && s.userId === where.seats.none.userId)),
          )
          .map((t) => ({
            ...t,
            creator: { name: (t.creatorId ?? '').toUpperCase() },
            _count: { seats: seats.filter((s) => s.tableId === t.id).length },
          })),
      ),
    },
    gameSeat: {},
  };

  const coins = { charge: jest.fn(), credit: jest.fn() };
  const gateway = { broadcastTableState: jest.fn() };

  const service = new GamesService(prisma as never, coins as never, gateway as never);
  return { service, prisma, tables, seats };
}

describe('GamesService.create', () => {
  it('создаёт стол без посадки создателя', async () => {
    const h = makeService();

    const table = await h.service.create('u1', TABLE);

    expect(table).toMatchObject({ gameType: 'blackjack', creatorId: 'u1', status: 'open' });
    expect(h.seats).toHaveLength(0);
  });

  it('число мест вне диапазона типа игры отклоняется', async () => {
    const h = makeService();

    await expect(h.service.create('u1', { ...TABLE, maxSeats: 8 })).rejects.toMatchObject({
      response: { code: 'GAME_BAD_SEATS' },
    });
  });

  it('minBuyIn больше maxBuyIn отклоняется', async () => {
    const h = makeService();

    await expect(h.service.create('u1', { ...TABLE, minBuyIn: 500, maxBuyIn: 100 })).rejects.toMatchObject({
      response: { code: 'GAME_BAD_BUYIN_RANGE' },
    });
  });
});

describe('GamesService.listPublic / listMine', () => {
  it('публичный список не показывает столы без свободных мест и столы, где я уже сижу', async () => {
    const h = makeService();
    await h.service.create('creator', { ...TABLE, visibility: 'public' });
    h.seats.push({ tableId: 'gt1', userId: 'me', seatIndex: 0, stack: 100 });

    const rows = await h.service.listPublic('me');

    expect(rows).toHaveLength(0);
  });

  it('мои столы включают те, где я создатель, даже без места', async () => {
    const h = makeService();
    await h.service.create('me', TABLE);

    const rows = await h.service.listMine('me');

    expect(rows).toHaveLength(1);
  });
});

describe('GamesService.get', () => {
  it('несуществующий стол — GAME_TABLE_NOT_FOUND', async () => {
    const h = makeService();

    await expect(h.service.get('u1', 'missing')).rejects.toMatchObject({
      response: { code: 'GAME_TABLE_NOT_FOUND' },
    });
  });

  it('отдаёт места и мой seatIndex', async () => {
    const h = makeService();
    await h.service.create('creator', TABLE);
    h.seats.push({ tableId: 'gt1', userId: 'me', seatIndex: 1, stack: 200 });

    const state = await h.service.get('me', 'gt1');

    expect(state.mySeat).toBe(1);
    expect(state.isCreator).toBe(false);
    expect(state.seats).toEqual([{ userId: 'me', name: null, seatIndex: 1, stack: 200 }]);
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run (из `backend/`): `npx jest src/games/games.service.spec.ts`
Expected: FAIL — `Cannot find module './games.service'`.

- [ ] **Step 3: Реализовать `games.service.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGameTableDto } from './dto/game-table.dto';
import { gameBadBuyInRange, gameBadSeats, gameTableNotFound } from './game-errors';
import { GameType, PUBLIC_LIST_LIMIT, SEATS_RANGE } from './games.config';

/**
 * Общая инфраструктура столов покера/блэкджека: лобби, посадка/уход с
 * эскроу фишек в монетах. Правила самой раздачи — вне этого сервиса,
 * отдельные модули поверх него.
 */
@Injectable()
export class GamesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly coins: unknown, // CoinsService — подключается в Task 5
    private readonly gateway: unknown, // GamesGateway — подключается в Task 5
  ) {}

  /** Создатель не садится автоматически: buy-in ещё не выбран, и стол для чужой игры — законный случай. */
  async create(userId: string, dto: CreateGameTableDto) {
    const seatsRange = SEATS_RANGE[dto.gameType];
    if (dto.maxSeats < seatsRange[0] || dto.maxSeats > seatsRange[1]) throw gameBadSeats();
    if (dto.maxBuyIn < dto.minBuyIn) throw gameBadBuyInRange();

    return this.prisma.gameTable.create({
      data: {
        gameType: dto.gameType,
        name: dto.name.trim(),
        visibility: dto.visibility ?? 'private',
        minBuyIn: dto.minBuyIn,
        maxBuyIn: dto.maxBuyIn,
        maxSeats: dto.maxSeats,
        creatorId: userId,
      },
    });
  }

  /** Столы, где я сижу или я создатель, ещё открытые. */
  async listMine(userId: string) {
    const rows = await this.prisma.gameTable.findMany({
      where: { status: 'open', OR: [{ creatorId: userId }, { seats: { some: { userId } } }] },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { seats: true } } },
    });
    return rows.map(({ _count, ...t }) => ({ ...t, players: _count.seats }));
  }

  /**
   * Открытые публичные столы без меня. Заполненные отсеиваются после чтения
   * — условие «мест меньше maxSeats» в одном запросе Prisma не выразить, а
   * открытых столов в системе всегда немного (тот же приём, что
   * `TournamentsService.listPublic`).
   */
  async listPublic(userId: string, gameType?: GameType) {
    const rows = await this.prisma.gameTable.findMany({
      where: {
        visibility: 'public',
        status: 'open',
        ...(gameType ? { gameType } : {}),
        seats: { none: { userId } },
      },
      orderBy: { createdAt: 'desc' },
      take: PUBLIC_LIST_LIMIT,
      include: { creator: { select: { name: true } }, _count: { select: { seats: true } } },
    });
    return rows
      .filter((t) => t._count.seats < t.maxSeats)
      .map(({ _count, creator, ...t }) => ({ ...t, players: _count.seats, creatorName: creator?.name ?? null }));
  }

  /** Стол и его места, глазами конкретного пользователя. Доступен по id любому вошедшему. */
  async get(userId: string, id: string) {
    const state = await this.snapshot(id);
    if (!state) throw gameTableNotFound();
    return {
      ...state,
      isCreator: state.table.creatorId === userId,
      mySeat: state.seats.find((s) => s.userId === userId)?.seatIndex ?? null,
    };
  }

  /** Снимок стола без взгляда конкретного пользователя — то, что рассылается комнате (Task 5). */
  private async snapshot(id: string) {
    const table = await this.prisma.gameTable.findUnique({
      where: { id },
      include: { seats: { include: { user: { select: { name: true } } } }, creator: { select: { name: true } } },
    });
    if (!table) return null;
    const { seats, creator, ...rest } = table;
    return {
      table: { ...rest, creatorName: creator?.name ?? null, players: seats.length },
      seats: [...seats]
        .sort((a, b) => a.seatIndex - b.seatIndex)
        .map((s) => ({ userId: s.userId, name: s.user?.name ?? null, seatIndex: s.seatIndex, stack: s.stack })),
    };
  }
}
```

> Примечание: `coins`/`gateway` в конструкторе — временно `unknown`, чтобы
> файл компилировался до того, как в Task 5 появятся `CoinsService` и
> `GamesGateway`. Task 5 заменяет их типы и добавляет `join`; Task 6 —
> `leave`/`close`.

- [ ] **Step 4: Убедиться, что тест проходит**

Run (из `backend/`): `npx jest src/games/games.service.spec.ts`
Expected: PASS, все тесты зелёные.

- [ ] **Step 5: Commit**

```bash
git add backend/src/games/games.service.ts backend/src/games/games.service.spec.ts
git commit -m "feat(games): GamesService — создание и чтение столов"
```

---

## Task 4: WebSocket-гейтвей

**Files:**
- Modify: `backend/package.json` (новые зависимости)
- Create: `backend/src/games/games.gateway.ts`
- Test: `backend/src/games/games.gateway.spec.ts`

**Interfaces:**
- Consumes: `JwtService` (`@nestjs/jwt`), `resolveJwtAccessSecret()` (`backend/src/auth/jwt-secret.ts`), `JwtPayload` (`backend/src/auth/strategies/jwt.strategy.ts`).
- Produces: `GamesGateway.broadcastTableState(tableId: string, state: unknown): void` — используется `GamesService` в Task 5/6.

- [ ] **Step 1: Установить зависимости**

Run (из `backend/`):
```
npm install @nestjs/websockets@^10.0.0 @nestjs/platform-socket.io@^10.0.0 socket.io@^4.8.0
```
Expected: пакеты добавлены в `package.json`/`package-lock.json`, установка без ошибок.

- [ ] **Step 2: Написать падающий тест**

Создать `backend/src/games/games.gateway.spec.ts`:

```ts
import { GamesGateway } from './games.gateway';

function makeSocket(auth: Record<string, unknown> = {}) {
  return {
    handshake: { auth },
    data: {} as Record<string, unknown>,
    disconnect: jest.fn(),
  };
}

describe('GamesGateway.handleConnection', () => {
  it('без токена соединение обрывается', async () => {
    const jwt = { verifyAsync: jest.fn() };
    const gateway = new GamesGateway(jwt as never);
    const socket = makeSocket();

    await gateway.handleConnection(socket as never);

    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(jwt.verifyAsync).not.toHaveBeenCalled();
  });

  it('невалидный токен обрывает соединение', async () => {
    const jwt = { verifyAsync: jest.fn().mockRejectedValue(new Error('bad token')) };
    const gateway = new GamesGateway(jwt as never);
    const socket = makeSocket({ token: 'bad' });

    await gateway.handleConnection(socket as never);

    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('валидный токен кладёт userId в data и не обрывает соединение', async () => {
    const jwt = { verifyAsync: jest.fn().mockResolvedValue({ sub: 'u1', email: 'u1@example.com' }) };
    const gateway = new GamesGateway(jwt as never);
    const socket = makeSocket({ token: 'good' });

    await gateway.handleConnection(socket as never);

    expect(socket.data.userId).toBe('u1');
    expect(socket.disconnect).not.toHaveBeenCalled();
  });
});

describe('GamesGateway.broadcastTableState', () => {
  it('рассылает снимок в комнату с id стола', () => {
    const gateway = new GamesGateway({} as never);
    const emit = jest.fn();
    const to = jest.fn().mockReturnValue({ emit });
    (gateway as unknown as { server: unknown }).server = { to };

    gateway.broadcastTableState('gt1', { table: { id: 'gt1' } });

    expect(to).toHaveBeenCalledWith('gt1');
    expect(emit).toHaveBeenCalledWith('table_state', { table: { id: 'gt1' } });
  });
});
```

- [ ] **Step 3: Убедиться, что тест падает**

Run (из `backend/`): `npx jest src/games/games.gateway.spec.ts`
Expected: FAIL — `Cannot find module './games.gateway'`.

- [ ] **Step 4: Реализовать `games.gateway.ts`**

```ts
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { resolveJwtAccessSecret } from '../auth/jwt-secret';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

/**
 * Первый WS-канал в проекте. У сокета нет Bearer-заголовка, поэтому токен
 * едет явным полем хендшейка (`auth.token`), а не через HTTP-guard.
 *
 * `join_table`/`leave_table` — это только подписка сокета на обновления
 * конкретного стола (комната socket.io = tableId), не посадка за него:
 * посадка остаётся REST-вызовом `/join`, чтобы деньги двигались только через
 * транзакцию с эскроу монет.
 */
@WebSocketGateway({
  namespace: '/games',
  cors: { origin: process.env.FRONTEND_URL || 'http://localhost:3000', credentials: true },
})
export class GamesGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(GamesGateway.name);

  @WebSocketServer()
  private server: Server;

  constructor(private readonly jwt: JwtService) {}

  async handleConnection(client: Socket) {
    const token = client.handshake.auth?.token as string | undefined;
    if (!token) {
      client.disconnect(true);
      return;
    }
    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token, { secret: resolveJwtAccessSecret() });
      client.data.userId = payload.sub;
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`disconnected: ${client.id}`);
  }

  @SubscribeMessage('join_table')
  handleJoinTable(client: Socket, tableId: string) {
    client.join(tableId);
  }

  @SubscribeMessage('leave_table')
  handleLeaveTable(client: Socket, tableId: string) {
    client.leave(tableId);
  }

  /** Снимок стола рассылается комнате после любой мутации (join/leave/close). */
  broadcastTableState(tableId: string, state: unknown) {
    this.server.to(tableId).emit('table_state', state);
  }
}
```

- [ ] **Step 5: Убедиться, что тест проходит**

Run (из `backend/`): `npx jest src/games/games.gateway.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/src/games/games.gateway.ts backend/src/games/games.gateway.spec.ts
git commit -m "feat(games): первый WebSocket-гейтвей — аутентификация и комнаты столов"
```

---

## Task 5: `GamesService.join`

**Files:**
- Modify: `backend/src/games/games.service.ts`
- Modify: `backend/src/games/games.service.spec.ts`

**Interfaces:**
- Consumes: `CoinsService.charge(tx, userId, amount, kind, refId)` (`backend/src/coins/coins.service.ts`), `GamesGateway.broadcastTableState` (Task 4), `Prisma.PrismaClientKnownRequestError` (`@prisma/client`).
- Produces: `GamesService.join(userId, id, buyIn): Promise<ReturnType<GamesService['get']>>`.

- [ ] **Step 1: Дописать падающие тесты**

В `backend/src/games/games.service.spec.ts` заменить блок `makeService` на
версию с рабочими `gameSeat` и денежными моками, и добавить `describe`
для `join`. Полная новая версия файла:

```ts
import { Prisma } from '@prisma/client';
import { GamesService } from './games.service';

const TABLE = {
  gameType: 'blackjack' as const,
  name: 'Стол 1',
  minBuyIn: 100,
  maxBuyIn: 1000,
  maxSeats: 3,
};

function makeService() {
  const tables = new Map<string, any>();
  const seats: any[] = [];
  const charges: any[] = [];
  const credits: any[] = [];
  let nextTableId = 1;
  let nextSeatId = 1;

  const prisma: any = {
    gameTable: {
      create: jest.fn(async ({ data }: any) => {
        const row = {
          id: `gt${nextTableId++}`,
          status: 'open',
          visibility: 'private',
          closedAt: null,
          createdAt: new Date(),
          ...data,
        };
        tables.set(row.id, row);
        return row;
      }),
      findUnique: jest.fn(async ({ where, include }: any) => {
        const row = tables.get(where.id) ?? null;
        if (!row || !include) return row;
        return {
          ...row,
          ...(include.seats ? { seats: seats.filter((s) => s.tableId === row.id) } : {}),
          ...(include.creator ? { creator: { name: (row.creatorId ?? '').toUpperCase() } } : {}),
        };
      }),
      findMany: jest.fn(async ({ where }: any) =>
        [...tables.values()]
          .filter(
            (t) =>
              (!where?.visibility || t.visibility === where.visibility) &&
              (!where?.status || t.status === where.status) &&
              (!where?.gameType || t.gameType === where.gameType) &&
              (!where?.OR ||
                where.OR.some(
                  (cond: any) =>
                    (cond.creatorId && t.creatorId === cond.creatorId) ||
                    (cond.seats?.some &&
                      seats.some((s) => s.tableId === t.id && s.userId === cond.seats.some.userId)),
                )) &&
              (!where?.seats?.none ||
                !seats.some((s) => s.tableId === t.id && s.userId === where.seats.none.userId)),
          )
          .map((t) => ({
            ...t,
            creator: { name: (t.creatorId ?? '').toUpperCase() },
            _count: { seats: seats.filter((s) => s.tableId === t.id).length },
          })),
      ),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const row = tables.get(where.id);
        if (!row) return { count: 0 };
        if (where.status && row.status !== where.status) return { count: 0 };
        if (where.seats?.none && seats.some((s) => s.tableId === where.id)) return { count: 0 };
        tables.set(where.id, { ...row, ...data });
        return { count: 1 };
      }),
    },
    gameSeat: {
      create: jest.fn(async ({ data }: any) => {
        const clash = seats.some(
          (s) =>
            s.tableId === data.tableId && (s.seatIndex === data.seatIndex || s.userId === data.userId),
        );
        if (clash) throw new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: 'test' });
        const row = { id: `gs${nextSeatId++}`, joinedAt: new Date(), ...data };
        seats.push(row);
        return row;
      }),
      findUnique: jest.fn(async ({ where }: any) => {
        const key = where.tableId_userId;
        return seats.find((s) => s.tableId === key.tableId && s.userId === key.userId) ?? null;
      }),
      delete: jest.fn(async ({ where }: any) => {
        const key = where.tableId_userId;
        const i = seats.findIndex((s) => s.tableId === key.tableId && s.userId === key.userId);
        return seats.splice(i, 1)[0];
      }),
    },
    $transaction: jest.fn(),
  };

  // Транзакция откатывает состояние: без этого проверка «не хватило монет —
  // и места нет» ничего бы не значила, ведь строку мы уже вставили.
  prisma.$transaction.mockImplementation(async (arg: unknown) => {
    if (typeof arg !== 'function') return Promise.all(arg as unknown[]);
    const snapshotTables = new Map(tables);
    const snapshotSeats = [...seats];
    try {
      return await (arg as (tx: unknown) => unknown)(prisma);
    } catch (e) {
      tables.clear();
      for (const [k, v] of snapshotTables) tables.set(k, v);
      seats.length = 0;
      seats.push(...snapshotSeats);
      throw e;
    }
  });

  const coins = {
    charge: jest.fn(async (_tx: unknown, userId: string, amount: number, kind: string, refId: string) => {
      charges.push({ userId, amount, kind, refId });
    }),
    credit: jest.fn(async (_tx: unknown, userId: string, amount: number, kind: string, refId: string) => {
      credits.push({ userId, amount, kind, refId });
    }),
  };

  const gateway = { broadcastTableState: jest.fn() };

  const service = new GamesService(prisma as never, coins as never, gateway as never);
  return { service, prisma, coins, gateway, tables, seats, charges, credits };
}

describe('GamesService.create', () => {
  it('создаёт стол без посадки создателя', async () => {
    const h = makeService();

    const table = await h.service.create('u1', TABLE);

    expect(table).toMatchObject({ gameType: 'blackjack', creatorId: 'u1', status: 'open' });
    expect(h.seats).toHaveLength(0);
  });

  it('число мест вне диапазона типа игры отклоняется', async () => {
    const h = makeService();

    await expect(h.service.create('u1', { ...TABLE, maxSeats: 8 })).rejects.toMatchObject({
      response: { code: 'GAME_BAD_SEATS' },
    });
  });

  it('minBuyIn больше maxBuyIn отклоняется', async () => {
    const h = makeService();

    await expect(h.service.create('u1', { ...TABLE, minBuyIn: 500, maxBuyIn: 100 })).rejects.toMatchObject({
      response: { code: 'GAME_BAD_BUYIN_RANGE' },
    });
  });
});

describe('GamesService.listPublic / listMine', () => {
  it('публичный список не показывает столы без свободных мест и столы, где я уже сижу', async () => {
    const h = makeService();
    await h.service.create('creator', { ...TABLE, visibility: 'public' });
    h.seats.push({ tableId: 'gt1', userId: 'me', seatIndex: 0, stack: 100 });

    const rows = await h.service.listPublic('me');

    expect(rows).toHaveLength(0);
  });

  it('мои столы включают те, где я создатель, даже без места', async () => {
    const h = makeService();
    await h.service.create('me', TABLE);

    const rows = await h.service.listMine('me');

    expect(rows).toHaveLength(1);
  });
});

describe('GamesService.get', () => {
  it('несуществующий стол — GAME_TABLE_NOT_FOUND', async () => {
    const h = makeService();

    await expect(h.service.get('u1', 'missing')).rejects.toMatchObject({
      response: { code: 'GAME_TABLE_NOT_FOUND' },
    });
  });

  it('отдаёт места и мой seatIndex', async () => {
    const h = makeService();
    await h.service.create('creator', TABLE);
    h.seats.push({ tableId: 'gt1', userId: 'me', seatIndex: 1, stack: 200 });

    const state = await h.service.get('me', 'gt1');

    expect(state.mySeat).toBe(1);
    expect(state.isCreator).toBe(false);
    expect(state.seats).toEqual([{ userId: 'me', name: null, seatIndex: 1, stack: 200 }]);
  });
});

describe('GamesService.join', () => {
  it('садится на первое свободное место и списывает buy-in', async () => {
    const h = makeService();
    await h.service.create('creator', TABLE);

    const state = await h.service.join('me', 'gt1', 300);

    expect(state.mySeat).toBe(0);
    expect(h.charges).toEqual([{ userId: 'me', amount: 300, kind: 'GAME_BUYIN', refId: h.seats[0].id }]);
    expect(h.gateway.broadcastTableState).toHaveBeenCalledWith('gt1', expect.any(Object));
  });

  it('повторная посадка за тот же стол отклоняется', async () => {
    const h = makeService();
    await h.service.create('creator', TABLE);
    await h.service.join('me', 'gt1', 300);

    await expect(h.service.join('me', 'gt1', 300)).rejects.toMatchObject({
      response: { code: 'GAME_ALREADY_SEATED' },
    });
    expect(h.charges).toHaveLength(1);
  });

  it('buy-in вне диапазона стола отклоняется, монеты не списываются', async () => {
    const h = makeService();
    await h.service.create('creator', TABLE);

    await expect(h.service.join('me', 'gt1', 50)).rejects.toMatchObject({
      response: { code: 'GAME_BUY_IN_OUT_OF_RANGE' },
    });
    expect(h.charges).toHaveLength(0);
    expect(h.seats).toHaveLength(0);
  });

  it('полный стол отклоняет посадку', async () => {
    const h = makeService();
    await h.service.create('creator', { ...TABLE, maxSeats: 1 });
    await h.service.join('p1', 'gt1', 300);

    await expect(h.service.join('p2', 'gt1', 300)).rejects.toMatchObject({
      response: { code: 'GAME_TABLE_FULL' },
    });
  });

  it('гонка за место — P2002 превращается в GAME_SEAT_RACE, а не в 500', async () => {
    const h = makeService();
    await h.service.create('creator', TABLE);
    // Кто-то другой успел занять место 0 между чтением и вставкой.
    h.prisma.gameSeat.create.mockImplementationOnce(() => {
      throw new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: 'test' });
    });

    await expect(h.service.join('me', 'gt1', 300)).rejects.toMatchObject({
      response: { code: 'GAME_SEAT_RACE' },
    });
  });
});
```

- [ ] **Step 2: Убедиться, что новые тесты падают**

Run (из `backend/`): `npx jest src/games/games.service.spec.ts -t "GamesService.join"`
Expected: FAIL — `service.join is not a function`.

- [ ] **Step 3: Реализовать `join` и подключить типы `CoinsService`/`GamesGateway`**

В `backend/src/games/games.service.ts`:

Заменить импорты:

```ts
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CoinsService } from '../coins/coins.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGameTableDto } from './dto/game-table.dto';
import {
  gameAlreadySeated,
  gameBadBuyInRange,
  gameBadSeats,
  gameBuyInOutOfRange,
  gameSeatRace,
  gameTableClosed,
  gameTableFull,
  gameTableNotFound,
} from './game-errors';
import { GameType, PUBLIC_LIST_LIMIT, SEATS_RANGE } from './games.config';
import { GamesGateway } from './games.gateway';
```

Заменить конструктор:

```ts
  constructor(
    private readonly prisma: PrismaService,
    private readonly coins: CoinsService,
    private readonly gateway: GamesGateway,
  ) {}
```

Добавить в конец класса, после приватного метода `snapshot(...)` (перед
закрывающей `}` класса):

```ts
  /**
   * Посадка: выбрать свободный номер места и списать buy-in одной
   * транзакцией. Гонка за один и тот же `seatIndex` (или повторная посадка
   * одного пользователя) ловится уникальным индексом БД — `P2002`
   * превращается в понятную ошибку для повторной попытки, а не в 500.
   */
  async join(userId: string, id: string, buyIn: number) {
    await this.prisma.$transaction(async (tx) => {
      const table = await tx.gameTable.findUnique({ where: { id }, include: { seats: true } });
      if (!table) throw gameTableNotFound();
      if (table.status !== 'open') throw gameTableClosed();
      if (table.seats.some((s) => s.userId === userId)) throw gameAlreadySeated();
      if (buyIn < table.minBuyIn || buyIn > table.maxBuyIn) throw gameBuyInOutOfRange();

      const taken = new Set(table.seats.map((s) => s.seatIndex));
      let seatIndex = -1;
      for (let i = 0; i < table.maxSeats; i++) {
        if (!taken.has(i)) {
          seatIndex = i;
          break;
        }
      }
      if (seatIndex === -1) throw gameTableFull();

      let seat;
      try {
        seat = await tx.gameSeat.create({ data: { tableId: id, userId, seatIndex, stack: buyIn } });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw gameSeatRace();
        throw e;
      }
      await this.coins.charge(tx, userId, buyIn, 'GAME_BUYIN', seat.id);
    });
    await this.pushState(id);
    return this.get(userId, id);
  }

  private async pushState(id: string) {
    const state = await this.snapshot(id);
    if (state) this.gateway.broadcastTableState(id, state);
  }
```

- [ ] **Step 4: Убедиться, что все тесты проходят**

Run (из `backend/`): `npx jest src/games/games.service.spec.ts`
Expected: PASS, все тесты (включая Task 3) зелёные.

- [ ] **Step 5: Commit**

```bash
git add backend/src/games/games.service.ts backend/src/games/games.service.spec.ts
git commit -m "feat(games): GamesService.join — посадка с эскроу buy-in и рассылкой снимка"
```

---

## Task 6: `GamesService.leave` и `close`

**Files:**
- Modify: `backend/src/games/games.service.ts`
- Modify: `backend/src/games/games.service.spec.ts`

**Interfaces:**
- Consumes: `CoinsService.credit(tx, userId, amount, kind, refId)`, `isOwnerEmail(email)` (`backend/src/admin/owner.ts`).
- Produces: `GamesService.leave(userId, id): Promise<{success: true}>`, `GamesService.close(userId, email, id): Promise<{success: true}>`.

- [ ] **Step 1: Дописать падающие тесты**

Добавить в конец `backend/src/games/games.service.spec.ts`:

```ts
describe('GamesService.leave', () => {
  it('возвращает стек монетами и освобождает место для следующего', async () => {
    const h = makeService();
    await h.service.create('creator', TABLE);
    await h.service.join('me', 'gt1', 300);

    const result = await h.service.leave('me', 'gt1');

    expect(result).toEqual({ success: true });
    expect(h.credits).toEqual([{ userId: 'me', amount: 300, kind: 'GAME_CASHOUT', refId: expect.any(String) }]);
    expect(h.seats).toHaveLength(0);

    await h.service.join('other', 'gt1', 300);
    expect(h.seats[0]).toMatchObject({ seatIndex: 0 });
  });

  it('уход не сидящего — GAME_NOT_SEATED', async () => {
    const h = makeService();
    await h.service.create('creator', TABLE);

    await expect(h.service.leave('me', 'gt1')).rejects.toMatchObject({
      response: { code: 'GAME_NOT_SEATED' },
    });
  });
});

describe('GamesService.close', () => {
  it('создатель закрывает пустой стол', async () => {
    const h = makeService();
    await h.service.create('creator', TABLE);

    const result = await h.service.close('creator', 'creator@example.com', 'gt1');

    expect(result).toEqual({ success: true });
    expect(h.tables.get('gt1').status).toBe('closed');
  });

  it('непустой стол закрыть нельзя', async () => {
    const h = makeService();
    await h.service.create('creator', TABLE);
    await h.service.join('me', 'gt1', 300);

    await expect(h.service.close('creator', 'creator@example.com', 'gt1')).rejects.toMatchObject({
      response: { code: 'GAME_TABLE_NOT_EMPTY' },
    });
  });

  it('чужой стол не создателем и не владельцем — отказ', async () => {
    const h = makeService();
    await h.service.create('creator', TABLE);

    await expect(h.service.close('me', 'me@example.com', 'gt1')).rejects.toMatchObject({
      response: { code: 'GAME_NOT_CREATOR_OR_ADMIN' },
    });
  });
});
```

- [ ] **Step 2: Убедиться, что новые тесты падают**

Run (из `backend/`): `npx jest src/games/games.service.spec.ts -t "leave|close"`
Expected: FAIL — `service.leave is not a function`.

- [ ] **Step 3: Реализовать `leave` и `close`**

В `backend/src/games/games.service.ts`:

Добавить в импорт ошибок `gameNotSeated`, `gameTableNotEmpty`, `gameNotCreatorOrAdmin`:

```ts
import {
  gameAlreadySeated,
  gameBadBuyInRange,
  gameBadSeats,
  gameBuyInOutOfRange,
  gameNotCreatorOrAdmin,
  gameNotSeated,
  gameSeatRace,
  gameTableClosed,
  gameTableFull,
  gameTableNotEmpty,
  gameTableNotFound,
} from './game-errors';
```

Добавить импорт `isOwnerEmail`:

```ts
import { isOwnerEmail } from '../admin/owner';
```

Добавить в конец класса, сразу после `pushState(...)` (перед закрывающей `}`
класса):

```ts
  /** Уход: остаток стека возвращается монетами, место освобождается для следующего. */
  async leave(userId: string, id: string) {
    await this.prisma.$transaction(async (tx) => {
      const seat = await tx.gameSeat.findUnique({ where: { tableId_userId: { tableId: id, userId } } });
      if (!seat) throw gameNotSeated();
      await tx.gameSeat.delete({ where: { tableId_userId: { tableId: id, userId } } });
      await this.coins.credit(tx, userId, seat.stack, 'GAME_CASHOUT', seat.id);
    });
    await this.pushState(id);
    return { success: true as const };
  }

  /**
   * Закрыть стол — создатель или владелец сервиса, и только когда стол пуст:
   * закрыть стол с чужими деньгами на нём нельзя. Проверка пустоты — часть
   * самого `updateMany` (`seats: { none: {} } `), а не отдельное чтение до
   * записи: место, занятое между чтением и записью, иначе закрыло бы стол с
   * игроком внутри.
   */
  async close(userId: string, email: string | null | undefined, id: string) {
    const table = await this.prisma.gameTable.findUnique({ where: { id } });
    if (!table) throw gameTableNotFound();
    if (table.creatorId !== userId && !isOwnerEmail(email)) throw gameNotCreatorOrAdmin();
    if (table.status !== 'open') throw gameTableClosed();

    const moved = await this.prisma.gameTable.updateMany({
      where: { id, status: 'open', seats: { none: {} } },
      data: { status: 'closed', closedAt: new Date() },
    });
    if (moved.count === 0) throw gameTableNotEmpty();
    await this.pushState(id);
    return { success: true as const };
  }
```

- [ ] **Step 4: Убедиться, что все тесты проходят**

Run (из `backend/`): `npx jest src/games/games.service.spec.ts`
Expected: PASS, весь файл зелёный (create, listMine/listPublic, get, join, leave, close).

- [ ] **Step 5: Commit**

```bash
git add backend/src/games/games.service.ts backend/src/games/games.service.spec.ts
git commit -m "feat(games): GamesService.leave/close — кэшаут и закрытие пустого стола"
```

---

## Task 7: REST-контроллер

**Files:**
- Create: `backend/src/games/games.controller.ts`

**Interfaces:**
- Consumes: `GamesService` (Tasks 3/5/6), `JwtAuthGuard` (`backend/src/auth/guards/jwt-auth.guard.ts`), `CurrentUser` (`backend/src/auth/decorators/current-user.decorator.ts`), `CreateGameTableDto`/`JoinGameTableDto` (Task 2), `GameType` (Task 2).
- Produces: маршруты `api/games/tables` — используются `GamesModule` (Task 8). Контроллеры в этом проекте не имеют отдельных unit-тестов (см. `tournaments.controller.ts`) — логика уже покрыта тестами сервиса.

- [ ] **Step 1: Реализовать `games.controller.ts`**

```ts
import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateGameTableDto, JoinGameTableDto } from './dto/game-table.dto';
import { GameType } from './games.config';
import { GamesService } from './games.service';

/**
 * Стол виден любому вошедшему пользователю по id: приватность держится тем,
 * что id никому не показан вне приглашения, а не проверкой членства (тот же
 * приём, что у ссылки-приглашения турнира).
 *
 * `mine`/`public` объявлены раньше `:id` — иначе Nest примет эти слова за id
 * стола.
 */
@UseGuards(JwtAuthGuard)
@Controller('api/games/tables')
export class GamesController {
  constructor(private readonly games: GamesService) {}

  @Post()
  create(@CurrentUser('userId') userId: string, @Body() dto: CreateGameTableDto) {
    return this.games.create(userId, dto);
  }

  @Get('mine')
  listMine(@CurrentUser('userId') userId: string) {
    return this.games.listMine(userId);
  }

  @Get('public')
  listPublic(@CurrentUser('userId') userId: string, @Query('gameType') gameType?: GameType) {
    return this.games.listPublic(userId, gameType);
  }

  @Get(':id')
  get(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.games.get(userId, id);
  }

  @Post(':id/join')
  join(@CurrentUser('userId') userId: string, @Param('id') id: string, @Body() dto: JoinGameTableDto) {
    return this.games.join(userId, id, dto.buyIn);
  }

  @Post(':id/leave')
  leave(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.games.leave(userId, id);
  }

  // Право шире остальных: ещё и у владельца сервиса, поэтому сюда едет почта.
  @Delete(':id')
  close(
    @CurrentUser('userId') userId: string,
    @CurrentUser('email') email: string,
    @Param('id') id: string,
  ) {
    return this.games.close(userId, email, id);
  }
}
```

- [ ] **Step 2: Проверить компиляцию**

Run (из `backend/`): `npx tsc --noEmit`
Expected: без ошибок (модуль ещё не зарегистрирован в `AppModule` — это Task 8).

- [ ] **Step 3: Commit**

```bash
git add backend/src/games/games.controller.ts
git commit -m "feat(games): REST-контроллер games/tables"
```

---

## Task 8: Модуль, регистрация в приложении, сборка

**Files:**
- Create: `backend/src/games/games.module.ts`
- Modify: `backend/src/app.module.ts`

**Interfaces:**
- Consumes: `GamesController` (Task 7), `GamesService` (Tasks 3/5/6), `GamesGateway` (Task 4), `CoinsModule` (`backend/src/coins/coins.module.ts`).

- [ ] **Step 1: `games.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { CoinsModule } from '../coins/coins.module';
import { GamesController } from './games.controller';
import { GamesGateway } from './games.gateway';
import { GamesService } from './games.service';

/**
 * Общая инфраструктура столов покера/блэкджека: лобби, эскроу фишек, канал
 * реалтайма. Правила самой игры — отдельные модули поверх этого слоя.
 *
 * `JwtModule.register({})` — как в `AuthModule`: секрет передаётся явно в
 * месте проверки (`GamesGateway`), а не через конфиг модуля.
 *
 * PrismaModule глобальный, поэтому здесь не импортируется. Гейтинг по роли
 * (`role.ts`) не нужен: в `worker` HTTP-порт не открывается, поэтому сокеты
 * там физически недостижимы — тот же принцип, что и у обычных контроллеров.
 */
@Module({
  imports: [CoinsModule, JwtModule.register({})],
  controllers: [GamesController],
  providers: [GamesService, GamesGateway],
  exports: [GamesService],
})
export class GamesModule {}
```

- [ ] **Step 2: Зарегистрировать модуль в `AppModule`**

В `backend/src/app.module.ts` добавить импорт:

```ts
import { GamesModule } from './games/games.module';
```

и добавить `GamesModule` в массив `imports` (после `TournamentsModule`):

```ts
    TournamentsModule,
    ReferralsModule,
    GamesModule,
```

- [ ] **Step 3: Полная сборка бэкенда**

Новый роут/модуль — билд запускается обязательно (не мелкая правка).

Run (из `backend/`): `npm run build`
Expected: `nest build` завершается без ошибок, `dist/` содержит `games/`.

- [ ] **Step 4: Прогнать весь набор тестов**

Run (из `backend/`): `npx jest src/games`
Expected: PASS — все файлы (`games.service.spec.ts`, `games.gateway.spec.ts`).

- [ ] **Step 5: Ручная проверка (опционально, без браузера)**

Поднять бэкенд (`npm run start:dev` в `backend/`, локальная БД поднята) и
проверить REST-цепочку curl'ом (подставить реальный access-токен из
`/auth/login`):

```
curl -X POST http://localhost:3000/api/games/tables \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"gameType":"blackjack","name":"Тест","minBuyIn":100,"maxBuyIn":1000,"maxSeats":3,"visibility":"public"}'
```
Expected: `201` со столом (`status: "open"`, без мест).

```
curl -X POST http://localhost:3000/api/games/tables/<id>/join \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"buyIn":300}'
```
Expected: `201` со снимком стола, `mySeat: 0`; баланс монет пользователя
уменьшился на 300 (`GET /api/coins/balance`, если такой эндпоинт есть, или
`GET /api/games/tables/<id>`).

- [ ] **Step 6: Commit**

```bash
git add backend/src/games/games.module.ts backend/src/app.module.ts
git commit -m "feat(games): подключить GamesModule к приложению"
```

---

## Self-Review

**Spec coverage:**
- Модель `GameTable`/`GameSeat`, delete-on-leave, `CoinTxKind` — Task 1. ✅
- Эскроу через `CoinsService` внутри транзакции, `GAME_SEAT_RACE` — Task 5. ✅
- REST-эндпоинты (`create`/`mine`/`public`/`:id`/`join`/`leave`/`close`) — Tasks 3, 5, 6, 7. ✅
- Создатель не садится автоматически — Task 3 (`create` не создаёт `GameSeat`), проверено тестом. ✅
- WS-гейтвей, аутентификация handshake, `join_table`/`leave_table`, `broadcastTableState` — Task 4. ✅
- Рассылка снимка после join/leave/close — Task 5 (`pushState` в `join`), Task 6 (`leave`, `close`). ✅
- Отсутствие гейтинга по роли — задокументировано в Task 8 (комментарий модуля) и Global Constraints. ✅
- Тестирование (unit, мокнутый Prisma/CoinsService/Gateway, по образцу `tournaments.service.spec.ts`) — Tasks 3, 4, 5, 6. ✅
- Вне рамок (правила игр, rebuy, обрыв соединения, фронтенд) — сознательно не покрыто ни одним таском. ✅

**Placeholder scan:** временный `unknown` тип для `coins`/`gateway` в Task 3
явно помечен и заменяется в Task 5 тем же файлом — не забыт, отслежен явным
шагом Task 5/Step 3. Остальной код — без TODO/заглушек.

**Type consistency:** `GamesService` конструктор — `(prisma, coins, gateway)`
одинаково в Tasks 3 (черновой), 5 (финальный), 6 (не меняется), 7 (контроллер
знает только про публичные методы), 8 (модуль). `broadcastTableState(tableId: string, state: unknown)` — сигнатура одинакова в Task 4 (объявление) и Task 5/6 (вызов через `pushState`). Коды ошибок в `game-errors.ts` (Task 2) везде совпадают с `toMatchObject({ response: { code: '...' } })` в тестах (Tasks 3, 5, 6).
