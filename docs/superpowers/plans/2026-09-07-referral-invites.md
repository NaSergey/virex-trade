# Инвайты: персональная реферальная ссылка — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** У каждого пользователя есть постоянная персональная ссылка; переход по ней и
последующая регистрация закрепляют нового пользователя за пригласившим, а пригласивший
видит в меню профиля счётчик «всего зарегистрировалось / из них подключили ключ».

**Architecture:** Одно новое поле `invitedById` на `User` (self-relation, без отдельной
таблицы кодов). Ссылка — `<домен>/login?mode=register&ref=<userId>`, `ref` читается на
странице входа и уходит в `POST /auth/register`. Новый бэкенд-модуль `referrals` отдаёт
`GET /api/referrals/me` со счётчиками. На фронте — новая фича `features/referrals` с
диалогом в меню профиля, по образцу уже существующей `features/donation`.

**Tech Stack:** NestJS + Prisma (backend), Next.js App Router + FSD (frontend), Jest
(backend-тесты, ручные стабы `PrismaService` — в проекте нет тестовой БД). Frontend-тестов
на UI/хуки в проекте сейчас нет ни для одной фичи — эта работа не заводит первую
изолированно, проверка идёт компиляцией и сборкой (см. Task 7).

## Global Constraints

- Весь пользовательский текст и комментарии в коде — на русском (код, имена файлов,
  импорты — как принято в проекте, латиницей). См. CLAUDE.md пользователя.
- FSD: новый экран/блок фронтенда — это `features/<name>/{api,ui}` + `index.ts`, не
  `widgets/` (виджет — только когда используется на 2+ страницах, что уже проверено
  грепом и здесь не так) и не сырая разметка вместо `shared/ui`.
- Prisma: миграций в проекте нет, схема применяется `npx prisma db push` (не
  `prisma migrate dev`). На Windows `prisma generate` (в т.ч. встроенный в `db push`)
  падает `EPERM`, если параллельно запущен `npm run start:dev` — эту команду держит DLL
  движка. Перед `db push` нужно либо убедиться, что backend не запущен локально, либо
  спросить пользователя, можно ли его временно остановить (не останавливать резидентный
  процесс без спроса).
- Backend-тесты новых сервисов — ручные стабы `PrismaService` (`{ user: { count: async
  (args) => ... } } as any`), как в `auth.service.spec.ts` и `notification-state.spec.ts`
  — в проекте нет интеграционных тестов поверх реальной БД.
- Коммиты — каждая задача заканчивается отдельным коммитом. Сообщение коммита
  заканчивается строкой:
  ```
  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  ```

---

## Task 1: Схема — поле `invitedById` на `User`

**Files:**
- Modify: `backend/prisma/schema.prisma`

**Interfaces:**
- Produces: поле `User.invitedById: string | null`, релейшены `User.invitedBy` и
  `User.invitedUsers` (Prisma relation name `"Referrals"`) — их читают Task 2 (запись
  при регистрации) и Task 3 (счётчик).

- [ ] **Step 1: Проверить, не запущен ли backend локально**

Backend в проекте по умолчанию гоняется на хосте (`start.bat` → `npm run start:dev`), не
только в Docker. Если он запущен (окно `virex-backend`, или `npm run start:dev` в
терминале), `prisma generate` на следующем шаге упадёт `EPERM: ... query_engine-windows.dll.node`
— движок Prisma держит открытым дочерний процесс nest watch.

Проверить командой:

```bash
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"CommandLine LIKE '%backend%start:dev%' OR CommandLine LIKE '%backend%main.js%'\" | Select-Object ProcessId, CommandLine"
```

Если что-то нашлось — **спросить пользователя**, можно ли временно остановить backend
на время этого шага (это может быть его рабочий терминал). Только после подтверждения
останавливать процесс. Если процессов нет — переходить к следующему шагу без вопросов.

- [ ] **Step 2: Добавить поле в схему**

В `backend/prisma/schema.prisma` найти модель `User` и вставить новый блок сразу после
`updatedAt DateTime @updatedAt` (перед комментарием `// DEPRECATED`):

```prisma
model User {
  id        String   @id @default(uuid())
  email     String   @unique
  password  String // bcrypt hash
  name      String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // Кто привёл этого пользователя — id из ссылки `/login?mode=register&ref=<id>`.
  // SetNull, а не Cascade: удаление аккаунта пригласившего не должно каскадом
  // утаскивать тех, кого он привёл, — они просто теряют ссылку на источник.
  invitedById  String?
  invitedBy    User?   @relation("Referrals", fields: [invitedById], references: [id], onDelete: SetNull)
  invitedUsers User[]  @relation("Referrals")

  // DEPRECATED — superseded by ExchangeConnection, kept only so
  ...
```

