# Разделение на площадку, журнал и админку: план реализации

> **Для исполнителя:** выполнять гибридом (глобальный `CLAUDE.md`): код инлайн, тесты на каждой задаче, ревью свежим
> Sonnet в контрольных точках по риску. Шаги — чекбоксы (`- [ ]`).

**Цель:** `trade-play.com` — игровая площадка, `journal.trade-play.com` — журнал, `admin.*` без изменений; один код, один аккаунт, общий вход.

**Архитектура:** тот же Next и тот же backend; часть определяется по Host, как уже сделано у админки. Гейт `proxy.ts`
разводит адреса редиректами, шапка и обвязка читают часть из контекста. Сессия — кука `tp_session` на весь домен.

**Стек:** Next.js App Router, NestJS, Express `trust proxy`, cookie-parser, vitest, jest + supertest.

**Спека:** `docs/superpowers/specs/2026-11-03-split-play-journal-design.md`.

## Глобальные ограничения

- Адреса игр не меняются: `/games/poker`, приглашение `/games/trading?t=<id>`.
- Редиректы между частями — 307, не 308.
- Новой зависимости нет; столбцы БД не удаляются (`db push` без `--accept-data-loss` положил бы прод).
- Ссылка в чужую часть — `<a>` с путём, не `next/link`.
- Выкладки две: сначала только кука, через день всё остальное. До первой — ручная настройка DNS и nginx.
- Коммиты — только в свои ветки; `main` и push — только по слову владельца «заливай»: merge в `main` это деплой.
- Сообщения коммитов заканчиваются строкой `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Фронт проверять `npx next build`, а не только `tsc`. Команды запускать по одной: параллельные `cd` уже путали каталог.

## Разметка по риску и контрольные точки

| Задачи | Класс | Точка ревью |
|---|---|---|
| 1–2 кука | A | R1 |
| 3–4 часть и маршруты | A | R2 |
| 5–8 шапка, карточки, главные, поиск | B (6 — C) | R3 |
| 9–10 профиль | B | R4 |
| 11 документы | C | нет |
| 12 живой прогон | A | финальное ревью Opus: точек больше двух |

---

# Выкладка 1: общая кука (ветка `session-cookie`)

### Задача 1: кука `tp_session` на backend (A)

**Файлы:**
- Создать: `backend/src/auth/session-cookie.ts`, `backend/src/auth/session-cookie.spec.ts`
- Править: `backend/src/auth/auth.controller.ts`

**Интерфейсы:**
- Производит: `SESSION_COOKIE`, `LEGACY_COOKIE`, `sharedDomain(host, frontendUrl?)`, `readSessionToken(req)`,
  `writeSessionCookie(req, res, token, maxAgeMs)`, `clearSessionCookie(req, res)`.
- Потребляет: `trustProxy` из `backend/src/http-proxy.ts`, `useSecureCookie`.

- [ ] **Шаг 1: написать падающий тест**

```ts
// backend/src/auth/session-cookie.spec.ts
import { INestApplication } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import * as cookieParser from 'cookie-parser';
import * as request from 'supertest';
import { trustProxy } from '../http-proxy';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { sharedDomain } from './session-cookie';

const RESULT = { user: { id: 'u' }, accessToken: 'a', refreshToken: 'NEW' };
const service = {
  login: jest.fn(async () => RESULT),
  refresh: jest.fn(async () => RESULT),
  logout: jest.fn(async () => undefined),
  refreshCookieMaxAgeMs: 1000,
};

describe('кука сессии', () => {
  let app: INestApplication;
  const before = process.env.FRONTEND_URL;

  beforeEach(async () => {
    process.env.FRONTEND_URL = 'https://trade-play.com';
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 30 }])],
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: service }],
    }).compile();
    const nest = module.createNestApplication<NestExpressApplication>();
    trustProxy(nest);
    nest.use(cookieParser());
    await nest.init();
    app = nest;
  });
  afterEach(() => app.close());
  afterAll(() => {
    process.env.FRONTEND_URL = before;
  });

  const post = (path: string, host: string, cookie?: string) => {
    const r = request(app.getHttpServer()).post(path).set('X-Forwarded-Host', host);
    return cookie ? r.set('Cookie', cookie) : r;
  };
  const cookies = (res: { headers: Record<string, unknown> }) => (res.headers['set-cookie'] ?? []) as unknown as string[];
  const named = (res: { headers: Record<string, unknown> }, name: string) =>
    cookies(res).filter((c) => c.startsWith(`${name}=`));

  it.each(['trade-play.com', 'journal.trade-play.com'])('вход на %s — кука на весь домен', async (host) => {
    const res = await post('/auth/login', host).send({ email: 'a@b.c', password: 'x' });
    const [c] = named(res, 'tp_session');
    expect(c).toContain('tp_session=NEW');
    expect(c).toContain('Domain=trade-play.com');
    expect(c).toContain('HttpOnly');
    expect(c).toContain('Secure');
  });

  it('вход на admin.* — своя кука без Domain, общей нет', async () => {
    const res = await post('/auth/login', 'admin.trade-play.com').send({ email: 'a@b.c', password: 'x' });
    expect(named(res, 'tp_session')).toEqual([]);
    const live = named(res, 'refresh_token').find((c) => c.startsWith('refresh_token=NEW'));
    expect(live).toBeDefined();
    expect(live).not.toContain('Domain=');
  });

  it('чужой адрес — кука без Domain: копия сайта не пишет куку на наш домен', async () => {
    const res = await post('/auth/login', 'evil.example').send({ email: 'a@b.c', password: 'x' });
    expect(named(res, 'tp_session')[0]).not.toContain('Domain=');
  });

  it('старая кука переходит в новую без повторного входа и гасится', async () => {
    const res = await post('/auth/refresh', 'trade-play.com', 'refresh_token=OLD');
    expect(service.refresh).toHaveBeenCalledWith('OLD');
    expect(named(res, 'tp_session')[0]).toContain('tp_session=NEW');
    expect(named(res, 'refresh_token').some((c) => /Expires=Thu, 01 Jan 1970/.test(c) && /Path=\/(;|$)/.test(c))).toBe(true);
  });

  it('новая сильнее старой', async () => {
    await post('/auth/refresh', 'trade-play.com', 'refresh_token=OLD; tp_session=FRESH');
    expect(service.refresh).toHaveBeenCalledWith('FRESH');
  });

  it('админка читает только свою: общая кука доезжает, но не считается', async () => {
    await post('/auth/refresh', 'admin.trade-play.com', 'tp_session=FRESH; refresh_token=ADMIN');
    expect(service.refresh).toHaveBeenCalledWith('ADMIN');
  });

  it('выход гасит общую на весь домен и старую', async () => {
    const res = await post('/auth/logout', 'journal.trade-play.com', 'tp_session=FRESH');
    expect(service.logout).toHaveBeenCalledWith('FRESH');
    const c = named(res, 'tp_session')[0];
    expect(c).toContain('Domain=trade-play.com');
    expect(c).toMatch(/Expires=Thu, 01 Jan 1970/);
    expect(named(res, 'refresh_token').length).toBeGreaterThan(0);
  });
});

