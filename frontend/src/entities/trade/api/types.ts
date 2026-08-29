// ── Closed trades (synced from Bybit closed-pnl) + statistics ──
export interface Trade {
  id: string;
  symbol: string;
  side: 'Buy' | 'Sell';
  direction: 'long' | 'short';
  qty: number;
  avgEntryPrice: number;
  avgExitPrice: number;
  closedPnl: number;
  openFee: number;
  closeFee: number;
  leverage: number | null;
  orderId: string;
  closedAt: string;
  openedAt: string | null; // approximate entry time (null for pre-feature trades)
  createdAt: string;
  // Из скольких закрывающих ордеров собрана позиция (1 = закрыта разом).
  parts: number;
  tags?: Array<{ id: string; name: string; color: string }>;
  // Снимок рынка на входе: null — контекст этой сделки ещё не посчитан
  // (у старых сделок его может не быть вовсе), ok === false — у символа не
  // хватило истории свечей.
  context?: TradeContext | null;
}

/** Каким был рынок в момент входа — то, что показывает раскрытая запись журнала. */
export interface TradeContext {
  ok: boolean;
  // basis и rsi отдаёт только /api/trades: Выборка присылает тот же снимок,
  // но без служебной привязки к моменту и без RSI — их там нечем показывать.
  basis?: 'opened' | 'closed';
  rsi?: number | null;
  atrPct: number | null;
  volRel: number | null;
  ema200Above: boolean | null;
  trend4h: string | null;
  rangePos15m: number | null;
  rangePos30m: number | null;
  rangePos1h: number | null;
  rangePos4h: number | null;
  rangePos1d: number | null;
}

// Один ордер раскрытой сделки: филлы биржи, сгруппированные по orderId.
export interface TradeOrder {
  orderId: string;
  side: 'Buy' | 'Sell';
  kind: 'entry' | 'exit';
  qty: number;
  avgPrice: number;
  value: number; // объём в USDT (qty * avgPrice)
  fills: number; // сколько исполнений биржа сделала по этому ордеру
  time: string;
  execTypes: string[]; // 'Trade' | 'BustTrade' (ликвидация) | 'AdlTrade' | ...
  pnl: number | null; // только у закрывающих
  fee: number | null; // комиссия закрытия
}

// ── Range-check: всё, чтобы проверить «диапазон входа» глазами на графике ──
export interface RangeCheckCandle {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
}

// 15m/30m — только для просмотра: в базе по ним ничего не хранится и «Выборка»
// по ним не фильтрует.
export const RANGE_TFS = ['15m', '30m', '1h', '4h', '1d'] as const;
export type RangeTf = (typeof RANGE_TFS)[number];

export interface RangeCheckResponse {
  success: boolean;
  symbol: string;
  direction: 'long' | 'short';
  timeframe: RangeTf;
  candles: RangeCheckCandle[];
  window: {
    candles: number; // сколько свечей реально попало в окно
    expected: number; // сколько должно было
    low: number | null;
    high: number | null;
    fromTime: number | null;
    toTime: number;
  };
  // barTime — время свечи, содержащей момент: маркер на «межсвечном» времени
  // на «межсвечном» времени маркер поставить некуда.
  // basis — насколько точно известно время входа: 'filled' — из истории
  // исполнений (точно), 'opened' — по первому появлению позиции в синке
  // (приблизительно), 'closed' — неизвестно, окно привязано к выходу.
  entry: {
    price: number;
    time: number;
    barTime: number | null;
    basis: 'filled' | 'opened' | 'closed';
  };
  exit: { price: number; time: number; barTime: number | null };
  closedPnl: number;
  stored: number | null; // что лежит в базе
  recomputed: number | null; // что даёт та же формула по нарисованным свечам
}

export interface TradeStats {
  totalTrades: number;
  totalPnl: number;
  totalFees: number;
  wins: number;
  losses: number;
  winRate: number;
  grossProfit: number;
  grossLoss: number;
  profitFactor: number;
  avgPnl: number;
  bestPnl: number;
  worstPnl: number;
  /** System Quality Number (Van Tharp). null — меньше 30 сделок или нулевая дисперсия P&L. */
  sqn: number | null;
}

export interface EquityPoint {
  time: number; // unix seconds
  value: number; // cumulative realized PnL
}

export interface TradesPage {
  success: boolean;
  trades: Trade[];
  total: number;
  page: number;
  pageSize: number;
}

// ── Time-of-day / weekday / hold-duration statistics ──
export interface TimeBucket {
  trades: number;
  wins: number;
  losses: number;
  totalPnl: number;
  winRate: number; // 0..100
}

export interface TimeStatsResponse {
  success: boolean;
  totalTrades: number;
  byWeekday: TimeBucket[]; // index = JS getDay(): 0 = воскресенье
  byHour: TimeBucket[]; // 24 buckets, user-local clock
  duration: {
    withOpenedAt: number; // trades that actually carry an entry time
    avgHoldMin: number;
    avgWinHoldMin: number;
    avgLossHoldMin: number;
  };
}

// Entry/exit fill marker for the candlestick chart (one per order).
export interface ExecMarker {
  orderId: string;
  time: number; // unix seconds
  price: number;
  side: 'Buy' | 'Sell';
  qty: number;
  isClose: boolean; // exit (closed part of a position) vs entry
}

// ── Instrument info (lot size, price tick, leverage range) ──
export interface InstrumentInfo {
  success: boolean;
  symbol: string;
  leverageFilter?: { minLeverage: string; maxLeverage: string; leverageStep: string };
  lotSizeFilter?: { minOrderQty: string; maxOrderQty: string; qtyStep: string; minNotionalValue?: string };
  priceFilter?: { minPrice: string; maxPrice: string; tickSize: string };
  error?: string;
}

// ── Habits: диагностика поведения без тегов ("Цена привычек") ──
export type HabitKind =
  | 'tilt'
  | 'overtrading'
  | 'size_up'
  | 'size_up_after_loss'
  | 'hold_long'
  | 'dir'
  | 'hour'
  | 'weekday'
  | 'session'
  | 'trend4h'
  | 'ema200'
  | 'atr'
  | 'vol'
  | 'range4h'
  | 'tag'
  | 'symbol';

export interface Habit {
  key: string;
  group: 'behaviour' | 'time' | 'context' | 'tag' | 'symbol';
  kind: HabitKind;
  params: Record<string, string | number>;
  // Сырые русские текст с бэкенда — запасной вариант для незнакомого kind,
  // см. habit-labels.ts.
  label: string;
  advice: string;
  n: number;
  nRest: number;
  avgPnl: number;
  avgRest: number;
  lift: number;
  cost: number;
  absolute: number;
  winRate: number;
  winRateRest: number;
  p: number;
  confidence: 'confirmed' | 'likely';
  outlierSafe: boolean;
  oos: 'pass' | 'fail' | 'na';
  // Query-параметры /api/trades/lab — открывают этот срез в Аналитике. null у
  // поведенческих привычек (tilt/overtrading/…) — там нечего фильтровать.
  lab: Record<string, string> | null;
}

export interface HabitsResponse {
  success: boolean;
  status: 'need_more' | 'ok';
  positions: number;
  need?: number; // только при status: 'need_more'
  tested?: number; // только при status: 'ok'
  totalCost: number;
  habits: Habit[];
  edges: Habit[];
  all: Habit[];
}
