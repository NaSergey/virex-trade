import { dateFormat } from '@/shared/lib/utils/intl';

/** Локаль `Intl` терминала по локали интерфейса. */
export const terminalIntl = (locale: string) => (locale === 'en' ? 'en-US' : 'ru-RU');

/**
 * Форматтеры подписей времени графика (`labelFor` в `Terminal`) — из общего
 * кеша (`dateFormat`). Первое создание форматтера на странице поднимает данные
 * локали и стоит заметно; главная зовёт это в простой браузера до подъёма
 * терминала (`TerminalDemo`), и к монтированию форматтеры уже лежат в кеше.
 */
export function timeLabelFormats(intl: string) {
  return {
    time: dateFormat(intl, { hour: '2-digit', minute: '2-digit' }),
    weekday: dateFormat(intl, { weekday: 'short' }),
    day: dateFormat(intl, { day: 'numeric', month: 'short', year: '2-digit' }),
  };
}
