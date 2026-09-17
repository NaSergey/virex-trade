import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CredentialsCryptoService } from './credentials-crypto.service';
import { ExchangeCredentials, ExchangeId } from '../exchanges/exchange.types';

/** A connection as the settings page sees it — never carries a live secret. */
export interface ConnectionStatus {
  exchange: ExchangeId;
  /** Null when the stored blob can't be opened — see `needsReconnect`. */
  apiKeyMasked: string | null;
  connectedAt: Date;
  /**
   * The row exists but its secrets are unreadable under the current
   * CREDENTIALS_ENCRYPTION_KEY: the user has to enter the keys again.
   */
  needsReconnect: boolean;
}

// T20 (B4): activeExchange() + get() together cost a `user` read, an
// `exchangeConnection` read and two/three AES decrypts on EVERY call that
// needs credentials — requireActive()/getActive() run that pair on every
// positions/balance poll, twice a minute per browser tab times however many
// tabs a user has open. A short in-memory cache collapses those into one hit
// per TTL window.
//
// T20 fix (review): this cache is a per-process singleton, and T11 splits
// `api` and `worker` into separate Node processes (backend/src/role.ts,
// docker-compose.prod.yml) with no shared cache and no Redis (plan decision,
// spec section C1) — invalidate() below only ever reaches the process that
// called it. settings.controller.ts runs in `api`, so its invalidate() makes
// `api`'s own next read correct immediately, but `worker`'s independent
// CredentialsService instance never sees that call; the TTL is what bounds
// how long *it* can keep serving a revoked/replaced key. 15s keeps that
// bound in the "seconds" the review asked for (worst case ~2x TTL — a read
// cached just before the change, then valid until it naturally expires) —
// down from the 60s originally chosen here, which produced a 60-120s window.
// This also means a single browser tab (polling every 30s) gets essentially
// no cache hits any more — each of its own polls lands after the cache has
// already expired, so its DB-read rate is unchanged from before T20. What
// this TTL still buys: concurrent in-flight dedup (several tabs polling at
// the same instant — the `inflight` map catches that at any TTL, including
// zero) plus a real cache hit for calls that land within the same ~15s
// window (several tabs open close together, or a page firing balance() and
// positions() back to back). Exactly reducing the multi-tab duplication B4
// named — not a lone tab's own steady 30s cadence.
//
// It also happens to sit under TradeSyncService's SYNC_INTERVAL_MS (60s):
// `worker` only calls activeExchange()/get() once per sync tick per user, so
// with TTL < 60s that call is *always* a cache miss (the previous tick's
// entry has already expired) — `worker` re-reads the DB on every tick
// regardless of this TTL's exact value, the same as it did before T20. The
// worst case for `worker` noticing a key change is therefore still bounded
// by one sync tick (~60s), not by this cache — unchanged from pre-T20
// behavior, where it never cached credentials at all.
export const CREDENTIALS_CACHE_TTL_MS = 15_000;

/**
 * Stores and retrieves per-user, per-exchange API credentials.
 *
 * Credentials live in ExchangeConnection rows, encrypted at rest, and are
 * decrypted only at the moment a request needs them. `activeExchange` on the
 * user picks which connection drives sync, positions and trading.
 */
@Injectable()
export class CredentialsService {
  private readonly logger = new Logger(CredentialsService.name);