(Остальной текст модели не трогать — просто вставить блок между `updatedAt` и
`// DEPRECATED`.)

- [ ] **Step 3: Применить схему к базе**

Убедиться, что контейнер с базой поднят (`docker compose up -d --wait db` из корня
репозитория), затем в `backend/`:

```bash
npx prisma db push
```

Ожидаемо: `Your database is now in sync with your Prisma schema.` и следом успешный
`✔ Generated Prisma Client`. Если снова `EPERM` — значит какой-то процесс всё ещё держит
движок; повторить Step 1.

- [ ] **Step 4: Проверить, что типы клиента подхватили новое поле**

```bash
grep -n "invitedById" node_modules/@prisma/client/index.d.ts
```

Ожидаемо: находится хотя бы одна строка (поле встречается в типах `User`,
`UserWhereInput`, `UserCreateInput` и т.д.).

- [ ] **Step 5: Если backend останавливали — поднять обратно**

Если на Step 1 backend был остановлен с разрешения пользователя, поднять его тем же
способом, каким он был запущен (`start.bat` или `npm run start:dev` в `backend/`).

- [ ] **Step 6: Commit**

```bash
git add backend/prisma/schema.prisma
git commit -m "feat(referrals): поле invitedById на User

Кто привёл пользователя — id из ссылки /login?mode=register&ref=<id>.
Без отдельной таблицы кодов: ссылка строится из уже существующего userId.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: Регистрация закрепляет пригласившего

**Files:**
- Modify: `backend/src/auth/dto/register.dto.ts`
- Modify: `backend/src/auth/auth.service.ts`
- Test: `backend/src/auth/auth.service.spec.ts`

**Interfaces:**
- Consumes: `AuthService` constructor `(prisma: PrismaService, jwt: JwtService, tags:
  TagsService)` — не меняется, только состав `register()`.
- Produces: `RegisterDto.ref?: string`; `AuthService.register(dto)` при валидном `ref`
  пишет `invitedById` в создаваемого пользователя.

- [ ] **Step 1: Написать падающие тесты**

Добавить в конец `backend/src/auth/auth.service.spec.ts` (файл уже содержит
`describe('AuthService.login', ...)` — этот блок идёт следом, ничего в существующем не
менять):

```ts
describe('AuthService.register', () => {
  const baseDto = { email: 'new@example.com', password: 'password123', name: 'New User' };

  // Ручной стаб PrismaService: register() трогает user.findUnique (дважды — по
  // email и по ref), user.create и refreshToken.create. jwt и tags — заглушки,
  // как в блоке AuthService.login выше.
  function makeService(existingUsers: Record<string, { id: string }>) {
    const created: any[] = [];
    const prisma = {
      user: {
        findUnique: async ({ where }: { where: { email?: string; id?: string } }) => {
          if (where.email) return null; // почта всегда свободна в этих тестах
          if (where.id) return existingUsers[where.id] ?? null;
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

  it('валидный ref закрепляет пригласившего', async () => {
    const { service, created } = makeService({ 'inviter-1': { id: 'inviter-1' } });

    await service.register({ ...baseDto, ref: 'inviter-1' } as any);

    expect(created[0].invitedById).toBe('inviter-1');
  });

  it('несуществующий ref не падает и не закрепляет пригласившего', async () => {
    const { service, created } = makeService({});

    await service.register({ ...baseDto, ref: 'ghost' } as any);

    expect(created[0].invitedById).toBeNull();
  });

  it('без ref не закрепляет пригласившего', async () => {
    const { service, created } = makeService({});

    await service.register(baseDto as any);

    expect(created[0].invitedById).toBeNull();
  });
});
```

- [ ] **Step 2: Запустить тесты, убедиться, что все три падают**

```bash
cd backend && npx jest src/auth/auth.service.spec.ts -t "AuthService.register"
```

Ожидаемо: FAIL на всех трёх — `register()` пока не читает `dto.ref` и не пишет
`invitedById`, поле в `created[0]` отсутствует (`undefined`), а не `'inviter-1'`/`null`.

- [ ] **Step 3: Добавить поле `ref` в DTO**

В `backend/src/auth/dto/register.dto.ts` добавить импорт `IsOptional` и новое поле в
конец класса:

```ts
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
```

```ts
  @MinLength(2, { message: 'Имя должно быть не короче 2 символов' })
  @MaxLength(40, { message: 'Имя должно быть не длиннее 40 символов' })
  name: string;

  /**
   * Id пригласившего — из ссылки `/login?mode=register&ref=<userId>`.
   * Необязателен и не проверяется на формат: неизвестный или мусорный ref — то
   * же самое, что его отсутствие (см. AuthService.register), а не повод
   * отклонить регистрацию.
   */
  @IsOptional()
  @IsString()
  ref?: string;
}
```

- [ ] **Step 4: Реализовать закрепление в `AuthService`**

В `backend/src/auth/auth.service.ts` заменить начало `register()`:

```ts
  async register(dto: RegisterDto): Promise<AuthResult> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException({
        message: 'Пользователь с таким email уже существует',
        code: 'USER_EXISTS',
      });
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: passwordHash,
        // DTO уже обрезал пробелы и потребовал непустое значение. Колонка
        // остаётся nullable ради тех, кто регистрировался, когда имя было
        // необязательным, — их записи трогать незачем.
        name: dto.name,
      },
    });
