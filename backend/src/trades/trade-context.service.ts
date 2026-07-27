import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BybitMarketService } from '../bybit/services/bybit-market.service';
import { IndicatorsService, Candle } from './indicators.service';

const H1_MS = 3600_000;
const H4_MS = 4 * H1_MS;
const D1_MS = 24 * H1_MS;
// EMA200 needs 200 closed 1h candles before the anchor; +20 slack.
const H1_LOOKBACK = 220;
// computeSnapshot wants >= 60 candles; ~200 gives stable ADX/EMA50 on 4h.
const H4_LOOKBACK = 210;
// Daily candles are fetched ONLY for the entry-range metric (no indicator is
// computed off them), so the lookback is just the range window plus slack.
const D1_LOOKBACK = 45;
const MIN_CANDLES = 60;
// Cap per user per sync tick so the initial backfill spreads over a few
// ticks instead of stalling one tick for minutes.
const BATCH_LIMIT = 400;

// Range windows for rangePos*: a day on 1h, five days on 4h, a month on the
// daily — three different answers to "did I buy high or low", one per horizon.
const RANGE_WINDOW_1H = 24;
const RANGE_WINDOW_4H = 30;
const RANGE_WINDOW_1D = 30;
// A window shorter than this isn't a range, it's two candles — better null
// than a percentage of noise.
const RANGE_MIN_CANDLES = 10;

/**
 * Current field-set of a snapshot. Bump whenever a new indicator is added:
 * rows written by an older version are dropped and recomputed, otherwise the
 * new field stays null on all existing history (snapshots are only computed
 * when a trade has no context at all).
 */
export const CTX_VERSION = 2;

export type RangeTf = '1h' | '4h' | '1d';

/** Kline interval, candle length, range window and chart lookback per timeframe. */
const RANGE_TF_SPEC: Record<RangeTf, { interval: string; tfMs: number; window: number; lookback: number }> = {
  '1h': { interval: '60', tfMs: H1_MS, window: RANGE_WINDOW_1H, lookback: RANGE_WINDOW_1H + 24 },
  '4h': { interval: '240', tfMs: H4_MS, window: RANGE_WINDOW_4H, lookback: RANGE_WINDOW_4H + 30 },
  '1d': { interval: 'D', tfMs: D1_MS, window: RANGE_WINDOW_1D, lookback: RANGE_WINDOW_1D + 30 },
};

/**
 * The indicator + entry-range snapshot of one moment. Field names match the
 * TradeContext columns so it can be spread straight into a Prisma write.
 */
export interface EntrySnapshot {
  ok: boolean;
  price?: number | null;
  atrPct?: number | null;
  rsi?: number | null;
  volRel?: number | null;
  ema200Above?: boolean | null;
  ema200DistPct?: number | null;
  trend4h?: string | null;
  rangePos1h?: number | null;
  rangePos4h?: number | null;
  rangePos1d?: number | null;
}

/** Last EMA value (SMA seed + standard smoothing), values oldest-first. */
function emaLast(values: number[], period: number): number {
  const k = 2 / (period + 1);
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) prev = values[i] * k + prev * (1 - k);
  return prev;
}

/** Milliseconds → lightweight-charts' unit (seconds), preserving null. */
const toSec = (ms: number | null): number | null => (ms == null ? null : Math.floor(ms / 1000));

/** Candles fully closed before `anchorMs` (candle.time is the OPEN time). */
function closedBefore(candles: Candle[], anchorMs: number, tfMs: number): Candle[] {
  return candles.filter((c) => c.time + tfMs <= anchorMs);
}

/**
 * Where `entry` sat inside the high/low range of the last `window` candles:
 * 0 = at the bottom of the range, 100 = at the top. Not clamped on purpose —
 * entering above the range (a breakout) reads > 100, below it < 0, and that
 * distinction is the whole point of the metric.
 */
function rangePos(candles: Candle[], window: number, entry: number): number | null {
  const slice = candles.slice(-window);
  if (slice.length < RANGE_MIN_CANDLES || !(entry > 0)) return null;
  let low = Infinity;
  let high = -Infinity;
  for (const c of slice) {
    if (c.low < low) low = c.low;
    if (c.high > high) high = c.high;
  }
  const span = high - low;
  if (!(span > 0)) return null;
  return Number((((entry - low) / span) * 100).toFixed(2));
}

/**
 * Computes the market-context snapshot (TradeContext) for closed trades that
 * don't have one yet: indicator state at the trade's entry moment, derived
 * from historical Bybit klines. Runs after every sync tick, so new trades get
 * context within a minute and history backfills progressively. Klines are
 * fetched once per symbol per run (one range covering all pending trades of
 * that symbol), not per trade.
 */
@Injectable()
export class TradeContextService {
  private readonly logger = new Logger(TradeContextService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly market: BybitMarketService,
    private readonly indicators: IndicatorsService,
  ) {}

