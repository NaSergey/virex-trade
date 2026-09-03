/**
 * Тихие часы — 23:00–08:00 по Москве. Пояс зашит константой: поля таймзоны у
 * пользователя нет, а заводить его ради одного окна и одного отчёта рано.
 * Часовой пояс без перехода на летнее время, поэтому сдвига достаточно.
 */
export const MSK_OFFSET_MS = 3 * 3_600_000;

const QUIET_FROM_HOUR = 23;
const QUIET_TO_HOUR = 8;

export const mskHour = (now: Date): number =>
  new Date(now.getTime() + MSK_OFFSET_MS).getUTCHours();

export const isQuietNow = (now: Date = new Date()): boolean => {
  const h = mskHour(now);
  // Окно перешагивает полночь, поэтому это ИЛИ, а не диапазон.
  return h >= QUIET_FROM_HOUR || h < QUIET_TO_HOUR;
};