```

на:

```ts
  async register(dto: RegisterDto): Promise<AuthResult> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException({
        message: 'Пользователь с таким email уже существует',
        code: 'USER_EXISTS',
      });
    }

    // Ссылка вида /login?mode=register&ref=<userId>: ref — id пригласившего.
    // Неизвестный или мусорный ref — то же самое, что его отсутствие, а не
    // повод отклонить регистрацию (см. RegisterDto.ref).
    const invitedById = dto.ref ? await this.resolveInviter(dto.ref) : null;

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: passwordHash,
        // DTO уже обрезал пробелы и потребовал непустое значение. Колонка
        // остаётся nullable ради тех, кто регистрировался, когда имя было
        // необязательным, — их записи трогать незачем.
        name: dto.name,
        invitedById,
      },
    });
```

И добавить приватный метод рядом с `hashToken` (перед `private toPublicUser`):

```ts
  /** id пригласившего, если такой пользователь существует, иначе null. */
  private async resolveInviter(ref: string): Promise<string | null> {
    const inviter = await this.prisma.user.findUnique({ where: { id: ref } });
    return inviter?.id ?? null;
  }
```

- [ ] **Step 5: Запустить тесты, убедиться, что всё проходит**

```bash
npx jest src/auth/auth.service.spec.ts
```

Ожидаемо: PASS, все тесты (и старый `AuthService.login`, и новый `AuthService.register`).

- [ ] **Step 6: Commit**

```bash
git add backend/src/auth/dto/register.dto.ts backend/src/auth/auth.service.ts backend/src/auth/auth.service.spec.ts
git commit -m "feat(referrals): регистрация закрепляет пригласившего по ref

RegisterDto.ref — необязательный id из ссылки /login?mode=register&ref=.
Битый или чужой ref не валит регистрацию — читается как его отсутствие.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: Модуль `referrals` — счётчик приглашённых

**Files:**
- Create: `backend/src/referrals/referrals.service.ts`
- Create: `backend/src/referrals/referrals.service.spec.ts`
- Create: `backend/src/referrals/referrals.controller.ts`
- Create: `backend/src/referrals/referrals.module.ts`
- Modify: `backend/src/app.module.ts`

**Interfaces:**
- Consumes: `PrismaService` (глобальный модуль, не импортируется явно — см.
  `donations.module.ts`), `JwtAuthGuard` из `../auth/guards/jwt-auth.guard`,
  `CurrentUser` из `../auth/decorators/current-user.decorator`.
- Produces: `ReferralsService.getStats(userId: string): Promise<{ total: number; withKey:
  number }>`; эндпоинт `GET /api/referrals/me` (авторизованный) с тем же телом ответа —
  их использует Task 6 (`features/referrals/api/hooks.ts`).

- [ ] **Step 1: Написать падающий тест сервиса**

Создать `backend/src/referrals/referrals.service.spec.ts`:

```ts
import { ReferralsService } from './referrals.service';

describe('ReferralsService.getStats', () => {
  it('считает total и withKey раздельно', async () => {
    const calls: Array<{ where: Record<string, unknown> }> = [];
    const prisma = {
      user: {
        count: async (args: { where: Record<string, unknown> }) => {
          calls.push(args);
          return 'exchangeConnections' in args.where ? 3 : 5;
        },
      },
    } as any;

    const stats = await new ReferralsService(prisma).getStats('inviter-1');

    expect(stats).toEqual({ total: 5, withKey: 3 });
    expect(calls[0].where).toEqual({ invitedById: 'inviter-1' });
    expect(calls[1].where).toEqual({
      invitedById: 'inviter-1',
      exchangeConnections: { some: {} },
    });
  });

  it('без приглашённых отдаёт нули, а не падает', async () => {
    const prisma = { user: { count: async () => 0 } } as any;

    const stats = await new ReferralsService(prisma).getStats('lonely');

    expect(stats).toEqual({ total: 0, withKey: 0 });
  });
});
```

