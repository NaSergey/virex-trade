import type { OddsBlock, OddsCheck, OddsSide, TradeRow } from './report.types';
import { summarize } from './stats';
import { effectOf } from './learning';

/** Меньше прошлых сделок — оценки нет, сделка берётся. */
export const MIN_ODDS_N = 30;

/**
 * Вероятность успеха сделки на свече подтверждения: доля прибыльных среди
 * прошлых сделок той же стороны, закрытых до неё, с той же дневной структурой
 * (меньше MIN_ODDS_N — вся сторона), против безубыточного винрейта той же выборки.
 */
export function judge(t: TradeRow, all: TradeRow[]): OddsCheck | null {
  const closed = all.filter((x) => x.dir === t.dir && x.exitMs < t.confirmMs);
  const same = closed.filter((x) => x.features.daily === t.features.daily);
  const pool = same.length >= MIN_ODDS_N ? same : closed;
  if (pool.length < MIN_ODDS_N) return null;
  const s = summarize(pool.map((x) => x.rNet));
  return { p: s.winrate, needed: s.breakeven, n: pool.length };
}

export interface OddsResult {
  kept: TradeRow[];
  skipped: TradeRow[];
  block: OddsBlock;
}

/** Сделка с p < нужно пропускается — правило одно для лонгов и шортов. */
export function filterByOdds(trades: TradeRow[]): OddsResult {
  const kept: TradeRow[] = [];
  const skipped: TradeRow[] = [];
  const side = (): OddsSide => ({
    considered: 0,
    taken: 0,
    skipped: 0,
    unjudged: 0,
  });
  const long = side();
  const short = side();
  for (const t of trades) {
    const odds = judge(t, trades);
    const row = { ...t, odds };
    const s = t.dir === 1 ? long : short;
    s.considered++;
    if (!odds) s.unjudged++;
    if (!odds || odds.p >= odds.needed) {
      kept.push(row);
      s.taken++;
    } else {
      skipped.push(row);
      s.skipped++;
    }
  }
  const taken = long.taken + short.taken;
  return {
    kept,
    skipped,
    block: {
      long,
      short,
      longShare: taken ? long.taken / taken : 0,
      effect: effectOf(skipped.map((t) => t.rNet)),
    },
  };
}
