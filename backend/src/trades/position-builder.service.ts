import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BybitTradeService } from '../bybit/services/bybit-trade.service';
import { BybitService } from '../bybit/bybit.service';
import { BybitCredentials } from '../bybit/services/bybit-auth.service';
import { fillDelta, type FillLike, type PositionSide } from './positions';

const WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // Bybit execution/list max query window
const BACKFILL_WEEKS = 30; // first run: cover the same span as the trade backfill
// Sizes come back as decimal strings; comparing the running total to an exact 0
// would leave a dust remainder open forever on float arithmetic.
const SIZE_EPS = 1e-8;
const SIDES: PositionSide[] = ['long', 'short'];

/** Открытый размер по сторонам одного символа (в хэдж-режиме обе ненулевые). */
type SideSizes = Record<PositionSide, number>;

/**
 * Reconstructs real positions out of Bybit's per-order closed-pnl rows.
 *
 * Bybit emits one closed-pnl record per CLOSING ORDER, so taking profit in
 * three parts looks like three trades, and averaging into a position splits it
 * further. That inflates the trade count and skews winrate upward (partial
 * take-profits are almost always green, partial stop-outs are not a thing).
 *
 * closed-pnl alone cannot fix this: it never reports the running position size,
 * so a partial exit is indistinguishable from a separate trade. Execution
 * history can — walking fills in order, a position runs from the moment size
 * leaves 0 until it returns to 0. Averaging in and scaling out both fall out of
 * that definition for free, with no time-window or price heuristics.
 *
 * Fills are stored locally (see the Execution model) so this runs off the
 * database on every tick; the exchange is only queried for the new window.
 */
@Injectable()
export class PositionBuilderService {
  private readonly logger = new Logger(PositionBuilderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bybitTrade: BybitTradeService,
    private readonly bybit: BybitService,
  ) {}

  /**
   * Pull new fills, then re-derive position boundaries and stamp `positionId`
   * on the affected trades. Returns what changed so callers can log it.
   */
  async sync(
    userId: string,
    creds: BybitCredentials,
    opts?: { full?: boolean },
  ): Promise<{ fills: number; positions: number; stamped: number }> {
    const fills = await this.fetchAndStoreExecutions(userId, creds, opts);
    const { positions, stamped } = await this.rebuild(
      userId,
      await this.currentSizes(creds),
    );
    return { fills, positions, stamped };
  }

  /**
   * Размер открытых прямо сейчас позиций, по символу и стороне. Нужен, чтобы
   * засеять обход ниже: сохранённая история начинается с середины, и позиция,
   * открытая до первого сохранённого филла, иначе никогда не сойдётся.
   *
   * Стороны считаются раздельно — в хэдж-режиме биржа отдаёт по символу две
   * записи сразу, и складывать их в одно число значит потерять обе.
   */
  private async currentSizes(
    creds: BybitCredentials,
  ): Promise<Map<string, SideSizes>> {
    const sizes = new Map<string, SideSizes>();
    try {
      const open = await this.bybit.getOpenPositions(creds);
      if (!open.success) return sizes;
      for (const p of open.positions as any[]) {
        const size = parseFloat(p.size ?? '0');
        if (!(size > 0)) continue;
        const symbol = String(p.symbol);
        const cur = sizes.get(symbol) ?? { long: 0, short: 0 };
        if (p.side === 'Buy') cur.long += size;
        else cur.short += size;
        sizes.set(symbol, cur);
      }
    } catch {
      // Treat as flat — the seeding below degrades to "assume nothing open".
    }
    return sizes;
  }

  /**
   * Fetch execution history in 7-day windows and upsert it locally. On the
   * first run (or `full`) it walks the whole backfill span; afterwards only the
   * window since the newest stored fill, so steady state is a single request.
   */
  private async fetchAndStoreExecutions(
    userId: string,
    creds: BybitCredentials,
    opts?: { full?: boolean },
  ): Promise<number> {
    const newest = await this.prisma.execution.findFirst({
      where: { userId },
      orderBy: { execTime: 'desc' },
      select: { execTime: true },
    });
    const now = Date.now();
    // Re-scan a full window back from the newest fill: Bybit can report a fill
    // slightly late, and re-fetching is free (execId dedupes on insert).
    const from =
      opts?.full || !newest
        ? now - BACKFILL_WEEKS * WINDOW_MS
        : newest.execTime.getTime() - WINDOW_MS;

    let stored = 0;
    for (let start = from; start < now; start += WINDOW_MS) {
      const end = Math.min(start + WINDOW_MS, now);
      let cursor: string | undefined;
      do {
        const page = await this.bybitTrade.fetchExecutionsPage(creds, {
          startTime: start,
          endTime: end,
          cursor,
          limit: 100,
        });
        if (!page.success) {
          this.logger.warn(`execution fetch failed: ${page.error}`);
          break;
        }
        const rows: Prisma.ExecutionCreateManyInput[] = [];
        for (const e of page.list) {
          // Funding rows carry an execQty too — counting them would drift the
          // running position size and split positions at random points. Every
          // other type (Trade, BustTrade liquidations, AdlTrade, ...) does move
          // the position and has to be kept, or a liquidated position never
          // balances back to zero.
          if (e.execType === 'Funding') continue;
          const execTime = Number(e.execTime);
          const qty = parseFloat(e.execQty ?? '0');
          if (!e.execId || !Number.isFinite(execTime) || !(qty > 0)) continue;
          rows.push({
            userId,
            symbol: String(e.symbol),
            side: e.side === 'Buy' ? 'Buy' : 'Sell',
            qty,
            price: parseFloat(e.execPrice ?? '0'),
            closedSize: parseFloat(e.closedSize ?? '0'),
            execType: String(e.execType ?? 'Trade'),
            orderId: String(e.orderId ?? ''),
            execId: String(e.execId),
            execTime: new Date(execTime),
          });
        }
        if (rows.length) {
          const res = await this.prisma.execution.createMany({
            data: rows,
            skipDuplicates: true,
          });
          stored += res.count;
        }
        cursor = page.nextPageCursor;
      } while (cursor);
    }
    return stored;
  }