- [ ] **Step 2: Запустить тест, убедиться, что падает**

```bash
cd backend && npx jest src/referrals/referrals.service.spec.ts
```

Ожидаемо: FAIL — `Cannot find module './referrals.service'` (файла ещё нет).

- [ ] **Step 3: Реализовать сервис**

Создать `backend/src/referrals/referrals.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface ReferralStats {
  total: number;
  withKey: number;
}

/**
 * Статистика по приглашённым: сколько зарегистрировалось по ссылке
 * пользователя и сколько из них сейчас держат подключённый ключ биржи.
 *
 * «Сейчас», а не «когда-либо»: отдельного флага «был подключён» нет — он
 * разошёлся бы с реальным состоянием в момент отключения ключа
 * (`settings.controller` такой путь уже поддерживает), и число обманывало бы
 * пригласившего.
 */
@Injectable()
export class ReferralsService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats(userId: string): Promise<ReferralStats> {
    const [total, withKey] = await Promise.all([
      this.prisma.user.count({ where: { invitedById: userId } }),
      this.prisma.user.count({
        where: { invitedById: userId, exchangeConnections: { some: {} } },
      }),
    ]);
    return { total, withKey };
  }
}
```

- [ ] **Step 4: Запустить тест, убедиться, что проходит**

```bash
npx jest src/referrals/referrals.service.spec.ts
```

Ожидаемо: PASS, оба теста.

- [ ] **Step 5: Контроллер и модуль**

Создать `backend/src/referrals/referrals.controller.ts`:

```ts
import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ReferralsService, ReferralStats } from './referrals.service';

@Controller('api/referrals')
export class ReferralsController {
  constructor(private readonly referrals: ReferralsService) {}

  /**
   * Ссылку строит фронт из своего userId (уже есть в `/auth/me`) — здесь
   * только счётчик, создавать или включать пользователю нечего.
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser('userId') userId: string): Promise<ReferralStats> {
    return this.referrals.getStats(userId);
  }
}
```

Создать `backend/src/referrals/referrals.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { ReferralsController } from './referrals.controller';
import { ReferralsService } from './referrals.service';

/** PrismaModule глобальный, поэтому здесь не импортируется. */
@Module({
  controllers: [ReferralsController],
  providers: [ReferralsService],
})
export class ReferralsModule {}
```

- [ ] **Step 6: Подключить модуль в `AppModule`**

В `backend/src/app.module.ts` добавить импорт рядом с `DonationsModule`:

```ts
import { DonationsModule } from './donations/donations.module';
import { ReferralsModule } from './referrals/referrals.module';
```

И в массив `imports`, сразу после `DonationsModule`:

```ts
    AdminModule,
    DonationsModule,
    ReferralsModule,
  ],
```

- [ ] **Step 7: Прогнать весь набор backend-тестов**

```bash
npx jest
```

Ожидаемо: PASS, без регрессий в остальных модулях.

- [ ] **Step 8: Commit**

```bash
git add backend/src/referrals backend/src/app.module.ts
git commit -m "feat(referrals): модуль referrals — GET /api/referrals/me

Счётчик приглашённых: всего зарегистрировалось и сколько из них сейчас
держат подключённый ключ биржи (живое состояние, не флаг «когда-либо»).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 4: Промоушен `CopyValue` в `shared/ui`

Компонент «значение + кнопка скопировать» существует только внутри `features/donation`
(`CopyValue.tsx`, классы `.don-copy`/`.don-copy-v`, тексты из namespace `support`). Task 6
использует тот же приём для ссылки. Фичи в этом проекте не импортируют друг у друга
внутренности (см. CLAUDE.md: `widgets/` — только для реально переиспользуемых блоков,
проверено грепом) — значит компонент, нужный двум фичам, переезжает в `shared/ui`, а не
дублируется и не импортируется напрямую из `donation`.

**Files:**
- Create: `frontend/src/shared/ui/CopyValue.tsx`
- Delete: `frontend/src/features/donation/ui/CopyValue.tsx`
- Modify: `frontend/src/features/donation/ui/PaymentStep.tsx`
- Modify: `frontend/src/app/globals.css`

**Interfaces:**
- Produces: `CopyValue({ value: string; ariaLabel?: string; labels: { copy: string;
  copied: string; copyFailed: string } })` из `@/shared/ui/CopyValue` — использует Task 6
  (`ReferralDialog`).

- [ ] **Step 1: Создать обобщённый компонент**

Создать `frontend/src/shared/ui/CopyValue.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/shared/ui/Button';