  // Keyed `${userId}:${exchange}` — a user can hold more than one connection.
  private readonly credsCache = new Map<
    string,
    { exp: number; val: ExchangeCredentials | null }
  >();
  private readonly credsInflight = new Map<
    string,
    Promise<ExchangeCredentials | null>
  >();
  // Keyed by userId alone — one active exchange per user.
  private readonly activeCache = new Map<
    string,
    { exp: number; val: ExchangeId | null }
  >();
  private readonly activeInflight = new Map<
    string,
    Promise<ExchangeId | null>
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CredentialsCryptoService,
  ) {}

  // Cache + request coalescing, same shape as BybitMarketService.cached(): a
  // key can cache `null` (genuinely "not connected"/"no active exchange") —
  // only a *thrown* fetcher stays uncached, so a transient DB/decrypt failure
  // stays retryable on the very next call instead of being pinned for a
  // minute.
  private async cached<T>(
    cache: Map<string, { exp: number; val: T }>,
    inflight: Map<string, Promise<T>>,
    key: string,
    ttlMs: number,
    fetcher: () => Promise<T>,
  ): Promise<T> {
    const hit = cache.get(key);
    if (hit && hit.exp > Date.now()) return hit.val;

    const running = inflight.get(key);
    if (running) return running;

    const p = (async () => {
      try {
        const val = await fetcher();
        cache.set(key, { exp: Date.now() + ttlMs, val });
        return val;
      } finally {
        inflight.delete(key);
      }
    })();
    inflight.set(key, p);
    return p;
  }

  /**
   * Drops this user's cached credentials and active-exchange snapshot.
   *
   * Must run right after any write that changes what get()/activeExchange()
   * would return — a saved/cleared connection or a switched active exchange —
   * so the very next read reflects it instead of the stale value surviving up
   * to CREDENTIALS_CACHE_TTL_MS. In-flight reads started just before the
   * write are left to finish; the tiny race between "settings just changed"
   * and "a read was already mid-flight" is not one a cache can close, and the
   * next read after that still gets the fresh value.
   *
   * Only clears *this* process's cache — settings.controller.ts (the one
   * caller, running in the `api` process) reaches only its own instance.
   * It does not, and cannot without a cross-process channel this plan
   * deliberately doesn't add (spec section C1), reach `worker`'s separate
   * CredentialsService. See the CREDENTIALS_CACHE_TTL_MS comment above for
   * why that gap is bounded rather than open-ended.
   */
  invalidate(userId: string): void {
    this.activeCache.delete(userId);
    const prefix = `${userId}:`;
    for (const key of this.credsCache.keys()) {
      if (key.startsWith(prefix)) this.credsCache.delete(key);
    }
  }

  /** Decrypted credentials for one exchange, or null if it isn't connected. */
  async get(
    userId: string,
    exchange: ExchangeId,
  ): Promise<ExchangeCredentials | null> {
    return this.cached(
      this.credsCache,
      this.credsInflight,
      `${userId}:${exchange}`,
      CREDENTIALS_CACHE_TTL_MS,
      () => this.fetchCredentials(userId, exchange),
    );
  }

  private async fetchCredentials(
    userId: string,
    exchange: ExchangeId,
  ): Promise<ExchangeCredentials | null> {
    const row = await this.prisma.exchangeConnection.findUnique({
      where: { userId_exchange: { userId, exchange } },
    });
    if (!row) return null;
    try {
      return {
        apiKey: this.crypto.decrypt(row.apiKeyEnc),
        apiSecret: this.crypto.decrypt(row.apiSecretEnc),
        ...(row.passphraseEnc
          ? { passphrase: this.crypto.decrypt(row.passphraseEnc) }
          : {}),
      };
    } catch (e) {
      // A raw throw here surfaced as a bare 500 "Internal server error", which
      // told the user nothing and named no way out. The cause is an operator
      // one (key rotated, DB restored under another key), so it goes to the
      // log; the client gets the one sentence that describes the remedy.
      this.logger.error(
        `cannot decrypt ${exchange} credentials of user ${userId}: ${e}`,
      );
      throw new BadRequestException({
        message:
          `Сохранённые ключи «${exchange}» не читаются: они зашифрованы другим ключом сервера. ` +
          'Подключите биржу заново на странице «Настройки».',
        code: 'EXCHANGE_KEYS_UNREADABLE',
        params: { exchange },
      });
    }
  }

  /** Which exchange this user is currently working with, if any. */
  async activeExchange(userId: string): Promise<ExchangeId | null> {
    return this.cached(
      this.activeCache,
      this.activeInflight,
      userId,
      CREDENTIALS_CACHE_TTL_MS,
      () => this.fetchActiveExchange(userId),
    );
  }

  private async fetchActiveExchange(
    userId: string,
  ): Promise<ExchangeId | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { activeExchange: true },
    });
    return (user?.activeExchange as ExchangeId | null) ?? null;
  }

  /**
   * Credentials of the active exchange, plus which one it is. Null when the
   * user has connected nothing — callers that must have keys use
   * requireActive() instead.
   */
  async getActive(userId: string): Promise<{
    exchange: ExchangeId;
    credentials: ExchangeCredentials;
  } | null> {
    const exchange = await this.activeExchange(userId);
    if (!exchange) return null;
    const credentials = await this.get(userId, exchange);
    if (!credentials) return null;
    return { exchange, credentials };
  }

  /** Same as getActive(), but throws a clear, user-facing error when absent. */
  async requireActive(
    userId: string,
  ): Promise<{ exchange: ExchangeId; credentials: ExchangeCredentials }> {
    const active = await this.getActive(userId);
    if (!active) {
      throw new BadRequestException({
        message:
          'Биржа не подключена. Добавьте API-ключи на странице «Настройки».',
        code: 'EXCHANGE_NOT_CONNECTED',
      });
    }
    return active;
  }

  /** Same, for endpoints that are specific to one exchange rather than active. */
  async require(
    userId: string,
    exchange: ExchangeId,
  ): Promise<ExchangeCredentials> {
    const creds = await this.get(userId, exchange);
    if (!creds) {
      throw new BadRequestException({
        message: `Биржа «${exchange}» не подключена. Добавьте API-ключи на странице «Настройки».`,
        code: 'EXCHANGE_NOT_CONNECTED_NAMED',
        params: { exchange },
      });
    }
    return creds;
  }

  /**
   * Every connection this user holds, for the settings page.
   *
   * A key that won't decrypt must not take the list down with it: this is the
   * only page from which the user can re-enter the keys, and a throw here left
   * it stuck on its loading skeleton — the one screen that fixes the problem
   * was the one screen the problem closed. Such a row comes back as connected
   * but `needsReconnect`, without a masked key it cannot produce.
   */
  async list(userId: string): Promise<ConnectionStatus[]> {
    const rows = await this.prisma.exchangeConnection.findMany({
      where: { userId },
      orderBy: { connectedAt: 'asc' },
    });
    return rows.map((r) => {
      const exchange = r.exchange as ExchangeId;
      try {
        return {
          exchange,
          apiKeyMasked: this.maskKey(this.crypto.decrypt(r.apiKeyEnc)),
          connectedAt: r.connectedAt,
          needsReconnect: false,
        };
      } catch (e) {
        this.logger.error(
          `cannot decrypt ${exchange} credentials of user ${userId}: ${e}`,
        );
        return {
          exchange,
          apiKeyMasked: null,
          connectedAt: r.connectedAt,
          needsReconnect: true,
        };
      }
    });
  }

  /**
   * Store (or replace) one exchange's credentials. The first connection also
   * becomes the active one, so connecting is a single step for a new user.
   */
  async save(
    userId: string,
    exchange: ExchangeId,
    creds: ExchangeCredentials,
  ): Promise<void> {
    const data = {
      apiKeyEnc: this.crypto.encrypt(creds.apiKey),
      apiSecretEnc: this.crypto.encrypt(creds.apiSecret),
      passphraseEnc: creds.passphrase
        ? this.crypto.encrypt(creds.passphrase)
        : null,
    };
    await this.prisma.$transaction(async (tx) => {
      await tx.exchangeConnection.upsert({
        where: { userId_exchange: { userId, exchange } },
        create: { userId, exchange, ...data, connectedAt: new Date() },
        update: { ...data, connectedAt: new Date() },
      });
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { activeExchange: true },
      });
      if (!user?.activeExchange) {
        await tx.user.update({
          where: { id: userId },
          data: { activeExchange: exchange },
        });
      }
    });
  }

  /**
   * Drop one exchange's credentials. If it was the active one, hand the slot to
   * another connection rather than leaving the user pointed at nothing — that
   * would silently stop sync for an account they still have connected.
   */
  async clear(userId: string, exchange: ExchangeId): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.exchangeConnection.deleteMany({ where: { userId, exchange } });
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { activeExchange: true },
      });
      if (user?.activeExchange !== exchange) return;
      const fallback = await tx.exchangeConnection.findFirst({
        where: { userId },
        orderBy: { connectedAt: 'asc' },
        select: { exchange: true },
      });
      await tx.user.update({
        where: { id: userId },
        data: { activeExchange: fallback?.exchange ?? null },
      });
    });
  }

  /** Switch which connected exchange the app works with. */
  async setActive(userId: string, exchange: ExchangeId): Promise<void> {
    const connected = await this.prisma.exchangeConnection.findUnique({
      where: { userId_exchange: { userId, exchange } },
      select: { id: true },
    });
    if (!connected) {
      throw new BadRequestException({
        message: 'Сначала подключите API-ключи этой биржи',
        code: 'EXCHANGE_NOT_CONNECTED',
      });
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { activeExchange: exchange },
    });
  }

  /** "ASSjQYU2q1zf6h28mZ" -> "••••••••••••••••mZ" — never expose the full key back to the client. */
  maskKey(apiKey: string): string {
    if (apiKey.length <= 4) return '••••';
    return '•'.repeat(apiKey.length - 4) + apiKey.slice(-4);
  }
}
