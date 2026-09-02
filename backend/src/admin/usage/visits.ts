/**
 * Единицы времени и вспомогательная арифметика для владельческой аналитики.
 *
 * Само разбиение минут на визиты живёт в SQL (usage-queries.ts) и только там:
 * второй реализации «что такое визит» здесь нет намеренно. Две копии одного
 * правила расходятся молча, и расхождение видно не по ошибке, а по числам,
 * которые уже кому-то показали.
 */

export const MINUTE_MS = 60_000;
export const DAY_MS = 24 * 60 * MINUTE_MS;

/**
 * Разрыв, после которого активность считается новым визитом.
 *
 * 30 минут — не истина, а компромисс: меньше — и человек, отошедший посмотреть
 * график на бирже, вернётся уже «вторым визитом»; больше — и два захода за
 * утро сольются в один.
 */
export const VISIT_GAP_MIN = 30;

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

export function round(value: number, digits = 1): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}
