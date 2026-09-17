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
 *
 * This is a per-process instance (see role.ts / T11): `api` and `worker` run
 * as separate Node processes in prod, each with its own
 * ExchangePositionsCacheService, so this dedup is real only for callers that
 * land in the *same* process — every browser tab against the one `api`
 * process (the actual duplication B4 named), and, in the combined `all`-role
 * single-process deployment (local dev), the sync tick too. In the split
 * prod topology the sync tick's exchange call is not visible to `api`'s
 * cache or vice versa; that pair can still each make one exchange call in
 * the same window, bounded to this same 12s TTL rather than compounding.
 */
const POSITIONS_CACHE_TTL_MS = 12_000;

/**
 * Coalesces getOpenPositions across a user's browser tabs (and, in a
 * combined single-process deployment, the background sync tick too — see the
 * per-process note above), exactly the cached()+inflight pattern already
 * used by BybitMarketService for public market data.
 *
 * Keyed `${userId}:${exchange}`, not userId alone: switching the active
 * exchange (settings.controller) lands on a different, empty key rather than
 * serving the previous exchange's cached snapshot under the new one.
 * Rotating the key of an exchange that's already connected does need
 * invalidate() below, though — same key, new credentials.
 */
@Injectable()
export class ExchangePositionsCacheService {
  private readonly cache = new Map<
    string,
    { exp: number; val: PositionsResult }
  >();
  private readonly inflight = new Map<string, Promise<PositionsResult>>();

  constructor(private readonly exchanges: ExchangeRegistry) {}

  /**
   * Drops one user+exchange's cached snapshot — call right after that
   * exchange's key is rotated (settings.controller's connect(), same point
   * as credentials.invalidate()) so the next read fetches under the new key
   * instead of serving up to POSITIONS_CACHE_TTL_MS of positions fetched
   * under the old one. A no-op if nothing is cached for that pair.
   */
  invalidate(userId: string, exchange: ExchangeId): void {
    this.cache.delete(`${userId}:${exchange}`);
  }

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
