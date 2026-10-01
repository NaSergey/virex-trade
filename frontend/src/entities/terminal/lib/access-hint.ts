export const TERMINAL_COOKIE = 'virex-terminal';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 год

/**
 * Разбирает сырое значение куки `virex-terminal` (что с сервера, что из
 * `document.cookie`). Единая точка для сервера (layout) и клиента — поэтому
 * первый рендер обеих сторон совпадает. Всё, кроме «1», — «терминала нет».
 */
export function parseTerminalHint(raw: string | null | undefined): boolean {
  return raw === '1';
}

function readCookieValue(name: string, source: string): string | null {
  const match = source.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/** Подсказка из `document.cookie`; источник — вторым параметром для тестов. */
export function getClientTerminalHint(
  source: string = typeof document === 'undefined' ? '' : document.cookie,
): boolean {
  return parseTerminalHint(readCookieValue(TERMINAL_COOKIE, source));
}

/**
 * Запоминает последний ответ о доступе к терминалу — кукой, а не в
 * `localStorage`: куку читает и сервер при SSR, и пункт «Терминал» стоит в
 * шапке уже в присланной разметке. Иначе он появлялся бы после ответа
 * `/api/terminal/access` и сдвигал всю рейку на глазах — тот же случай, что
 * тема и локаль.
 *
 * Это подсказка для первого кадра, а не право: доступ решает сервер, и саму
 * страницу и ордера кука не открывает. Без доступа кука стирается, а не
 * хранит «0» — ключа с торговлей у большинства нет, и лишняя кука им ни к чему.
 */
export function setClientTerminalHint(available: boolean): void {
  if (typeof document === 'undefined') return;
  document.cookie = available
    ? `${TERMINAL_COOKIE}=1; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`
    : `${TERMINAL_COOKIE}=; path=/; max-age=0; samesite=lax`;
}
