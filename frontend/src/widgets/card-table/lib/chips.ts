/**
 * Номиналы фишек — по цвету, как в любом казино: по стопке видно порядок
 * суммы раньше, чем прочитано число. Цвета — шкала от светлой к «тяжёлой»:
 * белая 1, красная 5, зелёная 25, чёрная 100, фиолетовая 500, золотая 1000.
 */
export const DENOMS = [1000, 500, 100, 25, 5, 1] as const;
export type Denom = (typeof DENOMS)[number];

/** Сколько фишек рисуется в одной стопке — дальше она перестаёт читаться. */
export const MAX_STACK = 5;

/**
 * Сумма → фишки снизу вверх: крупные внизу, как их кладёт крупье. Жадно по
 * номиналам; стопка обрезается сверху — мелочь не видна, но старшие номиналы,
 * по которым читается порядок суммы, остаются.
 */
export function chipsFor(amount: number, max = MAX_STACK): Denom[] {
  const out: Denom[] = [];
  let rest = Math.max(0, Math.floor(amount));
  for (const d of DENOMS) {
    while (rest >= d && out.length < max) {
      out.push(d);
      rest -= d;
    }
  }
  return out;
}
