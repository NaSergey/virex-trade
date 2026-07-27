import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { collapseToPositions, fillDelta, type PositionSide } from './positions';

export interface TradeStats {
  totalTrades: number;
  totalPnl: number;
  totalFees: number;
  wins: number;
  losses: number;
  winRate: number; // 0..100
  grossProfit: number;
  grossLoss: number;
  profitFactor: number; // grossProfit / |grossLoss|
  avgPnl: number;
  bestPnl: number;
  worstPnl: number;
}

export interface EquityPoint {
  time: number; // unix seconds, strictly ascending
  value: number; // cumulative realized PnL
}

export interface TradeFilter {
  symbol?: string;
  days?: number; // 0/undefined = all time
  // Tag drill-down: a tag id narrows to trades carrying that tag; the literal
  // 'untagged' narrows to trades that have no tags at all.
  tagId?: string;
  // Exact-set filter: trades whose tag set is EXACTLY these ids (a combo
  // card's trades) — carries all of them and nothing else.
  comboTagIds?: string[];
  // Contains-all filter: trades carrying ALL these ids, whatever else is
  // tagged (a saved combo card's trades).
  hasTagIds?: string[];
}

/** Per-direction slice of a tag bucket (long vs short can behave very differently). */
interface SideAgg {
  trades: number;
  wins: number;
  losses: number;
  totalPnl: number;
}

/**
 * Wilson score lower bound (95%) for the win proportion, as 0..100.
 * "The winrate is at least X" — ranks a 9-of-10 tag above a 1-of-1 fluke,
 * which sorting by raw winrate cannot do.
 */
export function wilsonLower(wins: number, n: number): number {
  if (n === 0) return 0;
  const z = 1.96;
  const p = wins / n;
  const z2 = z * z;
  const center = p + z2 / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return Number((Math.max(0, (center - margin) / (1 + z2 / n)) * 100).toFixed(2));
}

/** Thin a sparkline series to ≤ max points, always keeping the last one. */
function thinEquity(points: EquityPoint[], max = 60): EquityPoint[] {
  if (points.length <= max) return points;
  const stride = Math.ceil(points.length / max);
  const out = points.filter((_, i) => i % stride === 0);
  if (out[out.length - 1]?.time !== points[points.length - 1].time) {
    out.push(points[points.length - 1]);
  }
  return out;
}

@Injectable()
export class TradesService {
  constructor(private readonly prisma: PrismaService) {}

  private buildWhere(userId: string, f: TradeFilter): Prisma.TradeWhereInput {
    const where: Prisma.TradeWhereInput = { userId };
    if (f.symbol) where.symbol = f.symbol;
    if (f.days && f.days > 0) {
      where.closedAt = { gte: new Date(Date.now() - f.days * 24 * 60 * 60 * 1000) };
    }
    if (f.tagId === 'untagged') where.tags = { none: {} };
    else if (f.tagId) where.tags = { some: { tagId: f.tagId } };
    const and: Prisma.TradeWhereInput[] = [];
    if (f.comboTagIds && f.comboTagIds.length > 0) {
      and.push(
        ...f.comboTagIds.map((tagId) => ({ tags: { some: { tagId } } })),
        { tags: { none: { tagId: { notIn: f.comboTagIds } } } },
      );
    }
    if (f.hasTagIds && f.hasTagIds.length > 0) {
      and.push(...f.hasTagIds.map((tagId) => ({ tags: { some: { tagId } } })));
    }
    if (and.length > 0) where.AND = and;
    return where;
  }

