/** Пресеты рейза — доли банка, как на панели любого клиента. */
export const RAISE_PRESETS = [0.3, 0.5, 1, 1.4] as const;

/**
 * Рейз «на долю банка»: сначала уравнять, потом добавить долю от банка после
 * колла. Результат зажимается в допустимую вилку.
 */
export function presetRaiseTo(
  pct: number,
  opts: { pot: number; bets: number; toCall: number; currentBet: number; min: number; max: number },
): number {
  const potAfterCall = opts.pot + opts.bets + opts.toCall;
  const to = opts.currentBet + Math.round(potAfterCall * pct);
  return Math.min(opts.max, Math.max(opts.min, to));
}
