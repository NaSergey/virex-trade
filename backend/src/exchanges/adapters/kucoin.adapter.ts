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

const BASE_URL = 'https://api-futures.kucoin.com';
const PAGE_LIMIT = 100;
const MAX_PAGES = 50;

/**
 * KuCoin Futures adapter.
 *
 * Docs: https://www.kucoin.com/docs-new/rest/futures-trading/positions/get-positions-history
 * Auth: KC-API-SIGN = base64(HMAC-SHA256(secret, timestamp + METHOD + endpoint + body)),
 * timestamp in epoch milliseconds, endpoint including its query string.
 *
 * KuCoin differs from OKX and Bitget in one important way: the passphrase is
 * NOT sent in clear. Since key version 2 it must itself be signed —
 * base64(HMAC-SHA256(secret, passphrase)) — and KC-API-KEY-VERSION must say so,
 * or the exchange answers 400004.
 *
 * Sizes are in contracts (lots), not base currency. That is consistent within
 * the exchange, which is all position bookkeeping needs, but it means a KuCoin
 * size is not directly comparable to a Bybit one.
 */
@Injectable()
export class KucoinAdapter implements ExchangeAdapter {
  readonly id = 'kucoin' as const;

  async verifyCredentials(creds: ExchangeCredentials) {
    const res = await this.getBalance(creds);
    return res.success ? { success: true } : { success: false, error: res.error };
  }

  async getBalance(creds: ExchangeCredentials): Promise<BalanceResult> {
    const res = await this.signedGet(creds, '/api/v1/account-overview', { currency: 'USDT' });
    if (!res.success) {
      return { success: false, balance: 0, availableToWithdraw: 0, error: res.error };
    }
    return {
      success: true,
      balance: num(res.data?.accountEquity),
      availableToWithdraw: num(res.data?.availableBalance),
    };
  }

  async getOpenPositions(creds: ExchangeCredentials): Promise<PositionsResult> {
    const res = await this.signedGet(creds, '/api/v1/positions', {});
    if (!res.success) return { success: false, positions: [], error: res.error };

    const rows = Array.isArray(res.data) ? res.data : [];
    return {
      success: true,
      positions: rows
        // KuCoin keeps a row for a symbol after it flattens; a zero quantity is
        // not an open position.
        .filter((p: any) => num(p.currentQty) !== 0)
        .map((p: any) => {
          const qty = num(p.currentQty);
          return {
            symbol: String(p.symbol),
            // No side field: the sign of currentQty carries the direction.
            direction: qty >= 0 ? ('long' as const) : ('short' as const),
            size: String(Math.abs(qty)),
            avgPrice: str(p.avgEntryPrice),
            markPrice: str(p.markPrice),
            positionValue: str(p.posCost ?? p.markValue),
            unrealisedPnl: str(p.unrealisedPnl),
            leverage: str(p.realLeverage),
            liqPrice: str(p.liquidationPrice),
          };
        }),
    };
  }

  async fetchClosedTrades(
    creds: ExchangeCredentials,
    range: TimeRange,
  ): Promise<RangeResult<ClosedTrade>> {
    const page = await this.pageByIndex(
      creds,
      '/api/v1/history-positions',
      { from: range.startMs, to: range.endMs },
    );

    const items: ClosedTrade[] = [];
    for (const r of page.rows) {
      const closedMs = num(r.closeTime);
      if (!r.closeId || !closedMs) continue;
      // `side` on a closed position names the side that was held.
      const direction: 'long' | 'short' =
        r.side === 'short' || r.positionSide === 'SHORT' ? 'short' : 'long';
      items.push({
        symbol: String(r.symbol),
        side: direction === 'long' ? 'Sell' : 'Buy',
        direction,
        // History gives no closed size, so it is derived from the money:
        // |grossCost| / openPrice. Falls back to 0 when either is missing
        // (KuCoin reports null prices on liquidations).
        qty: closeQty(r),
        avgEntryPrice: num(r.openPrice),
        avgExitPrice: num(r.closePrice),
        // `pnl` is realized PnL; tradeFee and fundingFee are reported apart, and
        // only the trading fee belongs in the fee columns.
        openFee: 0,
        closeFee: Math.abs(num(r.tradeFee)),
        leverage: r.leverage ? num(r.leverage) : null,
        orderId: String(r.closeId),
        closedAt: new Date(closedMs),
        closedPnl: num(r.pnl),
        raw: r,
      });
    }
    return { success: !page.partial, items, partial: page.partial || undefined, error: page.error };
  }

