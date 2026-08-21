export type Locale = 'ru' | 'en';

export const SUPPORTED_LOCALES: readonly Locale[] = ['ru', 'en'];

const STORAGE_KEY = 'virex-locale';
const DEFAULT_LOCALE: Locale = 'ru';

function isLocale(value: string | null): value is Locale {
  return value === 'ru' || value === 'en';
}

function browserStorage(): Storage | undefined {
  return typeof window === 'undefined' ? undefined : window.localStorage;
}

/**
 * Читает сохранённый язык интерфейса. На сервере (первый SSR-проход) storage
 * недоступен — там всегда дефолт `'ru'`, а не исключение.
 */
export function getStoredLocale(storage: Pick<Storage, 'getItem'> | undefined = browserStorage()): Locale {
  const raw = storage?.getItem(STORAGE_KEY) ?? null;
  return isLocale(raw) ? raw : DEFAULT_LOCALE;
}

export function setStoredLocale(
  locale: Locale,
  storage: Pick<Storage, 'setItem'> | undefined = browserStorage(),
): void {
  storage?.setItem(STORAGE_KEY, locale);
}
