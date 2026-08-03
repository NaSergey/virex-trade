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
import { getJson, hmac, num, queryString, sha512Hex, str } from './http';
import { markersFromFills } from './markers';

const BASE_URL = 'https://api.gateio.ws';
// USDT-settled perpetuals. Gate scopes its futures API by settlement currency.
const SETTLE = 'usdt';
const PAGE_LIMIT = 100;
const MAX_PAGES = 50;

/**
 * Gate.io v4 futures adapter.
 *
 * Docs: https://www.gate.com/docs/developers/apiv4/
 * Auth: SIGN = hex(HMAC-SHA512(secret, signatureString)) where the signature
 * string is five newline-separated parts:
 *
 *   METHOD \n path \n queryString \n hex(SHA512(body)) \n timestamp
 *
 * The body hash is present even for a GET, where it is the SHA-512 of the empty
 * string — omitting the line entirely is the usual cause of a signature
 * mismatch. `Timestamp` is in SECONDS, not milliseconds, unlike every other
 * adapter here.
 *
 * Gate is the only one of the four that needs no passphrase.
 */
@Injectable()
export class GateAdapter implements ExchangeAdapter {
  readonly id = 'gate' as const;

  async verifyCredentials(creds: ExchangeCredentials) {
    const res = await this.getBalance(creds);
    return res.success ? { success: true } : { success: false, error: res.error };
  }

  async getBalance(creds: ExchangeCredentials): Promise<BalanceResult> {
    const res = await this.signedGet(creds, `/api/v4/futures/${SETTLE}/accounts`, {});
    if (!res.success) {
      return { success: false, balance: 0, availableToWithdraw: 0, error: res.error };
    }
    return {
      success: true,
      balance: num(res.data?.total),
      availableToWithdraw: num(res.data?.available),
    };
  }

  async getOpenPositions(creds: ExchangeCredentials): Promise<PositionsResult> {
    const res = await this.signedGet(creds, `/api/v4/futures/${SETTLE}/positions`, {});
    if (!res.success) return { success: false, positions: [], error: res.error };

    const rows = Array.isArray(res.data) ? res.data : [];
    return {
      success: true,
      positions: rows
        .filter((p: any) => num(p.size) !== 0)
        .map((p: any) => {
          const size = num(p.size);
          return {
            symbol: String(p.contract),
            // Like KuCoin, Gate encodes direction in the sign of the size.
            direction: size >= 0 ? ('long' as const) : ('short' as const),
            size: String(Math.abs(size)),
            avgPrice: str(p.entry_price),
            markPrice: str(p.mark_price),
            positionValue: str(p.value),
            unrealisedPnl: str(p.unrealised_pnl),
            leverage: str(p.leverage),
            liqPrice: str(p.liq_price),
          };
        }),
    };
  }

  async fetchClosedTrades(
    creds: ExchangeCredentials,
    range: TimeRange,
  ): Promise<RangeResult<ClosedTrade>> {
    const page = await this.pageByOffset(creds, `/api/v4/futures/${SETTLE}/position_close`, {
      from: Math.floor(range.startMs / 1000),
      to: Math.floor(range.endMs / 1000),
    });

    const items: ClosedTrade[] = [];
    for (const r of page.rows) {
      // Gate timestamps futures history in seconds.
      const closedMs = num(r.time) * 1000;
      if (!closedMs) continue;
      // `side` names the side that was held ('long' | 'short').
      const direction: 'long' | 'short' = r.side === 'short' ? 'short' : 'long';
      items.push({
        symbol: String(r.contract),
        side: direction === 'long' ? 'Sell' : 'Buy',
        direction,
        // position_close reports max size held over the position's life; there
        // is no separate closed-size field.
        qty: Math.abs(num(r.max_size)),
        avgEntryPrice: num(r.first_open_price ?? r.long_price),
        avgExitPrice: num(r.last_close_price ?? r.short_price),
        closedPnl: num(r.pnl),
        // Gate reports one signed total; funding (pnl_fund) is separate and is
        // not a trading fee, so it stays out of both columns.
        openFee: 0,
        closeFee: Math.abs(num(r.pnl_fee)),
        leverage: null,
        // No position id — the contract plus its close time is what uniquely
        // identifies the row, and it is stable across re-syncs.
        orderId: `${r.contract}:${num(r.time)}`,
        closedAt: new Date(closedMs),
        raw: r,
      });
    }
    return { success: !page.partial, items, partial: page.partial || undefined, error: page.error };
  }

