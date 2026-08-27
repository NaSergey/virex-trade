export type Theme = 'dark' | 'light';

export const THEME_COOKIE = 'virex-theme';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 год

/**
 * Тёмная — не «одна из двух», а исходное направление продукта: гроссбух
 * задуман тёмным, светлая тема добавлена рядом. Поэтому все, кто ничего не
 * выбирал (включая первое посещение), получают её, а не системную догадку.
 */
const DEFAULT_THEME: Theme = 'dark';

function isTheme(value: string | null | undefined): value is Theme {
  return value === 'dark' || value === 'light';
}

/**
 * Разбирает сырое значение куки `virex-theme` (что с сервера, что из
 * `document.cookie`) в валидную тему. Неизвестное или отсутствующее значение —
 * дефолт, без исключений: это единая точка, которую читают и сервер
 * (layout.tsx), и клиент, поэтому первый рендер обеих сторон гарантированно
 * совпадает.
 */
export function parseThemeCookie(raw: string | null | undefined): Theme {
  return isTheme(raw) ? raw : DEFAULT_THEME;
}

function readCookieValue(name: string, source: string): string | null {
  const match = source.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Читает тему из `document.cookie` на клиенте. Принимает источник вторым
 * параметром для тестов (по умолчанию — реальный `document.cookie`, `''` при
 * SSR/отсутствии `document`).
 */
export function getClientTheme(
  source: string = typeof document === 'undefined' ? '' : document.cookie,
): Theme {
  return parseThemeCookie(readCookieValue(THEME_COOKIE, source));
}

/**
 * Пишет тему в куку — не в `localStorage`: куку читает и сервер при SSR
 * (см. `layout.tsx`), поэтому следующая загрузка сразу приходит в нужных
 * цветах. С `localStorage` первый кадр был бы тёмным у всех, и человек,
 * выбравший светлую, ловил бы вспышку чёрного на каждой перезагрузке.
 */
export function setClientTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`;
}