describe('sharedDomain', () => {
  const url = 'https://trade-play.com';
  it('свой домен и журнал — домен из FRONTEND_URL, регистр не важен', () => {
    expect(sharedDomain('trade-play.com', url)).toBe('trade-play.com');
    expect(sharedDomain('JOURNAL.trade-play.com', url)).toBe('trade-play.com');
  });
  it('админка, чужой адрес и пусто — без Domain', () => {
    expect(sharedDomain('admin.trade-play.com', url)).toBeUndefined();
    expect(sharedDomain('evil.example', url)).toBeUndefined();
    expect(sharedDomain(undefined, url)).toBeUndefined();
  });
  it('localhost, IP и кривой адрес — без Domain: браузер такую куку выбросил бы', () => {
    expect(sharedDomain('localhost', 'http://localhost:8090')).toBeUndefined();
    expect(sharedDomain('93.187.64.13', 'http://93.187.64.13')).toBeUndefined();
    expect(sharedDomain('trade-play.com', undefined)).toBeUndefined();
  });
});
```

- [ ] **Шаг 2: убедиться, что падает.** `cd backend && npx jest src/auth/session-cookie.spec.ts` — модуля нет.

- [ ] **Шаг 3: написать модуль**

```ts
// backend/src/auth/session-cookie.ts
import type { CookieOptions, Request, Response } from 'express';
import { useSecureCookie } from './cookie-security';

/**
 * Кука сессии — общая у площадки (`<домен>`) и журнала (`journal.<домен>`): вошёл
 * в одной части, значит, вошёл и в другой (спека 2026-11-03).
 *
 * Имя новое, а не прежнее с `Domain`: иначе на `admin.*` приходили бы две куки
 * `refresh_token`, и разбор брал бы первую. Вход админки свой и читает только свою.
 */
export const SESSION_COOKIE = 'tp_session';
export const LEGACY_COOKIE = 'refresh_token';

const COOKIE_PATH = '/';
// До смены пути кука ставилась на '/auth' и могла остаться в браузере рядом с новой:
// браузер отдавал её первой, и на /auth/refresh уезжал мёртвый токен. Сама она не
// исчезнет, удалить её можно только тем же путём.
const OLD_COOKIE_PATH = '/auth';

const isAdminHost = (host: string | undefined) => /^admin\./i.test(host ?? '');

/**
 * Домен для `Domain` куки. Берётся из `FRONTEND_URL`, а не из запроса: от этого адреса
 * уже зависят CORS и `Secure`, а чужой Host не должен решать, на какой домен писать.
 * `undefined` — кука остаётся на своём адресе: localhost и IP браузер с `Domain` не примет.
 */
export function sharedDomain(
  host: string | undefined,
  frontendUrl: string | undefined = process.env.FRONTEND_URL,
): string | undefined {
  let base: string;
  try {
    base = new URL(frontendUrl ?? '').hostname.toLowerCase();
  } catch {
    return undefined;
  }
  if (!base.includes('.') || /^[\d.]+$/.test(base)) return undefined;
  const asked = host?.toLowerCase();
  return asked === base || asked === `journal.${base}` ? base : undefined;
}

/** Токен запроса. Старая кука читается, чтобы прежние сессии не обрывались при переезде. */
export function readSessionToken(req: Request): string | undefined {
  const cookies = req.cookies as Record<string, string | undefined> | undefined;
  if (isAdminHost(req.hostname)) return cookies?.[LEGACY_COOKIE];
  return cookies?.[SESSION_COOKIE] ?? cookies?.[LEGACY_COOKIE];
}

export function writeSessionCookie(req: Request, res: Response, token: string, maxAgeMs: number): void {
  const options: CookieOptions = {
    httpOnly: true,
    sameSite: 'lax',
    secure: useSecureCookie(),
    path: COOKIE_PATH,
    maxAge: maxAgeMs,
  };
  res.clearCookie(LEGACY_COOKIE, { path: OLD_COOKIE_PATH });
  if (isAdminHost(req.hostname)) {
    res.cookie(LEGACY_COOKIE, token, options);
    return;
  }
  res.clearCookie(LEGACY_COOKIE, { path: COOKIE_PATH });
  res.cookie(SESSION_COOKIE, token, { ...options, domain: sharedDomain(req.hostname) });
}

export function clearSessionCookie(req: Request, res: Response): void {
  res.clearCookie(LEGACY_COOKIE, { path: COOKIE_PATH });
  res.clearCookie(LEGACY_COOKIE, { path: OLD_COOKIE_PATH });
  if (isAdminHost(req.hostname)) return;
  res.clearCookie(SESSION_COOKIE, { path: COOKIE_PATH, domain: sharedDomain(req.hostname) });
}
```

- [ ] **Шаг 4: перевести контроллер.** В `auth.controller.ts`: убрать константы `REFRESH_COOKIE`, `REFRESH_COOKIE_PATH`,
  `LEGACY_REFRESH_COOKIE_PATH` с комментариями и импорт `useSecureCookie`; добавить `@Req() req: Request` в `register`, `login`,
  `changePassword`; `refresh`: `this.authService.refresh(readSessionToken(req))`; `logout`:
  `await this.authService.logout(readSessionToken(req)); clearSessionCookie(req, res);`.

```ts
  private respondWithTokens(req: Request, res: Response, result: AuthResult) {
    writeSessionCookie(req, res, result.refreshToken, this.authService.refreshCookieMaxAgeMs);
    return { user: result.user, accessToken: result.accessToken };
  }
