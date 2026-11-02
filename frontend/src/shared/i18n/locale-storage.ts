import { SITE_URL } from '@/shared/config/site';

export type Locale = 'ru' | 'en';

export const SUPPORTED_LOCALES: readonly Locale[] = ['ru', 'en'];

export const LOCALE_COOKIE = 'virex-locale';
/** Язык, заданный адресом страницы (`/ru`): его ставит `proxy.ts`, и он сильнее куки. */
export const LOCALE_HEADER = 'x-virex-locale';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 год

/**
 * Язык, который видит человек, впервые открывший продукт без куки.
 *
 * `en`, а не `ru`: продукт открыт всем, и первым экраном для незнакомого
 * посетителя должен быть язык, который он с большей вероятностью прочтёт.
 * Русскоязычный переключит его один раз, и выбор запомнится на год (кука
 * ниже), а англоязычному переключать нечего — он бы просто не понял, что
 * перед ним.
 */
const DEFAULT_LOCALE: Locale = 'en';

function isLocale(value: string | null | undefined): value is Locale {
  return value === 'ru' || value === 'en';
}

/**
 * Разбирает сырое значение куки `virex-locale` (что с сервера, что из
 * `document.cookie`) в валидную локаль. Неизвестное или отсутствующее
 * значение — `DEFAULT_LOCALE`, без исключений: это единая точка, которую
 * читают и сервер (layout.tsx), и клиент, поэтому первый рендер обеих сторон
 * гарантированно совпадает.
 */
export function parseLocaleCookie(raw: string | null | undefined): Locale {
  return isLocale(raw) ? raw : DEFAULT_LOCALE;
}

function readCookieValue(name: string, source: string): string | null {
  const match = source.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Читает локаль из `document.cookie` на клиенте. Принимает источник вторым
 * параметром для тестов (по умолчанию — реальный `document.cookie`, `''` при
 * SSR/отсутствии `document`).
 */
export function getClientLocale(
  source: string = typeof document === 'undefined' ? '' : document.cookie,
): Locale {
  return parseLocaleCookie(readCookieValue(LOCALE_COOKIE, source));
}

/**
 * Домен куки языка: на площадке и в журнале он один, иначе выбравший русский
 * получал бы другую часть продукта на английском. У админки, локально и на чужом
 * адресе кука остаётся на своём.
 */
export function localeCookieDomain(hostname: string): string | undefined {
  const apex = new URL(SITE_URL).hostname;
  return hostname === apex || hostname === `journal.${apex}` ? apex : undefined;
}

/**
 * Пишет локаль в куку — не в `localStorage`: куку, в отличие от
 * `localStorage`, читает и сервер при SSR (см. `layout.tsx`), поэтому
 * следующая загрузка страницы сразу рендерится в правильном языке без
 * вспышки и hydration mismatch.
 *
 * Кука своего адреса снимается: заведённая раньше, она шла бы первой, и новый выбор
 * на весь домен не читался бы.
 */
export function setClientLocale(locale: Locale): void {
  if (typeof document === 'undefined') return;
  const domain = localeCookieDomain(window.location.hostname);
  if (domain) document.cookie = `${LOCALE_COOKIE}=; path=/; max-age=0`;
  const scope = domain ? `; domain=${domain}` : '';
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax${scope}`;
}
