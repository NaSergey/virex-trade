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

const BASE_URL = 'https://www.okx.com';
// Perpetual swaps — the instrument class the journal is about. OKX keys the
// whole account API on instType, so it is threaded through every call.
const INST_TYPE = 'SWAP';
const PAGE_LIMIT = 100;
// Guard against an unbounded walk if a cursor ever stops advancing.
const MAX_PAGES = 50;

/**
 * OKX v5 adapter.
 *
 * Docs: https://www.okx.com/docs-v5/en/
 * Auth: OK-ACCESS-SIGN = base64(HMAC-SHA256(secret, timestamp + METHOD + path + body)),
 * where `path` includes the query string and `timestamp` is ISO-8601 with
 * milliseconds. OKX also requires the passphrase chosen when the key was
 * created, sent in clear as OK-ACCESS-PASSPHRASE (unlike KuCoin, which signs it).
 *
 * Unlike Bybit, OKX reports ONE row per closed position rather than one per
 * closing order, so a scaled-out exit already arrives collapsed.
 */
@Injectable()
export class OkxAdapter implements ExchangeAdapter {
  readonly id = 'okx' as const;

  async verifyCredentials(creds: ExchangeCredentials) {
    const res = await this.getBalance(creds);
    return res.success ? { success: true } : { success: false, error: res.error };
  }

  async getBalance(creds: ExchangeCredentials): Promise<BalanceResult> {
    const res = await this.signedGet(creds, '/api/v5/account/balance', { ccy: 'USDT' });
    if (!res.success) {
      return { success: false, balance: 0, availableToWithdraw: 0, error: res.error };
    }
    const usdt = (res.data[0]?.details ?? []).find((d: any) => d.ccy === 'USDT');
    return {
      success: true,
      // eqUsd is the position-inclusive equity; availBal is what can be spent.
      balance: num(usdt?.eq ?? usdt?.cashBal),
      availableToWithdraw: num(usdt?.availBal),
    };
  }

  async getOpenPositions(creds: ExchangeCredentials): Promise<PositionsResult> {
    const res = await this.signedGet(creds, '/api/v5/account/positions', { instType: INST_TYPE });
    if (!res.success) return { success: false, positions: [], error: res.error };

    return {
      success: true,
      positions: res.data.map((p: any) => {
        // posSide is 'long' | 'short' in hedge mode and 'net' in one-way mode,
        // where the sign of `pos` carries the direction instead.
        const direction: 'long' | 'short' =
          p.posSide === 'long' || p.posSide === 'short'
            ? p.posSide
            : num(p.pos) >= 0
              ? 'long'
              : 'short';
        return {
          symbol: String(p.instId),
          direction,
          size: String(Math.abs(num(p.pos))),
          avgPrice: str(p.avgPx),
          markPrice: str(p.markPx),
          positionValue: str(p.notionalUsd),
          unrealisedPnl: str(p.upl),
          leverage: str(p.lever),
          liqPrice: str(p.liqPx),
        };
      }),
    };
  }

  async fetchClosedTrades(
    creds: ExchangeCredentials,
    range: TimeRange,
  ): Promise<RangeResult<ClosedTrade>> {
    // positions-history pages backwards: `after` means "older than this uTime".
    const page = await this.pageBackwards(
      creds,
      '/api/v5/account/positions-history',
      { instType: INST_TYPE },
      range,
      (row) => num(row.uTime),
    );

    const items: ClosedTrade[] = [];
    for (const r of page.rows) {
      const closedMs = num(r.uTime);
      if (!r.posId || !closedMs) continue;
      const direction: 'long' | 'short' = r.direction === 'short' ? 'short' : 'long';
      items.push({
        symbol: String(r.instId),
        // OKX states the position side directly; the closing order side is its
        // opposite, which is what the rest of the app stores in `side`.
        side: direction === 'long' ? 'Sell' : 'Buy',
        direction,
        qty: num(r.closeTotalPos),
        avgEntryPrice: num(r.openAvgPx),
        avgExitPrice: num(r.closeAvgPx),
        closedPnl: num(r.realizedPnl),
        // OKX reports one signed `fee` for the whole position (negative = paid)
        // rather than splitting entry and exit. Funding is a separate field and
        // is not a trading fee, so it stays out of both.
        openFee: 0,
        closeFee: Math.abs(num(r.fee)),
        leverage: r.lever ? num(r.lever) : null,
        // No single closing order exists — the position id is the stable
        // identity, and it is what the (userId, exchange, orderId, closedAt)
        // key dedupes on across re-syncs.
        orderId: String(r.posId),
        closedAt: new Date(closedMs),
        raw: r,
      });
    }
    return { success: !page.partial, items, partial: page.partial || undefined, error: page.error };
  }

