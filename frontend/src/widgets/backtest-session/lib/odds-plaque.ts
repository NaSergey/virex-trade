import { RSI_DEFAULTS, type Divergence } from './rsi';

/** Свежесть дивергенции — горизонт исхода частот на сервере: позже её исход уже решился. */
export const FRESH_BARS = 20;

/**
 * Последняя дивергенция графика, подтверждённая не больше FRESH_BARS свечей
 * назад; `last` — индекс последней свечи. Подтверждение — `to + rightBars`, как
 * у событий, по которым сервер считал частоты.
 */
export function freshDivergence(divs: readonly Divergence[], last: number): { kind: 'bull' | 'bear'; ago: number } | null {
  const d = divs.at(-1);
  if (!d) return null;
  const ago = last - (d.to + RSI_DEFAULTS.rightBars);
  return ago >= 0 && ago <= FRESH_BARS ? { kind: d.kind, ago } : null;
}
