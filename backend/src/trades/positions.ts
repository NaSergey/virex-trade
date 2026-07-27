/**
 * Collapses Bybit's per-closing-order rows into the positions a trader
 * actually took.
 *
 * Bybit's closed-pnl emits one row per closing ORDER, so scaling out of a
 * position in three parts stored three rows and every aggregate counted three
 * trades. That inflates the trade count and biases winrate upward, because
 * partial exits are overwhelmingly taken in profit while losses get closed in
 * one go. TradeSyncService/PositionBuilderService stamp the rows of one
 * position with a shared `positionId`; this turns that grouping into the row
 * shape the aggregates already expect, so they can stay otherwise unchanged.
 *
 * Rows without a positionId (not reconstructed yet — e.g. the exchange hasn't
 * returned their fills) each stay their own position, which is exactly the old
 * behaviour and keeps totals complete.
 */

/** Сторона позиции, которую двигает филл. */
export type PositionSide = 'long' | 'short';

/** Минимум полей филла, нужный для восстановления границ позиции. */
export interface FillLike {
  side: string; // 'Buy' | 'Sell'
  qty: number;
  closedSize: number; // сколько этот филл закрыл (0 — чистое открытие/усреднение)
}

/**
 * Как один филл двигает лонговую и шортовую стороны — по отдельности.
 *
 * Считать один общий размер по символу нельзя: в хэдж-режиме лонг и шорт по
 * одной монете живут одновременно и в такой арифметике взаимно гасятся —
 * позиция «закрывается» на филле чужой стороны, и обе склеиваются в одну
 * (её P&L и число сделок тогда врут).
 *
 * Разделить стороны хватает `closedSize`, без positionIdx с биржи: филл
 * открывает СВОЮ сторону (Buy → лонг, Sell → шорт) и закрывает
 * ПРОТИВОПОЛОЖНУЮ. Переворот одним ордером (closedSize < qty) раскладывается
 * на обе части — поэтому closing/opening считаются отдельно, а не по флагу.
 */
export function fillDelta(f: FillLike): Record<PositionSide, number> {
  const closing = Math.min(Math.max(f.closedSize, 0), f.qty);
  const opening = f.qty - closing;
  return f.side === 'Buy'
    ? { long: opening, short: -closing }
    : { long: -closing, short: opening };
}

/** The trade columns every aggregate reads. Structural so callers can pass richer rows. */
export interface TradeRowLike {
  id: string;
  positionId: string | null;
  symbol: string;
  direction: string;
  qty: number;
  avgEntryPrice: number;
  avgExitPrice: number;
  closedPnl: number;
  openFee: number;
  closeFee: number;
  leverage: number | null;
  closedAt: Date;
  openedAt: Date | null;
}

export type PositionRow<T extends TradeRowLike> = T & {
  /** How many closing orders this position was built from (1 = closed in one go). */
  parts: number;
  /** Ids of every underlying trade row, for callers that need to drill down. */
  tradeIds: string[];
};

/**
 * Group rows sharing a positionId into one row each.
 *
 * Money and size add up; prices become size-weighted averages; `closedAt` is
 * the final exit and `openedAt` the earliest known entry. Every other field is
 * taken from the FIRST part — for `context` (the market snapshot at entry) that
 * is the meaningful one, and symbol/direction/leverage are identical across
 * parts anyway.
 *
 * Order is preserved by each position's first appearance, so a caller that
 * sorted by closedAt ascending gets positions in entry order.
 */
export function collapseToPositions<T extends TradeRowLike>(
  rows: T[],
): PositionRow<T>[] {
  const byPosition = new Map<string, T[]>();
  const order: string[] = [];
  for (const r of rows) {
    // Fall back to the row's own id so an ungrouped row is a position of one.
    const key = r.positionId ?? `trade:${r.id}`;
    const group = byPosition.get(key);
    if (group) group.push(r);
    else {
      byPosition.set(key, [r]);
      order.push(key);
    }
  }

  return order.map((key) => {
    const parts = byPosition.get(key)!;
    const first = parts[0];
    if (parts.length === 1) {
      return { ...first, parts: 1, tradeIds: [first.id] };
    }

    let qty = 0;
    let entryValue = 0;
    let exitValue = 0;
    let closedPnl = 0;
    let openFee = 0;
    let closeFee = 0;
    let closedAt = parts[0].closedAt;
    let openedAt: Date | null = null;
    for (const p of parts) {
      qty += p.qty;
      entryValue += p.avgEntryPrice * p.qty;
      exitValue += p.avgExitPrice * p.qty;
      closedPnl += p.closedPnl;
      openFee += p.openFee;
      closeFee += p.closeFee;
      if (p.closedAt > closedAt) closedAt = p.closedAt;
      if (p.openedAt && (!openedAt || p.openedAt < openedAt))
        openedAt = p.openedAt;
    }

    return {
      ...first,
      qty,
      // Guard against a zero-size group so a bad row can't produce NaN prices.
      avgEntryPrice: qty > 0 ? entryValue / qty : first.avgEntryPrice,
      avgExitPrice: qty > 0 ? exitValue / qty : first.avgExitPrice,
      closedPnl,
      openFee,
      closeFee,
      closedAt,
      openedAt,
      ...(mergeTags(parts) ?? {}),
      parts: parts.length,
      tradeIds: parts.map((p) => p.id),
    };
  });
}

/**
 * Union of the tags across a position's parts, when the caller included them.
 *
 * Parts of one position can carry different tags — tagging the first exit
 * "Дивер" and a later one "Б/У" describes the same position, so the position
 * belongs in both buckets. Taking only the first part's tags would silently
 * drop the rest.
 */
function mergeTags<T extends TradeRowLike>(
  parts: T[],
): { tags: unknown[] } | null {
  const withTags = parts as unknown as {
    tags?: { tagId?: string; tag?: { id: string } }[];
  }[];
  if (!Array.isArray(withTags[0]?.tags)) return null;
  const seen = new Set<string>();
  const merged: unknown[] = [];
  for (const p of withTags) {
    for (const tt of p.tags ?? []) {
      const id = tt.tagId ?? tt.tag?.id;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      merged.push(tt);
    }
  }
  return { tags: merged };
}