  /**
   * Walk stored fills per symbol and group the closing orders into positions.
   *
   * Stored history starts mid-stream, so a position opened before the first
   * stored fill shows up as closes without opens. The starting size is
   * recovered from the identity `size_now = size_start + sum(fills)`: whatever
   * doesn't balance must have been open before the history began.
   *
   * Лонг и шорт проходятся раздельно (см. fillDelta): в хэдж-режиме они живут
   * по одному символу одновременно, и общий размер по символу схлопывал бы их
   * в одну позицию. Сторона, которая так и не сошлась в ноль, остаётся
   * непроштампованной — её строки продолжают считаться сделками поштучно, как
   * раньше, но вторую сторону это больше не портит.
   */
  private async rebuild(
    userId: string,
    openSizes: Map<string, SideSizes>,
  ): Promise<{ positions: number; stamped: number }> {
    const fills = await this.prisma.execution.findMany({
      where: { userId },
      orderBy: [{ symbol: 'asc' }, { execTime: 'asc' }],
      select: {
        symbol: true,
        side: true,
        qty: true,
        closedSize: true,
        orderId: true,
        execTime: true,
      },
    });

    // orderId -> positionId, for every fill that closed part of a position.
    const orderToPosition = new Map<string, string>();
    let positions = 0;

    const bySymbol = new Map<string, typeof fills>();
    for (const f of fills) {
      const list = bySymbol.get(f.symbol);
      if (list) list.push(f);
      else bySymbol.set(f.symbol, [f]);
    }

    for (const [symbol, list] of bySymbol) {
      const open = openSizes.get(symbol) ?? { long: 0, short: 0 };
      for (const dir of SIDES) {
        // size_start = size_now - sum(fills). Non-zero means the symbol already
        // held a position when the stored history begins; seeding it lets that
        // first position close correctly instead of dragging the whole symbol
        // out of balance.
        const net = list.reduce((s, f) => s + fillDelta(f)[dir], 0);
        const resolved = this.buildSide(symbol, dir, list, open[dir] - net);
        if (!resolved) {
          this.logger.warn(
            `position size never settled for ${symbol} ${dir} — leaving its trades ungrouped`,
          );
          continue;
        }
        for (const r of resolved) {
          positions++;
          for (const id of r.orderIds) orderToPosition.set(id, r.positionId);
        }
      }
    }

    // Stamp only what actually changed, so a steady-state tick writes nothing.
    const trades = await this.prisma.trade.findMany({
      where: { userId },
      select: { id: true, orderId: true, positionId: true },
    });
    let stamped = 0;
    for (const t of trades) {
      const next = orderToPosition.get(t.orderId);
      if (!next || next === t.positionId) continue;
      await this.prisma.trade.update({
        where: { id: t.id },
        data: { positionId: next },
      });
      stamped++;
    }
    return { positions, stamped };
  }

  /**
   * Границы позиций ОДНОЙ стороны символа: позиция живёт с момента, когда её
   * размер уходит с нуля, и до возврата в ноль. Филлы чужой стороны дают
   * нулевую дельту и просто пропускаются.
   *
   * Возвращает null, если размер не сошёлся в ноль ни разу при наличии
   * закрытий — значит засев стартового размера промахнулся, и группировать
   * такую сторону наугад хуже, чем оставить её строки поштучно.
   */
  private buildSide(
    symbol: string,
    dir: PositionSide,
    fills: Array<FillLike & { orderId: string; execTime: Date }>,
    startSize: number,
  ): { positionId: string; orderIds: string[] }[] | null {
    let size = Math.abs(startSize) < SIZE_EPS ? 0 : startSize;
    // A position inherited from before the history has no known open time;
    // anchor it to the first fill we do have so its id stays stable.
    let openedAt: number | null = size !== 0 ? fills[0].execTime.getTime() : null;
    let pending: string[] = []; // closing orderIds of the position being built
    const resolved: { positionId: string; orderIds: string[] }[] = [];
    // Сторона в ключе: лонг и его хэдж-шорт по одному символу могут открыться
    // в одну миллисекунду, и без неё получили бы общий id.
    const idAt = (ms: number) => `${symbol}:${dir}:${ms}`;

    for (const f of fills) {
      const delta = fillDelta(f)[dir];
      if (delta === 0) continue;
      if (size === 0) openedAt = f.execTime.getTime();
      size += delta;
      if (Math.abs(size) < SIZE_EPS) size = 0;
      // delta < 0 — этот филл уменьшал именно нашу сторону, то есть закрывал её.
      if (delta < 0 && f.orderId) pending.push(f.orderId);
      if (size === 0 && openedAt != null) {
        // Position fully closed — every closing order seen since it opened
        // belongs to this one position. Keyed by open time so repeated
        // rebuilds produce identical ids (a side can only open once per ms).
        resolved.push({ positionId: idAt(openedAt), orderIds: pending });
        pending = [];
        openedAt = null;
      }
    }

    if (size !== 0 && resolved.length === 0 && pending.length > 0) return null;
    // Still-open position that has already been scaled out of: those partial
    // closes belong to one position even though it isn't finished. The id is
    // keyed on its open time, so it stays the same once it fully closes.
    if (size !== 0 && openedAt != null && pending.length > 0) {
      resolved.push({ positionId: idAt(openedAt), orderIds: pending });
    }
    return resolved;
  }
}
