import type { OddsBlock, OddsCheck, OddsSide, TradeRow } from './report.types';
import { summarize } from './stats';
import { effectOf } from './learning';

/** Меньше прошлых сделок — оценки нет. */
export const MIN_ODDS_N = 30;
/** Шортов среди взятых сделок — не больше этой доли (решение владельца: 70/30). */
export const SHORT_SHARE = 0.3;

/**
 * Вероятность успеха сделки на свече подтверждения: доля прибыльных среди
 * прошлых сделок той же стороны, закрытых до неё, с той же дневной структурой
 * (меньше MIN_ODDS_N — вся сторона); рядом — безубыточный винрейт той же выборки
 * и доля прибыльных всей стороны.
 */
export function judge(t: TradeRow, history: TradeRow[]): OddsCheck | null {
  const closed = history.filter(
    (x) => x.dir === t.dir && x.exitMs < t.confirmMs,
  );
  const same = closed.filter((x) => x.features.daily === t.features.daily);
  const pool = same.length >= MIN_ODDS_N ? same : closed;
  if (pool.length < MIN_ODDS_N) return null;
  const s = summarize(pool.map((x) => x.rNet));
  return {
    p: s.winrate,
    needed: s.breakeven,
    n: pool.length,
    sideP: summarize(closed.map((x) => x.rNet)).winrate,
  };
}

export interface OddsResult {
  /** Взятые сделки: одна позиция за раз, по времени входа. */
  system: TradeRow[];
  /** Шорты, пропущенные слабой оценкой или квотой. */
  skipped: TradeRow[];
  block: OddsBlock;
}

/**
 * Отбор сделок системы: лонги берутся все; шорт — только если его вероятность не
 * слабее своей стороны и шортов среди взятых не станет больше 30 %. Вход на
 * открытую позицию не рассматривается. `history` — исходы всех исполненных
 * сетапов, в том числе пропущенных: по ним идёт оценка.
 */
export function selectSystem(
  candidates: TradeRow[],
  history: TradeRow[],
): OddsResult {
  const system: TradeRow[] = [];
  const skipped: TradeRow[] = [];
  const count = { long: 0, short: 0 };
  const seen = {
    long: { considered: 0, skipped: 0, unjudged: 0 },
    short: { considered: 0, skipped: 0, unjudged: 0 },
  };
  let freeAt = -Infinity;
  const sorted = [...candidates].sort((a, b) => a.fillMs - b.fillMs);
  for (const t of sorted) {
    if (t.fillMs < freeAt) continue;
    const odds = judge(t, history);
    const row = { ...t, odds };
    const side = t.dir === 1 ? 'long' : 'short';
    seen[side].considered++;
    if (!odds) seen[side].unjudged++;
    if (t.dir === -1) {
      const weak = odds !== null && odds.p < odds.sideP;
      const over =
        (count.short + 1) / (count.long + count.short + 1) > SHORT_SHARE;
      if (weak || over) {
        skipped.push(row);
        seen.short.skipped++;
        continue;
      }
    }
    system.push(row);
    count[side]++;
    freeAt = t.exitMs;
  }
  const sideOf = (k: 'long' | 'short', dir: 1 | -1): OddsSide => ({
    ...seen[k],
    taken: count[k],
    summary: summarize(system.filter((t) => t.dir === dir).map((t) => t.rNet)),
  });
  const taken = count.long + count.short;
  return {
    system,
    skipped,
    block: {
      long: sideOf('long', 1),
      short: sideOf('short', -1),
      longShare: taken ? count.long / taken : 0,
      effect: effectOf(skipped.map((t) => t.rNet)),
    },
  };
}
