import type { MoneyBlock } from './report.types';
import { thin } from './stats';

/** Счёт и риск — как в примерах видео 2. */
export const START = 1000;
export const RISK = 0.01;

export interface MoneyTrade {
  rNet: number;
  /** Риск сделки в долях цены (дистанция до стопа к цене входа). */
  stopPct: number;
}

function run(
  trades: MoneyTrade[],
  pnlOf: (t: MoneyTrade, eq: number) => number,
  start: number,
): MoneyBlock {
  let eq = start;
  let peak = start;
  let maxDd = 0;
  let worst = 0;
  const curve = [start];
  for (const t of trades) {
    if (eq <= 0) break;
    const pnl = pnlOf(t, eq);
    worst = Math.min(worst, pnl / eq);
    eq = Math.max(0, eq + pnl);
    peak = Math.max(peak, eq);
    maxDd = Math.max(maxDd, 1 - eq / peak);
    curve.push(eq);
  }
  return { start, final: eq, maxDd, worstTrade: worst, equity: thin(curve) };
}

/** С теорией: риск — 1 % текущего счёта, объём от стопа. */
export const withTheory = (
  trades: MoneyTrade[],
  start = START,
  risk = RISK,
): MoneyBlock => run(trades, (t, eq) => t.rNet * risk * eq, start);

/** Без теории: одинаковый объём позиции, без поправки на стоп и на счёт. */
export const withoutTheory = (
  trades: MoneyTrade[],
  notional: number,
  start = START,
): MoneyBlock => run(trades, (t) => t.rNet * notional * t.stopPct, start);

/** Объём «без теории»: на медианном стопе — тот же риск, что «с теорией» на старте. */
export function plainNotional(
  trades: MoneyTrade[],
  start = START,
  risk = RISK,
): number {
  const stops = trades.map((t) => t.stopPct).sort((a, b) => a - b);
  const median = stops.length ? stops[Math.floor(stops.length / 2)] : 0;
  return median > 0 ? (start * risk) / median : 0;
}
