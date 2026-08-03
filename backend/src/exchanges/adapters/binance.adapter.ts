import { Injectable } from '@nestjs/common';
import {
  BalanceResult,
  ClosedTrade,
  ExchangeAdapter,
  ExchangeCredentials,
  ExecMarker,
  Fill,
  PositionsResult,
  RangeResult,
  TimeRange,
} from '../exchange.types';
import { getJson, hmac, num, queryString, str } from './http';
import { markersFromFills } from './markers';

const BASE_URL = 'https://fapi.binance.com';
// Binance rejects a userTrades/income range wider than 7 days.
const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const PAGE_LIMIT = 1000;
const MAX_PAGES = 20;
// Cap the per-symbol fan-out below: a busy account can touch dozens of symbols,
// and each one costs its own weighted request.
const MAX_SYMBOLS = 40;

/**
 * Binance USDⓈ-M futures adapter.
 *
 * Docs: https://developers.binance.com/docs/derivatives/usds-margined-futures
 * Auth: every signed request carries `timestamp` in the query string and
 * `signature` = hex(HMAC-SHA256(secret, queryString)) appended last, with the
 * key in the X-MBX-APIKEY header. Unlike the other adapters nothing is signed
 * in a header — the signature is a query parameter over the query itself.
 *
 * Binance is the first exchange here with NO closed-position endpoint, so
 * realized PnL is reconstructed. Two facts shape the whole design:
 *
 * - `/fapi/v1/income` takes no symbol, so it is the only way to learn which
 *   symbols an account traded in a window.
 * - `/fapi/v1/userTrades` REQUIRES a symbol, so fills can only be fetched once
 *   those symbols are known.
 *
 * Hence: income first to enumerate symbols, then userTrades per symbol. Each
 * closing fill becomes one ClosedTrade, which puts Binance in the same shape as
 * Bybit — one row per closing order — so PositionBuilderService's grouping does
 * the rest.
 */
@Injectable()
export class BinanceAdapter implements ExchangeAdapter {
  readonly id = 'binance' as const;

  async verifyCredentials(creds: ExchangeCredentials) {
    const res = await this.getBalance(creds);
    return res.success ? { success: true } : { success: false, error: res.error };
  }

  async getBalance(creds: ExchangeCredentials): Promise<BalanceResult> {
    const res = await this.signedGet(creds, '/fapi/v2/balance', {});
    if (!res.success) {
      return { success: false, balance: 0, availableToWithdraw: 0, error: res.error };
    }
    const usdt = (Array.isArray(res.data) ? res.data : []).find((b: any) => b.asset === 'USDT');
    return {
      success: true,
      balance: num(usdt?.balance),
      availableToWithdraw: num(usdt?.availableBalance),
    };
  }

  async getOpenPositions(creds: ExchangeCredentials): Promise<PositionsResult> {
    const res = await this.signedGet(creds, '/fapi/v2/positionRisk', {});
    if (!res.success) return { success: false, positions: [], error: res.error };

    const rows = Array.isArray(res.data) ? res.data : [];
    return {
      success: true,
      positions: rows
        // positionRisk returns a row for every symbol the account can trade,
        // not just the open ones.
        .filter((p: any) => num(p.positionAmt) !== 0)
        .map((p: any) => {
          const amt = num(p.positionAmt);
          return {
            symbol: String(p.symbol),
            // Hedge mode names positionSide; one-way reports BOTH and carries
            // the direction in the sign of positionAmt.
            direction:
              p.positionSide === 'LONG' || p.positionSide === 'SHORT'
                ? (String(p.positionSide).toLowerCase() as 'long' | 'short')
                : amt >= 0
                  ? ('long' as const)
                  : ('short' as const),
            size: String(Math.abs(amt)),
            avgPrice: str(p.entryPrice),
            markPrice: str(p.markPrice),
            positionValue: str(p.notional ?? p.positionInitialMargin),
            unrealisedPnl: str(p.unRealizedProfit),
            leverage: str(p.leverage),
            liqPrice: str(p.liquidationPrice),
          };
        }),
    };
  }

