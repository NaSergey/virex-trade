# Кастомная реферальная ссылка — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Пользователь может заменить `userId` в своей реферальной ссылке на свободное
кастомное имя (латиница, цифры, дефис, 3–30 символов) с живой проверкой доступности при
вводе, прямо в уже существующем диалоге «Пригласить друга».

**Architecture:** Новое nullable уникальное поле `User.referralSlug`. `AuthService.
resolveInviter` резолвит пригласившего по `id` ИЛИ по слагу одним запросом. `ReferralsService`
получает `isSlugAvailable`/`setSlug`; `ReferralsController` — два новых эндпоинта под тем же
`JwtAuthGuard`. На фронте — новый общий хук `useDebouncedValue`, два хука в
`features/referrals/api/hooks.ts` и редактируемое поле в `ReferralDialog`.

**Tech Stack:** NestJS + Prisma (backend), Next.js + FSD (frontend), Jest (backend, ручные
стабы `PrismaService`).

## Global Constraints

- Формат слага — `^[a-z0-9-]{3,30}$`. Ввод приводится к нижнему регистру перед проверкой
  и сохранением на бэкенде (в DTO, через `Transform`) — «Sergey» и «sergey» не должны
  считаться разными занятыми именами.
- Смена слага — простая перезапись поля: старое значение автоматически освобождается,
  отдельного действия «сбросить» не заводим. Ссылка по `userId` продолжает работать всегда.
- Присоединение слага для реферала (`resolveInviter`) не должно валить регистрацию при
  недействительном/чужом/битом `ref` — как и раньше с `id`.
- Конфликт уникальности БД при сохранении слага превращается в `ConflictException` с кодом
  `SLUG_TAKEN` (`{ message, code }`, тот же формат, что у `USER_EXISTS` в `AuthService`), а
  не остаётся 500-й.
- Prisma: миграций в проекте нет, схема применяется `npx prisma db push`. На Windows
  `prisma generate` падает `EPERM`, если параллельно запущен `npm run start:dev` — перед
  `db push` убедиться, что backend не запущен локально, либо спросить пользователя, можно
  ли его временно остановить.
- Backend-тесты — ручные стабы `PrismaService` (как в `auth.service.spec.ts`,
  `referrals.service.spec.ts`), без тестовой БД.
- Frontend-тестов на UI/хуки в проекте нет ни для одной фичи — не заводим и здесь; проверка
  — `npx next build` и ручной проход.
- Коммиты — каждая задача заканчивается отдельным коммитом. Сообщение коммита
  заканчивается строкой:
  ```
  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  ```

---

## Task 1: Схема — поле `referralSlug` на `User`

**Files:**
- Modify: `backend/prisma/schema.prisma`

**Interfaces:**
- Produces: поле `User.referralSlug: string | null`, уникальное — читают Task 2
  (`resolveInviter`) и Task 3 (`ReferralsService`).

- [ ] **Step 1: Проверить, не запущен ли backend локально**

```bash
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"CommandLine LIKE '%backend%start:dev%' OR CommandLine LIKE '%backend%main.js%'\" | Select-Object ProcessId, CommandLine"
```

Если что-то нашлось — спросить пользователя, можно ли временно остановить backend на время
следующего шага (`prisma db push` внутри вызывает `prisma generate`, который падает с
`EPERM`, если движок держит открытым процесс nest watch). Только после подтверждения
останавливать процесс. Если процессов нет — переходить дальше без вопросов.

- [ ] **Step 2: Добавить поле в схему**

В `backend/prisma/schema.prisma` найти модель `User` и вставить строку сразу после
`invitedUsers`:

```prisma
  invitedById  String?
  invitedBy    User?   @relation("Referrals", fields: [invitedById], references: [id], onDelete: SetNull)
  invitedUsers User[]  @relation("Referrals")
```

заменить на:

```prisma
  invitedById  String?
  invitedBy    User?   @relation("Referrals", fields: [invitedById], references: [id], onDelete: SetNull)
  invitedUsers User[]  @relation("Referrals")

  // Кастомное имя для реферальной ссылки вместо userId — необязательное и
  // уникальное. Формат (латиница, цифры, дефис, 3–30 символов) проверяет DTO
  // (см. referrals/dto/referral-slug.dto.ts), здесь только колонка.
  referralSlug String? @unique
```

- [ ] **Step 3: Применить схему к базе**

Убедиться, что база поднята (`docker compose up -d --wait db` из корня репозитория), затем
в `backend/`:

