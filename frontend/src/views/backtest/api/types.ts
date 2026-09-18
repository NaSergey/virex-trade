import type { TagItem } from '@/entities/tag';
import type { Direction } from '../lib/fills';

export type { Direction };
export type ExitReason = 'stop' | 'take' | 'manual' | 'finish' | 'limit';

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

/** Одно исполнение на вход — открытие сделки или добор сеткой (см. entries
 * ниже). entryPrice/entryTime сделки — усреднённый итог; отдельная стрелка на
 * графике под каждый реальный вход рисуется по этому списку, а не по ним. */
export interface BacktestTradeEntry {
  id: string;
  qty: number;
  price: number;
  time: string;
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
  leverage: number;
  closedQty: number;
  exitTime: string | null;
  exitPrice: number | null;
  exitReason: ExitReason | null;
  fee: number | null;
  pnl: number | null;
  r: number | null;
  tags: TagItem[];
  /** По времени входа — то же, что задаёт порядок стрелок на графике. */
  entries: BacktestTradeEntry[];
}

export interface BacktestCloseOrder {
  id: string;
  tradeId: string;
  price: number;
  qty: number;
  createdAt: string;
}

/** Уровень сетки на вход (Scaled order) — до срабатывания цены сделки ещё нет,
 * поэтому строка привязана к сессии и направлению, а не к tradeId. */
export interface BacktestEntryOrder {
  id: string;
  sessionId: string;
  direction: Direction;
  price: number;
  riskPct: number;
  stopLoss: number;
  takeProfit: number | null;
  leverage: number;
  createdAt: string;
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
  closeOrders: BacktestCloseOrder[];
  entryOrders: BacktestEntryOrder[];
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
