import { NextResponse, type NextRequest } from 'next/server';

/**
 * Единственный гейт защищённых страниц продукта — до рендера, на edge.
 *
 * Проверяет только присутствие куки сессии (`refresh_token`, HttpOnly,
 * `path: '/'` — см. `auth.controller.ts`), не её валидность: это не подмена
 * настоящей проверки (JWT в заголовке на каждом запросе к API, см.
 * `JwtAuthGuard`), а вход к странице. Просроченный или отозванный
 * refresh-токен здесь не отличить от действительного без похода в БД на
 * каждый переход — эту разницу ловит уже сама страница, когда
 * `/auth/refresh` не даёт новый access-токен, и уводит на `/login` из
 * `AuthGuard`.
 *
 * Кука долетает сюда только потому, что и `/auth/*`, и страницы продукта —
 * один origin: Next проксирует `/auth/*` и `/api/*` на backend через
 * rewrites (см. `next.config.ts`). Раздельные origin означали бы, что эта
 * кука до Next-сервера не доходит, и здесь нечего было бы проверять.
 *
 * Файл называется `proxy.ts` и лежит в `src/`: в Next 16 это актуальное имя
 * конвенции (бывший `middleware.ts` — тот тоже работает, но помечен
 * deprecated), и Next ищет его рядом с `src/app`, а не в корне пакета.
 */
const REFRESH_COOKIE = 'refresh_token';

export function proxy(request: NextRequest) {
  const authed = request.cookies.has(REFRESH_COOKIE);

  /*
   * Корень — единственная страница продукта, открытая всем: это рассказ о
   * том, что тут вообще происходит, и он адресован ровно тому, у кого ещё
   * нет аккаунта. Отправлять его на вход значило бы требовать войти прежде,
   * чем человек узнал куда.
   *
   * А вошедшему рассказывать не о чем — он идёт к своим сделкам. Развилка
   * стоит здесь, а не на самой странице: тогда лендинг остаётся статикой,
   * которую не надо рендерить, чтобы тут же выбросить.
   */
  if (request.nextUrl.pathname === '/') {
    if (!authed) return NextResponse.next();
    const url = request.nextUrl.clone();
    url.pathname = '/overview';
    url.search = '';
    return NextResponse.redirect(url);
  }

  if (authed) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.search = `next=${encodeURIComponent(request.nextUrl.pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Всё, кроме статики Next, favicon, самих /api и /auth (это не страницы —
  // их не на что редиректить) и /login (иначе вход стал бы недостижим).
  // Корень сюда попадает намеренно: развилка «лендинг или продукт» выше.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/|auth/|login).*)'],
};