```bash
npx prisma db push
```

Ожидаемо: `Your database is now in sync with your Prisma schema.` и `✔ Generated Prisma
Client`. Если `EPERM` — вернуться к Step 1.

- [ ] **Step 4: Проверить, что типы клиента подхватили новое поле**

```bash
grep -n "referralSlug" node_modules/.prisma/client/index.d.ts
```

Ожидаемо: находится хотя бы одна строка.

- [ ] **Step 5: Если backend останавливали — поднять обратно**

Тем же способом, каким он был запущен (`start.bat` или `npm run start:dev` в `backend/`).

- [ ] **Step 6: Commit**

```bash
git add backend/prisma/schema.prisma
git commit -m "feat(referrals): поле referralSlug на User

Кастомное имя для реферальной ссылки вместо userId. Nullable и
уникальное — формат проверяет DTO, здесь только колонка.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: `resolveInviter` матчит по id ИЛИ по слагу

**Files:**
- Modify: `backend/src/auth/auth.service.ts`
- Modify: `backend/src/auth/auth.service.spec.ts`

**Interfaces:**
- Consumes: `User.referralSlug` (Task 1).
- Produces: `AuthService.resolveInviter(ref)` теперь резолвит и по кастомному слагу —
  поведение проверяется этой же задачей, ничего наружу не меняется (сигнатура та же).

- [ ] **Step 1: Переписать тесты `AuthService.register` на новый стаб**

В `backend/src/auth/auth.service.spec.ts` заменить весь блок `describe('AuthService.
register', ...)` (от `describe('AuthService.register', () => {` до закрывающей `});` в
конце файла) на:

```ts
describe('AuthService.register', () => {
  const baseDto = { email: 'new@example.com', password: 'password123', name: 'New User' };

  // Ручной стаб PrismaService: register() трогает user.findUnique (по email),
  // user.findFirst (резолвит ref по id ИЛИ по слагу — см. resolveInviter),
  // user.create и refreshToken.create. jwt и tags — заглушки, как в блоке
  // AuthService.login выше.
  function makeService(existingUsers: Array<{ id: string; referralSlug?: string }>) {
    const created: any[] = [];
    const prisma = {
      user: {
        findUnique: async () => null, // почта всегда свободна в этих тестах
        findFirst: async ({ where }: { where: { OR: Array<{ id?: string; referralSlug?: string }> } }) => {
          for (const cond of where.OR) {
            const found = existingUsers.find(
              (u) => (cond.id && u.id === cond.id) || (cond.referralSlug && u.referralSlug === cond.referralSlug),
            );
            if (found) return found;
          }
          return null;
        },
        create: async ({ data }: { data: any }) => {
          created.push(data);
          return { id: 'new-user-id', email: data.email, name: data.name };
        },
      },
      refreshToken: { create: async () => ({}) },
    } as any;
    const jwt = { signAsync: async () => 'access-token' } as any;
    const tags = { createDefaults: async () => undefined } as any;
    return { service: new AuthService(prisma, jwt, tags), created };
  }

  it('валидный ref по id закрепляет пригласившего', async () => {
    const { service, created } = makeService([{ id: 'inviter-1' }]);

    await service.register({ ...baseDto, ref: 'inviter-1' } as any);

    expect(created[0].invitedById).toBe('inviter-1');
  });

  it('валидный ref по кастомному слагу закрепляет пригласившего (без учёта регистра)', async () => {
    const { service, created } = makeService([{ id: 'inviter-1', referralSlug: 'sergey' }]);

    await service.register({ ...baseDto, ref: 'Sergey' } as any);

    expect(created[0].invitedById).toBe('inviter-1');
  });

  it('несуществующий ref не падает и не закрепляет пригласившего', async () => {
    const { service, created } = makeService([]);

    await service.register({ ...baseDto, ref: 'ghost' } as any);

    expect(created[0].invitedById).toBeNull();
  });

  it('без ref не закрепляет пригласившего', async () => {
    const { service, created } = makeService([]);

    await service.register(baseDto as any);

    expect(created[0].invitedById).toBeNull();
  });
});
```

- [ ] **Step 2: Запустить тесты, убедиться, что падают**

```bash
cd backend && npx jest src/auth/auth.service.spec.ts
```

Ожидаемо: FAIL — `resolveInviter` пока вызывает `findUnique({ where: { id: ref } })`, а не
`findFirst`, так что новый стаб (у которого `findUnique` всегда отдаёт `null`) не находит
пригласившего ни в одном из первых трёх тестов.

