# Профиль: настройки аккаунта, позиции первыми, заглушки — план

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** окно «Настройки профиля» (картинка, имя, пароль, показ сделок) по шестерёнке на своём
профиле; «Открытые позиции» — первая вкладка; заглушки профиля и позиций.

**Architecture:** сервер — `PATCH /api/profile/name`, `POST /auth/password` (новая пара
токенов, прочие refresh-токены удаляются), предел картинки 64 КБ, демо-аккаунт заперт.
Фронт — `AuthContext.changePassword/setName`, `useSetName`, `toAvatarBlob`,
`ProfileSettings`, `ProfileSkeleton`, `isLoading` у `PositionsTable`.

**Tech Stack:** NestJS + Prisma + bcryptjs (jest), Next.js + react-query (vitest).

**Спека:** `docs/superpowers/specs/2026-10-16-profile-settings-design.md`.

## Global Constraints

- Неверный текущий пароль — 400 `PASSWORD_WRONG`, никогда не 401.
- `demo@example.com` — 403 `ACCOUNT_DEMO_LOCKED` на имя, пароль, картинку.
- Картинка — 256×256 WebP с клиента, сервер — не больше 64 КБ.
- Имя — trim, 2–40. Пароль — не короче 8.

## Контрольные точки ревью

- **После Task 1** (класс A — авторизация): Sonnet по диффу backend.
- **После Task 3** (класс B — стык и общий виджет): Sonnet по фронту.

### Task 1: Сервер — имя, пароль, предел картинки, демо

**Files:** Create `backend/src/auth/demo-account.ts`, `backend/src/auth/dto/change-password.dto.ts`,
`backend/src/profile/dto/name.dto.ts`; Modify `auth.service.ts`, `auth.controller.ts`,
`auth.service.spec.ts`, `profile/avatar.ts`, `profile.service.ts`, `profile.controller.ts`,
`profile.service.spec.ts`.

- [ ] Тесты: `ProfileService.setName` (сохраняет обрезанное имя; демо — 403),
  `setAvatar`/`removeAvatar` демо — 403, предел 64 КБ; `AuthService.changePassword`
  (неверный текущий — 400 `PASSWORD_WRONG`; тот же — 400 `PASSWORD_SAME`; демо — 403;
  успех — `user.update` с новым хэшем и `refreshToken.deleteMany({ userId })` в одной
  транзакции, ответ с новой парой).
- [ ] Код: `isDemoEmail`, `demoLocked()`; `changePassword`; `setName`; маршруты.
- [ ] `npx jest src/auth src/profile`, `tsc`.

### Task 2: Фронт — данные и авторизация

**Files:** `features/auth/model/AuthContext.tsx`; `entities/profile/api/hooks.ts`, `index.ts`;
`views/profile/lib/avatar-image.ts` (+ тест); `widgets/positions-table/PositionsTable.tsx`;
i18n `profile.settings*`, `errors.PASSWORD_WRONG|PASSWORD_SAME|ACCOUNT_DEMO_LOCKED`, `AVATAR_TOO_LARGE`.

- [ ] `avatarPlan(w, h)` → квадрат по центру (`sx, sy, side`), тест; `toAvatarBlob(file)`.
- [ ] `changePassword`, `setName` в контексте; `useSetName`.
- [ ] `PositionsTable`: `isLoading?`, `skeletonRows?` → `LedgerTable`.

### Task 3: Фронт — окно, вкладки, заглушки

**Files:** `views/profile/components/ProfileSettings.tsx`, `ProfileSkeleton.tsx`, `ProfileTabs.tsx`,
`PositionsPane.tsx`, `Identity.tsx`, `Page.tsx`; `app/globals.css`.

- [ ] Позиции первыми и открыты по умолчанию.
- [ ] `ProfileSkeleton` вместо пустой колонки; `PositionsPane` — заглушки строк.
- [ ] Шестерёнка справа на уровне имени (своему), окно из четырёх разделов.
- [ ] `tsc`, eslint, vitest, `next build`; глазами в браузере; ревью; CLAUDE.md.
