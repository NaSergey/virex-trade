import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Curated palette (matches the chip colors used across the tag UI). Color is
// always assigned by the server — letting users pick invites everyone
// clustering on the same 2-3 "nice" colors, and the chart reads better when
// tags are visually distinct by default.
const PALETTE = ['#6366f1', '#22c55e', '#ef4444', '#f59e0b', '#06b6d4', '#ec4899', '#a855f7', '#84cc16', '#14b8a6', '#f97316'];

/**
 * Entry-reason tags. A tag is created once per user, attached to open
 * positions (PositionTag) and inherited by every closed trade of that
 * position when TradeSyncService imports it (TradeTag). Win/loss per trade
 * is derived from Trade.closedPnl, so the tag stats need no extra state.
 */
@Injectable()
export class TagsService {
  constructor(private readonly prisma: PrismaService) {}

  // Prefer a color not already used by this user, so tags stay visually
  // distinct; once the palette is exhausted, fall back to any random pick.
  private async pickColor(userId: string): Promise<string> {
    const used = new Set(
      (await this.prisma.tag.findMany({ where: { userId }, select: { color: true } })).map((t) => t.color),
    );
    const available = PALETTE.filter((c) => !used.has(c));
    const pool = available.length > 0 ? available : PALETTE;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  async list(userId: string) {
    const tags = await this.prisma.tag.findMany({
      where: { userId },
      orderBy: { tradeTags: { _count: 'desc' } },
      include: { _count: { select: { tradeTags: true } } },
    });
    return {
      success: true,
      tags: tags.map((t) => ({
        id: t.id,
        name: t.name,
        color: t.color,
        type: t.type,
        createdAt: t.createdAt,
        tradesCount: t._count.tradeTags,
      })),
    };
  }

  async create(userId: string, name: string, type?: string) {
    const trimmed = name.trim();
    if (!trimmed) throw new BadRequestException('Пустое имя тега');
    const existing = await this.prisma.tag.findUnique({
      where: { userId_name: { userId, name: trimmed } },
    });
    if (existing) throw new ConflictException('Такой тег уже есть');
    const tag = await this.prisma.tag.create({
      data: { userId, name: trimmed, color: await this.pickColor(userId), ...(type ? { type } : {}) },
    });
    return { success: true, tag };
  }

  /** Rename and/or re-categorize a tag. Stats keep working — links are by id. */
  async update(id: string, userId: string, patch: { name?: string; type?: string }) {
    const tag = await this.prisma.tag.findUnique({ where: { id } });
    if (!tag || tag.userId !== userId) throw new NotFoundException('Тег не найден');
    const data: { name?: string; type?: string } = {};
    if (patch.name != null) {
      const trimmed = patch.name.trim();
      if (!trimmed) throw new BadRequestException('Пустое имя тега');
      if (trimmed !== tag.name) {
        const dupe = await this.prisma.tag.findUnique({
          where: { userId_name: { userId, name: trimmed } },
        });
        if (dupe) throw new ConflictException('Такой тег уже есть');
        data.name = trimmed;
      }
    }
    if (patch.type != null) data.type = patch.type;
    if (Object.keys(data).length === 0) return { success: true, tag };
    const updated = await this.prisma.tag.update({ where: { id }, data });
    return { success: true, tag: updated };
  }

  /**
   * Merge `sourceId` into `intoTagId`: every trade/position link moves to the
   * target (duplicates collapse via skipDuplicates), then the source tag is
   * deleted. The history-preserving alternative to delete for accidental
   * near-duplicates ("отскок EMA" vs "EMA bounce").
   */
  async merge(userId: string, sourceId: string, intoTagId: string) {
    if (sourceId === intoTagId) throw new BadRequestException('Нельзя слить тег сам в себя');
    const [source, target] = await Promise.all([
      this.prisma.tag.findUnique({ where: { id: sourceId } }),
      this.prisma.tag.findUnique({ where: { id: intoTagId } }),
    ]);
    if (!source || source.userId !== userId) throw new NotFoundException('Тег не найден');
    if (!target || target.userId !== userId) throw new NotFoundException('Целевой тег не найден');

    await this.prisma.$transaction(async (tx) => {
      const tradeLinks = await tx.tradeTag.findMany({
        where: { tagId: sourceId },
        select: { tradeId: true },
      });
      if (tradeLinks.length > 0) {
        await tx.tradeTag.createMany({
          data: tradeLinks.map((l) => ({ tradeId: l.tradeId, tagId: intoTagId })),
          skipDuplicates: true,
        });
      }
      const posLinks = await tx.positionTag.findMany({
        where: { tagId: sourceId },
        select: { symbol: true, direction: true },
      });
      if (posLinks.length > 0) {
        await tx.positionTag.createMany({
          data: posLinks.map((l) => ({ userId, symbol: l.symbol, direction: l.direction, tagId: intoTagId })),
          skipDuplicates: true,
        });
      }
      // Cascade deletes the source's remaining TradeTag/PositionTag rows.
      await tx.tag.delete({ where: { id: sourceId } });
    });
    return { success: true, tag: { id: target.id, name: target.name, color: target.color, type: target.type } };
  }

  async remove(id: string, userId: string) {
    const tag = await this.prisma.tag.findUnique({ where: { id } });
    // Same "not found" for wrong owner as for a nonexistent id.
    if (!tag || tag.userId !== userId) throw new NotFoundException('Тег не найден');
    // Cascades wipe TradeTag/PositionTag rows — past stats lose this tag too.
    // SavedTagCombo rows referencing the tag self-heal on the next stats read.
    await this.prisma.tag.delete({ where: { id } });
    return { success: true };
  }

  /**
   * Pin a user-composed combination card in «Лучшие комбинации». Unlike the
   * auto-derived exact sets it counts trades CONTAINING all these tags, so
   * it works as a persistent strategy watchlist entry.
   */
  async createSavedCombo(userId: string, tagIds: string[]) {
    const unique = [...new Set(tagIds)];
    if (unique.length < 2) throw new BadRequestException('Выбери хотя бы два тега');
    const owned = await this.prisma.tag.count({ where: { userId, id: { in: unique } } });
    if (owned !== unique.length) throw new BadRequestException('Некоторые теги не найдены');
    const sorted = [...unique].sort();
    const key = sorted.join('|');
    const existing = await this.prisma.savedTagCombo.findUnique({
      where: { userId_key: { userId, key } },
    });
    if (existing) throw new ConflictException('Такая комбинация уже сохранена');
    const combo = await this.prisma.savedTagCombo.create({
      data: { userId, tagIds: sorted, key },
    });
    return { success: true, combo };
  }

  /**
   * Toggle pin state and/or change the tag set of an existing saved combo.
   * Unlike delete, this never removes the row — unpinning a user-created card
   * must not make it disappear (see SavedTagCombo.pinned doc comment).
   */
  async updateSavedCombo(id: string, userId: string, patch: { tagIds?: string[]; pinned?: boolean }) {
    const combo = await this.prisma.savedTagCombo.findUnique({ where: { id } });
    if (!combo || combo.userId !== userId) throw new NotFoundException('Комбинация не найдена');

    const data: { tagIds?: string[]; key?: string; pinned?: boolean } = {};
    if (patch.pinned !== undefined) data.pinned = patch.pinned;

    if (patch.tagIds !== undefined) {
      const unique = [...new Set(patch.tagIds)];
      if (unique.length < 2) throw new BadRequestException('Выбери хотя бы два тега');
      const owned = await this.prisma.tag.count({ where: { userId, id: { in: unique } } });
      if (owned !== unique.length) throw new BadRequestException('Некоторые теги не найдены');
      const sorted = [...unique].sort();
      const key = sorted.join('|');
      if (key !== combo.key) {
        const existing = await this.prisma.savedTagCombo.findUnique({
          where: { userId_key: { userId, key } },
        });
        if (existing) throw new ConflictException('Такая комбинация уже сохранена');
      }
      data.tagIds = sorted;
      data.key = key;
    }

    const updated = await this.prisma.savedTagCombo.update({ where: { id }, data });
    return { success: true, combo: updated };
  }

  /** Hard delete — the explicit, deliberate "Удалить" action (not unpin). */
  async deleteSavedCombo(id: string, userId: string) {
    const combo = await this.prisma.savedTagCombo.findUnique({ where: { id } });
    if (!combo || combo.userId !== userId) throw new NotFoundException('Комбинация не найдена');
    await this.prisma.savedTagCombo.delete({ where: { id } });
    return { success: true };
  }

  /**
   * Hide an auto-derived exact-tag-set combo card from the «по тегам» grid.
   * Idempotent (upsert) — dismissing twice is a no-op, not a conflict. Uses
   * the same canonical key as TradesService.statsByTagCombo's bucket key so
   * filtering there matches regardless of tag order.
   */
  async dismissCombo(userId: string, tagIds: string[]) {
    const key = tagIds.length > 0 ? [...new Set(tagIds)].sort().join('|') : '__untagged__';
    await this.prisma.dismissedTagCombo.upsert({
      where: { userId_key: { userId, key } },
      create: { userId, key },
      update: {},
    });
    return { success: true };
  }

  /** Current tag set of an open position (symbol + direction). */
  async positionTags(userId: string, symbol: string, direction: string) {
    const [rows, seen] = await Promise.all([
      this.prisma.positionTag.findMany({
        where: { userId, symbol, direction },
        include: { tag: true },
      }),
      // Bybit's own createdTime doesn't reset per position lifecycle, so the
      // sync loop's first-seen clock is the only honest "открыта с" we have.
      this.prisma.openPositionSeen.findUnique({
        where: { userId_symbol_direction: { userId, symbol, direction } },
        select: { firstSeenAt: true },
      }),
    ]);
    return {
      success: true,
      openedAt: seen?.firstSeenAt ?? null,
      tags: rows.map((r) => ({ id: r.tag.id, name: r.tag.name, color: r.tag.color })),
    };
  }

  /** Replace the tag set of an open position. Empty list clears it. */
  async setPositionTags(userId: string, symbol: string, direction: string, tagIds: string[]) {
    const unique = [...new Set(tagIds)];
    if (unique.length > 0) {
      const owned = await this.prisma.tag.count({ where: { userId, id: { in: unique } } });
      if (owned !== unique.length) throw new BadRequestException('Некоторые теги не найдены');
    }
    await this.prisma.$transaction([
      this.prisma.positionTag.deleteMany({ where: { userId, symbol, direction } }),
      ...(unique.length > 0
        ? [
            this.prisma.positionTag.createMany({
              data: unique.map((tagId) => ({ userId, symbol, direction, tagId })),
            }),
          ]
        : []),
    ]);
    return { success: true };
  }

  /**
   * Replace the tag set of a single closed trade directly — used from the
   * trade history view for trades that closed before (or without) being
   * tagged via their position (e.g. tagged after the fact, or the position
   * was closed before the tag was set).
   */
  async setTradeTags(userId: string, tradeId: string, tagIds: string[]) {
    const trade = await this.prisma.trade.findUnique({ where: { id: tradeId } });
    if (!trade || trade.userId !== userId) throw new NotFoundException('Сделка не найдена');

    const unique = [...new Set(tagIds)];
    if (unique.length > 0) {
      const owned = await this.prisma.tag.count({ where: { userId, id: { in: unique } } });
      if (owned !== unique.length) throw new BadRequestException('Некоторые теги не найдены');
    }
    await this.prisma.$transaction([
      this.prisma.tradeTag.deleteMany({ where: { tradeId } }),
      ...(unique.length > 0
        ? [this.prisma.tradeTag.createMany({ data: unique.map((tagId) => ({ tradeId, tagId })) })]
        : []),
    ]);
    return { success: true };
  }

  /**
   * Drop position tags for (symbol, direction) pairs that are no longer an
   * open position on Bybit. Called by TradeSyncService on every sync tick so
   * a closed position's tags don't bleed into the next position opened on
   * the same symbol+direction (Bybit allows at most one open position per
   * symbol+direction, so that pair only identifies "the current position"
   * while it stays open).
   */
  async pruneClosedPositions(userId: string, openKeys: Set<string>): Promise<void> {
    const rows = await this.prisma.positionTag.findMany({
      where: { userId },
      select: { symbol: true, direction: true },
      distinct: ['symbol', 'direction'],
    });
    const stale = rows.filter((r) => !openKeys.has(`${r.symbol}|${r.direction}`));
    if (stale.length === 0) return;
    await this.prisma.$transaction(
      stale.map((r) =>
        this.prisma.positionTag.deleteMany({ where: { userId, symbol: r.symbol, direction: r.direction } }),
      ),
    );
  }

  /**
   * Copy position tags onto freshly synced trades. Called by TradeSyncService
   * after inserts: every trade closed after its position was tagged inherits
   * the tags. Idempotent via skipDuplicates + the closedAt >= createdAt guard.
   */
  async linkTagsToNewTrades(userId: string): Promise<number> {
    const posTags = await this.prisma.positionTag.findMany({ where: { userId } });
    if (posTags.length === 0) return 0;

    let linked = 0;
    // Group by position key to fetch matching trades once per position.
    const byKey = new Map<string, typeof posTags>();
    for (const pt of posTags) {
      const key = `${pt.symbol}|${pt.direction}`;
      const arr = byKey.get(key) ?? [];
      arr.push(pt);
      byKey.set(key, arr);
    }

    for (const [key, tags] of byKey) {
      const [symbol, direction] = key.split('|');
      const earliest = tags.reduce((min, t) => (t.createdAt < min ? t.createdAt : min), tags[0].createdAt);
      const trades = await this.prisma.trade.findMany({
        where: { userId, symbol, direction, closedAt: { gte: earliest } },
        select: { id: true, closedAt: true },
      });
      if (trades.length === 0) continue;
      const rows = trades.flatMap((tr) =>
        tags
          .filter((t) => t.createdAt <= tr.closedAt)
          .map((t) => ({ tradeId: tr.id, tagId: t.tagId })),
      );
      if (rows.length > 0) {
        const res = await this.prisma.tradeTag.createMany({ data: rows, skipDuplicates: true });
        linked += res.count;
      }
    }
    return linked;
  }
}
