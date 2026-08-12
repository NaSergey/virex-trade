import { Injectable } from '@nestjs/common';
import { BybitApiKeyService } from '../../bybit/services/bybit-api-key.service';
import { BybitBalanceService } from '../../bybit/services/bybit-balance.service';
import { BybitPositionService } from '../../bybit/services/bybit-position.service';
import { BybitTradeService } from '../../bybit/services/bybit-trade.service';
import {
  BalanceResult,
  ClosedTrade,
  ExchangeAdapter,
  ExchangeCredentials,
  ExecMarker,
  Fill,
  FillsResult,
  FundingRow,
  PositionsResult,
  RangeResult,
  TimeRange,
  VerifyResult,
} from '../exchange.types';

// Bybit caps closed-pnl and execution/list queries at a 7-day window, so any
// wider range is walked one week at a time.
const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Bybit implementation of ExchangeAdapter.
 *
 * All the Bybit-shaped parsing that used to live in TradeSyncService and
 * PositionBuilderService (retCode checks, cursor pagination, `updatedTime` vs
 * `execTime`, which execType moves position size) sits here now, so those
 * services no longer know which exchange they are talking to.
 */
@Injectable()
export class BybitAdapter implements ExchangeAdapter {
  readonly id = 'bybit' as const;

  constructor(
    private readonly balance: BybitBalanceService,
    private readonly positions: BybitPositionService,
    private readonly trades: BybitTradeService,
    private readonly apiKeys: BybitApiKeyService,
  ) {}

  async verifyCredentials(creds: ExchangeCredentials): Promise<VerifyResult> {
    // A balance read is the cheapest call that proves the key, the secret and
    // the account permissions all line up.
    const res = await this.balance.getUSDTBalance(creds);
    if (!res.success) return { success: false, error: res.error };

    // Bybit is the one exchange here that will say what a key may do, so it is
    // the one place the read-only rule can be enforced instead of trusted.
    // A key that reads fine but cannot be interrogated is reported without
    // permissions rather than as safe.
    const info = await this.apiKeys.getApiKeyInfo(creds);
    if (!info.success) return { success: true };

    return {
      success: true,
      permissions: { canTrade: info.canTrade, canWithdraw: info.canWithdraw },
    };
  }

  async getBalance(creds: ExchangeCredentials): Promise<BalanceResult> {
    const res = await this.balance.getUSDTBalance(creds);
    return {
      success: res.success,
      balance: res.balance,
      availableToWithdraw: res.availableToWithdraw,
      error: res.error,
    };
  }

  async getOpenPositions(creds: ExchangeCredentials): Promise<PositionsResult> {
    const res = await this.positions.getOpenPositions(creds);
    if (!res.success) return { success: false, positions: [], error: res.error };
    return {
      success: true,
      positions: (res.positions as any[]).map((p) => ({
        symbol: String(p.symbol),
        direction: p.side === 'Buy' ? ('long' as const) : ('short' as const),
        size: p.size != null ? String(p.size) : '0',
        avgPrice: str(p.avgPrice),
        markPrice: str(p.markPrice),
        positionValue: str(p.positionValue),
        unrealisedPnl: str(p.unrealisedPnl),
        leverage: str(p.leverage),
        liqPrice: str(p.liqPrice),
        takeProfit: str(p.takeProfit),
        stopLoss: str(p.stopLoss),
      })),
    };
  }

  async fetchClosedTrades(
    creds: ExchangeCredentials,
    range: TimeRange,
  ): Promise<RangeResult<ClosedTrade>> {
    const items: ClosedTrade[] = [];
    let partial = false;
    let error: string | undefined;

    for (const w of windowsOf(range)) {
      let cursor: string | undefined;
      do {
        const page = await this.trades.fetchClosedPnlPage(creds, {
          startTime: w.startMs,
          endTime: w.endMs,
          cursor,
        });
        if (!page.success) {
          // Stop this window but keep what other windows produced: a partial
          // import is still progress, it just must not be reported as complete.
          partial = true;
          error ??= page.error;
          break;
        }
        for (const r of page.list) {
          const trade = mapClosedTrade(r);
          if (trade) items.push(trade);
        }
        cursor = page.nextPageCursor;
      } while (cursor);
    }

    return { success: !partial, items, partial: partial || undefined, error };
  }

