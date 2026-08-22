export type Locale = 'ru' | 'en';

export const SUPPORTED_LOCALES: readonly Locale[] = ['ru', 'en'];

export const LOCALE_COOKIE = 'virex-locale';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 год

const DEFAULT_LOCALE: Locale = 'ru';

function isLocale(value: string | null | undefined): value is Locale {
  return value === 'ru' || value === 'en';
}

/**
 * Разбирает сырое значение куки `virex-locale` (что с сервера, что из
 * `document.cookie`) в валидную локаль. Неизвестное или отсутствующее
 * значение — дефолт `'ru'`, без исключений: это единая точка, которую читают
 * и сервер (layout.tsx), и клиент, поэтому первый рендер обеих сторон
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
 * Пишет локаль в куку — не в `localStorage`: куку, в отличие от
 * `localStorage`, читает и сервер при SSR (см. `layout.tsx`), поэтому
 * следующая загрузка страницы сразу рендерится в правильном языке без
 * вспышки и hydration mismatch.
 */
export function setClientLocale(locale: Locale): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`;
}
