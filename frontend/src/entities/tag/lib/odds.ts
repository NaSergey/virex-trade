import { wilson } from '@/shared/lib/utils/confidence';

export type TagVerdict = 'plus' | 'minus' | 'unclear';

export interface TagOdds {
  n: number;
  /** 0..100. */
  winRate: number;
  /** Винрейт безубыточности тега, 0..100. */
  need: number;
  verdict: TagVerdict;
}

/**
 * Винрейт тега против его безубыточности (спека 2026-10-25): «нужно» — средний
 * убыток / (средняя прибыль + средний убыток); вывод — по 95 % интервалу
 * Вильсона: весь выше «нужно» — в плюсе, весь ниже — в минусе, иначе не ясно.
 * Средние — модули, в USDT (журнал) или R (бектест). Сделок нет — null.
 */
export function tagOddsOf({
  trades,
  wins,
  avgWin,
  avgLoss,
}: {
  trades: number;
  wins: number;
  avgWin: number;
  avgLoss: number;
}): TagOdds | null {
  if (trades <= 0) return null;
  const w = Math.abs(avgWin);
  const l = Math.abs(avgLoss);
  const need = w + l > 0 ? (l / (w + l)) * 100 : 50;
  const { low, high } = wilson(wins, trades);
  const verdict: TagVerdict = low > need ? 'plus' : high < need ? 'minus' : 'unclear';
  return { n: trades, winRate: (wins / trades) * 100, need, verdict };
}