  async fetchFills(creds: ExchangeCredentials, range: TimeRange): Promise<RangeResult<Fill>> {
    const page = await this.pageBackwards(
      creds,
      '/api/v5/trade/fills-history',
      { instType: INST_TYPE },
      range,
      (row) => num(row.ts),
    );

    const items: Fill[] = [];
    for (const f of page.rows) {
      const ts = num(f.ts);
      const qty = num(f.fillSz);
      if (!f.tradeId || !ts || !(qty > 0)) continue;
      const side: 'Buy' | 'Sell' = f.side === 'buy' ? 'Buy' : 'Sell';
      items.push({
        symbol: String(f.instId),
        side,
        qty,
        price: num(f.fillPx),
        // A fill closes the side opposite to its own direction: in hedge mode
        // posSide names the side it acted on, so a Sell on posSide=long is a
        // close. One-way mode reports posSide='net' and gives no such marker,
        // leaving closedSize 0 — PositionBuilderService then declines to group
        // rather than guessing, which is safe here because OKX already returns
        // closed positions pre-collapsed.
        closedSize:
          (side === 'Sell' && f.posSide === 'long') || (side === 'Buy' && f.posSide === 'short')
            ? qty
            : 0,
        execType: 'Trade',
        orderId: String(f.ordId ?? ''),
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
   * Walk an OKX history endpoint from newest to oldest.
   *
   * OKX paginates with `after` = "return records older than this cursor value"
   * and answers at most `limit` rows, so each page is anchored on the oldest
   * timestamp seen so far. `begin`/`end` bound the range server-side; the loop
   * still stops early once rows fall before `startMs`, because some OKX history
   * endpoints ignore `begin` when a cursor is supplied.
   */
  private async pageBackwards(
    creds: ExchangeCredentials,
    path: string,
    baseParams: Record<string, string | number | undefined>,
    range: TimeRange,
    timeOf: (row: any) => number,
  ): Promise<{ rows: any[]; partial: boolean; error?: string }> {
    const rows: any[] = [];
    let after: string | undefined;

    for (let page = 0; page < MAX_PAGES; page++) {
      const res = await this.signedGet(creds, path, {
        ...baseParams,
        begin: range.startMs,
        end: range.endMs,
        limit: PAGE_LIMIT,
        after,
      });
      if (!res.success) return { rows, partial: true, error: res.error };
      if (res.data.length === 0) break;

      let oldest = Number.POSITIVE_INFINITY;
      let reachedStart = false;
      for (const row of res.data) {
        const ts = timeOf(row);
        if (ts && ts < oldest) oldest = ts;
        if (ts && ts < range.startMs) {
          reachedStart = true;
          continue;
        }
        rows.push(row);
      }

      if (reachedStart || res.data.length < PAGE_LIMIT || !Number.isFinite(oldest)) break;
      after = String(oldest);
    }

    return { rows, partial: false };
  }

  // Non-discriminated on purpose: the project builds with strictNullChecks
  // off, where narrowing a `success: true | false` union does not work.
  private async signedGet(
    creds: ExchangeCredentials,
    path: string,
    params: Record<string, string | number | undefined>,
  ): Promise<{ success: boolean; data: any[]; error?: string }> {
    const qs = queryString(params);
    const requestPath = qs ? `${path}?${qs}` : path;
    // ISO-8601 with milliseconds, e.g. 2020-12-08T09:08:57.715Z — OKX rejects a
    // request whose timestamp is more than 30s from server time.
    const timestamp = new Date().toISOString();
    const sign = hmac('sha256', creds.apiSecret, `${timestamp}GET${requestPath}`, 'base64');

    const res = await getJson(`${BASE_URL}${requestPath}`, {
      'OK-ACCESS-KEY': creds.apiKey,
      'OK-ACCESS-SIGN': sign,
      'OK-ACCESS-TIMESTAMP': timestamp,
      'OK-ACCESS-PASSPHRASE': creds.passphrase ?? '',
      'Content-Type': 'application/json',
    });

    // OKX wraps everything: code '0' is success, anything else carries msg.
    const body = res.body;
    if (body && String(body.code) !== '0') {
      return { success: false, data: [], error: body.msg || `OKX error ${body.code}` };
    }
    if (!res.ok) return { success: false, data: [], error: res.error ?? 'OKX request failed' };
    return { success: true, data: Array.isArray(body?.data) ? body.data : [] };
  }
}
