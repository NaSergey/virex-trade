/** Время плана — минуты суток владельца; пояс знает сервер, здесь только запись. */

export const hhmm = (min: number) =>
  `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** Конец блока 24:00 — полночь, а не 00:00 следующего дня. */
export const endLabel = (min: number) => (min === 1440 ? '24:00' : hhmm(min));

/** `ЧЧ:ММ` из поля времени → минута; пусто или мусор — null. `00:00` в поле конца — полночь. */
export function parseHHMM(value: string, end = false): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h > 24 || mm > 59 || (h === 24 && mm > 0)) return null;
  const v = h * 60 + mm;
  return end && v === 0 ? 1440 : v;
}

export function addDays(day: string, n: number): string {
  const t = Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10)) + n * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/** 0 — понедельник, как биты `PlanBlock.days`. */
export const weekdayOf = (day: string) => (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;

export const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

export const dayLabel = (day: string) =>
  `${WEEKDAYS[weekdayOf(day)].toLowerCase()}, ${+day.slice(8, 10)} ${MONTHS[+day.slice(5, 7) - 1]}`;

export const WEEKDAYS_MASK = 0b0011111;
export const WEEKEND_MASK = 0b1100000;
export const EVERY_DAY_MASK = 0b1111111;

/** Дни шаблона словами: «каждый день», «будни», «пн, ср, пт». */
export function daysLabel(mask: number): string {
  if (mask === EVERY_DAY_MASK) return 'каждый день';
  if (mask === WEEKDAYS_MASK) return 'будни';
  if (mask === WEEKEND_MASK) return 'выходные';
  return WEEKDAYS.filter((_, i) => mask & (1 << i))
    .map((d) => d.toLowerCase())
    .join(', ');
}

export function duration(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h && m ? `${h} ч ${m} мин` : h ? `${h} ч` : `${m} мин`;
}

export const pct = (score: number | null) => (score == null ? '—' : `${Math.round(score * 100)}%`);