  async list(userId: string, params: TradeFilter & { page?: number; pageSize?: number }) {
    const where = this.buildWhere(userId, params);
    const pageSize = Math.min(Math.max(params.pageSize ?? 20, 1), 200);
    const page = Math.max(params.page ?? 1, 1);
    // Paging happens after collapsing, not in SQL: one position can span
    // several closing-order rows, so a SQL LIMIT would cut a position in half
    // and make the page sizes and total disagree with every other stat.
    const rows = await this.prisma.trade.findMany({
      where,
      orderBy: { closedAt: 'desc' },
      include: { tags: { include: { tag: true } } },
    });
    const positions = collapseToPositions(rows);
    const pageRows = positions.slice((page - 1) * pageSize, page * pageSize);
    return {
      success: true,
      // tradeIds stays server-side: it's the drill-down handle for the rows a
      // position was built from, not something the table renders.
      trades: pageRows.map(({ tags, tradeIds, ...t }) => ({
        ...t,
        parts: tradeIds.length,
        tags: tags.map((tt) => ({ id: tt.tag.id, name: tt.tag.name, color: tt.tag.color })),
      })),
      total: positions.length,
      page,
      pageSize,
    };
  }

  /**
   * Все ордера одной позиции — раскрывающаяся строка таблицы сделок.
   *
   * Строка таблицы — это уже схлопнутая позиция (collapseToPositions), а её
   * `id` — id первой части. Отсюда берём positionId, а из него — момент
   * открытия: PositionBuilderService кодирует его прямо в ключ (`SYMBOL:ms`).
   * Дальше идём по сохранённым филлам символа с этого момента и обрываем
   * обход, как только суммарный размер возвращается к нулю — это ровно те
   * филлы, из которых состояла позиция (и входы, и выходы).
   *
   * Филлы группируются по orderId: биржа дробит один ордер на несколько
   * исполнений, а трейдеру нужен ордер. P&L есть только у закрывающих —
   * его отдаёт closed-pnl, то есть наши же строки Trade, по orderId.
   */
  async positionOrders(userId: string, tradeId: string) {
    const trade = await this.prisma.trade.findFirst({ where: { id: tradeId, userId } });
    if (!trade) return { success: false, orders: [], error: 'Сделка не найдена' };

    // Части позиции = все строки closed-pnl с тем же positionId (у несшитой
    // строки часть ровно одна — она сама).
    const parts = trade.positionId
      ? await this.prisma.trade.findMany({
          where: { userId, positionId: trade.positionId },
          orderBy: { closedAt: 'asc' },
        })
      : [trade];

    // P&L и комиссия закрытия — по закрывающему ордеру. Один orderId может
    // встретиться в нескольких строках (частичные исполнения с разным
    // closedAt), поэтому суммируем.
    const byClosingOrder = new Map<string, { pnl: number; fee: number }>();
    for (const p of parts) {
      const acc = byClosingOrder.get(p.orderId) ?? { pnl: 0, fee: 0 };
      acc.pnl += p.closedPnl;
      acc.fee += p.closeFee ?? 0;
      byClosingOrder.set(p.orderId, acc);
    }

    const dir: PositionSide = trade.direction === 'short' ? 'short' : 'long';
    const fills = await this.positionFills(userId, trade, dir, parts);

    interface OrderAgg {
      orderId: string;
      side: string;
      kind: 'entry' | 'exit';
      qty: number;
      value: number; // Σ qty*price — для средневзвешенной цены
      fills: number;
      time: Date;
      execTypes: Set<string>;
    }
    const orders = new Map<string, OrderAgg>();
    for (const f of fills) {
      // Знак дельты нашей стороны: > 0 — филл её набирал, < 0 — сокращал.
      // Именно он, а не closedSize, различает вход и выход для шорта.
      const delta = fillDelta(f)[dir];
      let o = orders.get(f.orderId);
      if (!o) {
        o = {
          orderId: f.orderId,
          side: f.side,
          kind: delta < 0 ? 'exit' : 'entry',
          qty: 0,
          value: 0,
          fills: 0,
          time: f.execTime,
          execTypes: new Set(),
        };
        orders.set(f.orderId, o);
      }
      o.qty += f.qty;
      o.value += f.qty * f.price;
      o.fills++;
      // Ордер помечаем закрывающим, если хоть один его филл сокращал позицию.
      if (delta < 0) o.kind = 'exit';
      if (f.execTime > o.time) o.time = f.execTime;
      o.execTypes.add(f.execType);
    }

    return {
      success: true,
      positionId: trade.positionId,
      // Пусто, когда история исполнений ещё не подтянута (или сделка старше
      // бэкфилла) — клиенту нужно показать это, а не «ордеров нет».
      orders: [...orders.values()]
        .sort((a, b) => a.time.getTime() - b.time.getTime())
        .map((o) => {
          const closing = byClosingOrder.get(o.orderId);
          return {
            orderId: o.orderId,
            side: o.side,
            kind: o.kind,
            qty: Number(o.qty.toFixed(8)),
            avgPrice: o.qty > 0 ? Number((o.value / o.qty).toFixed(8)) : 0,
            value: Number(o.value.toFixed(4)),
            fills: o.fills,
            time: o.time.toISOString(),
            execTypes: [...o.execTypes],
            pnl: o.kind === 'exit' && closing ? Number(closing.pnl.toFixed(4)) : null,
            fee: o.kind === 'exit' && closing ? Number(closing.fee.toFixed(4)) : null,
          };
        }),
    };
  }

