/**
 * Единицы времени и вспомогательная арифметика для владельческой аналитики.
 *
 * Сама сшивка минут в сессии живёт в SQL (usage-queries.ts) и только там:
 * второй реализации «что такое сессия» здесь нет намеренно. Две копии одного
 * правила расходятся молча, и расхождение видно не по ошибке, а по числам,
 * которые уже кому-то показали.
 */

export const MINUTE_MS = 60_000;
export const DAY_MS = 24 * 60 * MINUTE_MS;

/**
 * Разрыв, после которого активность считается новым визитом.
 *
 * 30 минут — не истина, а компромисс: меньше — и человек, отошедший посмотреть
 * график на бирже, получает две сессии вместо одной; больше — и вкладка,
 * открытая утром и закрытая вечером, читается как «сидел восемь часов».
 */
export const SESSION_GAP_MIN = 30;

/** Начало UTC-минуты, к которой относится момент времени. */
export function floorToMinute(at: Date): Date {
  return new Date(Math.floor(at.getTime() / MINUTE_MS) * MINUTE_MS);
}

/**
 * Начало суток, в которые попадает момент, со сдвигом часового пояса в минутах.
 *
 * Сдвиг нужен, потому что «сколько людей было вчера» владелец читает по своему
 * дню, а не по UTC: при tzOffsetMinutes=0 вечерняя активность москвича попадает
 * в следующие сутки, и день выглядит пустым.
 */
export function floorToDay(at: Date, tzOffsetMinutes = 0): Date {
  const shifted = at.getTime() + tzOffsetMinutes * MINUTE_MS;
  const day = Math.floor(shifted / DAY_MS) * DAY_MS;
  return new Date(day - tzOffsetMinutes * MINUTE_MS);
}

/** Начало недели (понедельник) с учётом сдвига часового пояса. */
export function floorToWeek(at: Date, tzOffsetMinutes = 0): Date {
  const day = floorToDay(at, tzOffsetMinutes);
  const shifted = new Date(day.getTime() + tzOffsetMinutes * MINUTE_MS);
  const weekday = (shifted.getUTCDay() + 6) % 7; // 0 = понедельник
  return new Date(day.getTime() - weekday * DAY_MS);
}

/**
 * Медиана. Для времени сессий она честнее среднего: одна забытая на весь день
 * вкладка поднимает среднее так, что оно перестаёт описывать кого-либо.
 */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

export function round(value: number, digits = 1): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}
