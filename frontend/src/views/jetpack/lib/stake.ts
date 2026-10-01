/**
 * Сумма ставки в панели: шаг кнопками − / + и быстрые суммы. Чистые функции —
 * лимиты приходят с сервера (`view.limits`), здесь только арифметика.
 */

/** Круглые суммы 1-2-5 до `max`: по ним шагают − и +. */
function ladder(max: number) {
  const out: number[] = [];
  for (let p = 1; p <= max; p *= 10) {
    for (const m of [1, 2, 5]) if (m * p <= max) out.push(m * p);
  }
  return out;
}

/**
 * Следующая круглая сумма в сторону шага. С некруглой — к ближайшей круглой:
 * из 37 «+» даёт 50, «−» — 20. Шаг на ±1 от тысячи был бы бесполезен, удвоение
 * от 1 — слишком грубо для мелких ставок. Пустое поле — к минимуму.
 */
export function stepBet(n: number, dir: 1 | -1, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  const steps = ladder(max);
  const next = dir > 0 ? steps.find((s) => s > n) : [...steps].reverse().find((s) => s < n);
  const v = next ?? (dir > 0 ? max : min);
  return Math.min(max, Math.max(min, v));
}

/** Быстрые суммы под полем — для стартовой тысячи монет; вне лимитов не показываются. */
const CHIPS = [10, 50, 100, 500];
export const chipsFor = (min: number, max: number) => CHIPS.filter((c) => c >= min && c <= max);

/** Подпись быстрой суммы: тысячи — буквой K, как на кнопке, где места на три знака. */
export const chipLabel = (n: number) => (n >= 1000 ? `${n / 1000}K` : String(n));
