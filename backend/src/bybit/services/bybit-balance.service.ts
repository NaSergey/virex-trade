import { Injectable } from '@nestjs/common';
import { BybitAuthService, BybitCredentials } from './bybit-auth.service';

@Injectable()
export class BybitBalanceService extends BybitAuthService {
  // Get USDT balance
  async getUSDTBalance(creds: BybitCredentials) {
    try {
      if (!this.hasKeys(creds)) {
        return { balance: 0, availableToWithdraw: 0, success: false, error: 'API keys not configured' };
      }

      const timestamp = Date.now().toString();
      const recvWindow = '5000';

      // Build query parameters (must be sorted alphabetically)
      const queryParams = {
        accountType: 'UNIFIED',
        recv_window: recvWindow,
        timestamp: timestamp,
      };

      const queryString = this.buildQueryString(queryParams);

      // Signature string: timestamp + apiKey + recvWindow + queryString
      const signatureString = timestamp + creds.apiKey + recvWindow + queryString;
      const signature = this.createSignature(signatureString, creds.apiSecret);

      const response = await fetch(`${this.baseUrl}/account/wallet-balance?${queryString}`, {
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

      if (data.retCode === 0 && data.result?.list?.length > 0) {
        const accountInfo = data.result.list[0];
        const usdtCoin = accountInfo.coin?.find((coin: any) => coin.coin === 'USDT');

        if (usdtCoin) {
          return {
            balance: parseFloat(usdtCoin.walletBalance || 0),
            availableToWithdraw: parseFloat(usdtCoin.availableToWithdraw || 0),
            success: true,
          };
        }
      }

      return { balance: 0, availableToWithdraw: 0, success: false, error: data.retMsg || 'No USDT balance found' };
    } catch (error: any) {
      console.error('getUSDTBalance error:', error);
      return { balance: 0, availableToWithdraw: 0, success: false, error: error.message };
    }
  }
}