  async fetchFills(creds: ExchangeCredentials, range: TimeRange): Promise<RangeResult<Fill>> {
    const page = await this.pageByIndex(
      creds,
      '/api/v1/fills',
      { startAt: range.startMs, endAt: range.endMs },
    );

    const items: Fill[] = [];
    for (const f of page.rows) {
      const ts = num(f.tradeTime ? Number(f.tradeTime) / 1e6 : f.createdAt);
      const qty = num(f.size);
      if (!f.tradeId || !ts || !(qty > 0)) continue;
      items.push({
        symbol: String(f.symbol),
        side: f.side === 'buy' ? 'Buy' : 'Sell',
        qty,
        price: num(f.price),
        // KuCoin fills carry no open/close marker at all — not even the
        // ambiguous one OKX and Bitget give. closedSize therefore stays 0 and
        // PositionBuilderService leaves these ungrouped, which costs nothing
        // here because history-positions already returns whole positions.
        closedSize: 0,
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
   * Walk a KuCoin paged list.
   *
   * KuCoin answers `{ currentPage, totalPage, items }` and expects
   * `currentPage`/`pageSize` back, so pagination is by index rather than by
   * cursor. The loop stops on the reported last page, an empty page, or the
   * MAX_PAGES guard.
   */
  private async pageByIndex(
    creds: ExchangeCredentials,
    path: string,
    baseParams: Record<string, string | number | undefined>,
  ): Promise<{ rows: any[]; partial: boolean; error?: string }> {
    const rows: any[] = [];

    for (let page = 1; page <= MAX_PAGES; page++) {
      const res = await this.signedGet(creds, path, {
        ...baseParams,
        currentPage: page,
        pageSize: PAGE_LIMIT,
      });
      if (!res.success) return { rows, partial: true, error: res.error };

      const body = res.data;
      const batch = Array.isArray(body?.items) ? body.items : Array.isArray(body) ? body : [];
      rows.push(...batch);

      const totalPage = num(body?.totalPage);
      if (batch.length === 0 || batch.length < PAGE_LIMIT || (totalPage && page >= totalPage)) break;
    }

    return { rows, partial: false };
  }

  private async signedGet(
    creds: ExchangeCredentials,
    path: string,
    params: Record<string, string | number | undefined>,
  ): Promise<{ success: boolean; data: any; error?: string }> {
    const qs = queryString(params);
    const endpoint = qs ? `${path}?${qs}` : path;
    const timestamp = String(Date.now());
    const sign = hmac('sha256', creds.apiSecret, `${timestamp}GET${endpoint}`, 'base64');
    // The passphrase is signed, not sent in clear — this is what
    // KC-API-KEY-VERSION 2+ means, and the header must declare it.
    const passphrase = hmac('sha256', creds.apiSecret, creds.passphrase ?? '', 'base64');

    const res = await getJson(`${BASE_URL}${endpoint}`, {
      'KC-API-KEY': creds.apiKey,
      'KC-API-SIGN': sign,
      'KC-API-TIMESTAMP': timestamp,
      'KC-API-PASSPHRASE': passphrase,
      'KC-API-KEY-VERSION': '2',
      'Content-Type': 'application/json',
    });

    const body = res.body;
    // KuCoin's envelope code is a string; '200000' is success.
    if (body && String(body.code) !== '200000') {
      return { success: false, data: null, error: body.msg || `KuCoin error ${body.code}` };
    }
    if (!res.ok) return { success: false, data: null, error: res.error ?? 'KuCoin request failed' };
    return { success: true, data: body?.data ?? null };
  }
}

/**
 * Closed size in contracts, derived from cost and entry price.
 *
 * history-positions reports what the position cost and what it opened at, but
 * never its size. Liquidations can carry a null openPrice, in which case there
 * is nothing to divide by and the size is left at 0 rather than invented.
 */
function closeQty(r: any): number {
  const openPrice = num(r.openPrice);
  const cost = Math.abs(num(r.realisedGrossCost ?? r.realisedGrossCurrency));
  if (!(openPrice > 0) || !(cost > 0)) return 0;
  return cost / openPrice;
}