  async fetchClosedTrades(
    creds: ExchangeCredentials,
    range: TimeRange,
  ): Promise<RangeResult<ClosedTrade>> {
    const fetched = await this.fetchRawTrades(creds, range);

    const items: ClosedTrade[] = [];
    for (const t of fetched.rows) {
      const realized = num(t.realizedPnl);
      const qty = num(t.qty);
      const time = num(t.time);
      // Only a fill that realized PnL closed anything. Pure entries realize
      // nothing and are not trades in the journal's sense — they show up as
      // fills instead.
      if (realized === 0 || !(qty > 0) || !time || !t.id) continue;

      // Binance labels the ORDER side; the position it closed is the opposite.
      const side: 'Buy' | 'Sell' = t.side === 'BUY' ? 'Buy' : 'Sell';
      const direction: 'long' | 'short' = side === 'Sell' ? 'long' : 'short';
      const exitPrice = num(t.price);

      items.push({
        symbol: String(t.symbol),
        side,
        direction,
        qty,
        // Binance never reports the entry price of a close, but it is exact
        // arithmetic from the realized PnL: for a long,
        // pnl = (exit − entry) · qty, and for a short the sign flips.
        // realizedPnl is gross of commission, which is reported separately, so
        // this does not smear fees into the price.
        avgEntryPrice:
          direction === 'long' ? exitPrice - realized / qty : exitPrice + realized / qty,
        avgExitPrice: exitPrice,
        closedPnl: realized,
        // Commission is charged per fill, so a close only ever carries its own
        // side of it; the entry's commission belongs to the entry fill.
        openFee: 0,
        closeFee: Math.abs(num(t.commission)),
        leverage: null,
        // One row per closing ORDER, exactly like Bybit — several partial
        // closes of one position share an orderId only when they were one
        // order, and PositionBuilderService groups the rest from the fills.
        orderId: String(t.orderId ?? t.id),
        closedAt: new Date(time),
        raw: t,
      });
    }

    return {
      success: !fetched.partial,
      items,
      partial: fetched.partial || undefined,
      error: fetched.error,
    };
  }

  async fetchFills(creds: ExchangeCredentials, range: TimeRange): Promise<RangeResult<Fill>> {
    const fetched = await this.fetchRawTrades(creds, range);

    const items: Fill[] = [];
    for (const t of fetched.rows) {
      const qty = num(t.qty);
      const time = num(t.time);
      if (!t.id || !(qty > 0) || !time) continue;
      const side: 'Buy' | 'Sell' = t.side === 'BUY' ? 'Buy' : 'Sell';
      items.push({
        symbol: String(t.symbol),
        side,
        qty,
        price: num(t.price),
        closedSize: closedSizeOf(t, side, qty),
        execType: 'Trade',
        orderId: String(t.orderId ?? ''),
        execId: String(t.id),
        execTime: new Date(time),
      });
    }

    return {
      success: !fetched.partial,
      items,
      partial: fetched.partial || undefined,
      error: fetched.error,
    };
  }

  async fetchExecutionMarkers(
    creds: ExchangeCredentials,
    params: { symbol: string; days?: number },
  ): Promise<ExecMarker[]> {
    const endMs = Date.now();
    const startMs = endMs - (params.days ?? 30) * 24 * 60 * 60 * 1000;
    // The symbol is known here, so the income lookup that normally discovers
    // symbols can be skipped entirely.
    const fetched = await this.tradesForSymbol(creds, params.symbol, { startMs, endMs });
    const fills: Fill[] = fetched.rows
      .filter((t) => t.id && num(t.qty) > 0 && num(t.time) > 0)
      .map((t) => {
        const qty = num(t.qty);
        const side: 'Buy' | 'Sell' = t.side === 'BUY' ? 'Buy' : 'Sell';
        return {
          symbol: String(t.symbol),
          side,
          qty,
          price: num(t.price),
          closedSize: closedSizeOf(t, side, qty),
          execType: 'Trade',
          orderId: String(t.orderId ?? ''),
          execId: String(t.id),
          execTime: new Date(num(t.time)),
        };
      });
    return markersFromFills(fills);
  }

  // ── plumbing ──

  /**
   * Every fill in the range, across symbols.
   *
   * userTrades is per-symbol only, so the symbol set is discovered first from
   * income history — the one account endpoint that spans symbols. A window with
   * no income means the account did not trade, and no fills are fetched at all.
   */
  private async fetchRawTrades(
    creds: ExchangeCredentials,
    range: TimeRange,
  ): Promise<{ rows: any[]; partial: boolean; error?: string }> {
    const symbols = await this.tradedSymbols(creds, range);
    if (!symbols.success) return { rows: [], partial: true, error: symbols.error };

    const rows: any[] = [];
    let partial = false;
    let error: string | undefined;

    for (const symbol of symbols.symbols) {
      const res = await this.tradesForSymbol(creds, symbol, range);
      rows.push(...res.rows);
      if (res.partial) {
        // Keep the symbols that did work; the range is reported incomplete so
        // the sync logs it rather than treating it as "nothing traded".
        partial = true;
        error ??= res.error;
      }
    }

    return { rows, partial, error };
  }

