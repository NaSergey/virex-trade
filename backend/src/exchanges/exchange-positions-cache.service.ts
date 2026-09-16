import { Injectable } from '@nestjs/common';
import {
  ExchangeCredentials,
  ExchangeId,
  PositionsResult,
} from './exchange.types';
import { ExchangeRegistry } from './exchange-registry.service';

/**
 * T20 (B4): getOpenPositions is read from two places that overlap in time —
 * exchange.controller's `/api/exchange/positions` (2x/min per browser tab,
 * so N tabs of the same user are N near-simultaneous calls) and the
 * background sync tick (once a minute per user). Without this, both paths
 * hit the exchange independently every time they happen to land close
 * together. 12s sits inside the plan's 10-15s window: comfortably above the
 * couple of seconds separating same-user tabs' polls (they don't all start
 * their setInterval at the exact same instant), short enough that a user
 * watching the positions table never sees data staler than about one tick.
 */
const POSITIONS_CACHE_TTL_MS = 12_000;

/**
 * Coalesces getOpenPositions across a user's browser tabs and the
 * background sync tick, exactly the cached()+inflight pattern already used
 * by BybitMarketService for public market data.
 *
 * Keyed `${userId}:${exchange}`, not userId alone: switching the active
 * exchange (settings.controller) lands on a different, empty key rather than
 * serving the previous exchange's cached snapshot under the new one — no
 * separate invalidation hook is needed for that case.
 */
@Injectable()
export class ExchangePositionsCacheService {
  private readonly cache = new Map<
    string,
    { exp: number; val: PositionsResult }
  >();
  private readonly inflight = new Map<string, Promise<PositionsResult>>();

  constructor(private readonly exchanges: ExchangeRegistry) {}

  async getOpenPositions(
    userId: string,
    exchange: ExchangeId,
    creds: ExchangeCredentials,
  ): Promise<PositionsResult> {
    const key = `${userId}:${exchange}`;
    const hit = this.cache.get(key);
    if (hit && hit.exp > Date.now()) return hit.val;

    const running = this.inflight.get(key);
    if (running) return running;

    const p = (async () => {
      try {
        const val = await this.exchanges.get(exchange).getOpenPositions(creds);
        // A failed fetch (network/auth error surfaced as success: false, or
        // this call rejecting) must stay retryable on the very next call, not
        // pin "no positions" for the whole TTL window.
        if (val.success)
          this.cache.set(key, {
            exp: Date.now() + POSITIONS_CACHE_TTL_MS,
            val,
          });
        return val;
      } finally {
        this.inflight.delete(key);
      }
    })();
    this.inflight.set(key, p);
    return p;
  }
}