  async fetchFills(creds: ExchangeCredentials, range: TimeRange): Promise<FillsResult> {
    const items: Fill[] = [];
    const funding: FundingRow[] = [];
    let partial = false;
    let error: string | undefined;

    for (const w of windowsOf(range)) {
      let cursor: string | undefined;
      do {
        const page = await this.trades.fetchExecutionsPage(creds, {
          startTime: w.startMs,
          endTime: w.endMs,
          cursor,
          limit: 100,
        });
        if (!page.success) {
          partial = true;
          error ??= page.error;
          break;
        }
        for (const e of page.list) {
          // Funding arrives in these same pages. It is split off here rather
          // than fetched again: one walk of the history yields both, and the
          // two lists can never be confused for each other downstream.
          const fee = mapFunding(e);
          if (fee) {
            funding.push(fee);
            continue;
          }
          const fill = mapFill(e);
          if (fill) items.push(fill);
        }
        cursor = page.nextPageCursor;
      } while (cursor);
    }

    return { success: !partial, items, funding, partial: partial || undefined, error };
  }

  fetchExecutionMarkers(
    creds: ExchangeCredentials,
    params: { symbol: string; days?: number },
  ): Promise<ExecMarker[]> {
    return this.trades.fetchExecutions(creds, params);
  }
}

/** Split an arbitrary range into Bybit-sized (7 day) windows, oldest last. */
function windowsOf(range: TimeRange): TimeRange[] {
  const windows: TimeRange[] = [];
  for (let end = range.endMs; end > range.startMs; end -= WINDOW_MS) {
    windows.push({ startMs: Math.max(range.startMs, end - WINDOW_MS), endMs: end });
  }
  return windows;
}

function mapClosedTrade(r: any): ClosedTrade | null {
  if (!r?.orderId || !r?.updatedTime) return null;
  const closedMs = Number(r.updatedTime);
  if (!Number.isFinite(closedMs)) return null;
  const side: 'Buy' | 'Sell' = r.side === 'Buy' ? 'Buy' : 'Sell';
  return {
    symbol: String(r.symbol),
    side,
    // Closing order side is opposite to the position direction:
    // a long is closed by a Sell, a short by a Buy.
    direction: side === 'Sell' ? 'long' : 'short',
    qty: num(r.qty ?? r.closedSize),
    avgEntryPrice: num(r.avgEntryPrice),
    avgExitPrice: num(r.avgExitPrice),
    closedPnl: num(r.closedPnl),
    openFee: num(r.openFee),
    closeFee: num(r.closeFee),
    leverage: r.leverage != null && r.leverage !== '' ? num(r.leverage) : null,
    orderId: String(r.orderId),
    closedAt: new Date(closedMs),
    raw: r,
  };
}

/**
 * A funding row, or null for anything that is not one.
 *
 * Bybit reports the payment in `execFee`, positive when the user paid it, and
 * leaves `execPrice`/`closedSize` meaningless here — only the amount, the
 * symbol and the time matter. Rows with a zero fee are still kept: a funding
 * window that cost nothing is a fact about the position, and dropping it would
 * make "no funding recorded" ambiguous between free and unknown.
 */
function mapFunding(e: any): FundingRow | null {
  if (e?.execType !== 'Funding') return null;
  const execTime = Number(e?.execTime);
  if (!e?.execId || !Number.isFinite(execTime)) return null;
  return {
    symbol: String(e.symbol),
    amount: num(e.execFee),
    at: new Date(execTime),
    execId: String(e.execId),
  };
}

function mapFill(e: any): Fill | null {
  // Funding rows carry an execQty too — counting them would drift the running
  // position size and split positions at random points. Every other type
  // (Trade, BustTrade liquidations, AdlTrade, ...) does move the position and
  // has to be kept, or a liquidated position never balances back to zero.
  if (e?.execType === 'Funding') return null;
  const execTime = Number(e?.execTime);
  const qty = num(e?.execQty);
  if (!e?.execId || !Number.isFinite(execTime) || !(qty > 0)) return null;
  return {
    symbol: String(e.symbol),
    side: e.side === 'Buy' ? 'Buy' : 'Sell',
    qty,
    price: num(e.execPrice),
    closedSize: num(e.closedSize),
    execType: String(e.execType ?? 'Trade'),
    orderId: String(e.orderId ?? ''),
    execId: String(e.execId),
    execTime: new Date(execTime),
  };
}

// Bybit sends every number as a string and uses '' for "not applicable";
// parseFloat('') is NaN, which Postgres rejects on a Float column.
function num(v: unknown): number {
  const n = parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
}

/** Keep the exchange's own decimal string, collapsing '' and null to absent. */
function str(v: unknown): string | undefined {
  return v != null && v !== '' ? String(v) : undefined;
}