  /**
   * Филлы, из которых состояла позиция. Обход от момента открытия до
   * возврата размера в ноль — та же логика границ, что и в
   * PositionBuilderService, только для одной позиции и одной стороны:
   * филлы хэджа по тому же символу сюда попасть не должны.
   */
  private async positionFills(
    userId: string,
    trade: { symbol: string; positionId: string | null; orderId: string; openedAt: Date | null },
    dir: PositionSide,
    parts: Array<{ orderId: string }>,
  ) {
    const SIZE_EPS = 1e-8;
    // positionId = `SYMBOL:openedAtMs`; режем по последнему ':' — на случай
    // символов с разделителем внутри.
    const openMs = trade.positionId ? Number(trade.positionId.slice(trade.positionId.lastIndexOf(':') + 1)) : NaN;
    const from = Number.isFinite(openMs) ? new Date(openMs) : trade.openedAt;

    if (!from) {
      // Позиция не реконструирована и времени входа нет — честно отдаём хотя
      // бы закрывающие ордера, входы восстановить не из чего.
      const orderIds = parts.map((p) => p.orderId);
      return this.prisma.execution.findMany({
        where: { userId, symbol: trade.symbol, orderId: { in: orderIds } },
        orderBy: { execTime: 'asc' },
      });
    }

    const candidates = await this.prisma.execution.findMany({
      where: { userId, symbol: trade.symbol, execTime: { gte: from } },
      orderBy: { execTime: 'asc' },
    });
    const out: typeof candidates = [];
    let size = 0;
    for (const f of candidates) {
      const delta = fillDelta(f)[dir];
      // Нулевая дельта — филл целиком про другую сторону (хэдж): не наш.
      if (delta === 0) continue;
      out.push(f);
      size += delta;
      // Размер вернулся в ноль — позиция закрыта, всё дальше уже другая.
      if (Math.abs(size) < SIZE_EPS) break;
    }
    return out;
  }

