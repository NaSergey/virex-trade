/**
 * Время плана — местное время владельца, а сервер живёт в UTC. Всё, что
 * зависит от «сейчас», считается здесь по поясу из настроек, без библиотек:
 * `Intl.DateTimeFormat` с `timeZone` знает переходы на летнее время сам.
 */

export const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
export const DAY_MINUTES = 24 * 60;

export interface LocalNow {
  /** Местная дата `YYYY-MM-DD`. */
  day: string;
  /** Минута суток, 0…1439. */
  min: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterOf(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    formatters.set(tz, f);
  }
  return f;
}

/** Пояс, который знает среда исполнения. Незнакомый — отказ, а не тихий UTC. */
export function isValidTz(tz: string): boolean {
  try {
    formatterOf(tz);
    return true;
  } catch {
    return false;
  }
}

export function localNow(tz: string, at: Date = new Date()): LocalNow {
  const parts = Object.fromEntries(
    formatterOf(tz)
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  return {
    day: `${parts.year}-${parts.month}-${parts.day}`,
    min: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

/** Дата со сдвигом на n дней — арифметика по календарю, без пояса. */
export function addDays(day: string, n: number): string {
  const t =
    Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10)) +
    n * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/** День недели 0…6, понедельник — 0 (бит `1 << weekday` в `PlanBlock.days`). */
export function weekdayOf(day: string): number {
  const d = new Date(`${day}T00:00:00Z`).getUTCDay();
  return (d + 6) % 7;
}

export const hasDay = (mask: number, day: string) =>
  (mask & (1 << weekdayOf(day))) !== 0;

export const hhmm = (min: number) =>
  `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** Минута суток, в которую случился момент `at`, — для опоздания относительно начала блока. */
export function minuteOfDay(tz: string, day: string, at: Date): number {
  const local = localNow(tz, at);
  if (local.day === day) return local.min;
  return local.day < day ? 0 : DAY_MINUTES + local.min;
}