  async fetchFills(creds: ExchangeCredentials, range: TimeRange): Promise<RangeResult<Fill>> {
    const page = await this.pageByOffset(creds, `/api/v4/futures/${SETTLE}/my_trades`, {
      from: Math.floor(range.startMs / 1000),
      to: Math.floor(range.endMs / 1000),
    });

    const items: Fill[] = [];
    for (const f of page.rows) {
      const ts = num(f.create_time) * 1000;
      // `size` is signed: positive is a buy, negative a sell.
      const signed = num(f.size);
      if (!f.id || !ts || signed === 0) continue;
      items.push({
        symbol: String(f.contract),
        side: signed > 0 ? 'Buy' : 'Sell',
        qty: Math.abs(signed),
        price: num(f.price),
        // Gate gives no open/close marker on a fill, same as KuCoin — and for
        // the same reason it does not matter: position_close already returns
        // whole positions.
        closedSize: 0,
        execType: 'Trade',
        orderId: String(f.order_id ?? ''),
        execId: String(f.id),
        execTime: new Date(ts),
      });
    }
    return { success: !page.partial, items, partial: page.partial || undefined, error: page.error };
  }

  async fetchExecutionMarkers(
    creds: ExchangeCredentials,
    params: { symbol: string; days?: number },
  ): Promise<ExecMarker[]> {
    const endMs = Date.now();
    const startMs = endMs - (params.days ?? 30) * 24 * 60 * 60 * 1000;
    const fills = await this.fetchFills(creds, { startMs, endMs });
    return markersFromFills(fills.items.filter((f) => f.symbol === params.symbol));
  }

  // ── plumbing ──

  /** Gate paginates its futures history with plain `offset`/`limit`. */
  private async pageByOffset(
    creds: ExchangeCredentials,
    path: string,
    baseParams: Record<string, string | number | undefined>,
  ): Promise<{ rows: any[]; partial: boolean; error?: string }> {
    const rows: any[] = [];

    for (let page = 0; page < MAX_PAGES; page++) {
      const res = await this.signedGet(creds, path, {
        ...baseParams,
        limit: PAGE_LIMIT,
        offset: page * PAGE_LIMIT,
      });
      if (!res.success) return { rows, partial: true, error: res.error };

      const batch = Array.isArray(res.data) ? res.data : [];
      rows.push(...batch);
      if (batch.length < PAGE_LIMIT) break;
    }

    return { rows, partial: false };
  }

  private async signedGet(
    creds: ExchangeCredentials,
    path: string,
    params: Record<string, string | number | undefined>,
  ): Promise<{ success: boolean; data: any; error?: string }> {
    const qs = queryString(params);
    // Seconds — Gate rejects a millisecond timestamp as out of window.
    const timestamp = String(Math.floor(Date.now() / 1000));
    // The empty-body hash is still part of the string on a GET.
    const payloadHash = sha512Hex('');
    const signatureString = `GET\n${path}\n${qs}\n${payloadHash}\n${timestamp}`;
    const sign = hmac('sha512', creds.apiSecret, signatureString, 'hex');

    const res = await getJson(`${BASE_URL}${path}${qs ? `?${qs}` : ''}`, {
      KEY: creds.apiKey,
      SIGN: sign,
      Timestamp: timestamp,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    });

    // Gate has no success envelope: a good response is the payload itself and a
    // failure is a non-2xx carrying { label, message }.
    if (!res.ok) {
      const label = res.body?.label;
      const message = res.body?.message ?? res.body?.detail;
      return {
        success: false,
        data: null,
        error: message ? `${label ? `${label}: ` : ''}${message}` : (res.error ?? 'Gate request failed'),
      };
    }
    return { success: true, data: res.body };
  }
}