- [ ] **Step 3: Переписать `resolveInviter`**

В `backend/src/auth/auth.service.ts` заменить:

```ts
  /** id пригласившего, если такой пользователь существует, иначе null. */
  private async resolveInviter(ref: string): Promise<string | null> {
    const inviter = await this.prisma.user.findUnique({ where: { id: ref } });
    return inviter?.id ?? null;
  }
```

на:

```ts
  /**
   * id пригласившего — по `userId` ИЛИ по кастомному слагу ссылки
   * (`referralSlug`, см. ReferralsService.setSlug), одним запросом. Слаг
   * сравнивается в нижнем регистре: хранится он тоже в нижнем, а `ref` в
   * адресной строке человек мог набрать как угодно.
   */
  private async resolveInviter(ref: string): Promise<string | null> {
    const inviter = await this.prisma.user.findFirst({
      where: { OR: [{ id: ref }, { referralSlug: ref.toLowerCase() }] },
    });
    return inviter?.id ?? null;
  }
```

- [ ] **Step 4: Запустить тесты, убедиться, что проходят**

```bash
npx jest src/auth/auth.service.spec.ts
```

Ожидаемо: PASS, все пять тестов (`AuthService.login` + четыре в `AuthService.register`).

- [ ] **Step 5: Commit**

```bash
git add backend/src/auth/auth.service.ts backend/src/auth/auth.service.spec.ts
git commit -m "feat(referrals): resolveInviter матчит и по кастомному слагу

ref в /login?mode=register&ref=<...> резолвится по userId ИЛИ по
referralSlug одним запросом, слаг сравнивается без учёта регистра.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: `ReferralsService`/`ReferralsController` — проверка и сохранение слага

**Files:**
- Create: `backend/src/referrals/dto/referral-slug.dto.ts`
- Modify: `backend/src/referrals/referrals.service.ts`
- Modify: `backend/src/referrals/referrals.service.spec.ts`
- Modify: `backend/src/referrals/referrals.controller.ts`

**Interfaces:**
- Consumes: `User.referralSlug` (Task 1).
- Produces: `ReferralStats` пополняется полем `slug: string | null`;
  `ReferralsService.isSlugAvailable(slug, excludeUserId): Promise<boolean>`;
  `ReferralsService.setSlug(userId, slug): Promise<{ slug: string }>` (бросает
  `ConflictException` с кодом `SLUG_TAKEN` при конфликте уникальности); эндпоинты
  `GET /api/referrals/slug-available?slug=` → `{ available: boolean }` и
  `PUT /api/referrals/slug` (тело `{ slug: string }`) → `{ slug: string }` — использует
  Task 6 (`features/referrals/api/hooks.ts`).

- [ ] **Step 1: DTO**

Создать `backend/src/referrals/dto/referral-slug.dto.ts`:

```ts
import { IsString, Matches } from 'class-validator';
import { Transform } from 'class-transformer';

/** Латиница, цифры, дефис, 3–30 символов — то же ограничение везде вокруг слага. */
const SLUG_PATTERN = /^[a-z0-9-]{3,30}$/;

const normalize = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class SetReferralSlugDto {
  @Transform(normalize)
  @IsString()
  @Matches(SLUG_PATTERN, {
    message: 'Ссылка может содержать только латиницу, цифры и дефис, от 3 до 30 символов',
  })
  slug: string;
}

/** Тот же формат, что при сохранении — используется для живой проверки доступности. */
export class SlugAvailableQueryDto extends SetReferralSlugDto {}
```

- [ ] **Step 2: Написать падающие тесты сервиса**

В `backend/src/referrals/referrals.service.spec.ts` заменить весь файл на:

```ts
import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ReferralsService } from './referrals.service';

describe('ReferralsService.getStats', () => {
  it('считает total и withKey раздельно, отдаёт слаг', async () => {
    const calls: Array<{ where: Record<string, unknown> }> = [];
    const prisma = {
      user: {
        count: async (args: { where: Record<string, unknown> }) => {
          calls.push(args);
          return 'exchangeConnections' in args.where ? 3 : 5;
        },
        findUnique: async () => ({ referralSlug: 'sergey' }),
      },
    } as any;

    const stats = await new ReferralsService(prisma).getStats('inviter-1');

    expect(stats).toEqual({ total: 5, withKey: 3, slug: 'sergey' });
    expect(calls[0].where).toEqual({ invitedById: 'inviter-1' });
    expect(calls[1].where).toEqual({
      invitedById: 'inviter-1',
      exchangeConnections: { some: {} },
    });
  });

  it('без приглашённых и без слага отдаёт нули и null', async () => {
    const prisma = {
      user: {
        count: async () => 0,
        findUnique: async () => ({ referralSlug: null }),
      },
    } as any;

    const stats = await new ReferralsService(prisma).getStats('lonely');

    expect(stats).toEqual({ total: 0, withKey: 0, slug: null });
  });
});