/**
 * Значение с кнопкой «скопировать» рядом, а не только через буфер обмена:
 * `navigator.clipboard` есть не везде (старый браузер, страница не по HTTPS),
 * и тогда кнопка честно говорит, что не вышло, а значение всё равно можно
 * выделить мышью — оно тут же, текстом.
 *
 * Тексты кнопки приходят пропсом, а не берутся из фиксированного namespace:
 * компонент общий для доната (сумма, адрес) и приглашений (ссылка), а тексты
 * у каждой фичи свои.
 */
export function CopyValue({
  value,
  /** Что именно копируется — на кнопку, для скринридера. */
  ariaLabel,
  labels,
}: {
  value: string;
  ariaLabel?: string;
  labels: { copy: string; copied: string; copyFailed: string };
}) {
  const [state, setState] = useState<'idle' | 'done' | 'failed'>('idle');

  useEffect(() => {
    if (state === 'idle') return;
    const timer = setTimeout(() => setState('idle'), 2000);
    return () => clearTimeout(timer);
  }, [state]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setState('done');
    } catch {
      setState('failed');
    }
  };

  return (
    <span className="copy-row">
      <span className="copy-row-v">{value}</span>
      <Button variant="bare" onClick={copy} aria-label={ariaLabel}>
        {state === 'done' ? labels.copied : state === 'failed' ? labels.copyFailed : labels.copy}
      </Button>
    </span>
  );
}
```

- [ ] **Step 2: Удалить старый файл фичи**

```bash
cd frontend && git rm src/features/donation/ui/CopyValue.tsx
```

- [ ] **Step 3: Переключить `PaymentStep` на общий компонент**

В `frontend/src/features/donation/ui/PaymentStep.tsx` заменить импорт:

```ts
import { CopyValue } from './CopyValue';
```

на:

```ts
import { CopyValue } from '@/shared/ui/CopyValue';
```

И оба использования:

```tsx
      <KeyValue label={t('amountLabel')}>
        <CopyValue value={live.expectedAmount} label={t('amountLabel')} />
      </KeyValue>
      <p className="dbt don-exact">{t('amountExact')}</p>

      <KeyValue label={t('addressLabel')}>
        <CopyValue value={live.receivingAddress} label={t('addressLabel')} />
      </KeyValue>
```

на:

```tsx
      <KeyValue label={t('amountLabel')}>
        <CopyValue
          value={live.expectedAmount}
          ariaLabel={t('amountLabel')}
          labels={{ copy: t('copy'), copied: t('copied'), copyFailed: t('copyFailed') }}
        />
      </KeyValue>
      <p className="dbt don-exact">{t('amountExact')}</p>

      <KeyValue label={t('addressLabel')}>
        <CopyValue
          value={live.receivingAddress}
          ariaLabel={t('addressLabel')}
          labels={{ copy: t('copy'), copied: t('copied'), copyFailed: t('copyFailed') }}
        />
      </KeyValue>
```

- [ ] **Step 4: Переименовать CSS-классы и перенести их в общую секцию**

В `frontend/src/app/globals.css` найти блок в секции `ДОНАТЫ`:

```css
  /* Значение и «скопировать» стоят одной строкой, значение — моноширинным:
     адрес и сумму человек сверяет посимвольно, и пропорциональный шрифт
     здесь мешает. Перенос по любому символу — адрес в 34 знака иначе
     распирает колонку. */
  .don-copy {
    display: inline-flex;
    align-items: baseline;
    gap: var(--s2);
    justify-content: flex-end;
    flex-wrap: wrap;
  }
  .don-copy-v {
    font-family: var(--font-mono);
    word-break: break-all;
  }
```

Удалить его из секции `ДОНАТЫ` и добавить в конец секции `ОБЩЕЕ` (после блока `.asym >
.set { max-width: none; }`, перед следующим `/* ═══ ... ═══ */`), с переименованными
классами:

```css
  /* Значение и «скопировать» стоят одной строкой, значение — моноширинным:
     строку вроде адреса или ссылки человек сверяет посимвольно, и
     пропорциональный шрифт здесь мешает. Перенос по любому символу — длинная
     строка иначе распирает колонку. Используется в донате и приглашениях. */
  .copy-row {
    display: inline-flex;
    align-items: baseline;
    gap: var(--s2);
    justify-content: flex-end;
    flex-wrap: wrap;
  }
  .copy-row-v {
    font-family: var(--font-mono);
    word-break: break-all;
  }
