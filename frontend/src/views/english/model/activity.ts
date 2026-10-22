/**
 * Занятия по дням: местная дата, серия дней подряд и календарь. День считается
 * учебным, если в нём было хоть одно занятие — карточка, задание или фраза.
 */

export interface DayRow {
  day: string;
  cards: number;
  answers: number;
  correct: number;
  phrases: number;
  /** Ответы в тестах по темам слов. */
  quiz: number;
}

/** Местная дата `YYYY-MM-DD`: день занятий — по часам владельца, а не по UTC. */
export function localDay(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Тот же день `n` дней назад (по календарю, а не по 24 часа: переход на летнее время). */
export function shiftDay(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return localDay(new Date(y, m - 1, d - n, 12).getTime());
}

export const activityOf = (r: DayRow | undefined) => (r ? r.cards + r.answers + r.phrases + (r.quiz ?? 0) : 0);

/**
 * Серия дней подряд с занятиями. Сегодня ещё не занимался — серия не рвётся,
 * считается до вчера: день не кончился.
 */
export function streak(days: ReadonlyMap<string, DayRow>, today: string): number {
  let day = activityOf(days.get(today)) > 0 ? today : shiftDay(today, 1);
  let n = 0;
  while (activityOf(days.get(day)) > 0) {
    n += 1;
    day = shiftDay(day, 1);
  }
  return n;
}

/**
 * Календарь последних `weeks` недель: столбец — неделя с понедельника,
 * последний — текущая. Дни после сегодня — null.
 */
export function calendar(today: string, weeks: number): (string | null)[][] {
  const [y, m, d] = today.split('-').map(Number);
  const weekday = (new Date(y, m - 1, d).getDay() + 6) % 7; // 0 — понедельник
  const lastMonday = shiftDay(today, weekday);
  const cols: (string | null)[][] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const monday = shiftDay(lastMonday, w * 7);
    cols.push(
      Array.from({ length: 7 }, (_, i) => {
        const day = shiftDay(monday, -i);
        return day > today ? null : day;
      }),
    );
  }
  return cols;
}