describe('ReferralsService.isSlugAvailable', () => {
  it('свободный слаг — true', async () => {
    const prisma = { user: { count: async () => 0 } } as any;

    expect(await new ReferralsService(prisma).isSlugAvailable('sergey', 'me')).toBe(true);
  });

  it('занятый слаг — false', async () => {
    const prisma = { user: { count: async () => 1 } } as any;

    expect(await new ReferralsService(prisma).isSlugAvailable('sergey', 'me')).toBe(false);
  });

  it('исключает самого пользователя из проверки', async () => {
    const calls: any[] = [];
    const prisma = {
      user: {
        count: async (args: any) => {
          calls.push(args);
          return 0;
        },
      },
    } as any;

    await new ReferralsService(prisma).isSlugAvailable('sergey', 'me');

    expect(calls[0].where).toEqual({ referralSlug: 'sergey', id: { not: 'me' } });
  });
});

describe('ReferralsService.setSlug', () => {
  it('сохраняет слаг', async () => {
    const prisma = {
      user: { update: async ({ data }: any) => ({ referralSlug: data.referralSlug }) },
    } as any;

    const result = await new ReferralsService(prisma).setSlug('me', 'sergey');

    expect(result).toEqual({ slug: 'sergey' });
  });

  it('занятый слаг превращается в ConflictException с кодом SLUG_TAKEN, а не в 500', async () => {
    const conflict = new Prisma.PrismaClientKnownRequestError('duplicate', {
      code: 'P2002',
      clientVersion: 'test',
    });
    const prisma = {
      user: {
        update: async () => {
          throw conflict;
        },
      },
    } as any;

    let caught: unknown;
    try {
      await new ReferralsService(prisma).setSlug('me', 'sergey');
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(ConflictException);
    expect((caught as ConflictException).getResponse()).toMatchObject({ code: 'SLUG_TAKEN' });
  });

  it('прочая ошибка БД не проглатывается', async () => {
    const other = new Error('connection lost');
    const prisma = {
      user: {
        update: async () => {
          throw other;
        },
      },
    } as any;

    await expect(new ReferralsService(prisma).setSlug('me', 'sergey')).rejects.toThrow(
      'connection lost',
    );
  });
});
```

- [ ] **Step 3: Запустить тесты, убедиться, что падают**

```bash
npx jest src/referrals/referrals.service.spec.ts
```

Ожидаемо: FAIL — `getStats` пока не зовёт `findUnique`, `isSlugAvailable`/`setSlug` ещё не
существуют.

- [ ] **Step 4: Реализовать сервис**

Заменить `backend/src/referrals/referrals.service.ts` целиком на:

```ts
import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface ReferralStats {
  total: number;
  withKey: number;
  slug: string | null;
}

/**
 * Статистика по приглашённым и управление кастомным слагом ссылки.
 *
 * «Сейчас», а не «когда-либо»: у withKey нет отдельного флага «был
 * подключён» — он разошёлся бы с реальным состоянием в момент отключения
 * ключа (`settings.controller` такой путь уже поддерживает), и число
 * обманывало бы пригласившего.
 */
@Injectable()
export class ReferralsService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats(userId: string): Promise<ReferralStats> {
    const [total, withKey, user] = await Promise.all([
      this.prisma.user.count({ where: { invitedById: userId } }),
      this.prisma.user.count({
        where: { invitedById: userId, exchangeConnections: { some: {} } },
      }),
      this.prisma.user.findUnique({ where: { id: userId }, select: { referralSlug: true } }),
    ]);
    return { total, withKey, slug: user?.referralSlug ?? null };
  }

  /**
   * Свободен ли слаг для всех, кроме самого пользователя — иначе повторный
   * ввод своего же текущего слага показывал бы «занято».
   */
  async isSlugAvailable(slug: string, excludeUserId: string): Promise<boolean> {
    const taken = await this.prisma.user.count({
      where: { referralSlug: slug, id: { not: excludeUserId } },
    });
    return taken === 0;
  }

  /**
   * Сохраняет слаг. Уникальность держит индекс БД, а не проверка здесь —
   * между `isSlugAvailable` и сохранением кто-то другой мог успеть занять то
   * же имя; такую гонку превращаем в понятную ошибку, а не в 500.
   */
  async setSlug(userId: string, slug: string): Promise<{ slug: string }> {
    try {
      const user = await this.prisma.user.update({
        where: { id: userId },
        data: { referralSlug: slug },
        select: { referralSlug: true },
      });
      return { slug: user.referralSlug! };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException({ message: 'Это имя уже занято', code: 'SLUG_TAKEN' });
      }
      throw e;
    }
  }
}
```

- [ ] **Step 5: Запустить тесты, убедиться, что проходят**

```bash
npx jest src/referrals/referrals.service.spec.ts
```

Ожидаемо: PASS, все восемь тестов.

- [ ] **Step 6: Контроллер**

Заменить `backend/src/referrals/referrals.controller.ts` целиком на:

```ts
import { Body, Controller, Get, Put, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SetReferralSlugDto, SlugAvailableQueryDto } from './dto/referral-slug.dto';
import { ReferralsService, ReferralStats } from './referrals.service';

