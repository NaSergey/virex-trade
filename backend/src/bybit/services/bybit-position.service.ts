import { Injectable } from '@nestjs/common';
import { BybitAuthService, BybitCredentials } from './bybit-auth.service';

@Injectable()
export class BybitPositionService extends BybitAuthService {
  // Get open positions
  async getOpenPositions(creds: BybitCredentials) {
    try {
      if (!this.hasKeys(creds)) {
        return { positions: [], success: false, error: 'API keys not configured' };
      }

      const timestamp = Date.now().toString();
      const recvWindow = '5000';

      // Build query parameters (must be sorted alphabetically)
      const queryParams = {
        category: 'linear',
        recv_window: recvWindow,
        settleCoin: 'USDT',
        timestamp: timestamp,
      };

      const queryString = this.buildQueryString(queryParams);

      // Signature string: timestamp + apiKey + recvWindow + queryString
      const signatureString = timestamp + creds.apiKey + recvWindow + queryString;
      const signature = this.createSignature(signatureString, creds.apiSecret);

      const response = await fetch(`${this.baseUrl}/position/list?${queryString}`, {
        method: 'GET',
        headers: this.buildAuthHeaders(creds.apiKey, timestamp, signature, recvWindow),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.retMsg || `HTTP error! status: ${response.status}`;
        console.error('Bybit API error:', {
          status: response.status,
          message: errorMessage,
          retCode: errorData.retCode,
        });
        throw new Error(errorMessage);
      }

      const data = await response.json();

      if (data.retCode === 0 && data.result?.list) {
        const positions = data.result.list.filter((pos: any) => parseFloat(pos.size) > 0);
        return { positions, success: true };
      }

      return { positions: [], success: false, error: data.retMsg || 'Failed to get positions' };
    } catch (error: any) {
      console.error('getOpenPositions error:', error);
      return { positions: [], success: false, error: error.message };
    }
  }

  // Get margin mode (isolated / cross) for a specific symbol (based on first position)
  async getMarginMode(creds: BybitCredentials, symbol: string) {
    try {
      if (!this.hasKeys(creds)) {
        return { success: false, error: 'API keys not configured' };
      }

      const timestamp = Date.now().toString();
      const recvWindow = '5000';

      const queryParams = {
        category: 'linear',
        symbol,
        recv_window: recvWindow,
        timestamp: timestamp,
      };

      const queryString = this.buildQueryString(queryParams);
      const signatureString = timestamp + creds.apiKey + recvWindow + queryString;
      const signature = this.createSignature(signatureString, creds.apiSecret);

      const response = await fetch(`${this.baseUrl}/position/list?${queryString}`, {
        method: 'GET',
        headers: this.buildAuthHeaders(creds.apiKey, timestamp, signature, recvWindow),
      });

      const data = await response.json();

      if (data.retCode !== 0 || !data.result?.list?.length) {
        return {
          success: false,
          error: data.retMsg || 'Не удалось получить информацию о марже',
        };
      }

      const position = data.result.list[0];

      // Bybit v5: tradeMode / isolated flags can различаться по типу (число/строка)
      const tradeMode = position.tradeMode ?? position.isolated;
      const isolated =
        tradeMode === 1 ||
        tradeMode === '1' ||
        position.isolated === 1 ||
        position.isolated === '1';

      return {
        success: true,
        symbol,
        marginMode: isolated ? 'isolated' : 'cross',
        raw: {
          tradeMode,
          isolated: position.isolated,
        },
      };
    } catch (error: any) {
      console.error('getMarginMode error:', error);
      return { success: false, error: error.message };
    }
  }
}