  /**
   * Winrate / PnL per entry-reason tag. A trade is a win when closedPnl > 0.
   * Trades without tags land in the `untagged` bucket so the numbers always
   * add up to the overall stats. Besides winrate each bucket carries the
   * payoff side of the story (avgWin/avgLoss/profitFactor — a 40% winrate
   * setup can still be the best one), a long/short split and a cumulative-PnL
   * sparkline showing whether the setup still works or is decaying.
   */
  async statsByTag(userId: string, days?: number) {
    const trades = collapseToPositions(
      await this.prisma.trade.findMany({
        where: this.buildWhere(userId, { days }),
        orderBy: { closedAt: 'asc' },
        include: { tags: { include: { tag: true } } },
      }),
    );

    interface Bucket {
      id: string | null;
      name: string;
      color: string;
      type: string | null;
      trades: number;
      wins: number;
      losses: number;
      totalPnl: number;
      grossProfit: number;
      grossLoss: number;
      long: SideAgg;
      short: SideAgg;
      equity: EquityPoint[];
      lastTime: number;
    }
    const newSide = (): SideAgg => ({ trades: 0, wins: 0, losses: 0, totalPnl: 0 });
    const newBucket = (id: string | null, name: string, color: string, type: string | null): Bucket => ({
      id,
      name,
      color,
      type,
      trades: 0,
      wins: 0,
      losses: 0,
      totalPnl: 0,
      grossProfit: 0,
      grossLoss: 0,
      long: newSide(),
      short: newSide(),
      equity: [],
      lastTime: 0,
    });

    const buckets = new Map<string, Bucket>();
    const untagged = newBucket(null, 'Без тегов', '#6b7280', null);

    for (const t of trades) {
      const pnl = t.closedPnl;
      const isWin = pnl > 0;
      const isLoss = pnl < 0;
      const targets: Bucket[] =
        t.tags.length === 0
          ? [untagged]
          : t.tags.map((tt) => {
              let b = buckets.get(tt.tag.id);
              if (!b) {
                b = newBucket(tt.tag.id, tt.tag.name, tt.tag.color, tt.tag.type);
                buckets.set(tt.tag.id, b);
              }
              return b;
            });
      for (const b of targets) {
        b.trades++;
        if (isWin) {
          b.wins++;
          b.grossProfit += pnl;
        } else if (isLoss) {
          b.losses++;
          b.grossLoss += pnl;
        }
        b.totalPnl += pnl;
        const side = t.direction === 'long' ? b.long : b.short;
        side.trades++;
        if (isWin) side.wins++;
        else if (isLoss) side.losses++;
        side.totalPnl += pnl;
        // Sparkline: cumulative PnL of this bucket over time. lightweight
        // series semantics — strictly ascending unique times.
        let time = Math.floor(t.closedAt.getTime() / 1000);
        if (time <= b.lastTime) time = b.lastTime + 1;
        b.lastTime = time;
        b.equity.push({ time, value: Number(b.totalPnl.toFixed(4)) });
      }
    }

    const finalizeSide = (s: SideAgg) => ({
      ...s,
      totalPnl: Number(s.totalPnl.toFixed(4)),
      winRate: s.trades ? Number(((s.wins / s.trades) * 100).toFixed(2)) : 0,
    });
    const finalize = ({ lastTime: _lastTime, ...b }: Bucket) => ({
      ...b,
      totalPnl: Number(b.totalPnl.toFixed(4)),
      grossProfit: Number(b.grossProfit.toFixed(4)),
      grossLoss: Number(b.grossLoss.toFixed(4)),
      avgPnl: b.trades ? Number((b.totalPnl / b.trades).toFixed(4)) : 0,
      avgWin: b.wins ? Number((b.grossProfit / b.wins).toFixed(4)) : 0,
      avgLoss: b.losses ? Number((b.grossLoss / b.losses).toFixed(4)) : 0,
      profitFactor: b.grossLoss !== 0 ? Number((b.grossProfit / Math.abs(b.grossLoss)).toFixed(2)) : 0,
      winRate: b.trades ? Number(((b.wins / b.trades) * 100).toFixed(2)) : 0,
      wilsonLow: wilsonLower(b.wins, b.trades),
      long: finalizeSide(b.long),
      short: finalizeSide(b.short),
      equity: thinEquity(b.equity),
    });

    return {
      success: true,
      totalTrades: trades.length,
      tags: [...buckets.values()].map(finalize).sort((a, b) => b.trades - a.trades || b.totalPnl - a.totalPnl),
      untagged: finalize(untagged),
    };
  }