  /**
   * Symbols the account had any futures activity on, from income history.
   * REALIZED_PNL alone would miss a position opened in the window and still
   * open, so commission — charged on every fill — is included too.
   */
  private async tradedSymbols(
    creds: ExchangeCredentials,
    range: TimeRange,
  ): Promise<{ success: boolean; symbols: string[]; error?: string }> {
    const symbols = new Set<string>();

    for (const w of windowsOf(range)) {
      let fromId: number | undefined;
      for (let page = 0; page < MAX_PAGES; page++) {
        const res = await this.signedGet(creds, '/fapi/v1/income', {
          startTime: w.startMs,
          endTime: w.endMs,
          limit: PAGE_LIMIT,
          page: fromId,
        });
        if (!res.success) return { success: false, symbols: [], error: res.error };

        const batch = Array.isArray(res.data) ? res.data : [];
        for (const row of batch) {
          const type = String(row.incomeType ?? '');
          if (type !== 'REALIZED_PNL' && type !== 'COMMISSION') continue;
          if (row.symbol) symbols.add(String(row.symbol));
        }
        if (batch.length < PAGE_LIMIT) break;
        fromId = (fromId ?? 1) + 1;
      }
    }

    return { success: true, symbols: [...symbols].slice(0, MAX_SYMBOLS) };
  }

  /** All fills of one symbol in the range, walked in 7-day windows. */
  private async tradesForSymbol(
    creds: ExchangeCredentials,
    symbol: string,
    range: TimeRange,
  ): Promise<{ rows: any[]; partial: boolean; error?: string }> {
    const rows: any[] = [];

    for (const w of windowsOf(range)) {
      let fromId: string | undefined;
      for (let page = 0; page < MAX_PAGES; page++) {
        const res = await this.signedGet(creds, '/fapi/v1/userTrades', {
          symbol,
          // fromId and a time range are mutually exclusive on Binance, so
          // paging past the first page drops the window and walks by id.
          ...(fromId ? { fromId } : { startTime: w.startMs, endTime: w.endMs }),
          limit: PAGE_LIMIT,
        });
        if (!res.success) return { rows, partial: true, error: res.error };

        const batch = Array.isArray(res.data) ? res.data : [];
        // Walking by id leaves the window behind, so it is re-applied here.
        for (const t of batch) {
          const ts = num(t.time);
          if (ts >= w.startMs && ts <= w.endMs) rows.push(t);
        }
        if (batch.length < PAGE_LIMIT) break;

        const lastId = num(batch[batch.length - 1]?.id);
        if (!lastId) break;
        fromId = String(lastId + 1);
      }
    }

    return { rows, partial: false };
  }

  private async signedGet(
    creds: ExchangeCredentials,
    path: string,
    params: Record<string, string | number | undefined>,
  ): Promise<{ success: boolean; data: any; error?: string }> {
    // The signature covers the query string, and must be appended after it —
    // signing a string that differs from what is sent is a -1022 error.
    const qs = queryString({ ...params, timestamp: Date.now(), recvWindow: 5000 });
    const signature = hmac('sha256', creds.apiSecret, qs, 'hex');

    const res = await getJson(`${BASE_URL}${path}?${qs}&signature=${signature}`, {
      'X-MBX-APIKEY': creds.apiKey,
      'Content-Type': 'application/json',
    });

    // Binance signals failure with a non-2xx and a { code, msg } body; a
    // successful response is the bare payload with no envelope.
    if (!res.ok) {
      const msg = res.body?.msg;
      return {
        success: false,
        data: null,
        error: msg ? `${msg}${res.body?.code ? ` (${res.body.code})` : ''}` : (res.error ?? 'Binance request failed'),
      };
    }
    return { success: true, data: res.body };
  }
}

/** Split an arbitrary range into Binance-sized (7 day) windows. */
function windowsOf(range: TimeRange): TimeRange[] {
  const windows: TimeRange[] = [];
  for (let end = range.endMs; end > range.startMs; end -= WINDOW_MS) {
    windows.push({ startMs: Math.max(range.startMs, end - WINDOW_MS), endMs: end });
  }
  return windows;
}

/**
 * How much of a fill closed an existing position.
 *
 * Hedge mode is exact: positionSide names the side the fill acted on, so a SELL
 * on LONG is a close. One-way mode reports BOTH and gives no such marker, but
 * there a non-zero realizedPnl means the fill reduced a position — which is the
 * signal Binance does give, unlike KuCoin and Gate, whose fills say nothing at
 * all. It is still not exact for an order that flips a position through zero;
 * PositionBuilderService tolerates that by declining to group when the running
 * size never settles.
 */
function closedSizeOf(t: any, side: 'Buy' | 'Sell', qty: number): number {
  const positionSide = String(t.positionSide ?? 'BOTH');
  if (positionSide === 'LONG') return side === 'Sell' ? qty : 0;
  if (positionSide === 'SHORT') return side === 'Buy' ? qty : 0;
  return num(t.realizedPnl) !== 0 ? qty : 0;
}