```

- [ ] **Step 5: Обновить тексты доната под новую форму пропсов**

В `frontend/src/shared/i18n/messages/ru.json` и `en.json` в namespace `support` ключи
`copy`/`copied`/`copyFailed` уже есть (используются в `PaymentStep` через `t('copy')` и
т.п.) — их менять не нужно, они просто теперь передаются явно, а не читаются компонентом
самостоятельно.

- [ ] **Step 6: Проверить типы**

```bash
npx tsc --noEmit -p tsconfig.json
```

Ожидаемо: без ошибок.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/shared/ui/CopyValue.tsx frontend/src/features/donation/ui/PaymentStep.tsx frontend/src/app/globals.css
git commit -m "refactor(donation): CopyValue переезжает в shared/ui

Приглашениям (Task 6) нужен тот же приём «значение + скопировать». Фичи
не импортируют друг у друга внутренности — общий компонент едет в
shared/ui, тексты кнопки теперь пропсом, а не фиксированным namespace.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 5: Фронтенд — `ref` доезжает от ссылки до регистрации

**Files:**
- Modify: `frontend/src/features/auth/model/AuthContext.tsx`
- Modify: `frontend/src/app/login/page.tsx`

**Interfaces:**
- Consumes: ничего нового извне.
- Produces: `useAuth().register(email, password, name?, ref?)` — сигнатура меняется,
  единственный вызывающий (`app/login/page.tsx`) обновляется тем же шагом.

- [ ] **Step 1: Добавить параметр `ref` в `register()`**

В `frontend/src/features/auth/model/AuthContext.tsx` заменить:

```ts
  const register = useCallback(
    async (email: string, password: string, name?: string) => {
      const res = await fetch(`${API_BASE_URL}/auth/register`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name }),
      });
      await applyAuthResponse(res);
    },
    [],
  );
```

на:

```ts
  const register = useCallback(
    async (email: string, password: string, name?: string, ref?: string) => {
      const res = await fetch(`${API_BASE_URL}/auth/register`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name, ref }),
      });
      await applyAuthResponse(res);
    },
    [],
  );
```

И в интерфейсе `AuthContextValue` чуть выше:

```ts
  register: (email: string, password: string, name?: string) => Promise<void>;
```

на:

```ts
  register: (email: string, password: string, name?: string, ref?: string) => Promise<void>;
```

- [ ] **Step 2: Прокинуть `ref` из query на странице входа**

В `frontend/src/app/login/page.tsx` добавить чтение параметра рядом с `nextParam`:

```ts
  const nextParam = params.get('next');
  const next = nextParam && NEXT_PATH.test(nextParam) ? nextParam : '/overview';
```

добавить после этого блока:

```ts
  /*
   * Кто пригласил: id из ссылки `/login?mode=register&ref=<userId>`
   * (см. features/referrals). Читается один раз при заходе на страницу и
   * передаётся в register() при отправке формы — сам параметр в адресной
   * строке переживает переключение mode (setMode — локальный стейт, не
   * router.push) и перезагрузку страницы.
   */
  const ref = params.get('ref') ?? undefined;
```

И заменить вызов регистрации:

```ts
      if (mode === 'login') await login(email, password);
      else await register(email, password, name || undefined);
```

на:

```ts
      if (mode === 'login') await login(email, password);
      else await register(email, password, name || undefined, ref);
```

- [ ] **Step 3: Проверить типы**

```bash
cd frontend && npx tsc --noEmit -p tsconfig.json
```

Ожидаемо: без ошибок.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/auth/model/AuthContext.tsx frontend/src/app/login/page.tsx
git commit -m "feat(referrals): ref из ссылки доезжает до регистрации

register() принимает необязательный ref, страница входа читает его из
query-параметра ссылки /login?mode=register&ref=<userId>.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 6: Фронтенд — фича `features/referrals`

**Files:**
- Create: `frontend/src/features/referrals/api/hooks.ts`
- Create: `frontend/src/features/referrals/ui/ReferralDialog.tsx`
- Create: `frontend/src/features/referrals/index.ts`
- Modify: `frontend/src/shared/i18n/messages/ru.json`
- Modify: `frontend/src/shared/i18n/messages/en.json`

**Interfaces:**
- Consumes: `CopyValue` из `@/shared/ui/CopyValue` (Task 4), `Dialog`/`DialogBody`/
  `DialogContent`/`DialogFooter`/`DialogHeader` из `@/shared/ui/dialog`, `KeyValue` из
  `@/shared/ui/Lookup`, `Button` из `@/shared/ui/Button`, `apiJson` из
  `@/shared/api/http`.
- Produces: `ReferralDialog({ userId: string; open: boolean; onClose: () => void })` из
  `@/features/referrals` — использует Task 7 (`TopNav`).

- [ ] **Step 1: Хук счётчика**

Создать `frontend/src/features/referrals/api/hooks.ts`:

```ts
'use client';