```

- [ ] **Шаг 5: убедиться, что проходит.** `npx jest src/auth` — зелёное.

- [ ] **Шаг 6: коммит** в ветку `session-cookie` вместе со спекой и этим планом (`feat(auth): общая кука сессии tp_session`).

### Задача 2: гейт знает обе куки (A)

**Файлы:** править `frontend/src/proxy.ts`, `frontend/src/proxy.test.ts`, `deploy/nginx-virex.conf.example`, `deploy/Caddyfile`, `docs/deploy/vps-domain.md`.

- [ ] **Шаг 1: тест**

```ts
describe('proxy — кука сессии', () => {
  const asked = (host: string, cookie: string) =>
    new NextRequest(new URL('/terminal', `http://${host}`), { headers: { host, cookie } });

  it('вне админки вошедшим считается и новая кука, и старая', () => {
    for (const cookie of ['tp_session=x', 'refresh_token=x']) {
      expect(locationOf(proxy(asked('trade-play.com', cookie)))).toBeNull();
    }
  });

  it('админка не считает вошедшим по общей куке: вход у неё свой', () => {
    const res = proxy(asked('admin.trade-play.com', 'tp_session=x'));
    expect(locationOf(res)).toMatch(/\/login\?next=/);
  });
});
```

- [ ] **Шаг 2: падает.** `cd frontend && npx vitest run src/proxy.test.ts` — на `tp_session` редирект.

- [ ] **Шаг 3: правка гейта**

```ts
const SESSION_COOKIE = 'tp_session';
const LEGACY_COOKIE = 'refresh_token';
// ...
const host = request.headers.get('host');
// Админка читает только свою куку: общая доезжает и туда, но вход у неё свой.
const authed = isAdminHost(host)
  ? request.cookies.has(LEGACY_COOKIE)
  : request.cookies.has(SESSION_COOKIE) || request.cookies.has(LEGACY_COOKIE);
```

- [ ] **Шаг 4: проходит.** `npx vitest run src/proxy.test.ts`.

- [ ] **Шаг 5: блоки адресов в конфигах.** В `deploy/nginx-virex.conf.example` дописать блок `journal.ВАШ.ДОМЕН` той же формы, что основной, и редирект
  `www` на корень; в `deploy/Caddyfile` — `journal.{$APP_DOMAIN}` с теми же `handle`, вынеся их в сниппет `(app)`, и `www.{$APP_DOMAIN}` c `redir`;
  в `docs/deploy/vps-domain.md` — раздел «Части продукта» с порядком: DNS без подстановочной записи → nginx → certbot и `listen 93.187.64.13:443 ssl`.

- [ ] **Шаг 6: коммит** (`feat(auth): гейт читает общую куку`).

**Контрольная точка R1 (A):** ревьюер Sonnet по диффу задач 1–2; фокус — подмена Host, сессия админки, переход со старой куки.

**Выкладка 1.** Условия: DNS без `*`, `www` и `journal` на нашем сервере, `https://journal.trade-play.com/robots.txt` отвечает 200.
После слова «заливай» — merge `session-cookie` в `main`, push. Проверка: `POST /auth/login` демо-входом отдаёт `tp_session; Domain=trade-play.com`.
Вторая выкладка — не раньше чем через день.

---

# Выкладка 2: разделение (ветка `split-play-journal` от `session-cookie`)

### Задача 3: часть продукта, домены и общий язык (A)

**Файлы:**
- Создать: `frontend/src/shared/lib/utils/app-part.ts`, `app-part.test.ts`, `frontend/src/shared/lib/utils/AppPartProvider.tsx`
- Править: `shared/config/site.ts`, `shared/i18n/locale-storage.ts` и его тест, `shared/lib/utils/admin-host.ts` и его тест, `app/layout.tsx`

**Интерфейсы:** `AppPart = 'play' | 'journal' | 'admin'`, `partOfHost(host)`, `HOME_OF`, `journalHost(host)`, `playHost(host)`,
`isJournalRoute(path)`, `isPlayRoute(path)`, `useAppPart()`, `AppPartProvider`, `JOURNAL_URL`, `localeCookieDomain(hostname)`.

- [ ] **Шаг 1: тест**

```ts
// app-part.test.ts
import { describe, expect, it } from 'vitest';
import { HOME_OF, isJournalRoute, isPlayRoute, journalHost, partOfHost, playHost } from './app-part';

describe('часть продукта', () => {
  it('определяется по Host', () => {
    expect(partOfHost('trade-play.com')).toBe('play');
    expect(partOfHost('journal.trade-play.com')).toBe('journal');
    expect(partOfHost('JOURNAL.localhost:8090')).toBe('journal');
    expect(partOfHost('admin.trade-play.com')).toBe('admin');
    expect(partOfHost(null)).toBe('play');
  });
  it('адреса соседней части, с портом и без www', () => {
    expect(journalHost('trade-play.com')).toBe('journal.trade-play.com');
    expect(journalHost('www.trade-play.com')).toBe('journal.trade-play.com');
    expect(journalHost('localhost:8090')).toBe('journal.localhost:8090');
    expect(playHost('journal.trade-play.com')).toBe('trade-play.com');
  });
  it('маршруты: граница по слэшу', () => {
    expect(isJournalRoute('/backtest/abc')).toBe(true);
    expect(isJournalRoute('/tagsx')).toBe(false);
    expect(isPlayRoute('/games/poker/1')).toBe(true);
    expect(isPlayRoute('/profile/abc')).toBe(true);
    expect(isPlayRoute('/gamesx')).toBe(false);
  });
  it('главные частей', () => {
    expect(HOME_OF).toEqual({ play: '/games', journal: '/terminal', admin: '/' });
  });
});
```

Дополнить: `admin-host.test.ts` — `adminOrigin('https:', 'journal.trade-play.com')` даёт `https://admin.trade-play.com`;
`locale-storage.test.ts` — `localeCookieDomain('trade-play.com')` и `('journal.trade-play.com')` дают `trade-play.com`, `('admin.trade-play.com')` и `('localhost')` — `undefined`.

- [ ] **Шаг 2: падает.** `npx vitest run src/shared`.

- [ ] **Шаг 3: код**

```ts
// app-part.ts
import { isAdminHost } from './admin-host';

/** Части продукта (спека 2026-11-03): один код, разные адреса. */
export type AppPart = 'play' | 'journal' | 'admin';

export function partOfHost(host: string | null | undefined): AppPart {
  if (isAdminHost(host)) return 'admin';
  return /^journal\./i.test(host ?? '') ? 'journal' : 'play';
}

/** Куда ведут знак, вход и «/» вошедшего. */
export const HOME_OF: Record<AppPart, string> = { play: '/games', journal: '/terminal', admin: '/' };

const bare = (host: string) => host.replace(/^(www|journal)\./i, '');
export const journalHost = (host: string) => `journal.${bare(host)}`;
export const playHost = bare;

const under = (path: string, root: string) => path === root || path.startsWith(`${root}/`);
const JOURNAL_ROUTES = ['/terminal', '/overview', '/tags', '/analytics', '/market', '/backtest', '/settings'];
const PLAY_ROUTES = ['/games', '/profile'];
export const isJournalRoute = (path: string) => JOURNAL_ROUTES.some((r) => under(path, r));
export const isPlayRoute = (path: string) => PLAY_ROUTES.some((r) => under(path, r));
```

