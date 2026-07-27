import { Injectable } from '@nestjs/common';
import { BybitAuthService, BybitCredentials } from './bybit-auth.service';

export interface ClosedPnlPage {
  success: boolean;
  list: any[];
  nextPageCursor?: string;
  error?: string;
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

const EXEC_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // Bybit execution/list max window
const EXEC_MAX_WINDOWS = 13; // ~90 days cap

/**
 * Reads realized-PnL history from Bybit (GET /v5/position/closed-pnl).
 * Signed GET, same scheme as the other authed services. Bybit limits a single
 * query to a 7-day window and 100 rows per page; the sync service walks windows
 * and follows the cursor.
 */
@Injectable()
export class BybitTradeService extends BybitAuthService {
  async fetchClosedPnlPage(
    creds: BybitCredentials,
    params: {
      startTime?: number;
      endTime?: number;
      cursor?: string;
      limit?: number;
      symbol?: string;
    },
  ): Promise<ClosedPnlPage> {
    try {
      if (!this.hasKeys(creds)) {
        return { success: false, list: [], error: 'API keys not configured' };
      }

      const timestamp = Date.now().toString();
      const recvWindow = '5000';

      const queryParams: Record<string, string> = {
        category: 'linear',
        limit: String(params.limit ?? 100),
      };
      if (params.symbol) queryParams.symbol = params.symbol;
      if (params.startTime) queryParams.startTime = String(params.startTime);
      if (params.endTime) queryParams.endTime = String(params.endTime);
      // Cursor must be URL-encoded consistently in both the signature and the URL.
      if (params.cursor) queryParams.cursor = encodeURIComponent(params.cursor);

      const queryString = this.buildQueryString(queryParams);
      const signatureString = timestamp + creds.apiKey + recvWindow + queryString;
      const signature = this.createSignature(signatureString, creds.apiSecret);

      const response = await fetch(`${this.baseUrl}/position/closed-pnl?${queryString}`, {
        method: 'GET',
        headers: this.buildAuthHeaders(creds.apiKey, timestamp, signature, recvWindow),
      });

      const data = await response.json();
      if (data.retCode !== 0) {
        return { success: false, list: [], error: data.retMsg || 'Failed to fetch closed PnL' };
      }

      return {
        success: true,
        list: data.result?.list ?? [],
        nextPageCursor: data.result?.nextPageCursor || undefined,
      };
    } catch (error: any) {
      console.error('fetchClosedPnlPage error:', error);
      return { success: false, list: [], error: error.message };
    }
  }

  /** One signed page of raw executions (GET /v5/execution/list). */
  async fetchExecutionsPage(
    creds: BybitCredentials,
    params: {
      symbol?: string;
      startTime?: number;
      endTime?: number;
      cursor?: string;
      limit?: number;
    },
  ): Promise<ClosedPnlPage> {
    try {
      if (!this.hasKeys(creds)) {
        return { success: false, list: [], error: 'API keys not configured' };
      }

      const timestamp = Date.now().toString();
      const recvWindow = '5000';

      const queryParams: Record<string, string> = {
        category: 'linear',
        limit: String(params.limit ?? 100),
      };
      if (params.symbol) queryParams.symbol = params.symbol;
      if (params.startTime) queryParams.startTime = String(params.startTime);
      if (params.endTime) queryParams.endTime = String(params.endTime);
      if (params.cursor) queryParams.cursor = encodeURIComponent(params.cursor);

      const queryString = this.buildQueryString(queryParams);
      const signatureString = timestamp + creds.apiKey + recvWindow + queryString;
      const signature = this.createSignature(signatureString, creds.apiSecret);

      const response = await fetch(`${this.baseUrl}/execution/list?${queryString}`, {
        method: 'GET',
        headers: this.buildAuthHeaders(creds.apiKey, timestamp, signature, recvWindow),
      });

      const data = await response.json();
      if (data.retCode !== 0) {
        return { success: false, list: [], error: data.retMsg || 'Failed to fetch executions' };
      }

      return {
        success: true,
        list: data.result?.list ?? [],
        nextPageCursor: data.result?.nextPageCursor || undefined,
      };
    } catch (error: any) {
      console.error('fetchExecutionsPage error:', error);
      return { success: false, list: [], error: error.message };
    }
  }

  /**
   * Recent fills for a symbol, aggregated to one marker per order (so grid /
   * partial fills don't spam the chart). Walks 7-day windows back over `days`.
   */
  async fetchExecutions(creds: BybitCredentials, params: { symbol: string; days?: number }): Promise<ExecMarker[]> {
    const windows = Math.min(Math.ceil((params.days ?? 30) / 7), EXEC_MAX_WINDOWS);
    const now = Date.now();

    // Accumulate per order: weighted price, total qty, latest time, any close.
    const byOrder = new Map<
      string,
      { time: number; valueSum: number; qty: number; side: 'Buy' | 'Sell'; isClose: boolean }
    >();
    const seenExec = new Set<string>();

    for (let i = 0; i < windows; i++) {
      const end = now - i * EXEC_WINDOW_MS;
      const start = end - EXEC_WINDOW_MS;
      let cursor: string | undefined;
      do {
        const page = await this.fetchExecutionsPage(creds, { symbol: params.symbol, startTime: start, endTime: end, cursor });
        if (!page.success) break;
        for (const e of page.list) {
          if (e.execType !== 'Trade') continue; // skip funding etc.
          if (e.execId && seenExec.has(e.execId)) continue;
          if (e.execId) seenExec.add(e.execId);
          const orderId = String(e.orderId);
          const price = parseFloat(e.execPrice ?? '0');
          const qty = parseFloat(e.execQty ?? '0');
          const time = Math.floor(Number(e.execTime) / 1000);
          if (!orderId || !Number.isFinite(time) || qty <= 0) continue;
          const closed = parseFloat(e.closedSize ?? '0') > 0;
          const acc = byOrder.get(orderId);
          if (acc) {
            acc.valueSum += price * qty;
            acc.qty += qty;
            acc.time = Math.max(acc.time, time);
            acc.isClose = acc.isClose || closed;
          } else {
            byOrder.set(orderId, {
              time,
              valueSum: price * qty,
              qty,
              side: e.side === 'Buy' ? 'Buy' : 'Sell',
              isClose: closed,
            });
          }
        }
        cursor = page.nextPageCursor;
      } while (cursor);
    }

    const markers: ExecMarker[] = [];
    for (const [orderId, a] of byOrder) {
      markers.push({
        orderId,
        time: a.time,
        price: a.qty > 0 ? a.valueSum / a.qty : 0,
        side: a.side,
        qty: a.qty,
        isClose: a.isClose,
      });
    }
    markers.sort((x, y) => x.time - y.time);
    return markers;
  }
}
