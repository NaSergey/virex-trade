import type { TagItem } from '@/entities/tag';
import type { Direction } from '../lib/fills';

export type { Direction };
export type ExitReason = 'stop' | 'take' | 'manual' | 'finish' | 'limit';

/**
 * Откуда свечи сессии: отрезок истории BTC, сгенерированный рынок тренажёра
 * или живой рынок в эфире (цену и время ставит сервер, уровни исполняет он же).
 */
export type DataSource = 'real' | 'synthetic' | 'live';

/** Статистика бектеста: эфир считается вместе с реальной историей — это тот же рынок. */
export type StatsSource = Exclude<DataSource, 'live'>;

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
  dataSource: DataSource;
  status: 'active' | 'finished';
  createdAt: string;
  finishedAt: string | null;
  /** Турнирная сессия: id турнира и его граница. У обычной — null. */
  tournamentId: string | null;
  endTime: string | null;
}

/**
 * Турнир сессии — рядом с ней, а не внутри: терминалу нужны только эти поля.
 * `mode: 'live'` означает, что цены и время ставит сервер, а браузер не
 * проверяет срабатывания — их исполняет серверный движок.
 */
export interface SessionTournament {
  id: string;
  name: string;
  mode: string;
  status: 'lobby' | 'running' | 'finished';
  endsAt: string | null;
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
  /** Монета сделки; не-BTC бывает только в эфире. */
  symbol: string;
  direction: Direction;
  entryTime: string;
  entryPrice: number;
  /** У сделки сессии стоп есть всегда; 0 — стопа нет (позиция биржи, открытая мимо терминала). */
  stopLoss: number;
  takeProfit: number | null;
  riskPct: number;
  riskUsdt: number;
  qty: number;
  leverage: number;
  closedQty: number;
  /** Стоп за тейками — ставит сетка фиксации; двигает стоп сервер. */
  stopFollow: boolean;
  exitTime: string | null;
  exitPrice: number | null;
  exitReason: ExitReason | null;
  fee: number | null;
  pnl: number | null;
  r: number | null;
  tags: TagItem[];
  /** По времени входа — то же, что задаёт порядок стрелок на графике. */
  entries: BacktestTradeEntry[];
  /**
   * Цена ликвидации, как её сообщает биржа, — только у позиции биржевого
   * терминала; null — биржа её не называет. У сделки сессии поля нет, и цена
   * считается по упрощённой формуле (`liquidationPrice`).
   */
  liqPrice?: number | null;
  /**
   * Маркировка и нереализованный результат позиции, как их сообщает биржа, —
   * только у позиции биржевого терминала (null — биржа не назвала); у сделки
   * сессии полей нет. Наличие поля и переключает `openPnl` на формулу биржи:
   * число обязано совпадать с тем, что человек видит на бирже.
   */
  markPrice?: number | null;
  unrealisedPnl?: number | null;
}

/**
 * Что окнам позиции (уровни, закрытие) нужно от сделки. Биржевой терминал
 * отдаёт им позицию биржи в этой же форме: окна одни на оба терминала.
 * `stopLoss: 0` — стопа у позиции нет (у сделки бектеста он есть всегда).
 */
export type PositionLike = Pick<BacktestTrade, 'symbol' | 'direction' | 'entryPrice' | 'stopLoss' | 'takeProfit'>;

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
  symbol: string;
  direction: Direction;
  price: number;
  riskPct: number;
  stopLoss: number;
  takeProfit: number | null;
  leverage: number;
  createdAt: string;
  /**
   * Объём ордера, если он уже зафиксирован, — так у лимита на бирже. У ордера
   * сессии поля нет: объём посчитает сервер на срабатывании, от риска и стопа.
   */
  qty?: number;
}

/**
 * Монета эфира, как её отдаёт `/api/market-data/live/symbols`: список живёт на
 * сервере, своей копии фронт не держит. `decimals` — шаг цены монеты.
 */
export interface LiveSymbol {
  symbol: string;
  base: string;
  decimals: number;
}

/** Монета истории и тренажёра — единственная, и с неё же начинается график эфира. */
export const DEFAULT_SYMBOL = 'BTCUSDT';

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
  /** Не null — сессия турнира; см. `SessionTournament`. */
  tournament: SessionTournament | null;
  /** Тренажёр прежней версии генератора: графика нет, сессию можно только завершить. */
  synthOutdated: boolean;
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