@Controller('api/referrals')
@UseGuards(JwtAuthGuard)
export class ReferralsController {
  constructor(private readonly referrals: ReferralsService) {}

  /**
   * Ссылку строит фронт из своего userId или, если задан, своего слага
   * (оба есть в этом ответе) — создавать или включать пользователю нечего.
   */
  @Get('me')
  me(@CurrentUser('userId') userId: string): Promise<ReferralStats> {
    return this.referrals.getStats(userId);
  }

  /** Живая проверка при вводе — свой текущий слаг не считается «занято». */
  @Get('slug-available')
  async slugAvailable(
    @CurrentUser('userId') userId: string,
    @Query() query: SlugAvailableQueryDto,
  ): Promise<{ available: boolean }> {
    return { available: await this.referrals.isSlugAvailable(query.slug, userId) };
  }

  @Put('slug')
  setSlug(
    @CurrentUser('userId') userId: string,
    @Body() dto: SetReferralSlugDto,
  ): Promise<{ slug: string }> {
    return this.referrals.setSlug(userId, dto.slug);
  }
}
```

(Guard переехал с метода `me` на класс целиком — теперь все три эндпоинта требуют
авторизации, а не только `me`.)

- [ ] **Step 7: Проверить типы и прогнать весь backend**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | head -50
npx jest
```

Ожидаемо: первая команда — без ошибок типов. Вторая — PASS, весь набор, без регрессий.

- [ ] **Step 8: Commit**

```bash
git add backend/src/referrals
git commit -m "feat(referrals): проверка и сохранение кастомного слага

GET /api/referrals/slug-available и PUT /api/referrals/slug. Конфликт
уникальности БД превращается в 409 SLUG_TAKEN, а не в 500. GET /me
теперь тоже отдаёт slug.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 4: Ошибка `SLUG_TAKEN` в словаре фронтенда

**Files:**
- Modify: `frontend/src/shared/i18n/messages/ru.json`
- Modify: `frontend/src/shared/i18n/messages/en.json`

**Interfaces:**
- Produces: перевод кода ошибки `SLUG_TAKEN`, который `resolveApiError`
  (`frontend/src/shared/api/http.ts`) достаёт из `messages.errors` — тот же путь, что у
  `USER_EXISTS`. Использует Task 7 (`ErrorNote` в `ReferralDialog`, как запасной путь: тем
  же кодом уже отвечает `PUT /api/referrals/slug`).

- [ ] **Step 1: Добавить ключ в `ru.json`**

В `frontend/src/shared/i18n/messages/ru.json`, в блоке `"errors"`, заменить:

```json
    "DONATION_AMOUNT_POOL_EXHAUSTED": "Слишком много одновременных платежей на эту сумму — попробуйте через минуту"
  },
```

на:

```json
    "DONATION_AMOUNT_POOL_EXHAUSTED": "Слишком много одновременных платежей на эту сумму — попробуйте через минуту",
    "SLUG_TAKEN": "Это имя уже занято"
  },
```

- [ ] **Step 2: Добавить ключ в `en.json`**

В `frontend/src/shared/i18n/messages/en.json`, в блоке `"errors"`, заменить:

```json
    "DONATION_AMOUNT_POOL_EXHAUSTED": "Too many simultaneous payments of this amount — try again in a minute"
  },
