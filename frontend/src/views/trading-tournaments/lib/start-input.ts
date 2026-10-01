/**
 * Время старта в форме нового турнира — поле `datetime-local`, то есть
 * местное время браузера без пояса. На сервер оно уходит ISO (`toISOString`),
 * и границы там проверяются ещё раз (`startTimeFrom`).
 */

const MINUTE_MS = 60_000;
const STEP_MS = 5 * MINUTE_MS;

/**
 * Запас в форме — две минуты, а не минута, как на сервере: сервер отбрасывает
 * секунды, и «через 61 секунду» у него превращается в «через 0:01».
 */
const LEAD_MS = 2 * MINUTE_MS;
const MAX_MS = 30 * 24 * 60 * MINUTE_MS;

const pad = (n: number) => String(n).padStart(2, '0');

/** Значение поля `datetime-local` для момента `ms` в поясе браузера. */
export function localInputValue(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Что подставить сразу: через час, вверх до пяти минут — круглое время легче назвать другу. */
export function defaultStartInput(now: number): string {
  return localInputValue(Math.ceil((now + 60 * MINUTE_MS) / STEP_MS) * STEP_MS);
}

/** Самое раннее, что поле разрешит выбрать (`min`). */
export function earliestStartInput(now: number): string {
  return localInputValue(Math.ceil((now + LEAD_MS) / MINUTE_MS) * MINUTE_MS);
}

export function startInputOk(value: string, now: number): boolean {
  const t = new Date(value).getTime();
  return Number.isFinite(t) && t >= now + LEAD_MS && t <= now + MAX_MS;
}