  /**
   * Winrate per exact tag COMBINATION (the distinct set of tags on a trade),
   * as opposed to statsByTag where a 2-tag trade counts toward both tags'
   * individual buckets. This answers "which combo of entry reasons wins
   * most" rather than "which single reason wins most" — a trade tagged
   * both "пробой уровня" + "подтверждение объёмом" is its own bucket,
   * separate from either tag alone. Only sets of 2+ tags count — single-tag
   * trades are already covered by statsByTag. The untagged pile IS included
   * as its own always-last bucket: its card is the "click to go tag these"
   * entry point, so hiding it would hide the backlog.
   */
  async statsByTagCombo(userId: string, days?: number) {
    const trades = collapseToPositions(
      await this.prisma.trade.findMany({
        where: this.buildWhere(userId, { days }),
        include: { tags: { include: { tag: true } } },
      }),
    );

    interface ComboBucket {
      key: string;
      tagIds: string[];
      tagNames: string[];
      colors: string[];
      trades: number;
      wins: number;
      losses: number;
      totalPnl: number;
    }
    const combos = new Map<string, ComboBucket>();

    for (const t of trades) {
      if (t.tags.length === 1) continue;
      const sorted = [...t.tags].sort((a, b) => a.tag.name.localeCompare(b.tag.name));
      const key = sorted.length > 0 ? sorted.map((tt) => tt.tag.id).join('|') : '__untagged__';
      let b = combos.get(key);
      if (!b) {
        b = {
          key,
          tagIds: sorted.map((tt) => tt.tag.id),
          tagNames: sorted.length > 0 ? sorted.map((tt) => tt.tag.name) : ['Без тегов'],
          colors: sorted.length > 0 ? sorted.map((tt) => tt.tag.color) : ['#6b7280'],
          trades: 0,
          wins: 0,
          losses: 0,
          totalPnl: 0,
        };
        combos.set(key, b);
      }
      b.trades++;
      if (t.closedPnl > 0) b.wins++;
      else if (t.closedPnl < 0) b.losses++;
      b.totalPnl += t.closedPnl;
    }

    // Canonical dedup key for dismissal — sorted tag ids joined '|' (or the
    // untagged sentinel), same scheme TagsService.dismissCombo writes. Not the
    // same as ComboBucket.key above, which sorts by tag *name* for display.
    const dismissedKeys = new Set(
      (await this.prisma.dismissedTagCombo.findMany({ where: { userId }, select: { key: true } })).map(
        (d) => d.key,
      ),
    );
    const canonicalKey = (ids: string[]) => (ids.length > 0 ? [...ids].sort().join('|') : '__untagged__');

    // Точный набор тегов из 1-2 сделок почти всегда случайное совпадение (трейдер
    // отметил сделку кучей тегов разом), а не повторяющийся сетап — такие карточки
    // только шумят в сетке и не несут статистической значимости.
    const MIN_COMBO_TRADES = 3;

    const finalized = [...combos.values()]
      .filter((b) => !dismissedKeys.has(canonicalKey(b.tagIds)) && b.trades >= MIN_COMBO_TRADES)
      .map((b) => ({
        tagIds: b.tagIds,
        tagNames: b.tagNames,
        colors: b.colors,
        trades: b.trades,
        wins: b.wins,
        losses: b.losses,
        totalPnl: Number(b.totalPnl.toFixed(4)),
        avgPnl: b.trades ? Number((b.totalPnl / b.trades).toFixed(4)) : 0,
        winRate: b.trades ? Number(((b.wins / b.trades) * 100).toFixed(2)) : 0,
        wilsonLow: wilsonLower(b.wins, b.trades),
      }));
    // Default order = Wilson lower bound: a proven 10-trade 90% combo outranks
    // a lucky 1-trade 100% one. The client offers other sort keys on top.
    // The untagged bucket is pinned last regardless (the client re-pins too).
    finalized.sort(
      (a, b) =>
        Number(a.tagIds.length === 0) - Number(b.tagIds.length === 0) ||
        b.wilsonLow - a.wilsonLow ||
        b.trades - a.trades,
    );

    return {
      success: true,
      totalTrades: trades.length,
      combos: finalized,
      saved: await this.savedComboStats(userId, trades),
    };
  }

