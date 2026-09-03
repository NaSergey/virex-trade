import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CredentialsService } from '../credentials/credentials.service';
import { ExchangeRegistry } from '../exchanges/exchange-registry.service';
import { ClosedTrade, ExchangeId } from '../exchanges/exchange.types';
import { TagsService } from '../tags/tags.service';
import { TelegramService, OpenedPositionInfo } from '../telegram/telegram.service';
import { TradeContextService } from './trade-context.service';
import { PositionBuilderService } from './position-builder.service';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const BACKFILL_WEEKS = 26; // first run: import ~6 months of history
const SYNC_INTERVAL_MS = 60_000; // periodic incremental sync
// Сколько пользователей обходить одновременно. Обход был последовательным, и
// это упиралось не в CPU, а в ожидание биржи: на 1000 подключённых по ~1-2 с
// на человека круг занимал полчаса вместо минуты, причём молча — тик, попавший
// на незакрытый обход, просто отбрасывался. Лимиты бирж считаются по ключу, а
// ключи у пользователей разные, поэтому параллелить их безопасно; общий на всех
// потолок по IP (у Bybit — сотни запросов в секунду) при таком числе далеко.
const SYNC_CONCURRENCY = Math.max(1, Number(process.env.TRADE_SYNC_CONCURRENCY) || 24);

/**
 * Стоп с биржи — десятичная строка. Ноль и пустая строка у нескольких бирж
 * означают «стопа нет», и превращать их в 0 нельзя: planned_risk_pct тогда
 * покажет 100% там, где стопа просто не было, и правило соврёт в сторону,
 * которая выглядит как забота о пользователе.
 */
