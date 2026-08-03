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
import { getJson, hmac, num, str } from './http';
import { markersFromFills } from './markers';

const BASE_URL = 'https://contract.mexc.com';
const PAGE_LIMIT = 100;
const MAX_PAGES = 50;

// MEXC encodes both the direction and the intent of a fill in one number.
const DEAL_OPEN_LONG = 1;
const DEAL_CLOSE_SHORT = 2;
const DEAL_OPEN_SHORT = 3;
const DEAL_CLOSE_LONG = 4;

// And the side of a position in another.
const POSITION_LONG = 1;

/**
 * MEXC futures (contract) adapter.
 *
 * Docs: https://www.mexc.com/api-docs/futures/account-and-trading-endpoints
 * Auth: Signature = hex(HMAC-SHA256(secret, accessKey + timestamp + paramString)),
 * where paramString is the business parameters sorted by key and joined with
 * '&'. Note what is signed is NOT the request path — only the key, the
 * timestamp and the parameters, which is unlike every other adapter here.
 * The key, timestamp and signature travel as ApiKey / Request-Time / Signature
 * headers.
 *
 * history_positions returns one row per closed position, so no reconstruction
 * is needed — the same shape as OKX, Bitget, KuCoin and Gate.
 *
 * Caveat worth knowing operationally: MEXC has restricted futures API access on
 * many accounts. A key that works for spot may still be refused here, which
 * surfaces at connect time as a permissions error from the exchange.
 */
@Injectable()
export class MexcAdapter implements ExchangeAdapter {
  readonly id = 'mexc' as const;

  async verifyCredentials(creds: ExchangeCredentials) {
    const res = await this.getBalance(creds);
    return res.success ? { success: true } : { success: false, error: res.error };
  }

  async getBalance(creds: ExchangeCredentials): Promise<BalanceResult> {
    const res = await this.signedGet(creds, '/api/v1/private/account/asset/USDT', {});
    if (!res.success) {
      return { success: false, balance: 0, availableToWithdraw: 0, error: res.error };
    }
    return {
      success: true,
      balance: num(res.data?.equity),
      availableToWithdraw: num(res.data?.availableBalance),
    };
  }

  async getOpenPositions(creds: ExchangeCredentials): Promise<PositionsResult> {
    const res = await this.signedGet(creds, '/api/v1/private/position/open_positions', {});
    if (!res.success) return { success: false, positions: [], error: res.error };

    const rows = Array.isArray(res.data) ? res.data : [];
    return {
      success: true,
      positions: rows
        .filter((p: any) => num(p.holdVol) > 0)
        .map((p: any) => ({
          symbol: String(p.symbol),
          direction: num(p.positionType) === POSITION_LONG ? ('long' as const) : ('short' as const),
          size: String(num(p.holdVol)),
          avgPrice: str(p.holdAvgPrice),
          // MEXC does not return a mark price on the position row; the table
          // simply leaves that column empty rather than showing a wrong number.
          positionValue: str(p.im ?? p.oim),
          unrealisedPnl: str(p.realised ?? p.profitReal),
          leverage: str(p.leverage),
          liqPrice: str(p.liquidatePrice),
        })),
    };
  }

  async fetchClosedTrades(
    creds: ExchangeCredentials,
    range: TimeRange,
  ): Promise<RangeResult<ClosedTrade>> {
    const page = await this.pageByNumber(creds, '/api/v1/private/position/list/history_positions', {
      start_time: range.startMs,
      end_time: range.endMs,
    });

    const items: ClosedTrade[] = [];
    for (const r of page.rows) {
      const closedMs = num(r.updateTime);
      if (!r.positionId || !closedMs) continue;
      // The window is re-applied locally: history_positions paginates by page
      // number, and a page can carry rows outside the requested range.
      if (closedMs < range.startMs || closedMs > range.endMs) continue;

      const direction: 'long' | 'short' =
        num(r.positionType) === POSITION_LONG ? 'long' : 'short';
      items.push({
        symbol: String(r.symbol),
        side: direction === 'long' ? 'Sell' : 'Buy',
        direction,
        qty: num(r.closeVol),
        avgEntryPrice: num(r.openAvgPrice),
        avgExitPrice: num(r.closeAvgPrice),
        closedPnl: num(r.realised),
        // MEXC reports one fee total for the position rather than splitting
        // entry from exit.
        openFee: 0,
        closeFee: Math.abs(num(r.fee ?? r.closeFee)),
        leverage: r.leverage ? num(r.leverage) : null,
        orderId: String(r.positionId),
        closedAt: new Date(closedMs),
        raw: r,
      });
    }
    return { success: !page.partial, items, partial: page.partial || undefined, error: page.error };
  }

  async fetchFills(creds: ExchangeCredentials, range: TimeRange): Promise<RangeResult<Fill>> {
    const page = await this.pageByNumber(creds, '/api/v1/private/order/list/order_deals', {
      start_time: range.startMs,
      end_time: range.endMs,
    });

    const items: Fill[] = [];
    for (const d of page.rows) {
      const ts = num(d.timestamp);
      const qty = num(d.vol);
      if (!d.id || !ts || !(qty > 0)) continue;
      if (ts < range.startMs || ts > range.endMs) continue;

      const dealSide = num(d.side);
      items.push({
        symbol: String(d.symbol),
        // 1 opens a long and 2 closes a short — both buy. 3 and 4 both sell.
        side: dealSide === DEAL_OPEN_LONG || dealSide === DEAL_CLOSE_SHORT ? 'Buy' : 'Sell',
        qty,
        price: num(d.price),
        // MEXC is the only exchange here that states intent unambiguously in
        // both account modes, so closedSize is exact — no realizedPnl or
        // positionSide inference needed.
        closedSize: dealSide === DEAL_CLOSE_LONG || dealSide === DEAL_CLOSE_SHORT ? qty : 0,
        execType: 'Trade',
        orderId: String(d.orderId ?? ''),
        execId: String(d.id),
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

  /** MEXC paginates its private lists with page_num / page_size, 1-based. */
  private async pageByNumber(
    creds: ExchangeCredentials,
    path: string,
    baseParams: Record<string, string | number | undefined>,
  ): Promise<{ rows: any[]; partial: boolean; error?: string }> {
    const rows: any[] = [];

    for (let page = 1; page <= MAX_PAGES; page++) {
      const res = await this.signedGet(creds, path, {
        ...baseParams,
        page_num: page,
        page_size: PAGE_LIMIT,
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
    // Sorted by key and joined with '&' — MEXC signs the parameters alone, not
    // the path, so the same params on a different endpoint sign identically.
    const paramString = Object.keys(params)
      .filter((k) => params[k] !== undefined && params[k] !== '')
      .sort()
      .map((k) => `${k}=${params[k]}`)
      .join('&');
    const timestamp = String(Date.now());
    const signature = hmac('sha256', creds.apiSecret, `${creds.apiKey}${timestamp}${paramString}`, 'hex');

    const url = paramString ? `${BASE_URL}${path}?${paramString}` : `${BASE_URL}${path}`;
    const res = await getJson(url, {
      ApiKey: creds.apiKey,
      'Request-Time': timestamp,
      Signature: signature,
      'Content-Type': 'application/json',
    });

    const body = res.body;
    // MEXC wraps everything in { success, code, data } and answers failures
    // with HTTP 200, like OKX and Bitget.
    if (body && body.success === false) {
      return { success: false, data: null, error: body.message || `MEXC error ${body.code}` };
    }
    if (!res.ok) return { success: false, data: null, error: res.error ?? 'MEXC request failed' };
    return { success: true, data: body?.data ?? null };
  }
}