import { useQuery } from '@tanstack/react-query';
import { apiJson } from '@/shared/api/http';

export interface ReferralStats {
  total: number;
  withKey: number;
}

/**
 * Счётчик приглашённых. Число меняется редко — не в реальном времени, как
 * статус доната, — поэтому без опроса, только при открытии окна.
 */
export const useReferralStats = () =>
  useQuery({
    queryKey: ['referralStats'],
    queryFn: () => apiJson<ReferralStats>('/api/referrals/me'),
    staleTime: 60_000,
  });
```

- [ ] **Step 2: Строки интерфейса**

В `frontend/src/shared/i18n/messages/ru.json` добавить ключ в существующий блок `"nav"`
(после `"support": "Поддержать разработчика"`):

```json
    "support": "Поддержать разработчика",
    "referrals": "Пригласить друга"
```

И новый блок верхнего уровня `"referrals"` — вставить сразу после закрывающей `}` блока
`"support"` (перед `"admin": {`):

```json
  "referrals": {
    "title": "Пригласить друга",
    "lede": "Постоянная ссылка — поделитесь ей, и новый аккаунт закрепится за вами.",
    "linkLabel": "Ссылка",
    "totalLabel": "Зарегистрировалось",
    "withKeyLabel": "Подключили ключ",
    "copy": "скопировать",
    "copied": "скопировано",
    "copyFailed": "не вышло"
  },
```

В `frontend/src/shared/i18n/messages/en.json` — то же самое рядом с соответствующими
местами (`"support": "Support the developer"` в блоке `"nav"`, блок `"support": {` перед
`"admin": {`):

```json
    "support": "Support the developer",
    "referrals": "Invite a friend"
```

```json
  "referrals": {
    "title": "Invite a friend",
    "lede": "A permanent link — share it, and the new account will be linked to you.",
    "linkLabel": "Link",
    "totalLabel": "Registered",
    "withKeyLabel": "Connected a key",
    "copy": "copy",
    "copied": "copied",
    "copyFailed": "failed"
  },
```

- [ ] **Step 3: Диалог**

Создать `frontend/src/features/referrals/ui/ReferralDialog.tsx`:

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/shared/ui/Button';
import { CopyValue } from '@/shared/ui/CopyValue';
import { KeyValue } from '@/shared/ui/Lookup';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from '@/shared/ui/dialog';
import { useReferralStats } from '../api/hooks';

/**
 * «Пригласить друга» — постоянная персональная ссылка, без второго шага, в
 * отличие от доната: тут нечего ждать в реальном времени. Ссылка строится на
 * фронте из своего userId (уже есть в `/auth/me`) — отдельный «код» бэкенду
 * создавать незачем, см. дизайн.
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

  const link =
    open && typeof window !== 'undefined'
      ? `${window.location.origin}/login?mode=register&ref=${userId}`
      : '';

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader title={t('title')} subtitle={t('lede')} />
        <DialogBody>
          <KeyValue label={t('linkLabel')}>
            <CopyValue
              value={link}
              ariaLabel={t('linkLabel')}
              labels={{ copy: t('copy'), copied: t('copied'), copyFailed: t('copyFailed') }}
            />
          </KeyValue>
          <KeyValue label={t('totalLabel')}>{stats?.total ?? '—'}</KeyValue>
          <KeyValue label={t('withKeyLabel')}>{stats?.withKey ?? '—'}</KeyValue>
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

- [ ] **Step 4: Публичный экспорт фичи**

Создать `frontend/src/features/referrals/index.ts`:

```ts
export { ReferralDialog } from './ui/ReferralDialog';
```

- [ ] **Step 5: Проверить типы**

```bash
cd frontend && npx tsc --noEmit -p tsconfig.json
```

Ожидаемо: без ошибок.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/referrals frontend/src/shared/i18n/messages/ru.json frontend/src/shared/i18n/messages/en.json
git commit -m "feat(referrals): диалог «Пригласить друга»

Постоянная ссылка (CopyValue) + счётчик «зарегистрировалось / подключили
ключ» из GET /api/referrals/me. Без второго шага — тут нечего ждать.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 7: Пункт в меню профиля + финальная проверка

**Files:**
- Modify: `frontend/src/widgets/top-nav/TopNav.tsx`

**Interfaces:**
- Consumes: `ReferralDialog` из `@/features/referrals` (Task 6).

- [ ] **Step 1: Импорт и состояние**

В `frontend/src/widgets/top-nav/TopNav.tsx` добавить импорт рядом с `DonateDialog`:

```ts
import { DonateDialog } from '@/features/donation';
```

```ts
import { DonateDialog } from '@/features/donation';
import { ReferralDialog } from '@/features/referrals';
```

И состояние рядом с `donateOpen`:

```ts
  const [donateOpen, setDonateOpen] = useState(false);
```

```ts
  const [donateOpen, setDonateOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
```

- [ ] **Step 2: Пункт в меню**

В том же файле, внутри `<div className="acct-menu" role="menu">`, найти блок доната:

```tsx
              <KeyValue label={t('support')} control valueClassName="">
                <Button
                  variant="bare"
                  onClick={() => {
                    setMenuOpen(false);
                    setDonateOpen(true);
                  }}
                >
                  {tc('open')}
                </Button>
              </KeyValue>
              <Button
                variant="risk"
```

Вставить новый пункт между ними:

```tsx
              <KeyValue label={t('support')} control valueClassName="">
                <Button
                  variant="bare"
                  onClick={() => {
                    setMenuOpen(false);
                    setDonateOpen(true);
                  }}
                >
                  {tc('open')}
                </Button>
              </KeyValue>
              {/* Тот же приём, что у доната: пункт открывает окно поверх
                  текущей страницы, а не уводит на отдельный адрес. */}
              <KeyValue label={t('referrals')} control valueClassName="">
                <Button
                  variant="bare"
                  onClick={() => {
                    setMenuOpen(false);
                    setInviteOpen(true);
                  }}
                >
                  {tc('open')}
                </Button>
              </KeyValue>
              <Button
                variant="risk"
```

- [ ] **Step 3: Смонтировать диалог**

Найти в конце файла:

```tsx
      {/* Окно живёт в шапке, а не в разделе: шапка есть на каждой странице
          продукта, и донат должен открываться поверх любой из них. */}
      <DonateDialog open={donateOpen} onClose={() => setDonateOpen(false)} />
    </header>
```

Заменить на:

```tsx
      {/* Окно живёт в шапке, а не в разделе: шапка есть на каждой странице
          продукта, и донат должен открываться поверх любой из них. */}
      <DonateDialog open={donateOpen} onClose={() => setDonateOpen(false)} />
      {user && (
        <ReferralDialog userId={user.id} open={inviteOpen} onClose={() => setInviteOpen(false)} />
      )}
    </header>
```

- [ ] **Step 4: Проверить типы**

```bash
cd frontend && npx tsc --noEmit -p tsconfig.json
```

Ожидаемо: без ошибок.

- [ ] **Step 5: Полная сборка**

Изменение трогает несколько слоёв (auth-контекст, страница входа, шапка, новая фича,
новый API) — по правилам сборки (CLAUDE.md пользователя) это крупное изменение, билд
запускается не спрашивая:

```bash
npx next build
```

Ожидаемо: сборка проходит без ошибок. `src/pages/` не создавался — маршрутов Pages Router
эта работа не заводит, но `next build`, а не только `tsc`, всё равно обязателен по
правилу проекта для изменений такого размера.

- [ ] **Step 6: Backend — финальный прогон тестов**

```bash
cd backend && npx jest
```

Ожидаемо: PASS, весь набор.

- [ ] **Step 7: Commit**

```bash
cd /path/to/repo/root
git add frontend/src/widgets/top-nav/TopNav.tsx
git commit -m "feat(referrals): пункт «Пригласить друга» в меню профиля

Рядом с донатом: та же пара KeyValue + кнопка, открывает ReferralDialog
поверх текущей страницы.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Ручная проверка (после Task 7)

Автоматических тестов на UI/хуки фронтенда в проекте нет ни для одной фичи (см. Global
Constraints) — эта работа не заводит их изолированно для одной новой фичи. Итоговый путь
стоит пройти руками:

1. Поднять стек (`start.bat` или `docker compose up`).
2. Войти существующим пользователем A, открыть меню профиля → «Пригласить друга»,
   скопировать ссылку. Убедиться, что счётчик показывает `0 / 0`.
3. В приватном окне браузера открыть скопированную ссылку — должна открыться форма
   регистрации (не входа). Зарегистрировать пользователя B.
4. Войти пользователем A, открыть диалог снова — счётчик должен показать `1 / 0`.
5. Пользователем B подключить ключ биржи (или, для быстрой проверки без реального ключа,
   через Prisma Studio `npx prisma studio` создать строку `ExchangeConnection` для B
   вручную и проверить, что счётчик не читает её как «подключено», если она относится к
   другому пользователю).
6. Открыть диалог пользователем A снова — счётчик должен показать `1 / 1`.
7. Зарегистрировать пользователя C по адресу `/login?mode=register&ref=не-существующий-id`
   — регистрация обязана пройти успешно, без закрепления за кем-либо.