export function stopLossOf(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/**
 * Keeps each connected user's local `trades` table in sync with the realized-PnL
 * history of whichever exchange they have active. On boot (and then on an
 * interval) it loops over every user with a connected exchange and pulls their
 * recent window (or backfills history on their first-ever sync). Closed trades
 * never change, so inserts are idempotent via the
 * (userId, exchange, orderId, closedAt) unique key.
 *
 * Exchange-specific parsing lives behind ExchangeAdapter — this service only
 * ever sees normalized ClosedTrade/OpenPosition values.
 */
@Injectable()
export class TradeSyncService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(TradeSyncService.name);
  // Per-user locks, not one global flag: a single shared `syncing` boolean let
  // the background sweep swallow a user's manual re-sync (it returned a
  // truthful-looking `{ inserted: 0 }` without ever contacting Bybit), and made
  // every user wait behind whoever was mid-backfill.
  private readonly inFlight = new Set<string>();
  private sweeping = false;
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly exchanges: ExchangeRegistry,
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

  /** Sync every user that has an exchange connected. Used by the periodic timer. */
  async syncAll(opts?: { full?: boolean }): Promise<{ inserted: number }> {
    if (this.sweeping) return { inserted: 0 };
    this.sweeping = true;
    try {
      const users = await this.prisma.user.findMany({
        where: { activeExchange: { not: null } },
        select: { id: true },
      });
      const startedAt = Date.now();
      const inserted = await this.sweep(users, opts);
      const elapsed = Date.now() - startedAt;
      // Обход, не укладывающийся в интервал, снаружи выглядит как работающий
      // синк с необъяснимо старыми сделками. Оставляем след, чтобы это было
      // видно до жалоб пользователей.
      if (elapsed > SYNC_INTERVAL_MS) {
        this.logger.warn(
          `sweep of ${users.length} users took ${Math.round(elapsed / 1000)}s ` +
            `(> ${SYNC_INTERVAL_MS / 1000}s interval); raise TRADE_SYNC_CONCURRENCY`,
        );
      }
      return { inserted };
    } finally {
      this.sweeping = false;
    }
  }

  /**
   * Обходит список пулом из {@link SYNC_CONCURRENCY} воркеров, разбирающих
   * общую очередь. Пул, а не разбиение на равные пачки: пользователи стоят
   * по-разному — у кого-то первый бэкфилл на полгода, у кого-то пустой
   * инкремент, — и на фиксированных пачках все ждали бы самую тяжёлую.
   */
  private async sweep(users: { id: string }[], opts?: { full?: boolean }): Promise<number> {
    let next = 0;
    let inserted = 0;
    const worker = async () => {
      for (let i = next++; i < users.length; i = next++) {
        const u = users[i];
        if (this.inFlight.has(u.id)) continue; // manual re-sync already running
        // One user's failure (revoked keys, an undecryptable credential blob,
        // an exchange outage) must not abort the sweep for everyone behind them.
        try {
          // Отдельной строкой, не `inserted += await ...`: составное присваивание
          // читает левый операнд ДО ожидания, и параллельные воркеры затирали бы
          // друг другу инкремент.
          const n = await this.runLocked(u.id, opts);
          inserted += n;
        } catch (e) {
          this.logger.warn(`sync failed for user ${u.id}: ${e}`);
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(SYNC_CONCURRENCY, users.length) }, worker),
    );
    return inserted;
  }

  /**
   * Manual re-sync for a single user (e.g. right after connecting keys).
   * `skipped` distinguishes "nothing new on the exchange" from "your previous
   * sync is still running" — both used to surface as a bare `inserted: 0`.
   */
  async syncUser(
    userId: string,
    opts?: { full?: boolean },
  ): Promise<{ inserted: number; skipped?: boolean }> {
    if (this.inFlight.has(userId)) return { inserted: 0, skipped: true };
    return { inserted: await this.runLocked(userId, opts) };
  }

  private async runLocked(userId: string, opts?: { full?: boolean }): Promise<number> {
    this.inFlight.add(userId);
    try {
      return await this.syncUserUnlocked(userId, opts);
    } finally {
      this.inFlight.delete(userId);
    }
  }

  private async syncUserUnlocked(userId: string, opts?: { full?: boolean }): Promise<number> {
    const active = await this.credentials.getActive(userId);
    if (!active) return 0;
    const { exchange, credentials: creds } = active;
    const adapter = this.exchanges.get(exchange);

    // Backfill depth is per exchange: connecting a second exchange must pull
    // its full history, not the one-week increment the first one is down to.
    const existing = await this.prisma.trade.count({ where: { userId, exchange } });
    const weeks = opts?.full || existing === 0 ? BACKFILL_WEEKS : 1;
    const now = Date.now();
    const closed = await adapter.fetchClosedTrades(creds, {
      startMs: now - weeks * WEEK_MS,
      endMs: now,
    });
    if (closed.partial) {
      this.logger.warn(`closed-trade fetch incomplete for ${exchange}: ${closed.error}`);
    }
    const inserted = await this.persist(userId, exchange, closed.items);
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
      const filled = await this.fillEntryStamps(userId);
      if (filled > 0) this.logger.log(`stamped openedAt on ${filled} trade(s)`);
    } catch (e) {
      this.logger.warn(`openedAt fill failed: ${e}`);
    }
    // Group the closing orders of one position under a shared positionId, so
    // partial take-profits and averaging in stop counting as separate trades.
    // Runs every tick (not just on inserts): a position that closed in parts
    // only becomes groupable once its final closing fill arrives.
    try {
      const p = await this.positions.sync(userId, exchange, creds, opts);
      if (p.fills > 0 || p.stamped > 0) {
        this.logger.log(`positions: +${p.fills} fill(s), ${p.stamped} trade(s) grouped into ${p.positions} position(s)`);
      }
    } catch (e) {
      this.logger.warn(`position rebuild failed: ${e}`);
    }
    // Market-context snapshots for trades that don't have one yet (new trades
    // + progressive backfill of history). Must run AFTER fillEntryStamps so the
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
      const open = await adapter.getOpenPositions(creds);
      if (open.success) {
        // Tag prune keeps the historical unfiltered-keys semantics (a 0-size
        // row keeps tags one extra tick, which linkTagsToNewTrades relies on).
        const openKeys = new Set<string>(
          open.positions.map((p) => `${p.symbol}|${p.direction}`),
        );
        await this.tags.pruneClosedPositions(userId, openKeys);
        // The registry (and its notifications) only counts real exposure — an
        // exchange briefly reports just-closed positions with size 0.
        const positions: OpenedPositionInfo[] = open.positions
          .filter((p) => parseFloat(p.size) > 0)
          .map((p) => ({
            symbol: p.symbol,
            direction: p.direction,
            size: p.size,
            avgPrice: p.avgPrice,
            leverage: p.leverage,
            stopLoss: p.stopLoss,
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
        create: { userId, symbol: p.symbol, direction: p.direction, stopLoss: stopLossOf(p.stopLoss) },
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
   * Проставить свежесинхронизированным сделкам то, что известно только из
   * реестра открытых позиций: время входа и объявленный на входе стоп.
   *
   * Guard `closedAt >= firstSeenAt` не даёт пометить сделки предыдущей позиции
   * по тому же символу. Сделки, чья позиция открылась при лежащем сервере,
   * остаются без обоих полей — статистика по времени их просто пропускает, а
   * правило по плановому риску не считает их ни нарушением, ни соблюдением.
   *
   * Стоп ставится тем же updateMany и под тем же условием `openedAt: null`, а
   * не своим: оба поля приходят из одной строки реестра в один момент, и
   * второе условие развело бы их при первом же частичном сбое.
   */
  private async fillEntryStamps(userId: string): Promise<number> {
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
        data: { openedAt: r.firstSeenAt, stopLoss: r.stopLoss },
      });
      filled += res.count;
    }
    return filled;
  }

  private async persist(
    userId: string,
    exchange: ExchangeId,
    trades: ClosedTrade[],
  ): Promise<number> {
    if (trades.length === 0) return 0;
    const data: Prisma.TradeCreateManyInput[] = trades.map((t) => ({
      userId,
      exchange,
      symbol: t.symbol,
      side: t.side,
      direction: t.direction,
      qty: t.qty,
      avgEntryPrice: t.avgEntryPrice,
      avgExitPrice: t.avgExitPrice,
      closedPnl: t.closedPnl,
      openFee: t.openFee,
      closeFee: t.closeFee,
      leverage: t.leverage,
      orderId: t.orderId,
      closedAt: t.closedAt,
      raw: t.raw as Prisma.InputJsonValue,
    }));
    const res = await this.prisma.trade.createMany({ data, skipDuplicates: true });
    return res.count;
  }
}
