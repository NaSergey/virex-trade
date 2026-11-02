import { NextResponse, type NextRequest } from 'next/server';
import { LANDING_PATH } from '@/shared/config/site';
import { LOCALE_HEADER } from '@/shared/i18n/locale-storage';
import { adminOrigin, adminPath } from '@/shared/lib/utils/admin-host';
import { HOME_OF, isJournalRoute, isPlayRoute, journalHost, partOfHost, playHost } from '@/shared/lib/utils/app-part';

/**
 * Единственный гейт защищённых страниц продукта — до рендера, на edge.
 *
 * Проверяет только присутствие куки сессии (HttpOnly, `path: '/'` — см.
 * `session-cookie.ts` на backend), не её валидность: это не подмена
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
const SESSION_COOKIE = 'tp_session';
const LEGACY_COOKIE = 'refresh_token';

/** Протокол запроса снаружи. Цепочка прокси пишет протоколы через запятую — свой у первого. */
function protoOf(request: NextRequest): string {
  return request.headers.get('x-forwarded-proto')?.split(',')[0].trim() || request.nextUrl.protocol.replace(':', '');
}

/**
 * Origin запроса снаружи — от Host, а не от `nextUrl`: у того хост — адрес
 * самого сервера Next (localhost), и редирект на поддомене увёл бы туда.
 */
