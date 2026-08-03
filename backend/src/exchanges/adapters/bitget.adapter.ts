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

const BASE_URL = 'https://api.bitget.com';
// USDT-margined perpetuals. Bitget keys its whole mix (futures) API on this.
const PRODUCT_TYPE = 'USDT-FUTURES';
const PAGE_LIMIT = 100;
const MAX_PAGES = 50;

/**
 * Bitget v2 adapter.
 *
 * Docs: https://www.bitget.com/api-doc/contract/position/Get-History-Position
 * Auth: ACCESS-SIGN = base64(HMAC-SHA256(secret,
 *   timestamp + METHOD + requestPath [+ '?' + queryString] + body)),
 * timestamp in epoch milliseconds. Like OKX it needs the passphrase chosen at
 * key creation, sent in clear as ACCESS-PASSPHRASE.
 *
 * Note the '?' is part of the signed string only when a query is present —
 * signing a bare '?' on an empty query is a common source of 40009 errors.
 *
 * As with OKX, history-position returns one row per closed position.
 */
@Injectable()
export class BitgetAdapter implements ExchangeAdapter {
  readonly id = 'bitget' as const;

  async verifyCredentials(creds: ExchangeCredentials) {
    const res = await this.getBalance(creds);
    return res.success ? { success: true } : { success: false, error: res.error };
  }

  async getBalance(creds: ExchangeCredentials): Promise<BalanceResult> {
    const res = await this.signedGet(creds, '/api/v2/mix/account/accounts', {
      productType: PRODUCT_TYPE,
    });
    if (!res.success) {
      return { success: false, balance: 0, availableToWithdraw: 0, error: res.error };
    }
    const usdt = (Array.isArray(res.data) ? res.data : []).find((a: any) => a.marginCoin === 'USDT');
    return {
      success: true,
      balance: num(usdt?.accountEquity),
      availableToWithdraw: num(usdt?.available),
    };
  }

  async getOpenPositions(creds: ExchangeCredentials): Promise<PositionsResult> {
    const res = await this.signedGet(creds, '/api/v2/mix/position/all-position', {
      productType: PRODUCT_TYPE,
    });
    if (!res.success) return { success: false, positions: [], error: res.error };

    return {
      success: true,
      positions: (Array.isArray(res.data) ? res.data : []).map((p: any) => ({
        symbol: String(p.symbol),
        // Bitget names the position side outright, in both one-way and hedge mode.
        direction: p.holdSide === 'short' ? ('short' as const) : ('long' as const),
        size: String(num(p.total)),
        avgPrice: str(p.openPriceAvg),
        markPrice: str(p.markPrice),
        // Bitget has no single "notional" field; the margin-coin value of the
        // position is what the table shows as size in money.
        positionValue: str(p.marginSize ?? p.available),
        unrealisedPnl: str(p.unrealizedPL),
        leverage: str(p.leverage),
        liqPrice: str(p.liquidationPrice),
      })),
    };
  }

  async fetchClosedTrades(
    creds: ExchangeCredentials,
    range: TimeRange,
  ): Promise<RangeResult<ClosedTrade>> {
    const page = await this.pageBackwards(
      creds,
      '/api/v2/mix/position/history-position',
      { productType: PRODUCT_TYPE },
      range,
      (body) => (Array.isArray(body?.list) ? body.list : []),
      (body) => str(body?.endId),
      (row) => num(row.utime),
    );

    const items: ClosedTrade[] = [];
    for (const r of page.rows) {
      const closedMs = num(r.utime);
      if (!r.positionId || !closedMs) continue;
      const direction: 'long' | 'short' = r.holdSide === 'short' ? 'short' : 'long';
      items.push({
        symbol: String(r.symbol),
        side: direction === 'long' ? 'Sell' : 'Buy',
        direction,
        qty: num(r.closeTotalPos),
        avgEntryPrice: num(r.openAvgPrice),
        avgExitPrice: num(r.closeAvgPrice),
        // netProfit is realized PnL after fees; pnl is before. The journal's
        // closedPnl has always been the exchange's realized figure with fees
        // reported separately, so `pnl` is the matching one.
        closedPnl: num(r.pnl),
        // Bitget does split the two, unlike OKX. Both arrive negative.
        openFee: Math.abs(num(r.openFee)),
        closeFee: Math.abs(num(r.closeFee)),
        leverage: r.leverage ? num(r.leverage) : null,
        orderId: String(r.positionId),
        closedAt: new Date(closedMs),
        raw: r,
      });
    }
    return { success: !page.partial, items, partial: page.partial || undefined, error: page.error };
  }