```tsx
// AppPartProvider.tsx
'use client';
import { createContext, useContext, type ReactNode } from 'react';
import type { AppPart } from './app-part';

const Ctx = createContext<AppPart>('play');
export const AppPartProvider = ({ part, children }: { part: AppPart; children: ReactNode }) => (
  <Ctx.Provider value={part}>{children}</Ctx.Provider>
);
/** Часть известна уже серверу: шапке она нужна в первой разметке. */
export const useAppPart = () => useContext(Ctx);
```

`site.ts`: `export const JOURNAL_URL = 'https://journal.trade-play.com';` и

```ts
/** Домен куки языка: на площадке и в журнале один, у админки и локально — нет. */
export function localeCookieDomain(hostname: string): string | undefined {
  const apex = new URL(SITE_URL).hostname;
  return hostname === apex || hostname === `journal.${apex}` ? apex : undefined;
}
```

`setClientLocale`: при известном домене сначала снять старую куку того же имени, потом записать с `domain`:

```ts
const domain = localeCookieDomain(window.location.hostname);
if (domain) document.cookie = `${LOCALE_COOKIE}=; path=/; max-age=0`;
document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax${domain ? `; domain=${domain}` : ''}`;
```

`adminOrigin`: `host.replace(/^(www|journal)\./i, '')`.

`app/layout.tsx`: `const part = partOfHost((await headers()).get('host'))`; в `RootLayout` площадка всегда тёмная — `part === 'play' ? 'dark' : await getServerTheme()`;
`<AppPartProvider part={part}>` снаружи `QueryProvider`. В `generateMetadata`: `metadataBase: new URL(part === 'journal' ? JOURNAL_URL : SITE_URL)`,
`manifest: part === 'journal' ? '/assets/app/manifest.webmanifest' : '/assets/app/manifest-play.webmanifest'`. Создать `manifest-play.webmanifest` — копия с `"start_url": "/games"`.

- [ ] **Шаг 4: проходит.** `npx vitest run src/shared`, `npx tsc --noEmit`.
- [ ] **Шаг 5: коммит** (`feat(split): часть продукта по адресу, общий язык`).

### Задача 4: гейт и адреса частей (A)

**Файлы:** править `frontend/src/proxy.ts`, `proxy.test.ts`, `frontend/next.config.ts`; создать `app/journal/page.tsx`, `app/journal/ru/page.tsx`.

- [ ] **Шаг 1: тесты в `proxy.test.ts`**

```ts
describe('proxy — части', () => {
  const play = 'trade-play.com';
  const journal = 'journal.trade-play.com';

  it('адрес журнала на площадке — в журнал с путём и запросом, 307', () => {
    const res = proxy(req('/analytics?tags=1', { host: play, authed: true, proto: 'https' }));
    expect(res.status).toBe(307);
    expect(locationOf(res)).toBe('https://journal.trade-play.com/analytics?tags=1');
  });
  it('гость тоже уходит в журнал: вход спросит уже он', () => {
    expect(locationOf(proxy(req('/terminal', { host: play, proto: 'https' })))).toBe('https://journal.trade-play.com/terminal');
  });
  it('адрес площадки в журнале — на площадку', () => {
    expect(locationOf(proxy(req('/games/poker', { host: journal, authed: true, proto: 'https' })))).toBe('https://trade-play.com/games/poker');
    expect(locationOf(proxy(req('/profile/abc', { host: journal, proto: 'https' })))).toBe('https://trade-play.com/profile/abc');
  });
  it('внутренний адрес главной журнала на площадке — на настоящую', () => {
    expect(locationOf(proxy(req('/journal/ru', { host: play, proto: 'https' })))).toBe('https://journal.trade-play.com/ru');
  });
  it('/ вошедшего: площадка — витрина, журнал — терминал', () => {
    expect(locationOf(proxy(req('/', { host: play, authed: true })))).toMatch(/\/games$/);
    expect(locationOf(proxy(req('/ru', { host: journal, authed: true })))).toMatch(/\/terminal$/);
  });
  it('/ и /ru гостя открыты в обеих частях, /ru задаёт язык', () => {
    for (const host of [play, journal]) {
      expect(locationOf(proxy(req('/', { host })))).toBeNull();
      const ru = proxy(req('/ru', { host }));
      expect(locationOf(ru)).toBeNull();
      expect(ru.headers.get('x-middleware-request-x-virex-locale')).toBe('ru');
    }
  });
  it('закрытая страница гостя — на главную своей части', () => {
    expect(locationOf(proxy(req('/games/poker', { host: play })))).toMatch(/\/\?auth=login&next=%2Fgames%2Fpoker$/);
    expect(locationOf(proxy(req('/terminal', { host: journal })))).toMatch(/\/\?auth=login&next=%2Fterminal$/);
  });
});
```

Прежний тест «вошедший с обеих главных уходит в терминал» и «защищённая страница без куки» заменить этими.

- [ ] **Шаг 2: падает.** `npx vitest run src/proxy.test.ts`.

- [ ] **Шаг 3: гейт.** После ветки `/admin` и до `/login`:

```ts
  if (host && part === 'play' && (isJournalRoute(pathname) || pathname === '/journal' || pathname.startsWith('/journal/'))) {
    const path = pathname.replace(/^\/journal(?=\/|$)/, '') || '/';
    return NextResponse.redirect(`${originOf(request, journalHost(host))}${path}${request.nextUrl.search}`);
  }
  if (host && part === 'journal' && isPlayRoute(pathname)) {
    return NextResponse.redirect(`${originOf(request, playHost(host))}${pathname}${request.nextUrl.search}`);
  }
