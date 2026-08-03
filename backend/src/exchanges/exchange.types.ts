/**
 * The contract every exchange integration implements.
 *
 * Everything downstream — trade sync, position reconstruction, the settings
 * page — talks to these normalized shapes rather than to any one exchange's
 * response format. Adding an exchange is therefore a new adapter plus a
 * catalog entry, with no changes to the sync pipeline.
 */

export type ExchangeId = 'bybit' | 'okx' | 'bitget' | 'kucoin' | 'gate' | 'binance' | 'mexc';

/** Per-user API credentials, decrypted just-in-time by CredentialsService. */
export interface ExchangeCredentials {
  apiKey: string;
  apiSecret: string;
  /** Third secret required by OKX/Bitget/KuCoin; absent for Bybit. */
  passphrase?: string;
}

/**
 * A position currently open on the exchange.
 *
 * Numbers stay decimal strings, as every exchange reports them — parsing them
 * to float here would round sizes and prices before they are ever displayed.
 * Everything past `size` is optional: it is what the positions table draws, and
 * an exchange that doesn't report a field simply leaves it out.
 */
export interface OpenPosition {
  symbol: string;
  direction: 'long' | 'short';
  /** '0' for a position the exchange briefly still reports after it closed. */
  size: string;
  avgPrice?: string;
  markPrice?: string;
  positionValue?: string;
  unrealisedPnl?: string;
  leverage?: string;
  liqPrice?: string;
  takeProfit?: string;
  stopLoss?: string;
}

/**
 * One realized-PnL record: the exchange's own accounting of a closing order,
 * already parsed into numbers. `raw` keeps the original payload for
 * forward-compat, exactly as the Bybit-only version stored it.
 */
export interface ClosedTrade {
  symbol: string;
  /** Closing order side — a long is closed by a Sell, a short by a Buy. */
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
  closedAt: Date;
  raw: unknown;
}

/**
 * One fill from execution history. Only fills that move position size belong
 * here — funding rows carry a qty as well and would corrupt the running size
 * PositionBuilderService walks, so adapters drop them.
 */
export interface Fill {
  symbol: string;
  side: 'Buy' | 'Sell';
  qty: number;
  price: number;
  /** 0 on opening/averaging-in fills, > 0 on closing fills. */
  closedSize: number;
  execType: string;
  orderId: string;
  execId: string;
  execTime: Date;
}

/** One fill aggregated per order — for entry/exit markers on the chart. */
export interface ExecMarker {
  orderId: string;
  time: number; // unix seconds (last fill of the order)
  price: number; // value-weighted average fill price
  side: 'Buy' | 'Sell';
  qty: number; // total filled qty for the order
  isClose: boolean; // closed part of a position (reduce/exit) vs opened (entry)
}

export interface BalanceResult {
  success: boolean;
  balance: number;
  availableToWithdraw: number;
  error?: string;
}

export interface PositionsResult {
  success: boolean;
  positions: OpenPosition[];
  error?: string;
}

/**
 * A range fetch either completed or it did not. `partial` marks a range the
 * adapter could not walk to the end (an upstream error mid-pagination), so the
 * sync can log it instead of mistaking a truncated window for "no trades" and
 * advancing past data it never saw.
 */
export interface RangeResult<T> {
  success: boolean;
  items: T[];
  partial?: boolean;
  error?: string;
}

export interface TimeRange {
  startMs: number;
  endMs: number;
}

export interface ExchangeAdapter {
  readonly id: ExchangeId;

  /**
   * Cheap authenticated call used to check freshly entered keys before they are
   * stored, so a typo or a key without the right permissions is caught at
   * connect time rather than on the first sync.
   */
  verifyCredentials(creds: ExchangeCredentials): Promise<{ success: boolean; error?: string }>;

  getBalance(creds: ExchangeCredentials): Promise<BalanceResult>;

  getOpenPositions(creds: ExchangeCredentials): Promise<PositionsResult>;

  /** Realized-PnL records closed within the range. Adapters paginate internally. */
  fetchClosedTrades(creds: ExchangeCredentials, range: TimeRange): Promise<RangeResult<ClosedTrade>>;

  /** Position-moving fills within the range. Adapters paginate internally. */
  fetchFills(creds: ExchangeCredentials, range: TimeRange): Promise<RangeResult<Fill>>;

  /** Recent fills for one symbol, aggregated to one marker per order. */
  fetchExecutionMarkers(
    creds: ExchangeCredentials,
    params: { symbol: string; days?: number },
  ): Promise<ExecMarker[]>;
}