  async fetchFills(creds: ExchangeCredentials, range: TimeRange): Promise<RangeResult<Fill>> {
    const page = await this.pageBackwards(
      creds,
      '/api/v2/mix/order/fill-history',
      { productType: PRODUCT_TYPE },
      range,
      (body) => (Array.isArray(body?.fillList) ? body.fillList : []),
      (body) => str(body?.endId),
      (row) => num(row.cTime),
    );

    const items: Fill[] = [];
    for (const f of page.rows) {
      const ts = num(f.cTime);
      const qty = num(f.baseVolume);
      if (!f.tradeId || !ts || !(qty > 0)) continue;
      items.push({
        symbol: String(f.symbol),
        side: f.side === 'buy' ? 'Buy' : 'Sell',
        qty,
        price: num(f.price),
        // tradeSide says what the fill did to the position. Hedge mode uses
        // 'open'/'close'; one-way mode reports 'buy_single'/'sell_single',
        // which names the direction and not the intent — there closedSize
        // stays 0, same as OKX, and grouping is simply not attempted.
        closedSize: String(f.tradeSide ?? '').includes('close') ? qty : 0,
        execType: 'Trade',
        orderId: String(f.orderId ?? ''),
        execId: String(f.tradeId),
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

  /**
   * Walk a Bitget history endpoint newest-first.
   *
   * Bitget pages with `idLessThan`, echoing the last id of the page as `endId`;
   * `startTime`/`endTime` bound the window. Rows older than the range end the
   * walk, so a cursor that stops advancing cannot spin.
   */
  private async pageBackwards(
    creds: ExchangeCredentials,
    path: string,
    baseParams: Record<string, string | number | undefined>,
    range: TimeRange,
    rowsOf: (body: any) => any[],
    cursorOf: (body: any) => string | undefined,
    timeOf: (row: any) => number,
  ): Promise<{ rows: any[]; partial: boolean; error?: string }> {
    const rows: any[] = [];
    let idLessThan: string | undefined;

    for (let page = 0; page < MAX_PAGES; page++) {
      const res = await this.signedGet(creds, path, {
        ...baseParams,
        startTime: range.startMs,
        endTime: range.endMs,
        limit: PAGE_LIMIT,
        idLessThan,
      });
      if (!res.success) return { rows, partial: true, error: res.error };

      const batch = rowsOf(res.data);
      if (batch.length === 0) break;

      let reachedStart = false;
      for (const row of batch) {
        const ts = timeOf(row);
        if (ts && ts < range.startMs) {
          reachedStart = true;
          continue;
        }
        rows.push(row);
      }

      const next = cursorOf(res.data);
      if (reachedStart || batch.length < PAGE_LIMIT || !next || next === idLessThan) break;
      idLessThan = next;
    }

    return { rows, partial: false };
  }

  private async signedGet(
    creds: ExchangeCredentials,
    path: string,
    params: Record<string, string | number | undefined>,
  ): Promise<{ success: boolean; data: any; error?: string }> {
    const qs = queryString(params);
    // The '?' belongs to the signed string only when there is a query.
    const signedPath = qs ? `${path}?${qs}` : path;
    const timestamp = String(Date.now());
    const sign = hmac('sha256', creds.apiSecret, `${timestamp}GET${signedPath}`, 'base64');

    const res = await getJson(`${BASE_URL}${signedPath}`, {
      'ACCESS-KEY': creds.apiKey,
      'ACCESS-SIGN': sign,
      'ACCESS-TIMESTAMP': timestamp,
      'ACCESS-PASSPHRASE': creds.passphrase ?? '',
      'Content-Type': 'application/json',
      locale: 'en-US',
    });

    const body = res.body;
    // Bitget mirrors OKX: '00000' is success and failures still answer HTTP 200.
    if (body && String(body.code) !== '00000') {
      return { success: false, data: null, error: body.msg || `Bitget error ${body.code}` };
    }
    if (!res.ok) return { success: false, data: null, error: res.error ?? 'Bitget request failed' };
    return { success: true, data: body?.data ?? null };
  }
}