```

Где сейчас `url.pathname = '/terminal'` — `url.pathname = HOME_OF[part]`.

- [ ] **Шаг 4: rewrites.** В `next.config.ts`: `const JOURNAL_HOST = "journal\\..+";`, `allowedDevOrigins: ["admin.localhost", "journal.localhost"]`, в конец `beforeFiles`:

```ts
{ source: "/", has: [{ type: "host", value: JOURNAL_HOST }], destination: "/journal" },
{ source: "/ru", has: [{ type: "host", value: JOURNAL_HOST }], destination: "/journal/ru" },
```

- [ ] **Шаг 5: маршруты.** `app/journal/page.tsx` и `app/journal/ru/page.tsx` — пока отдают нынешний `LandingPage` с метаданными пути (задача 8 их доведёт).
- [ ] **Шаг 6: проверка.** `npx vitest run src/proxy.test.ts`; `npx next build`; standalone на свободном порту с `HOSTNAME=0.0.0.0` и `curl -H "Host: …"` по таблице выше,
  плюс `X-Forwarded-Host` у backend (эхо на порту 8091, скрипт `check-next-hop.cjs` из scratchpad, поле `req.headers['x-forwarded-host']`).
- [ ] **Шаг 7: коммит** (`feat(split): гейт и адреса частей`).

**Контрольная точка R2 (A):** задачи 3–4; фокус — петли редиректов, потеря запроса, гость и вошедший в каждой части, поддомен админки.

### Задача 5: шапка, панель, обвязка, настройки, вход (B)

**Файлы:** править `widgets/top-nav/{sections.ts,TopNav.tsx,TabBar.tsx}`, `app/(internal)/AppChrome.tsx`, `widgets/settings-dialog/components/SettingsDialog.tsx`,
`features/auth/ui/AuthForm.tsx`, `views/landing/components/RegisterScene.tsx`, `app/globals.css`, `messages/{ru,en}.json`; создать `widgets/top-nav/sections.test.ts`.

- [ ] **Шаг 1: тест `sections.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { isActive, navOf, tabsOf } from './sections';

const ids = (list: { id: string }[]) => list.map((i) => i.id);

describe('разделы частей', () => {
  it('журнал: четыре раздела и выход на площадку', () => {
    expect(ids(navOf('journal'))).toEqual(['terminal', 'journal', 'market', 'backtest', 'games']);
    expect(navOf('journal').find((i) => i.id === 'games')?.other).toBe(true);
  });
  it('площадка: игры и выход в журнал; на телефоне три пункта', () => {
    expect(ids(navOf('play'))).toEqual(['games', 'tournaments', 'poker', 'blackjack', 'jetpack', 'race', 'journalApp']);
    expect(ids(tabsOf('play'))).toEqual(['games', 'tournaments', 'journalApp']);
  });
  it('«Игры» горят только на витрине, игра — на своих адресах, чужая часть — никогда', () => {
    const play = navOf('play');
    const of = (id: string) => play.find((i) => i.id === id)!;
    expect(isActive('/games', of('games'))).toBe(true);
    expect(isActive('/games/poker/1', of('games'))).toBe(false);
    expect(isActive('/games/poker/1', of('poker'))).toBe(true);
    expect(isActive('/terminal', of('journalApp'))).toBe(false);
    expect(isActive('/tags', navOf('journal').find((i) => i.id === 'journal')!)).toBe(true);
  });
});
```

- [ ] **Шаг 2: падает.** `npx vitest run src/widgets/top-nav`.

- [ ] **Шаг 3: `sections.ts`**

```ts
export type Tab = 'terminal' | 'journal' | 'market' | 'backtest' | 'games' | 'tournaments' | 'poker' | 'blackjack' | 'jetpack' | 'race' | 'journalApp';
/** `other` — раздел соседней части: обычная ссылка, куда надо уведёт гейт. */
export type NavItem = { id: Tab; labelKey: Tab; href: string; other?: boolean };

const JOURNAL_NAV: NavItem[] = [
  { id: 'terminal', labelKey: 'terminal', href: '/terminal' },
  { id: 'journal', labelKey: 'journal', href: '/overview' },
  { id: 'market', labelKey: 'market', href: '/market' },
  { id: 'backtest', labelKey: 'backtest', href: '/backtest' },
  { id: 'games', labelKey: 'games', href: '/games', other: true },
];
const PLAY_NAV: NavItem[] = [
  { id: 'games', labelKey: 'games', href: '/games' },
  { id: 'tournaments', labelKey: 'tournaments', href: '/games/trading' },
  { id: 'poker', labelKey: 'poker', href: '/games/poker' },
  { id: 'blackjack', labelKey: 'blackjack', href: '/games/blackjack' },
  { id: 'jetpack', labelKey: 'jetpack', href: '/games/jetpack' },
  { id: 'race', labelKey: 'race', href: '/games/race' },
  { id: 'journalApp', labelKey: 'journalApp', href: '/terminal', other: true },
];
const PLAY_TABS: readonly Tab[] = ['games', 'tournaments', 'journalApp'];

export const navOf = (part: AppPart) => (part === 'journal' ? JOURNAL_NAV : PLAY_NAV);
export const tabsOf = (part: AppPart) => (part === 'journal' ? JOURNAL_NAV : PLAY_NAV.filter((i) => PLAY_TABS.includes(i.id)));