```

на:

```json
    "DONATION_AMOUNT_POOL_EXHAUSTED": "Too many simultaneous payments of this amount — try again in a minute",
    "SLUG_TAKEN": "This name is already taken"
  },
```

- [ ] **Step 3: Проверить парность ключей**

```bash
cd frontend && npx vitest run src/shared/i18n/messages.test.ts
```

Ожидаемо: PASS — этот тест сверяет набор ключей `ru.json`/`en.json` и упадёт, если один
файл поправлен, а другой нет.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/shared/i18n/messages/ru.json frontend/src/shared/i18n/messages/en.json
git commit -m "feat(referrals): перевод ошибки SLUG_TAKEN

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 5: `useDebouncedValue` — общий хук

**Files:**
- Create: `frontend/src/shared/lib/hooks/useDebouncedValue.ts`

**Interfaces:**
- Produces: `useDebouncedValue<T>(value: T, delayMs: number): T` — использует Task 7
  (`ReferralDialog`).

- [ ] **Step 1: Создать хук**

Создать `frontend/src/shared/lib/hooks/useDebouncedValue.ts`:

```ts
'use client';

import { useEffect, useState } from 'react';

/**
 * Отдаёт значение с задержкой: меняется не на каждое нажатие клавиши, а
 * только когда ввод затих на `delayMs`. Общий приём для полей с проверкой на
 * сервере при вводе — первый потребитель: слаг реферальной ссылки
 * (`features/referrals/ui/ReferralDialog.tsx`).
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
```

- [ ] **Step 2: Проверить типы**

```bash
cd frontend && npx tsc --noEmit -p tsconfig.json
```

Ожидаемо: без ошибок (файл пока никем не импортируется, но обязан компилироваться сам по
себе).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/shared/lib/hooks/useDebouncedValue.ts
git commit -m "feat(referrals): useDebouncedValue — общий хук задержки

Первый потребитель — живая проверка доступности слага, но хук не о
рефералках: общий приём для любого поля с проверкой на сервере при вводе.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 6: Хуки `features/referrals` + строки интерфейса

**Files:**
- Modify: `frontend/src/features/referrals/api/hooks.ts`
- Modify: `frontend/src/shared/i18n/messages/ru.json`
- Modify: `frontend/src/shared/i18n/messages/en.json`

**Interfaces:**
- Consumes: `apiJson` из `@/shared/api/http`.
- Produces: `ReferralStats` пополняется `slug: string | null`; `useSlugAvailable(slug:
  string, enabled: boolean)`; `useSetReferralSlug()` (мутация, инвалидирует
  `['referralStats']` при успехе) — использует Task 7 (`ReferralDialog`).

- [ ] **Step 1: Обновить хуки**

Заменить `frontend/src/features/referrals/api/hooks.ts` целиком на:

```ts
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiJson } from '@/shared/api/http';

export interface ReferralStats {
  total: number;
  withKey: number;
  /** Кастомное имя вместо userId в ссылке — null, если не задано. */
  slug: string | null;
}

/**
 * Счётчик приглашённых и текущий слаг. Число меняется редко — не в реальном
 * времени, как статус доната, — поэтому без опроса, только при открытии окна.
 */
export const useReferralStats = () =>
  useQuery({
    queryKey: ['referralStats'],
    queryFn: () => apiJson<ReferralStats>('/api/referrals/me'),
    staleTime: 60_000,
  });

/**
 * Живая проверка доступности слага при вводе. `enabled` решает вызывающий:
 * запрос имеет смысл только когда формат уже валиден и значение отличается
 * от уже сохранённого — см. ReferralDialog.
 */
export const useSlugAvailable = (slug: string, enabled: boolean) =>
  useQuery({
    queryKey: ['referralSlugAvailable', slug],
    queryFn: () => apiJson<{ available: boolean }>(`/api/referrals/slug-available?slug=${encodeURIComponent(slug)}`),
    enabled,
    staleTime: 0,
  });

export const useSetReferralSlug = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (slug: string) =>
      apiJson<{ slug: string }>('/api/referrals/slug', {
        method: 'PUT',
        body: JSON.stringify({ slug }),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['referralStats'] }),
  });
};
```

- [ ] **Step 2: Строки интерфейса**

В `frontend/src/shared/i18n/messages/ru.json`, в блоке `"referrals"`, заменить:

```json
    "copy": "скопировать",
    "copied": "скопировано",
    "copyFailed": "не вышло"
  },
