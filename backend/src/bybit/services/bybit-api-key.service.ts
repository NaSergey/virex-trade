import { Injectable } from '@nestjs/common';
import { BybitAuthService, BybitCredentials } from './bybit-auth.service';

/** What `GET /v5/user/query-api` says a key is allowed to do. */
export interface BybitApiKeyInfo {
  success: boolean;
  /** True when the key may place, amend or cancel orders anywhere. */
  canTrade: boolean;
  /** True when the key may move funds off the account. */
  canWithdraw: boolean;
  /**
   * True when the key may place derivatives orders — what the exchange terminal
   * needs. Narrower than `canTrade`, which errs on the strict side and counts
   * an unfamiliar group as trading: a terminal shown on a guess would reject
   * every order, so this one names the groups that actually carry the right.
   */
  canPlaceOrders: boolean;
  error?: string;
}

/**
 * Reads the permissions Bybit itself reports for a key.
 *
 * Nothing is refused over the answer — it is shown to the user on the settings
 * page, so they can see what the key they handed over is able to do.
 *
 * Two fields have to be read together. `readOnly: 1` is a key created as
 * read-only, and Bybit still fills its permission groups: they name what such
 * a key may *read* (its own example pairs `readOnly: 1` with ContractTrade
 * ["Order","Position"]). Reading the groups alone called every read-only key
 * a trading one. With `readOnly: 0` the groups are what the key may do, so
 * anything non-empty in a trading or withdrawal group counts.
 */
@Injectable()
export class BybitApiKeyService extends BybitAuthService {
  async getApiKeyInfo(creds: BybitCredentials): Promise<BybitApiKeyInfo> {
    const deny = (error: string): BybitApiKeyInfo => ({
      success: false,
      canTrade: false,
      canWithdraw: false,
      canPlaceOrders: false,
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

      // Only an explicit 1 counts: a missing or unfamiliar flag leaves the key
      // to be judged by its groups, which is the stricter reading.
      if (Number(data.result?.readOnly) === 1) {
        return { success: true, canTrade: false, canWithdraw: false, canPlaceOrders: false };
      }

      const perms = data.result?.permissions ?? {};
      // Every group except the read-only ones grants some kind of order
      // placement; naming the safe ones keeps a group Bybit adds later on the
      // strict side rather than silently shown as harmless.
      const readOnlyGroups = new Set(['Wallet', 'Exchange', 'CopyTrading', 'BlockTrade', 'NFT']);
      const canTrade = Object.entries(perms).some(
        ([group, rights]) =>
          !readOnlyGroups.has(group) && Array.isArray(rights) && rights.length > 0,
      );

      // Only withdrawal, not the transfer rights that sit in the same group:
      // AccountTransfer moves money between the user's own account types and
      // cannot take it off the platform, so calling it withdrawal would alarm
      // the owner of an ordinary key over nothing.
      const walletRights: string[] = Array.isArray(perms.Wallet) ? perms.Wallet : [];
      const canWithdraw = walletRights.some((r) => /withdraw/i.test(String(r)));

      // USDT perpetuals are ordered under ContractTrade (classic account) or
      // Derivatives (unified account); either one is enough.
      const granted = (group: string) => Array.isArray(perms[group]) && perms[group].length > 0;
      const canPlaceOrders = granted('ContractTrade') || granted('Derivatives');

      return { success: true, canTrade, canWithdraw, canPlaceOrders };
    } catch (error: any) {
      console.error('getApiKeyInfo error:', error);
      return deny(error.message);
    }
  }
}