export function isActive(pathname: string, item: NavItem): boolean {
  if (item.other) return false;
  if (item.id === 'journal') return isJournalPath(pathname);
  if (item.href === '/games') return pathname === '/games';
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
```

- [ ] **Шаг 4: `TopNav`.** `const part = useAppPart(); const play = part === 'play'; const nav = navOf(part);`
  - `useBattlePass(play)`, знак `href={HOME_OF[part]}`, `section = nav.find((i) => isActive(pathname, i))`;
  - пункт с `item.other` — `<a href={item.href}>`, «Дневник» — как сейчас, остальное — `Link`, `isActive(pathname, item)`;
  - `{play && <CoinBalance … />}`, `{!play && <ThemeToggle />}`, `{!play && <кнопка «Обучение» />}`;
  - «Профиль» в журнале — `<a className="acct-item" href={…}>`, на площадке — `Link`.

- [ ] **Шаг 5: `TabBar`.** Список `tabsOf(part)`, `ICONS` дополнить (`Trophy`, `Spade`, `Club`, `Rocket`, `Flag`, `NotebookPen` у `journalApp`), `item.other` — `<a>`. В `.tabbar` заменить
  `grid-template-columns: repeat(5, minmax(0, 1fr))` на `grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr)`.

- [ ] **Шаг 6: `AppChrome`.** Добавить `'use client'`:

```tsx
const play = useAppPart() === 'play';
return (
  <OnboardingProvider>
    {play && <GamesVeil />}
    <TopNav />
    {children}
    <TabBar />
    {!play && <TourOverlay />}
    {play && <DailyRewardPrompt />}
    <SettingsHost />
    {!play && <TerminalWarmup />}
  </OnboardingProvider>
);
```

- [ ] **Шаг 7: настройки.** В `SettingsDialog`: `const tabs = useAppPart() === 'journal' ? SETTINGS_TABS : (['profile'] as const);` — строка вкладок идёт по `tabs`.
- [ ] **Шаг 8: вход.** В `AuthForm`: `const home = HOME_OF[useAppPart()]`; проп `next` без значения по умолчанию, `router.replace(next ?? home)`, демо — `router.replace(home)`. В `RegisterScene`: `safeNext(params.get('next'), HOME_OF[useAppPart()])`. `safeNext` и его тест не меняются.
- [ ] **Шаг 9: тексты.** `nav` в обоих словарях: `tournaments` «Турниры»/«Tournaments», `poker` «Покер»/«Poker», `blackjack` «Блэкджек»/«Blackjack», `jetpack` «Джетпак»/«Jetpack», `race` «Гонки»/«Racing», `journalApp` «Журнал»/«Journal».
- [ ] **Шаг 10: проверка.** `npx vitest run`, `npx tsc --noEmit`, `npx eslint` по изменённым файлам.
- [ ] **Шаг 11: коммит** (`feat(split): шапка и обвязка по частям`).

### Задача 6: карточки игр — в виджет (C)

Карточки теперь нужны двум страницам, а вью друг друга не импортируют.

- [ ] **Шаг 1: перенос `git mv`** с сохранением относительного строения, поэтому импорты внутри не меняются:
  `views/games/components/{GameCard,BlackjackScene,CasinoScene,JetpackScene,PokerScene,RaceScene,SceneLayer,TradingScene}.tsx` → `widgets/game-cards/components/`;
  `views/games/lib/*` → `widgets/game-cards/lib/`; `views/games/model/*` → `widgets/game-cards/model/`.
- [ ] **Шаг 2: `widgets/game-cards/index.ts`**: `export { GameCard } from './components/GameCard'; export { GAMES } from './model/games'; export type { Game } from './model/games';`. В `views/games/Page.tsx` импорт оттуда, в `model/games.ts` поправить путь в комментарии.
- [ ] **Шаг 3: ссылка карточки.** В `GameCard` новый необязательный проп: `link?: { href: string; onClick: () => void }`; при нём карточка — `<a href={link.href} onClick={link.onClick} className={className}>{face}</a>`.
- [ ] **Шаг 4: проверка.** `npx vitest run src/widgets/game-cards`, `npx tsc --noEmit`.
- [ ] **Шаг 5: коммит** (`refactor(games): карточки игр в виджете`).

### Задача 7: две главные (B)

**Файлы:** создать `views/landing/components/GamesScene.tsx`; править `views/landing/Page.tsx`, `components/{LandingHeader,PlatformScene,MarkAssembly,StepsScene}.tsx`, `landing.css`, `messages/{ru,en}.json`, `app/page.tsx`, `app/ru/page.tsx`, `app/journal/**`.

- [ ] **Шаг 1: `GamesScene`**

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { Wrap } from '@/shared/ui/Wrap';
import { GAMES, GameCard } from '@/widgets/game-cards';
import { SceneHead } from './SceneHead';

/**
 * «Игры» — настоящие карточки витрины, а не снимки. Обязана сказать словами, что
 * игры идут на монеты: раздел стоит в одном продукте с настоящими деньгами.
 * Клик ведёт к форме регистрации с `next` в эту игру; якорь крутит Lenis, адрес
 * меняется без перехода, и форма читает его как обычно.
 */
export function GamesScene({ onRegister }: { onRegister: () => void }) {
  const t = useTranslations('landing');
  const pick = (href: string) => {
    onRegister();
    const query = new URLSearchParams(window.location.search);
    query.set('auth', 'register');
    query.set('next', href);
    window.history.replaceState(null, '', `${window.location.pathname}?${query}`);
  };
  return (
    <section className="ls-games" id="games" aria-labelledby="games-title">
      <div className="ls-games-in">
        <Wrap>
          <SceneHead kicker={t('navGames')} kickerId="games-title" lede={t('gamesLede')} />
          <div className="games-page gcards">
            {GAMES.map((game) => (
              <GameCard key={game.id} game={game} link={{ href: '#register', onClick: () => pick(game.href) }} />
            ))}
          </div>
        </Wrap>
      </div>
    </section>
  );
}
```

В `landing.css` добавить `.ls-games-in` к обоим спискам с `.ls-about-in, .ls-term-in, .ls-steps-in` и `.ls-games-in { padding-bottom: var(--s6); }` (на узком — `--s5`).

- [ ] **Шаг 2: `Page.tsx`.** Общая рамка и две страницы:

```tsx
function Frame({ sections, footer, scenes }: {
  sections: readonly NavSection[];
  footer: string;
  scenes: (onAuth: (mode: AuthMode) => void) => ReactNode;
}) { /* нынешнее тело LandingPage: useLenis, mode, эффект адреса, шапка, main с scenes(setMode) и RegisterScene, подвал */ }

export function PlayLanding() {
  const t = useTranslations('landing');
  return (
    <Frame
      sections={['platform', 'games', 'about', 'register']}
      footer={t('playFooter')}
      scenes={(onAuth) => (
        <>
          <PlatformScene />
          <GamesScene onRegister={() => onAuth('register')} />
          <AboutScene />
        </>
      )}
    />
  );
}

