import { Injectable } from '@nestjs/common';
import { BybitAuthService, BybitCredentials } from './bybit-auth.service';

/** What `GET /v5/user/query-api` says a key is allowed to do. */
export interface BybitApiKeyInfo {
  success: boolean;
  /** True when the key may place, amend or cancel orders anywhere. */
  canTrade: boolean;
  /** True when the key may move funds off the account. */
  canWithdraw: boolean;
  error?: string;
}

/**
 * Reads the permissions Bybit itself reports for a key.
 *
 * Virex only ever reads an account, so a key handed to it should not be able to
 * trade or withdraw — and the only way to know before storing it is to ask.
 * `readOnly` alone is not enough: it is 1 only for keys created as read-only,
 * while a key with permissions later trimmed by hand still reports 0. The
 * permission lists are the authority, so anything non-empty in a
 * trading or withdrawal group counts.
 */
@Injectable()
export class BybitApiKeyService extends BybitAuthService {
  async getApiKeyInfo(creds: BybitCredentials): Promise<BybitApiKeyInfo> {
    const deny = (error: string): BybitApiKeyInfo => ({
      success: false,
      canTrade: false,
      canWithdraw: false,
      error,
    });

    try {
      if (!this.hasKeys(creds)) return deny('API keys not configured');

      const timestamp = Date.now().toString();
      const recvWindow = '5000';
      const signature = this.createSignature(
        timestamp + creds.apiKey + recvWindow,
        creds.apiSecret,
      );

      const response = await fetch(`${this.baseUrl}/user/query-api`, {
        method: 'GET',
        headers: this.buildAuthHeaders(creds.apiKey, timestamp, signature, recvWindow),
      });
      const data = await response.json();

      if (data.retCode !== 0) {
        return deny(data.retMsg || 'Не удалось прочитать права API-ключа');
      }

      const perms = data.result?.permissions ?? {};
      // Every group except the read-only ones grants some kind of order
      // placement; naming the safe ones keeps a group Bybit adds later on the
      // strict side of the check rather than silently allowed.
      const readOnlyGroups = new Set(['Wallet', 'Exchange', 'CopyTrading', 'BlockTrade', 'NFT']);
      const canTrade = Object.entries(perms).some(
        ([group, rights]) =>
          !readOnlyGroups.has(group) && Array.isArray(rights) && rights.length > 0,
      );

      // Only withdrawal, not the transfer rights that sit in the same group:
      // AccountTransfer moves money between the user's own account types and
      // cannot take it off the platform, so refusing keys over it would reject
      // ordinary read-only keys for no gain in safety.
      const walletRights: string[] = Array.isArray(perms.Wallet) ? perms.Wallet : [];
      const canWithdraw = walletRights.some((r) => /withdraw/i.test(String(r)));

      return { success: true, canTrade, canWithdraw };
    } catch (error: any) {
      console.error('getApiKeyInfo error:', error);
      return deny(error.message);
    }
  }
}