function originOf(request: NextRequest, host: string): string {
  return `${protoOf(request)}://${host}`;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get('host');
  const part = partOfHost(host);
  // Общая кука доезжает и до админки, но вход у неё свой. Старая вне админки ещё
  // считается: прежние сессии переходят на новую при первом обмене токена.
  const authed = part === 'admin'
    ? request.cookies.has(LEGACY_COOKIE)
    : request.cookies.has(SESSION_COOKIE) || request.cookies.has(LEGACY_COOKIE);

  /*
   * Поддомен админки (`admin.*`, спека 2026-10-19-hyperliquid-wallet-scout-design.md)
   * — свой набор страниц `app/admin/*` под адресами без префикса: `/` —
   * кошельки, `/saved`, `/users`. Адреса переписывает не этот файл, а rewrites
   * `beforeFiles` в `next.config.ts` по условию на Host: rewrite отсюда Next
   * сравнивает со своим origin (`HOSTNAME` сервера — на проде 0.0.0.0, а адрес
   * у proxy — localhost), считает внешним и проксирует новым запросом с Host
   * сервера — мимо этой развилки (проверено на standalone-сборке). Здесь —
   * только гейт входа.
   *
   * Своя кука здесь ставится без Domain, поэтому вход свой: без неё любая
   * страница ведёт на `/login` поддомена. Сама форма входа — всегда форма, без
   * «уже вошёл → на главную»: решать это по одной куке нельзя — протухшая кука
   * и AuthGuard уводили бы друг на друга по кругу. Вошедшего уводит страница.
   */
  if (part === 'admin' && host) {
    if (pathname === '/login' || authed) return NextResponse.next();
    return NextResponse.redirect(`${originOf(request, host)}/login?next=${encodeURIComponent(pathname)}`);
  }

  // На основном хосте страниц админки нет — старые закладки `/admin` уходят на
  // поддомен. Без Host уводить некуда; данные админки всё равно за AdminGuard.
  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    if (!host) return NextResponse.next();
    return NextResponse.redirect(`${adminOrigin(`${protoOf(request)}:`, host)}${adminPath(pathname)}`);
  }

  /*
   * Части продукта (спека 2026-11-03): адрес чужой части уводит туда же с тем же
   * запросом — закладки, ссылки из уведомлений и пункты рейки в соседнюю часть
   * держатся на этом. Вход спрашивает уже та часть, куда пришли. 307, а не 308:
   * постоянный редирект браузер запоминает, и откатить его было бы нечем.
   */
  if (host && part === 'play' && (isJournalRoute(pathname) || pathname === '/journal' || pathname.startsWith('/journal/'))) {
    const path = pathname.replace(/^\/journal(?=\/|$)/, '') || '/';
    return NextResponse.redirect(`${originOf(request, journalHost(host))}${path}${request.nextUrl.search}`);
  }
  if (host && part === 'journal' && isPlayRoute(pathname)) {
    return NextResponse.redirect(`${originOf(request, playHost(host))}${pathname}${request.nextUrl.search}`);
  }

  /*
   * `/login` только пересылает старые ссылки на главную. `/profile/<id>` —
   * со слэшем — проходит гейт без куки, но **профиля на ней гость не видит**
   * (решение владельца 2026-10-02). Его пускают сюда не ради данных, а ради
   * фразы: данные за `JwtAuthGuard` (`ProfileByIdController`), а страница
   * говорит гостю «чтобы посмотреть профиль, зарегистрируйтесь» (`GuestGate`).
   * Редирект на `/login` вместо неё отвечал бы не на то, зачем человек пришёл
   * по чужой ссылке. Свой `/profile` в гейт попадает и остаётся за входом: он
   * только уводит на адрес со своим id.
   *
   * Оба пропускаются здесь, а не исключением в matcher: на поддомене админки
   * `/login` обязан пройти развилку выше.
   */
  if (pathname === '/login' || pathname.startsWith('/profile/')) return NextResponse.next();

  /*
   * Корень — страница, открытая всем: это рассказ о том, что тут вообще
   * происходит, и он адресован ровно тому, у кого ещё нет аккаунта. Отправлять
   * его на вход значило бы требовать войти прежде, чем человек узнал куда. У
   * каждой части своя главная: журнал получает её через rewrites `next.config.ts`.
   *
   * А вошедшему рассказывать не о чем — он идёт на главную своей части
   * (`HOME_OF`). Развилка стоит здесь, а не на самой странице: тогда лендинг не
   * надо рендерить, чтобы тут же выбросить.
   *
   * `/ru` — та же главная по-русски, для поисковика (`views/landing/seo.tsx`).
   * Корневому layout адрес недоступен, поэтому язык едет к нему заголовком.
   */
  if (pathname === LANDING_PATH.en || pathname === LANDING_PATH.ru) {
    if (!authed) {
      if (pathname === LANDING_PATH.en) return NextResponse.next();
      const headers = new Headers(request.headers);
      headers.set(LOCALE_HEADER, 'ru');
      return NextResponse.next({ request: { headers } });
    }
    const url = request.nextUrl.clone();
    url.pathname = HOME_OF[part];
    url.search = '';
    return NextResponse.redirect(url);
  }

  if (authed) return NextResponse.next();

  const url = request.nextUrl.clone();
  // Входа-страницы больше нет: вход — окно на главной, оно открывается по `auth`.
  url.pathname = '/';
  url.search = `auth=login&next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Всё, кроме статики Next, favicon и самих /api и /auth (это не страницы —
  // их не на что редиректить). Корень сюда попадает намеренно: развилка
  // «лендинг или продукт» выше; `/login` и `/profile/` — тоже (см. выше).
  //
  // `assets/` — картинки раздела игр из `public/`. Их нельзя защищать этим
  // гейтом по двум причинам. Первая: оптимизатор `next/image` ходит за
  // исходником по HTTP сам к себе и куку сессии с собой не несёт — он
  // получал бы редирект на /login вместо файла и отвечал 400, то есть
  // картинки пропадали бы и у вошедшего. Вторая: в этих файлах нет ничего
  // пользовательского, защищать там нечего.
  //
  // `robots.txt` и `sitemap.xml` читает поисковик без куки: через гейт он
  // получал редирект на форму входа вместо файла.
  matcher: ['/((?!_next/static|_next/image|assets/|favicon.ico|robots.txt|sitemap.xml|api/|auth/).*)'],
};