export function JournalLanding() {
  const t = useTranslations('landing');
  return (
    <Frame
      sections={['platform', 'terminal', 'how', 'register']}
      footer={t('footer')}
      scenes={() => (
        <>
          <PlatformScene />
          <TerminalScene />
          <StepsScene />
        </>
      )}
    />
  );
}
```

- [ ] **Шаг 3: шапка главной.** `LandingHeader` принимает `sections`; `NavSection` дополняется `'games'`, `LABEL.games = 'navGames'`; экспорт `NAV_SECTIONS` убрать.
- [ ] **Шаг 4: надписи по части.** `PlatformScene`: `h1` — `play ? t('playTitle') : t('platformTitle')`. `MarkAssembly`: `play ? t('playHeroA') : t('heroTitleA')` и так же B. Проверить в браузере при 1440 и 390 px, что «Игровая площадка» не заходит на буквы; заходит — уменьшить кегль `.mk-title` у площадки через `[data-part="play"]`.
- [ ] **Шаг 5: «Что внутри» без игр.** `STEPS` в `StepsScene` — без пятого пункта. Снимки `public/assets/landing/games-*-v4.webp` удалить, ключи `step5Title`, `step5Body` удалить из обоих словарей.
- [ ] **Шаг 6: тексты.** В `landing` обоих словарей: `navGames` «Игры»/«Games»; `heroTitleA` «Журнал»/«Journal» (B прежний); `playHeroA` «Игровая площадка»/«Trading playground»; `playHeroB` «для трейдеров»/«for traders»;
  `playTitle` «Trade Play — игровая площадка для трейдеров: турниры, покер, блэкджек, джетпак и гонки»/«Trade Play — a playground for traders: tournaments, poker, blackjack, jetpack and racing»;
  `gamesLede` «Игры идут на монеты, деньги счёта не участвуют.»/«Games are played for coins, account money never takes part.»;
  `playFooter` «Trade Play — игровая площадка для трейдеров.»/«Trade Play — a playground for traders.»;
  `footer` «Trade Play — журнал трейдера: сделки, терминал, бектест и тренажёр.»/«Trade Play — a trader's journal: trades, terminal, backtesting and a simulator.».
- [ ] **Шаг 7: маршруты.** `app/page.tsx`, `app/ru/page.tsx` рисуют `PlayLanding`; `app/journal/page.tsx`, `app/journal/ru/page.tsx` — `JournalLanding`.
- [ ] **Шаг 8: проверка.** `npx vitest run src/shared/i18n`, `npx next build`.
- [ ] **Шаг 9: коммит** (`feat(split): главные площадки и журнала`).

### Задача 8: поиск по частям (B)

**Файлы:** править `views/landing/seo.tsx`, `app/robots.ts`, `app/sitemap.ts`, `messages/{ru,en}.json`, `app/page.tsx`, `app/ru/page.tsx`, `app/journal/**`; создать `public/assets/app/og-play-{ru,en}-v1.png`.

- [ ] **Шаг 1: `landingMetadata(part, path)`.** Подпись меняется, остальное — ключами по части:

```ts
const texts = part === 'journal'
  ? { title: meta.landingTitle, description: meta.landingDescription, image: `/assets/app/og-${locale}-v1.png` }
  : { title: meta.playLandingTitle, description: meta.playLandingDescription, image: `/assets/app/og-play-${locale}-v1.png` };
```

`LandingJsonLd({ part })`: `url` от `JOURNAL_URL` или `SITE_URL`; `name` — `Trade Play` у площадки, `Trade Play Journal` у журнала; `Organization.url` всегда `SITE_URL`.

- [ ] **Шаг 2: тексты.** `meta.playLandingTitle` «Trade Play — игровая площадка для трейдеров»/«Trade Play — a playground for traders»;
  `meta.playLandingDescription` «Торговые турниры на настоящем рынке, покер, блэкджек, джетпак и гонки. Игры идут на монеты, деньги счёта не участвуют.»/«Trading tournaments on the live market, poker, blackjack, jetpack and racing. Games are played for coins, account money never takes part.».
- [ ] **Шаг 3: `robots.ts` и `sitemap.ts`.** Адрес `sitemap` — от части; `sitemap.ts` становится `async` и читает Host:

```ts
const part = partOfHost((await headers()).get('host'));
const base = part === 'journal' ? JOURNAL_URL : SITE_URL;
const en = `${base}${LANDING_PATH.en}`;
const ru = `${base}${LANDING_PATH.ru}`;
```

- [ ] **Шаг 4: картинка ссылок площадки.** Снять `.gcards` превью с локальной сборки, собрать `og-play-{ru,en}-v1.png` скриптом из scratchpad (`make-icons.cjs`, та же раскладка 1200×630, справа снимок карточек, текст «Игровая площадка для трейдеров»). Посмотреть результат глазами.
- [ ] **Шаг 5: проверка.** `npx next build`; standalone и `curl -H "Host: …"`: заголовок, canonical, hreflang, `og:image`, `robots.txt`, `sitemap.xml` у обеих частей; `noindex` у `/profile/abc` и админки.
- [ ] **Шаг 6: коммит** (`feat(split): поиск по частям`).

**Контрольная точка R3 (B):** задачи 5–8; фокус — стык частей в шапке, гость на превью без запросов к API, тексты про монеты.

### Задача 9: профиль без журнала — backend (B)

**Файлы:** править `backend/src/profile/{profile.service.ts,profile.controller.ts,profile.module.ts,profile-queries.ts,series.ts,achievements.ts}` и их спеки, `backend/src/trades/trade-sync.service.ts`; удалить `backend/src/profile/dto/privacy.dto.ts`, `backend/src/trades/trade-sync.snapshot.spec.ts`.

- [ ] **Шаг 1: тесты.** В `profile.service.spec.ts` удалить блоки `ProfileService.trades`, `.positions`, `.privacy`, `setPrivacy: демо-аккаунт`, четыре теста признаков и импорты `POSITION_FRESH_MS`, `TRADES_PAGE_SIZE`, `AggregateCacheService`; новый конструктор — `new ProfileService(prisma as never, tournaments as never)`. Добавить:

```ts
  it('журнала в ответе нет: ни признаков, ни запросов к сделкам и позициям', async () => {
    const { service, prisma } = make(PLAYER);
    const out = await service.overview(ID, now);
    expect(out).not.toHaveProperty('hasExchangeTrades');
    expect(out).not.toHaveProperty('hasOpenPositions');
    expect(prisma.trade.findFirst).not.toHaveBeenCalled();
    expect(prisma.openPositionSeen.findFirst).not.toHaveBeenCalled();
  });

  it('значков десять: разметки и бектеста среди них нет', async () => {
    const { service } = make(PLAYER);
    const ids = (await service.overview(ID, now)).achievements.map((a) => a.id);
    expect(ids).toHaveLength(10);
    expect(ids).not.toContain('tagger_100');
    expect(ids).not.toContain('backtest_10');
  });
```

В `achievements.spec.ts` убрать из `ZERO` `taggedTrades`, `backtestSessions`. В `series.spec.ts` список игр — `['tournament', 'jetpack', 'poker', 'blackjack']`, строку про разметку заменить строкой неизвестного вида `{ kind: 'other' }`.

- [ ] **Шаг 2: падает.** `cd backend && npx jest src/profile`.
- [ ] **Шаг 3: сервис.** В `profile.service.ts` удалить: `TRADES_PAGE_SIZE`, `POSITION_FRESH_MS`, `freshPositions`, `ProfileTradesPage`, `PUBLIC_TRADE_SELECT`, `tradesHidden`, методы `trades`, `positions`, `privacy`, `setPrivacy`, поля `exchangeTrades`, `openPosition` из `Promise.all` с их запросами, `showTrades` из `select`, `hasExchangeTrades`, `hasOpenPositions`, `taggedTrades`, `backtestSessions`, зависимости `DataVersionService`, `AggregateCacheService`, импорты `Prisma`, `ForbiddenException`, `collapseToPositions`, `cacheKey`.
- [ ] **Шаг 4: контроллер и модуль.** Удалить `GET/PATCH privacy`, `GET :userId/trades`, `GET :userId/positions`, `PrivacyDto`, `Query`, `TRADES_PAGE_SIZE` и `dto/privacy.dto.ts`; из `profile.module.ts` убрать `TradesModule` и абзац про сделки. Комментарий контроллера: «Своё на профиле: имя и картинка»; порядок контроллеров объяснять больше нечем, абзац про `privacy` убрать.
- [ ] **Шаг 5: запрос и реестры.** В `queryActions` убрать ветки `backtest` и `tag`; в `series.ts` `GameId` и `GAME_IDS` без `backtest`; в `achievements.ts` убрать `taggedTrades`, `backtestSessions`, `tagger_100`, `backtest_10`.
- [ ] **Шаг 6: синк.** В `trade-sync.service.ts` удалить `positionSnapshot`, `storePositionSnapshots` и блок его вызова с комментарием; удалить `trade-sync.snapshot.spec.ts`; ненужный импорт `OpenPosition` убрать. Схему не трогать: столбцы остаются. Над ними в `schema.prisma` пометить: «не заполняются с 2026-11-03, снять отдельно».
- [ ] **Шаг 7: проверка.** `npx jest src/profile src/trades`, `npx tsc --noEmit -p tsconfig.json`.
- [ ] **Шаг 8: коммит** (`feat(profile): журнала в профиле больше нет`).

### Задача 10: профиль без журнала — фронт (B)

**Файлы:** править `views/profile/components/{ProfileTabs,GamesPane,StatCells,Achievements}.tsx`, `views/profile/lib/{achievements,charts}.ts`, `charts.test.ts`, `entities/profile/{index.ts,api/hooks.ts,api/types.ts}`, `widgets/settings-dialog/components/ProfileTab.tsx`, `messages/{ru,en}.json`; удалить `views/profile/components/{TradesPane,PositionsPane}.tsx`, `views/profile/lib/games.ts`.

- [ ] **Шаг 1: тест.** В `charts.test.ts` заменить блок `favourite`:

```ts
describe('favourite', () => {
  const g = (id: string, days90: number, played: number) => ({ id, days90, played });
  it('чаще всего за 90 дней среди сыгранных', () => {
    expect(favourite([g('jetpack', 19, 412), g('tournament', 31, 23)])?.id).toBe('tournament');
  });
  it('ни во что не играл — любимой игры нет', () => {
    expect(favourite([g('poker', 0, 0)])).toBeNull();
  });
});
```

- [ ] **Шаг 2: падает.** `npx vitest run src/views/profile`.
- [ ] **Шаг 3: код.**
  - `charts.ts`: `favourite(games)` без `hidden`: `byFrequency(games.filter((g) => g.played > 0))[0] ?? null`.
  - `StatCells`, `GamesPane`: без `HIDDEN_GAMES`; `const games = profile.games;`. Файл `lib/games.ts` удалить.
  - `ProfileTabs`: `type Tab = 'games' | 'feed' | 'ach'`; три опции; убрать `userId`, ветки и импорты панелей; комментарий про позиции убрать.
  - `entities/profile`: убрать `useProfileTrades`, `useProfilePositions`, `privacyKey`, `usePrivacy`, `useSetPrivacy`, `ProfileTrades`, `ProfilePosition(s)`, импорт `Trade` и `keepPreviousData`, поля `hasExchangeTrades`, `hasOpenPositions`, `backtest` из `GameId`, `tagger_100`, `backtest_10` из `AchievementId`.
  - `lib/achievements.ts`, `Achievements.tsx`: убрать две записи и импорты `Tag`, `History`.
  - `ProfileTab.tsx`: убрать `PrivacyRow`, его импорты (`usePrivacy`, `useSetPrivacy`, `Skeleton`), строку в разметке и «показ сделок» в комментарии.
  - Словари: `profile.tabExchange`, `profile.tabPositions` (строка 1925, а не 2331), `tradesEmptyTitle`, `tradesEmptyBody`, `tradesFailed`, `posEmptyTitle`, `posEmptyBody`, `positionsFailed` в разделе `profile`; `settings.privacyShowTrades`, `settings.privacyFailed`; `profile.games.backtest`; `ach.tagger_100`, `ach.backtest_10`. Удалить в обоих языках; `errors.PROFILE_TRADES_HIDDEN`, если есть.
- [ ] **Шаг 4: проверка.** `npx vitest run`, `npx tsc --noEmit`, `npx next build`. `tileCols` считает сам и правки не требует; посмотреть вкладку «Достижения» с десятью плашками.
- [ ] **Шаг 5: коммит** (`feat(profile): вкладки журнала убраны`).

**Контрольная точка R4 (B):** задачи 9–10; фокус — ничего не читает снятых адресов, синк не сломан, значки и игры сходятся у сервера и фронта.

### Задача 11: документы (C)

- [ ] В `CLAUDE.md`:
  - новый раздел «Части продукта» в «Стек и структура»: адреса, определение по Host, гейт, `<a>` между частями, что где живёт, общая кука и условие про поддомены;
  - «Разделы приложения»: две рейки; главная журнала — `/terminal`, площадки — `/games`;
  - «Вход на поддомене свой»: заменить фразу про общую куку;
  - «Поиск»: своё у каждой части; «Главная и вход»: две главные, «Что внутри» без игр, снимки без `games`;
  - «Профиль»: снять «Пользователи видят сделки друг друга», вкладки и «Открытые позиции» с пометкой «снято владельцем 2026-11-03»; «двенадцать значков» → «десять»;
  - «Battle Pass»: пометка, что `journal.tag` больше никто не читает.
- [ ] Обновить память проекта (`virex_seo.md`, новая заметка о разделении).
- [ ] Коммит (`docs: разделение на части`).

### Задача 12: живой прогон (A)

- [ ] Локально: `start.bat` или Docker, если запущен; `trade-play`-поведение на `localhost:8090` и журнал на `journal.localhost:8090`. Сценарий браузером: гость на превью → клик по карточке → форма с `next` → регистрация на настоящем домене → игра; демо-вход в обеих частях; рейка между частями; окна награды нет в журнале; профиль с тремя вкладками; настройки площадки с одной вкладкой; русский язык переживает переход между частями в пределах одного адреса.
- [ ] Финальное ревью Opus по всей ветке.
- [ ] После слова «заливай»: merge в `main`, push, ждать Actions. Проверка на проде: вход на площадке и журнал без пароля; выход там и там; старые закладки `/terminal`, `/games/poker`, приглашение в турнир; `robots.txt` и `sitemap.xml` обеих частей; демо-вход; лимит входа (11-я попытка — 429).
- [ ] Вручную: добавить `journal.trade-play.com` в Яндекс Вебмастер, отправить его sitemap в Search Console.