  /**
   * Stats for the user-composed (saved) combos over the same trade window.
   * Contains-all semantics: a trade counts when it carries every tag of the
   * combo, no matter what else is tagged — that's the "how does FVG+Дивер
   * perform" watchlist question, as opposed to the exact-set buckets above.
   * Combos referencing a deleted tag self-heal away here.
   */
  private async savedComboStats(
    userId: string,
    trades: Array<{ closedPnl: number; tags: Array<{ tagId: string }> }>,
  ) {
    const rows = await this.prisma.savedTagCombo.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    if (rows.length === 0) return [];

    const allIds = [...new Set(rows.flatMap((r) => r.tagIds))];
    const tagInfo = new Map(
      (await this.prisma.tag.findMany({ where: { userId, id: { in: allIds } } })).map((t) => [t.id, t]),
    );
    const broken = rows.filter((r) => r.tagIds.some((id) => !tagInfo.has(id)));
    if (broken.length > 0) {
      await this.prisma.savedTagCombo.deleteMany({ where: { id: { in: broken.map((b) => b.id) } } });
    }

    const tradeSets = trades.map((t) => ({ t, set: new Set(t.tags.map((tt) => tt.tagId)) }));
    return rows
      .filter((r) => !broken.includes(r))
      .map((r) => {
        let count = 0;
        let wins = 0;
        let losses = 0;
        let totalPnl = 0;
        for (const { t, set } of tradeSets) {
          if (!r.tagIds.every((id) => set.has(id))) continue;
          count++;
          if (t.closedPnl > 0) wins++;
          else if (t.closedPnl < 0) losses++;
          totalPnl += t.closedPnl;
        }
        const tags = r.tagIds
          .map((id) => tagInfo.get(id)!)
          .sort((a, b) => a.name.localeCompare(b.name));
        return {
          id: r.id,
          pinned: r.pinned,
          tagIds: tags.map((t) => t.id),
          tagNames: tags.map((t) => t.name),
          colors: tags.map((t) => t.color),
          trades: count,
          wins,
          losses,
          totalPnl: Number(totalPnl.toFixed(4)),
          avgPnl: count ? Number((totalPnl / count).toFixed(4)) : 0,
          winRate: count ? Number(((wins / count) * 100).toFixed(2)) : 0,
          wilsonLow: wilsonLower(wins, count),
        };
      });
  }

