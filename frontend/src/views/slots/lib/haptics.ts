/**
 * Вибрация телефона на событиях автомата: удар барабана, выигрыш, ступень
 * крупного выигрыша. Где её нет (десктоп, iOS Safari), вызов молчит.
 * Под `prefers-reduced-motion` — тоже молчит.
 */
export function buzz(pattern: number | number[]) {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // Браузер без жеста пользователя вибрацию не даёт — это не ошибка игры.
  }
}
