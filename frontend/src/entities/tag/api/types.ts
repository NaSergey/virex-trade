// Journal categories: setups (entry reasons) vs emotions/mistakes — the stats
// page groups tags by these so "what wins" and "what my mistakes cost" read
// separately.
export const TAG_TYPES = ['setup', 'emotion', 'mistake'] as const;
export type TagType = (typeof TAG_TYPES)[number];
export const TAG_TYPE_LABELS: Record<TagType, string> = {
  setup: 'Сетап',
  emotion: 'Эмоция',
  mistake: 'Ошибка',
};

export interface TagItem {
  id: string;
  name: string;
  color: string;
  type?: TagType;
  createdAt?: string;
  tradesCount?: number;
}

/** Long-only / short-only slice of a tag bucket. */
export interface TagSideAgg {
  trades: number;
  wins: number;
  losses: number;
  totalPnl: number;
  winRate: number; // 0..100
}

export interface TagBucket {
  id: string | null;
  name: string;
  color: string;
  type: TagType | null; // null for the untagged bucket
  trades: number;
  wins: number;
  losses: number;
  totalPnl: number;
  grossProfit: number;
  grossLoss: number;
  avgPnl: number;
  avgWin: number;
  avgLoss: number; // ≤ 0
  profitFactor: number; // 0 when the tag has no losses yet
  winRate: number; // 0..100
  wilsonLow: number; // 0..100, 95% lower confidence bound on winrate
  long: TagSideAgg;
  short: TagSideAgg;
  equity: Array<{ time: number; value: number }>; // cumulative PnL sparkline
}

export interface TagStatsResponse {
  success: boolean;
  totalTrades: number;
  tags: TagBucket[];
  untagged: TagBucket;
}

export interface TagComboBucket {
  tagIds: string[];
  tagNames: string[];
  colors: string[];
  trades: number;
  wins: number;
  losses: number;
  totalPnl: number;
  avgPnl: number;
  winRate: number; // 0..100
  wilsonLow: number; // 0..100
}

/** User-composed pinned combo: counts trades CONTAINING all its tags. */
export interface SavedComboBucket extends TagComboBucket {
  id: string;
  pinned: boolean;
}

export interface TagComboStatsResponse {
  success: boolean;
  totalTrades: number;
  combos: TagComboBucket[];
  saved: SavedComboBucket[];
}