  /**
   * When do trades work: winrate/PnL bucketed by local weekday and hour, plus
   * hold-duration stats. The hour/weekday basis is openedAt (entry) when the
   * sync captured it, falling back to closedAt for older trades — for intraday
   * trading the two are close; duration stats use only openedAt-carrying
   * trades. `tzOffsetMin` is the client's Date.getTimezoneOffset() so buckets
   * land in the user's local clock, not the server's.
   */
  async statsByTime(userId: string, params: { days?: number; tzOffsetMin?: number; tagId?: string }) {
    // Collapsed to positions like every other stat, so "when do I trade well"
    // counts a scaled-out position once rather than once per partial exit —
    // otherwise the hours a trader habitually takes profit in look busier and
    // more successful than they are.
    const trades = collapseToPositions(
      await this.prisma.trade.findMany({
        where: this.buildWhere(userId, { days: params.days, tagId: params.tagId }),
      }),
    );

    const tz = Number.isFinite(params.tzOffsetMin) ? (params.tzOffsetMin as number) : 0;
    const empty = () => ({ trades: 0, wins: 0, losses: 0, totalPnl: 0 });
    const byWeekday = Array.from({ length: 7 }, empty); // index = JS getDay(): 0 = Sunday
    const byHour = Array.from({ length: 24 }, empty);

    let withOpenedAt = 0;
    let holdSum = 0;
    let holdWinSum = 0;
    let holdLossSum = 0;
    let holdWins = 0;
    let holdLosses = 0;

    for (const t of trades) {
      const pnl = t.closedPnl;
      const basis = t.openedAt ?? t.closedAt;
      // Shift to user-local time, then read with UTC accessors.
      const local = new Date(basis.getTime() - tz * 60_000);
      for (const b of [byWeekday[local.getUTCDay()], byHour[local.getUTCHours()]]) {
        b.trades++;
        if (pnl > 0) b.wins++;
        else if (pnl < 0) b.losses++;
        b.totalPnl += pnl;
      }
      if (t.openedAt) {
        withOpenedAt++;
        const mins = Math.max(0, (t.closedAt.getTime() - t.openedAt.getTime()) / 60_000);
        holdSum += mins;
        if (pnl > 0) {
          holdWinSum += mins;
          holdWins++;
        } else if (pnl < 0) {
          holdLossSum += mins;
          holdLosses++;
        }
      }
    }

    const fin = (b: { trades: number; wins: number; losses: number; totalPnl: number }) => ({
      ...b,
      totalPnl: Number(b.totalPnl.toFixed(4)),
      winRate: b.trades ? Number(((b.wins / b.trades) * 100).toFixed(2)) : 0,
    });

    return {
      success: true,
      totalTrades: trades.length,
      byWeekday: byWeekday.map(fin),
      byHour: byHour.map(fin),
      duration: {
        withOpenedAt,
        avgHoldMin: withOpenedAt ? Math.round(holdSum / withOpenedAt) : 0,
        avgWinHoldMin: holdWins ? Math.round(holdWinSum / holdWins) : 0,
        avgLossHoldMin: holdLosses ? Math.round(holdLossSum / holdLosses) : 0,
      },
    };
  }

  async stats(
    userId: string,
    params: TradeFilter,
  ): Promise<{ success: boolean; stats: TradeStats; equity: EquityPoint[] }> {
    const trades = collapseToPositions(
      await this.prisma.trade.findMany({
        where: this.buildWhere(userId, params),
        orderBy: { closedAt: 'asc' },
      }),
    );

    let totalPnl = 0;
    let totalFees = 0;
    let wins = 0;
    let losses = 0;
    let grossProfit = 0;
    let grossLoss = 0;
    let bestPnl = 0;
    let worstPnl = 0;
    let cum = 0;
    let lastTime = 0;
    const equity: EquityPoint[] = [];

    for (const t of trades) {
      const pnl = t.closedPnl;
      totalPnl += pnl;
      totalFees += (t.openFee ?? 0) + (t.closeFee ?? 0);
      if (pnl > 0) {
        wins++;
        grossProfit += pnl;
      } else if (pnl < 0) {
        losses++;
        grossLoss += pnl;
      }
      if (pnl > bestPnl) bestPnl = pnl;
      if (pnl < worstPnl) worstPnl = pnl;

      cum += pnl;
      // lightweight-charts needs strictly ascending unique times.
      let time = Math.floor(t.closedAt.getTime() / 1000);
      if (time <= lastTime) time = lastTime + 1;
      lastTime = time;
      equity.push({ time, value: Number(cum.toFixed(4)) });
    }

    const totalTrades = trades.length;
    const stats: TradeStats = {
      totalTrades,
      totalPnl: Number(totalPnl.toFixed(4)),
      totalFees: Number(totalFees.toFixed(4)),
      wins,
      losses,
      winRate: totalTrades ? Number(((wins / totalTrades) * 100).toFixed(2)) : 0,
      grossProfit: Number(grossProfit.toFixed(4)),
      grossLoss: Number(grossLoss.toFixed(4)),
      profitFactor: grossLoss !== 0 ? Number((grossProfit / Math.abs(grossLoss)).toFixed(2)) : 0,
      avgPnl: totalTrades ? Number((totalPnl / totalTrades).toFixed(4)) : 0,
      bestPnl: Number(bestPnl.toFixed(4)),
      worstPnl: Number(worstPnl.toFixed(4)),
    };

    return { success: true, stats, equity };
  }
}
