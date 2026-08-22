const WEEKDAY_LABELS_RU = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const WEEKDAY_LABELS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Подписи дней недели по индексу JS getDay(): 0 — воскресенье. */
export function weekdayLabels(locale: 'ru' | 'en'): string[] {
  return locale === 'en' ? WEEKDAY_LABELS_EN : WEEKDAY_LABELS_RU;
}

/** Порядок показа: неделя начинается с понедельника, а не с getDay()-нуля. */
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

// Старт нового периода торговли (с тегами на каждой сделке). Бэкенд фильтрует
// по «days назад от now», абсолютных дат нет — поэтому считаем days динамически.
const DEFAULT_SINCE = new Date(2026, 6, 3); // 3 июля 2026

/**
 * Сколько дней прошло от даты (включительно, локальная полночь) до сегодня —
 * бэкенд не знает абсолютных дат, только «N дней назад от now», поэтому любой
 * пользовательский выбор даты (см. usePeriodFilter) пересчитывается в days так же.
 */
export function daysSince(date: Date | string): number {
  const from = typeof date === 'string' ? new Date(date) : date;
  return Math.max(1, Math.ceil((Date.now() - from.getTime()) / 86400000));
}

/**
 * Сколько дней прошло с начала текущего периода торговли — используется как
 * динамический «days» для серверного фильтра «N дней назад от now».
 */
export function daysSinceDefault(): number {
  return daysSince(DEFAULT_SINCE);
}

/**
 * Период прописью: «30 июн — 29 июл 2026». Свод всегда подписан теми самыми
 * датами, за которые он посчитан, — иначе «30 дней» остаётся абстракцией, и по
 * снимку экрана уже не сказать, какой это был месяц.
 * @param days - глубина периода в днях; 0 — всё время
 * @param locale - BCP-47 локаль для Intl (по умолчанию 'ru-RU')
 * @param allTimeLabel - что показать при days <= 0 (по умолчанию русский — для
 *   мест, ещё не подключивших перевод)
 */
export function formatPeriodRange(days: number, locale = 'ru-RU', allTimeLabel = 'всё время'): string {
  if (days <= 0) return allTimeLabel;
  const to = new Date();
  const from = new Date(to.getTime() - (days - 1) * 86400000);
  const short = (d: Date) => d.toLocaleDateString(locale, { day: 'numeric', month: 'short' }).replace('.', '');
  return `${short(from)} — ${short(to)} ${to.getFullYear()}`;
}
