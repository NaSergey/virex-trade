import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BybitTradeService } from '../bybit/services/bybit-trade.service';
import { BybitService } from '../bybit/bybit.service';
import { CredentialsService } from '../credentials/credentials.service';
import { BybitCredentials } from '../bybit/services/bybit-auth.service';
import { TagsService } from '../tags/tags.service';
import { TelegramService, OpenedPositionInfo } from '../telegram/telegram.service';
import { TradeContextService } from './trade-context.service';
import { PositionBuilderService } from './position-builder.service';

const WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // Bybit closed-pnl max query window
const BACKFILL_WEEKS = 26; // first run: import ~6 months of history
const SYNC_INTERVAL_MS = 60_000; // periodic incremental sync

/**
 * Keeps each connected user's local `trades` table in sync with their own
 * Bybit realized-PnL history. On boot (and then on an interval) it loops over
 * every user who has Bybit keys connected and pulls their recent window
 * (or backfills history on their first-ever sync). Closed trades never
 * change, so inserts are idempotent via the (userId, orderId, closedAt)
 * unique key.
 */
@Injectable()
export class TradeSyncService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(TradeSyncService.name);
  private syncing = false;
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly bybitTrade: BybitTradeService,
    private readonly bybit: BybitService,
    private readonly credentials: CredentialsService,
    private readonly tags: TagsService,
    private readonly telegram: TelegramService,
    private readonly tradeContext: TradeContextService,
    private readonly positions: PositionBuilderService,
  ) {}

  onApplicationBootstrap() {
    // Don't block startup on the network; sync in the background.
    this.syncAll().catch((e) => this.logger.error('initial sync failed', e));
    this.timer = setInterval(() => {
      this.syncAll().catch((e) => this.logger.error('periodic sync failed', e));
    }, SYNC_INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Sync every user that has connected Bybit keys. Used by the periodic timer. */
  async syncAll(opts?: { full?: boolean }): Promise<{ inserted: number }> {
    if (this.syncing) return { inserted: 0 };
    this.syncing = true;
    try {
      const users = await this.prisma.user.findMany({
        where: { bybitApiKeyEnc: { not: null } },
        select: { id: true },
      });
      let inserted = 0;
      for (const u of users) {
        inserted += await this.syncUserUnlocked(u.id, opts);
      }
      return { inserted };
    } finally {
      this.syncing = false;
    }
  }

  /** Manual re-sync for a single user (e.g. right after connecting keys). */
  async syncUser(userId: string, opts?: { full?: boolean }): Promise<{ inserted: number }> {
    if (this.syncing) return { inserted: 0 };
    this.syncing = true;
    try {
      return { inserted: await this.syncUserUnlocked(userId, opts) };
    } finally {
      this.syncing = false;
    }
  }

  private async syncUserUnlocked(userId: string, opts?: { full?: boolean }): Promise<number> {
    const creds = await this.credentials.get(userId);
    if (!creds) return 0;

    const existing = await this.prisma.trade.count({ where: { userId } });
    const weeks = opts?.full || existing === 0 ? BACKFILL_WEEKS : 1;
    const now = Date.now();
    let inserted = 0;
    for (let i = 0; i < weeks; i++) {
      const end = now - i * WINDOW_MS;
      const start = end - WINDOW_MS;
      const records = await this.fetchWindow(creds, start, end);
      inserted += await this.persist(userId, records);
    }
    if (inserted > 0) {
      this.logger.log(`synced ${inserted} new trade(s) for user ${userId}`);
      // New closed trades inherit the entry-reason tags of their position.
      try {
        const linked = await this.tags.linkTagsToNewTrades(userId);
        if (linked > 0) this.logger.log(`linked ${linked} tag(s) to synced trades`);
      } catch (e) {
        this.logger.warn(`tag linking failed: ${e}`);
      }
    }
    // Stamp approximate entry time from the first-seen registry. Runs every
    // tick (not just on inserts) so a failed attempt retries while the
    // registry row still exists; must run before the prune below drops the
    // rows of closed positions.
    try {
      const filled = await this.fillOpenedAt(userId);
      if (filled > 0) this.logger.log(`stamped openedAt on ${filled} trade(s)`);
    } catch (e) {
      this.logger.warn(`openedAt fill failed: ${e}`);
    }
    // Group the closing orders of one position under a shared positionId, so
    // partial take-profits and averaging in stop counting as separate trades.
    // Runs every tick (not just on inserts): a position that closed in parts
    // only becomes groupable once its final closing fill arrives.
    try {
      const p = await this.positions.sync(userId, creds, opts);
      if (p.fills > 0 || p.stamped > 0) {
        this.logger.log(`positions: +${p.fills} fill(s), ${p.stamped} trade(s) grouped into ${p.positions} position(s)`);
      }
    } catch (e) {
      this.logger.warn(`position rebuild failed: ${e}`);
    }
    // Market-context snapshots for trades that don't have one yet (new trades
    // + progressive backfill of history). Must run AFTER fillOpenedAt so the
    // snapshot anchors at the entry time whenever we know it.
    try {
      const ctx = await this.tradeContext.computeMissing(userId);
      if (ctx > 0) this.logger.log(`computed market context for ${ctx} trade(s)`);
    } catch (e) {
      this.logger.warn(`trade context compute failed: ${e}`);
    }
    // Drop position tags once their position has fully closed, so they don't
    // carry over to the next position opened on the same symbol+direction.
    // The openedAt registry follows the exact same lifecycle.
    try {
      const open = await this.bybit.getOpenPositions(creds);
      if (open.success) {
        // Tag prune keeps the historical unfiltered-keys semantics (a 0-size
        // row keeps tags one extra tick, which linkTagsToNewTrades relies on).
        const openKeys = new Set<string>(
          open.positions.map((p: any) => `${p.symbol}|${p.side === 'Buy' ? 'long' : 'short'}`),
        );
        await this.tags.pruneClosedPositions(userId, openKeys);
        // The registry (and its notifications) only counts real exposure —
        // Bybit briefly reports just-closed positions with size 0.
        const positions: OpenedPositionInfo[] = open.positions
          .filter((p: any) => parseFloat(p.size ?? '0') > 0)
          .map((p: any) => ({
            symbol: String(p.symbol),
            direction: p.side === 'Buy' ? ('long' as const) : ('short' as const),
            size: p.size != null ? String(p.size) : undefined,
            avgPrice: p.avgPrice != null && p.avgPrice !== '' ? String(p.avgPrice) : undefined,
            leverage: p.leverage != null && p.leverage !== '' ? String(p.leverage) : undefined,
          }));
        await this.trackOpenPositions(userId, positions);
      }
    } catch (e) {
      this.logger.warn(`position tag prune failed: ${e}`);
    }
    return inserted;
  }

  /**
   * Keep the OpenPositionSeen registry in step with Bybit: remember when each
   * currently open position was first seen (that's our best entry-time proxy —
   * Bybit's closed-pnl has no entry time and the position list's createdTime
   * doesn't reset per position lifecycle), and drop rows whose position is
   * gone so they can't leak onto the next position on the same key.
   *
   * A key missing from the registry = a freshly opened position → telegram
   * notification with tag buttons (no-op for users without a linked chat, so
   * the first tick after this feature deploys can't flood anyone).
   */
  private async trackOpenPositions(userId: string, positions: OpenedPositionInfo[]): Promise<void> {
    const existing = await this.prisma.openPositionSeen.findMany({ where: { userId } });
    const existingKeys = new Set(existing.map((r) => `${r.symbol}|${r.direction}`));
    const openKeys = new Set(positions.map((p) => `${p.symbol}|${p.direction}`));

    for (const p of positions) {
      if (existingKeys.has(`${p.symbol}|${p.direction}`)) continue;
      await this.prisma.openPositionSeen.upsert({
        where: { userId_symbol_direction: { userId, symbol: p.symbol, direction: p.direction } },
        create: { userId, symbol: p.symbol, direction: p.direction },
        update: {}, // first-seen time never moves while the position stays open
      });
      // A failed telegram send must never break the sync loop.
      try {
        await this.telegram.notifyPositionOpened(userId, p);
      } catch (e) {
        this.logger.warn(`telegram notify failed: ${e}`);
      }
    }

    // Entry snapshots for positions that don't have one yet. Separate from the
    // loop above so a snapshot missed while the exchange was unreachable gets
    // retried on the next tick instead of being lost for the whole position.
    await this.snapshotOpenPositions(userId, positions);

    const stale = existing.filter((r) => !openKeys.has(`${r.symbol}|${r.direction}`));
    if (stale.length > 0) {
      await this.prisma.openPositionSeen.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });
    }
  }

  /**
   * Compute the entry context (indicators + where the entry sat in each
   * timeframe's range) for open positions that don't have it yet, and store it
   * on the registry row. Runs while the position is still open, so the numbers
   * come from the price actually paid at the moment it was paid rather than
   * being reconstructed from history after the fact.
   *
   * `ctxOk === false` means the symbol's kline history was too short — the row
   * keeps that verdict so we don't re-request candles every single tick for a
   * position that will never produce a snapshot.
   */
  private async snapshotOpenPositions(userId: string, positions: OpenedPositionInfo[]): Promise<void> {
    const rows = await this.prisma.openPositionSeen.findMany({
      where: { userId, ctxOk: null },
      select: { id: true, symbol: true, direction: true, firstSeenAt: true },
    });
    if (rows.length === 0) return;

    const priceOf = new Map(
      positions.map((p) => [`${p.symbol}|${p.direction}`, p.avgPrice ? parseFloat(p.avgPrice) : NaN]),
    );

    for (const r of rows) {
      const entryPrice = priceOf.get(`${r.symbol}|${r.direction}`);
      // Position already gone (or Bybit didn't report an entry price this
      // tick): leave the row untouched, the prune below will clean it up.
      if (entryPrice == null || !Number.isFinite(entryPrice)) continue;
      try {
        // Anchored at first-seen, not "now": on a restart-triggered catch-up
        // the position may have been open for a while already, and the entry
        // context belongs to when it opened.
        const snap = await this.tradeContext.snapshotNow(r.symbol, entryPrice, r.firstSeenAt.getTime());
        await this.prisma.openPositionSeen.update({
          where: { id: r.id },
          data: {
            entryPrice,
            ctxOk: snap.ok,
            ctxComputedAt: new Date(),
            price: snap.price ?? null,
            atrPct: snap.atrPct ?? null,
            rsi: snap.rsi ?? null,
            volRel: snap.volRel ?? null,
            ema200Above: snap.ema200Above ?? null,
            ema200DistPct: snap.ema200DistPct ?? null,
            trend4h: snap.trend4h ?? null,
            rangePos1h: snap.rangePos1h ?? null,
            rangePos4h: snap.rangePos4h ?? null,
            rangePos1d: snap.rangePos1d ?? null,
          },
        });
        this.logger.log(`entry context computed for open ${r.symbol} ${r.direction}`);
      } catch (e) {
        this.logger.warn(`entry context failed for ${r.symbol} ${r.direction}: ${e}`);
      }
    }
  }

  /**
   * Copy first-seen times onto freshly synced trades of the same position
   * (closedAt >= firstSeenAt guards against stamping an earlier position's
   * trades). Trades whose position opened while the server was down keep
   * openedAt = null and are simply skipped by time-based stats.
   */
  private async fillOpenedAt(userId: string): Promise<number> {
    const rows = await this.prisma.openPositionSeen.findMany({ where: { userId } });
    let filled = 0;
    for (const r of rows) {
      const res = await this.prisma.trade.updateMany({
        where: {
          userId,
          symbol: r.symbol,
          direction: r.direction,
          openedAt: null,
          closedAt: { gte: r.firstSeenAt },
        },
        data: { openedAt: r.firstSeenAt },
      });
      filled += res.count;
    }
    return filled;
  }

  /** Paginate a single 7-day window via the Bybit cursor. */
  private async fetchWindow(creds: BybitCredentials, startTime: number, endTime: number): Promise<any[]> {
    const all: any[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.bybitTrade.fetchClosedPnlPage(creds, { startTime, endTime, cursor });
      if (!page.success) {
        this.logger.warn(`closed-pnl fetch failed: ${page.error}`);
        break;
      }
      all.push(...page.list);
      cursor = page.nextPageCursor;
    } while (cursor);
    return all;
  }

  private async persist(userId: string, records: any[]): Promise<number> {
    const data = records
      .map((r) => this.mapRecord(userId, r))
      .filter((d): d is Prisma.TradeCreateManyInput => d !== null);
    if (data.length === 0) return 0;
    const res = await this.prisma.trade.createMany({ data, skipDuplicates: true });
    return res.count;
  }

  private mapRecord(userId: string, r: any): Prisma.TradeCreateManyInput | null {
    if (!r?.orderId || !r?.updatedTime) return null;
    const closedMs = Number(r.updatedTime);
    if (!Number.isFinite(closedMs)) return null;
    const side: string = r.side === 'Buy' ? 'Buy' : 'Sell';
    return {
      userId,
      symbol: r.symbol,
      side,
      // Closing order side is opposite to the position direction:
      // a long is closed by a Sell, a short by a Buy.
      direction: side === 'Sell' ? 'long' : 'short',
      qty: parseFloat(r.qty ?? r.closedSize ?? '0'),
      avgEntryPrice: parseFloat(r.avgEntryPrice ?? '0'),
      avgExitPrice: parseFloat(r.avgExitPrice ?? '0'),
      closedPnl: parseFloat(r.closedPnl ?? '0'),
      openFee: parseFloat(r.openFee ?? '0'),
      closeFee: parseFloat(r.closeFee ?? '0'),
      leverage: r.leverage != null && r.leverage !== '' ? parseFloat(r.leverage) : null,
      orderId: String(r.orderId),
      closedAt: new Date(closedMs),
      raw: r as Prisma.InputJsonValue,
    };
  }
}
