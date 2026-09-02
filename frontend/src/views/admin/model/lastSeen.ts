/**
 * Сколько ЦЕЛЫХ календарных суток прошло с последнего захода. null — не заходил
 * ни разу.
 *
 * Календарных, а не «по 24 часа»: вчерашние 23:50 — это «вчера», а не «сегодня,
 * десять минут назад», и владелец, глядя на список, читает именно календарь.
 * Границы берутся локальные — тот же день, что у человека на часах.
 */
export function calendarDaysAgo(iso: string | null | undefined, now = new Date()): number | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;

  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(at)) / 86_400_000);
  // Будущая дата (часы клиента отстали) — это всё равно «сегодня», а не
  // «минус один день назад».
  return Math.max(0, days);
}
