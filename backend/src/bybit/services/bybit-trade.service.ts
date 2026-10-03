import { Injectable } from '@nestjs/common';
import { BybitAuthService, BybitCredentials } from './bybit-auth.service';
import { bybitFetch } from '../bybit-gate';

export interface ClosedPnlPage {
  success: boolean;
  list: any[];
  nextPageCursor?: string;
  error?: string;
}

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

      const response = await bybitFetch(`${this.baseUrl}/position/closed-pnl?${queryString}`, {
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

      const response = await bybitFetch(`${this.baseUrl}/execution/list?${queryString}`, {
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
}