```

на:

```json
    "copy": "скопировать",
    "copied": "скопировано",
    "copyFailed": "не вышло",
    "customLabel": "Своё имя для ссылки",
    "slugPlaceholder": "sergey",
    "formatHint": "Латиница, цифры, дефис — от 3 до 30 символов",
    "checking": "проверяю…",
    "available": "свободно",
    "taken": "занято",
    "slugSaveFailed": "Не удалось сохранить ссылку"
  },
```

В `frontend/src/shared/i18n/messages/en.json`, в блоке `"referrals"`, заменить:

```json
    "copy": "copy",
    "copied": "copied",
    "copyFailed": "failed"
  },
```

на:

```json
    "copy": "copy",
    "copied": "copied",
    "copyFailed": "failed",
    "customLabel": "Custom name for the link",
    "slugPlaceholder": "sergey",
    "formatHint": "Latin letters, digits, hyphen — 3 to 30 characters",
    "checking": "checking…",
    "available": "available",
    "taken": "taken",
    "slugSaveFailed": "Could not save the link"
  },
```

- [ ] **Step 3: Проверить типы и парность ключей**

```bash
cd frontend && npx tsc --noEmit -p tsconfig.json
npx vitest run src/shared/i18n/messages.test.ts
```

Ожидаемо: без ошибок типов; тест парности ключей — PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/referrals/api/hooks.ts frontend/src/shared/i18n/messages/ru.json frontend/src/shared/i18n/messages/en.json
git commit -m "feat(referrals): хуки useSlugAvailable/useSetReferralSlug

ReferralStats пополняется полем slug. Успешное сохранение инвалидирует
кэш referralStats — ссылка и счётчики обновляются сами.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 7: `ReferralDialog` — редактируемый слаг

**Files:**
- Modify: `frontend/src/features/referrals/ui/ReferralDialog.tsx`

**Interfaces:**
- Consumes: `useDebouncedValue` (Task 5); `useReferralStats`, `useSlugAvailable`,
  `useSetReferralSlug` (Task 6); `Field`/`Input` из `@/shared/ui/Field`; `ErrorNote` из
  `@/shared/ui/ErrorNote`.

- [ ] **Step 1: Переписать диалог**

Заменить `frontend/src/features/referrals/ui/ReferralDialog.tsx` целиком на:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/shared/ui/Button';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { Field, Input } from '@/shared/ui/Field';
import { KeyValue } from '@/shared/ui/Lookup';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from '@/shared/ui/dialog';
import { useDebouncedValue } from '@/shared/lib/hooks/useDebouncedValue';
import { useReferralStats, useSetReferralSlug, useSlugAvailable } from '../api/hooks';
import { CopyLink } from './CopyLink';

/** Латиница, цифры, дефис — то же ограничение, что проверяет бэкенд. */
const SLUG_FORMAT = /^[a-z0-9-]{3,30}$/;

/**
 * «Пригласить друга» — постоянная персональная ссылка, без второго шага, в
 * отличие от доната: тут нечего ждать в реальном времени, кроме живой
 * проверки доступности слага. Ссылка строится на фронте из своего userId
 * или, если задан, из кастомного слага — отдельный «код» бэкенду создавать
 * незачем, см. дизайн.
 */
export function ReferralDialog({
  userId,
  open,
  onClose,
}: {
  userId: string;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations('referrals');
  const tc = useTranslations('common');
  const { data: stats } = useReferralStats();
  const setSlug = useSetReferralSlug();

  const [slugInput, setSlugInput] = useState('');
  // Черновик подтягивается из сохранённого слага при каждом ОТКРЫТИИ окна, а
  // не на каждое обновление stats: иначе фоновый рефетч (например, при
  // возврате на вкладку) стирал бы то, что человек ещё не сохранил.
  useEffect(() => {
    if (open) setSlugInput(stats?.slug ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- см. комментарий выше: подтягиваем только на open
  }, [open]);

  const debouncedSlug = useDebouncedValue(slugInput, 300);
  const normalized = debouncedSlug.trim().toLowerCase();
  const formatValid = SLUG_FORMAT.test(normalized);
  const isUnchanged = normalized === (stats?.slug ?? '');
  const checkEnabled = open && formatValid && !isUnchanged;

  const { data: availability, isFetching: checking } = useSlugAvailable(normalized, checkEnabled);
  const canSave = checkEnabled && availability?.available === true && !setSlug.isPending;

  const link =
    open && typeof window !== 'undefined'
      ? `${window.location.origin}/login?mode=register&ref=${stats?.slug ?? userId}`
      : '';

  // Единая точка, откуда берутся и текст статуса, и его цвет — раньше это были
  // два параллельных выражения, и рассинхронить их было легко: например,
  // показать «проверяю…» зелёным цветом «свободно».
  const status = (() => {
    if (normalized === '') return null;
    if (!formatValid) return { text: t('formatHint'), cls: 'muted' };
    if (isUnchanged) return null;
    if (checking) return { text: t('checking'), cls: 'muted' };
    if (availability?.available) return { text: t('available'), cls: 'pos' };
    if (availability?.available === false) return { text: t('taken'), cls: 'neg' };
    return null;
  })();

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader title={t('title')} subtitle={t('lede')} />
        <DialogBody>
          <KeyValue label={t('linkLabel')}>
            <CopyLink value={link} />
          </KeyValue>
          <KeyValue label={t('totalLabel')}>{stats?.total ?? '—'}</KeyValue>
          <KeyValue label={t('withKeyLabel')}>{stats?.withKey ?? '—'}</KeyValue>

          <Field label={t('customLabel')} htmlFor="referral-slug">
            <span style={{ display: 'flex', gap: 'var(--s2)', alignItems: 'center' }}>
              <Input
                id="referral-slug"
                placeholder={t('slugPlaceholder')}
                maxLength={30}
                value={slugInput}
                onChange={(e) => setSlugInput(e.target.value)}
              />
              <Button variant="bare" disabled={!canSave} onClick={() => setSlug.mutate(normalized)}>
                {setSlug.isPending ? tc('saving') : tc('save')}
              </Button>
            </span>
          </Field>
          {status && (
            <p className={status.cls} style={{ marginTop: 'var(--s1)' }}>
              {status.text}
            </p>
          )}
          <ErrorNote error={setSlug.error} fallback={t('slugSaveFailed')} style={{ marginTop: 'var(--s1)' }} />
        </DialogBody>
        <DialogFooter>
          <Button variant="solid" onClick={onClose}>
            {tc('close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Проверить типы**

```bash
npx tsc --noEmit -p tsconfig.json
```

Ожидаемо: без ошибок.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/referrals/ui/ReferralDialog.tsx
git commit -m "feat(referrals): редактируемый слаг в диалоге приглашения

Поле «Своё имя для ссылки» с живой проверкой доступности (debounce
300мс), кнопка «Сохранить» активна только когда слаг валиден, свободен
и отличается от текущего. Ссылка выше обновляется сама.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 8: Финальная проверка

**Files:** нет новых изменений — только верификация.

- [ ] **Step 1: Полный набор backend-тестов**

```bash
cd backend && npx jest
```

Ожидаемо: PASS, весь набор, без регрессий.

- [ ] **Step 2: Полный набор frontend-тестов**

```bash
cd frontend && npx vitest run
```

Ожидаемо: PASS, весь набор.

- [ ] **Step 3: Полная сборка фронтенда**

Изменение трогает несколько слоёв и общий диалог — по правилам сборки (CLAUDE.md
пользователя) это крупное изменение, билд запускается не спрашивая:

```bash
npx next build
```

Ожидаемо: без ошибок.

- [ ] **Step 4: Ручная проверка**

1. Поднять стек (`start.bat` или `docker compose up`).
2. Войти пользователем A, открыть меню профиля → «Пригласить друга».
3. В поле «Своё имя для ссылки» ввести короткое имя (`ab`) — статус должен показать
   формат-подсказку, кнопка «Сохранить» недоступна.
4. Ввести валидное свободное имя (например, `sergey`) — после паузы в статусе должно
   появиться «свободно», кнопка активируется.
5. Сохранить. Ссылка в блоке выше должна тут же поменяться на
   `.../login?mode=register&ref=sergey`.
6. Войти пользователем B, открыть тот же диалог, ввести `sergey` (или `Sergey` — с большой
   буквы) — статус должен показать «занято».
7. Открыть `/login?mode=register&ref=sergey` в приватном окне, зарегистрировать нового
   пользователя C — регистрация должна пройти успешно и закрепить его за пользователем A
   (проверить через счётчик «Зарегистрировалось» — должен вырасти на 1).
8. Пользователем A сменить слаг на другой (например, `sergey2`) и сохранить. После этого
   пользователем B снова открыть диалог и ввести `sergey` — статус должен показать
   «свободно» (старое имя освободилось).
