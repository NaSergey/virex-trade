import { NextResponse, type NextRequest } from 'next/server';
import { adminOrigin, adminPath, isAdminHost } from '@/shared/lib/utils/admin-host';

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
  const authed = request.cookies.has(REFRESH_COOKIE);
  const { pathname } = request.nextUrl;
  const host = request.headers.get('host');

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
   * Кука сессии ставится без Domain, поэтому вход здесь свой: без куки любая
   * страница ведёт на `/login` поддомена. Сама форма входа — всегда форма, без
   * «уже вошёл → на главную»: решать это по одной куке нельзя — протухшая кука
   * и AuthGuard уводили бы друг на друга по кругу. Вошедшего уводит страница.
   */
  if (isAdminHost(host)) {
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
   * Корень — единственная страница продукта, открытая всем: это рассказ о
   * том, что тут вообще происходит, и он адресован ровно тому, у кого ещё
   * нет аккаунта. Отправлять его на вход значило бы требовать войти прежде,
   * чем человек узнал куда.
   *
   * А вошедшему рассказывать не о чем — он идёт на главную продукта, в
   * терминал (владелец 2026-10-17; до этого — обзор дневника). Развилка
   * стоит здесь, а не на самой странице: тогда лендинг остаётся статикой,
   * которую не надо рендерить, чтобы тут же выбросить.
   */
  if (pathname === '/') {
    if (!authed) return NextResponse.next();
    const url = request.nextUrl.clone();
    url.pathname = '/terminal';
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
  matcher: ['/((?!_next/static|_next/image|assets/|favicon.ico|api/|auth/).*)'],
};
