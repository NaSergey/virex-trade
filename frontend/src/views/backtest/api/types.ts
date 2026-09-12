import type { TagItem } from '@/entities/tag';
import type { Direction } from '../lib/fills';

export type { Direction };
export type ExitReason = 'stop' | 'take' | 'manual' | 'finish';

/** Как её отдаёт `/api/backtest/sessions*`. Цены везде настоящие, без масштаба показа. */
export interface BacktestSession {
  id: string;
  startTime: string;
  cursorTime: string;
  startBalance: number;
  balance: number;
  hideDate: boolean;
  hidePrice: boolean;
  priceScale: number;
  status: 'active' | 'finished';
  createdAt: string;
  finishedAt: string | null;
}

export interface BacktestTrade {
  id: string;
  sessionId: string;
  direction: Direction;
  entryTime: string;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number | null;
  riskPct: number;
  riskUsdt: number;
  qty: number;
  exitTime: string | null;
  exitPrice: number | null;
  exitReason: ExitReason | null;
  fee: number | null;
  pnl: number | null;
  r: number | null;
  tags: TagItem[];
}

export interface Summary {
  trades: number;
  wins: number;
  winRate: number;
  totalR: number;
  avgR: number;
  pnl: number;
}

export interface SessionDetail {
  session: BacktestSession;
  trades: BacktestTrade[];
  summary: Summary & { maxDrawdownPct: number };
}

export interface SessionListItem extends BacktestSession {
  summary: Summary;
}

export interface TagSummary extends Summary {
  tag: TagItem;
}

export interface BacktestStats {
  overall: Summary & { sessions: number };
  byTag: TagSummary[];
}
