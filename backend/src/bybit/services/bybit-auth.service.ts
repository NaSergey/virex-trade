import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { BYBIT_API } from '../bybit-gate';

// Per-user Bybit API credentials, decrypted just-in-time by CredentialsService.
// Never cached on `this` — every signed call takes them explicitly so one
// singleton service instance safely serves every user's requests.
export interface BybitCredentials {
  apiKey: string;
  apiSecret: string;
}

@Injectable()
export class BybitAuthService {
  /**
   * Адрес — из шлюза, а сами запросы наследники шлют только через
   * `bybitFetch`: лимит Bybit на IP сервера общий для всех (`bybit-gate.ts`).
   */
  protected readonly baseUrl = BYBIT_API;

  protected hasKeys(creds: BybitCredentials | null | undefined): creds is BybitCredentials {
    return !!creds?.apiKey && !!creds?.apiSecret;
  }

  // Create HMAC SHA256 signature
  protected createSignature(signatureString: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(signatureString).digest('hex');
  }

  // Build query string with sorted parameters
  protected buildQueryString(params: Record<string, string>): string {
    const sortedKeys = Object.keys(params).sort();
    return sortedKeys.map(key => `${key}=${params[key]}`).join('&');
  }

  // Build headers for authenticated requests
  protected buildAuthHeaders(apiKey: string, timestamp: string, signature: string, recvWindow: string = '5000') {
    return {
      'X-BAPI-API-KEY': apiKey,
      'X-BAPI-SIGN': signature,
      'X-BAPI-TIMESTAMP': timestamp,
      'X-BAPI-RECV-WINDOW': recvWindow,
      'Content-Type': 'application/json',
    };
  }
}