  /** Compute context for up to BATCH_LIMIT context-less trades of the user. */
  async computeMissing(userId: string): Promise<number> {
    await this.dropStale(userId);

    const pending = await this.prisma.trade.findMany({
      where: { userId, context: null },
      orderBy: { closedAt: 'desc' },
      take: BATCH_LIMIT,
      select: { id: true, symbol: true, openedAt: true, closedAt: true, avgEntryPrice: true },
    });
    if (pending.length === 0) return 0;

    const bySymbol = new Map<string, typeof pending>();
    for (const t of pending) {
      const list = bySymbol.get(t.symbol);
      if (list) list.push(t);
      else bySymbol.set(t.symbol, [t]);
    }

    let written = 0;
    for (const [symbol, rows] of bySymbol) {
      try {
        written += await this.computeSymbol(symbol, rows);
      } catch (e) {
        this.logger.warn(`context compute failed for ${symbol}: ${e}`);
      }
    }
    return written;
  }

  /**
   * Drop snapshots written by an older CTX_VERSION so the pass below recomputes
   * them with the current field set. Bounded by BATCH_LIMIT like everything
   * else here: deleting the whole history at once would blank the Лаборатория's
   * market-context filters until the backfill caught up, whereas one batch per
   * tick keeps the hole small and self-healing.
   */
  private async dropStale(userId: string): Promise<void> {
    const stale = await this.prisma.tradeContext.findMany({
      where: { ctxVersion: { lt: CTX_VERSION }, trade: { userId } },
      take: BATCH_LIMIT,
      select: { id: true },
    });
    if (stale.length === 0) return;
    await this.prisma.tradeContext.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });
    this.logger.log(`recomputing ${stale.length} outdated trade contexts`);
  }

  private async computeSymbol(
    symbol: string,
    rows: Array<{ id: string; openedAt: Date | null; closedAt: Date; avgEntryPrice: number }>,
  ): Promise<number> {
    const anchors = rows.map((r) => ({
      row: r,
      ms: (r.openedAt ?? r.closedAt).getTime(),
      basis: r.openedAt ? 'opened' : 'closed',
    }));
    const minMs = Math.min(...anchors.map((a) => a.ms));
    const maxMs = Math.max(...anchors.map((a) => a.ms));

    const c1 = await this.market.getKlinesRange(symbol, '60', minMs - H1_LOOKBACK * H1_MS, maxMs);
    const c4 = await this.market.getKlinesRange(symbol, '240', minMs - H4_LOOKBACK * H4_MS, maxMs);
    // Daily candles serve only rangePos1d — no indicator is computed off them,
    // so a symbol without daily history still gets a full snapshot.
    const cd = await this.market.getKlinesRange(symbol, 'D', minMs - D1_LOOKBACK * D1_MS, maxMs);

    const data = anchors.map((a) =>
      this.buildRow(a.row.id, a.basis, a.ms, a.row.avgEntryPrice, c1, c4, cd),
    );
    // skipDuplicates: a concurrent run (manual sync + timer) must not throw
    // on the unique tradeId.
    const res = await this.prisma.tradeContext.createMany({ data, skipDuplicates: true });
    return res.count;
  }

  private buildRow(
    tradeId: string,
    basis: string,
    anchorMs: number,
    entryPrice: number,
    c1: Candle[],
    c4: Candle[],
    cd: Candle[],
  ): Prisma.TradeContextCreateManyInput {
    return {
      tradeId,
      basis,
      ctxVersion: CTX_VERSION,
      ...this.buildSnapshot(anchorMs, entryPrice, c1, c4, cd),
    };
  }

  /**
   * The indicator + entry-range snapshot itself, independent of where it gets
   * stored. Shared by the closed-trade backfill above and by snapshotNow()
   * below, so an open position is measured by exactly the same yardstick its
   * closed trade will be — otherwise the two would drift apart silently.
   *
   * Candles are filtered to those closed strictly before the anchor, so nothing
   * here can see the future of the entry moment.
   */
  buildSnapshot(
    anchorMs: number,
    entryPrice: number,
    c1: Candle[],
    c4: Candle[],
    cd: Candle[],
  ): EntrySnapshot {
    const h1 = closedBefore(c1, anchorMs, H1_MS).slice(-H1_LOOKBACK);
    const h4 = closedBefore(c4, anchorMs, H4_MS).slice(-H4_LOOKBACK);
    const d1 = closedBefore(cd, anchorMs, D1_MS).slice(-D1_LOOKBACK);
    // Not enough history (delisted symbol, very old trade beyond kline paging):
    // ok=false so callers don't retry this anchor forever.
    if (h1.length < MIN_CANDLES || h4.length < MIN_CANDLES) {
      return { ok: false };
    }

    const s1 = this.indicators.computeSnapshot(h1);
    const s4 = this.indicators.computeSnapshot(h4);
    const price = s1.price;

    const last20 = h1.slice(-20);
    const avgVol = last20.reduce((a, c) => a + c.volume, 0) / last20.length;
    const volRel = avgVol > 0 ? h1[h1.length - 1].volume / avgVol : null;

    let ema200Above: boolean | null = null;
    let ema200DistPct: number | null = null;
    const closes = h1.map((c) => c.close);
    if (closes.length >= 200) {
      const e200 = emaLast(closes, 200);
      if (e200 > 0) {
        ema200Above = price >= e200;
        ema200DistPct = Number((((price - e200) / e200) * 100).toFixed(4));
      }
    }

    return {
      ok: true,
      price,
      atrPct: price > 0 ? Number(((s1.atr / price) * 100).toFixed(4)) : null,
      rsi: Number(s1.rsi.toFixed(2)),
      volRel: volRel != null ? Number(volRel.toFixed(4)) : null,
      ema200Above,
      ema200DistPct,
      trend4h: s4.regime,
      // Measured against the price actually paid, not the last close: the
      // question is where THIS entry landed in the range, not where the market
      // happened to be at the anchor candle's close.
      rangePos1h: rangePos(h1, RANGE_WINDOW_1H, entryPrice),
      rangePos4h: rangePos(h4, RANGE_WINDOW_4H, entryPrice),
      rangePos1d: rangePos(d1, RANGE_WINDOW_1D, entryPrice),
    };
  }

  /**
   * Snapshot for a position that is open RIGHT NOW, at the price actually paid.
   * Called once, the first tick a position is seen (TradeSyncService), so the
   * entry context exists while the position is still running instead of only
   * being reconstructed weeks later when it closes.
   */
  async snapshotNow(symbol: string, entryPrice: number, anchorMs = Date.now()): Promise<EntrySnapshot> {
    const c1 = await this.market.getKlinesRange(symbol, '60', anchorMs - H1_LOOKBACK * H1_MS, anchorMs);
    const c4 = await this.market.getKlinesRange(symbol, '240', anchorMs - H4_LOOKBACK * H4_MS, anchorMs);
    const cd = await this.market.getKlinesRange(symbol, 'D', anchorMs - D1_LOOKBACK * D1_MS, anchorMs);
    return this.buildSnapshot(anchorMs, entryPrice, c1, c4, cd);
  }

  /**
   * Everything needed to eyeball ONE trade's entry-range number on a chart:
   * the candles of the timeframe, the exact high/low window the metric was
   * measured against, and the entry itself. `stored` is what sits in the
   * database, `recomputed` is what the same formula produces from the candles
   * being drawn — if the two disagree, the picture is showing you why.
   */
  async rangeCheck(userId: string, tradeId: string, tf: RangeTf) {
    const trade = await this.prisma.trade.findUnique({
      where: { id: tradeId },
      include: { context: true },
    });
    if (!trade || trade.userId !== userId) throw new NotFoundException('Сделка не найдена');

    const { interval, tfMs, window, lookback } = RANGE_TF_SPEC[tf];
    const anchorMs = (trade.openedAt ?? trade.closedAt).getTime();
    const entryPrice = trade.avgEntryPrice;
    // Left edge covers the measurement window; the right edge runs past the
    // exit so the chart also shows how the trade actually played out.
    const fromMs = anchorMs - lookback * tfMs;
    const toMs = trade.closedAt.getTime() + 10 * tfMs;
    const candles = await this.market.getKlinesRange(trade.symbol, interval, fromMs, toMs);

    // Chart markers must sit on an actual bar, so entry/exit times are snapped
    // to the candle containing them. Found by scanning the candles we're about
    // to draw rather than by rounding to the interval — that stays correct
    // whatever boundary the exchange aligns its candles to.
    const barOf = (ms: number): number | null => {
      let found: number | null = null;
      for (const c of candles) {
        if (c.time > ms) break;
        found = c.time;
      }
      return found;
    };

    const windowCandles = closedBefore(candles, anchorMs, tfMs).slice(-window);
    const low = windowCandles.length > 0 ? Math.min(...windowCandles.map((c) => c.low)) : null;
    const high = windowCandles.length > 0 ? Math.max(...windowCandles.map((c) => c.high)) : null;
    const stored =
      tf === '1h'
        ? trade.context?.rangePos1h
        : tf === '1d'
          ? trade.context?.rangePos1d
          : trade.context?.rangePos4h;

    return {
      success: true,
      symbol: trade.symbol,
      direction: trade.direction,
      timeframe: tf,
      // Candle times in seconds — lightweight-charts' unit.
      candles: candles.map((c) => ({
        time: Math.floor(c.time / 1000),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
      window: {
        candles: windowCandles.length,
        expected: window,
        low,
        high,
        fromTime: windowCandles.length > 0 ? Math.floor(windowCandles[0].time / 1000) : null,
        toTime: Math.floor(anchorMs / 1000),
      },
      entry: {
        price: entryPrice,
        time: Math.floor(anchorMs / 1000),
        barTime: toSec(barOf(anchorMs)),
        // 'opened' = real entry time; 'closed' = we only knew the exit time and
        // anchored there, which the chart should say out loud.
        basis: trade.openedAt ? 'opened' : 'closed',
      },
      exit: {
        price: trade.avgExitPrice,
        time: Math.floor(trade.closedAt.getTime() / 1000),
        barTime: toSec(barOf(trade.closedAt.getTime())),
      },
      closedPnl: trade.closedPnl,
      stored: stored ?? null,
      recomputed: rangePos(windowCandles, window, entryPrice),
    };
  }
}
