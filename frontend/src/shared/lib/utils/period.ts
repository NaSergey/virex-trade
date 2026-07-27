/** Подписи дней недели по индексу JS getDay(): 0 — воскресенье. */
export const WEEKDAY_LABELS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

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
