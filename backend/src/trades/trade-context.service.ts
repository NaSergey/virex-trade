import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BybitMarketService } from '../bybit/services/bybit-market.service';
import { IndicatorsService, Candle } from './indicators.service';
import { entryTimeOf } from './positions';

const M15_MS = 900_000;
const M30_MS = 2 * M15_MS;
const H1_MS = 3600_000;
const H4_MS = 4 * H1_MS;
const D1_MS = 24 * H1_MS;
// Младшие ТФ считают только диапазон входа — индикаторов по ним нет, поэтому
// глубина ровно в окно плюс запас.
const M15_LOOKBACK = 60;
const M30_LOOKBACK = 60;
// EMA200 needs 200 closed 1h candles before the anchor; +20 slack.
const H1_LOOKBACK = 220;
// computeSnapshot wants >= 60 candles; ~200 gives stable ADX/EMA50 on 4h.
const H4_LOOKBACK = 210;
// Daily candles are fetched ONLY for the entry-range metric (no indicator is
// computed off them), so the lookback is just the range window plus slack.
const D1_LOOKBACK = 70;
const MIN_CANDLES = 60;
// Cap per user per sync tick so the initial backfill spreads over a few
// ticks instead of stalling one tick for minutes.
const BATCH_LIMIT = 400;

// Range windows for rangePos*: how far back "did I buy high or low" looks, one
// horizon per timeframe — two days on 1h, ten days on 4h, two months on the
// daily.
//
// Каждое окно равно тому, что рисует график этого таймфрейма (RANGE_TF_SPEC
// ниже), и это не совпадение: пока окно было короче нарисованного, слева от
// стрелки входа оставались свечи ниже «низа», и число выглядело враньём. Либо
// не рисовать лишнего, либо считать по всему нарисованному — выбрано второе.
const RANGE_WINDOW_15M = 48;
const RANGE_WINDOW_30M = 48;
const RANGE_WINDOW_1H = 48;
const RANGE_WINDOW_4H = 60;
const RANGE_WINDOW_1D = 60;
// A window shorter than this isn't a range, it's two candles — better null
// than a percentage of noise.
const RANGE_MIN_CANDLES = 10;

// ── Качество входа/выхода: окно — сама сделка (вход→выход), не история до
// входа, как у rangePos. Свой, независимый от rangePos набор констант и
// запросов свечей — см. docs/superpowers/specs/2026-08-29-entry-exit-quality-design.md.
const QUALITY_SCALP_MS = 4 * H1_MS; // < 4ч — 5-минутки
const QUALITY_INTRADAY_MS = 3 * D1_MS; // 4ч–3д — 15м
const QUALITY_SWING_MS = 30 * D1_MS; // 3д–30д — 1ч, дальше — 4ч
export const QUALITY_MIN_CANDLES = 3; // меньше — окно из 1-2 свечей, не диапазон

export interface QualityInterval {
  maxHoldMs: number;
  interval: string;
  tfMs: number;
}

const QUALITY_INTERVALS: QualityInterval[] = [
  { maxHoldMs: QUALITY_SCALP_MS, interval: '5', tfMs: 5 * 60_000 },
  { maxHoldMs: QUALITY_INTRADAY_MS, interval: '15', tfMs: M15_MS },
  { maxHoldMs: QUALITY_SWING_MS, interval: '60', tfMs: H1_MS },
  { maxHoldMs: Infinity, interval: '240', tfMs: H4_MS },
];

const QUALITY_INTERVALS_BY_KEY = new Map(QUALITY_INTERVALS.map((q) => [q.interval, q]));

/** Свечная корзина по длительности удержания сделки — см. QUALITY_INTERVALS. */
export function qualityIntervalFor(holdMs: number): QualityInterval {
  return QUALITY_INTERVALS.find((b) => holdMs < b.maxHoldMs) ?? QUALITY_INTERVALS[QUALITY_INTERVALS.length - 1];
}

/** Свечи, полностью закрытые внутри [fromMs, toMs] — окно самой сделки. */
export function withinTrade(candles: Candle[], fromMs: number, toMs: number, tfMs: number): Candle[] {
  return candles.filter((c) => c.time >= fromMs && c.time + tfMs <= toMs);
}

/**
 * Качество входа/выхода относительно диапазона самой сделки. null — меньше
 * QUALITY_MIN_CANDLES свечей в окне. Клампится в [0,100] — в отличие от
 * rangePos, здесь окно задано самой сделкой, и цена входа/выхода физически не
 * может лежать вне свечи, в которую сама попала; выход за границы означал бы
 * только числовую погрешность, а не находку.
 */
export function computeTradeQuality(
  direction: string,
  entryPrice: number,
  exitPrice: number,
  windowCandles: Candle[],
): { entryQuality: number | null; exitQuality: number | null } {
  if (windowCandles.length < QUALITY_MIN_CANDLES) return { entryQuality: null, exitQuality: null };
  let low = Infinity;
  let high = -Infinity;
  for (const c of windowCandles) {
    if (c.low < low) low = c.low;
    if (c.high > high) high = c.high;
  }
  const span = high - low;
  if (!(span > 0)) return { entryQuality: null, exitQuality: null };
  const clamp = (v: number) => Math.max(0, Math.min(100, v));
  const pos = (price: number) => ((price - low) / span) * 100;
  const isLong = direction === 'long';
  return {
    entryQuality: Number(clamp(isLong ? 100 - pos(entryPrice) : pos(entryPrice)).toFixed(2)),
    exitQuality: Number(clamp(isLong ? pos(exitPrice) : 100 - pos(exitPrice)).toFixed(2)),
  };
}

/**
 * Current field-set of a snapshot. Bump whenever a new indicator is added:
 * rows written by an older version are dropped and recomputed, otherwise the
 * new field stays null on all existing history (snapshots are only computed
 * when a trade has no context at all).
 */
// 3: окна rangePos* расширены до всей истории, которую показывает график
// (48 свечей на 1h, 60 на 4h и на дневках) — старые значения считались по
// более коротким окнам и с новыми не сравнимы.
// 4: добавлены rangePos15m/30m — на старых снимках они пустые.
export const CTX_VERSION = 4;

// Пять горизонтов одного вопроса «дорого ли я взял»: от двенадцати часов до
// двух месяцев. Скальперу коридор в сутки ничего не говорит — ему нужны
// последние часы, и вот они.
export const RANGE_TF_LIST = ['15m', '30m', '1h', '4h', '1d'] as const;
export type RangeTf = (typeof RANGE_TF_LIST)[number];
export const isRangeTf = (v: unknown): v is RangeTf =>
  RANGE_TF_LIST.includes(v as RangeTf);

/** Колонка снимка, в которой лежит диапазон входа этого ТФ. */
export const RANGE_POS_FIELD = {
  '15m': 'rangePos15m',
  '30m': 'rangePos30m',
  '1h': 'rangePos1h',
  '4h': 'rangePos4h',
  '1d': 'rangePos1d',
} as const satisfies Record<RangeTf, string>;

/** Сохранённый диапазон входа выбранного ТФ — из любого носителя этих полей. */
export function storedRangePos(
  ctx: Partial<Record<(typeof RANGE_POS_FIELD)[RangeTf], number | null>>,
  tf: RangeTf,
): number | null {
  return ctx[RANGE_POS_FIELD[tf]] ?? null;
}

/**
 * Kline interval, candle length and range window per timeframe.
 *
 * lookback === window намеренно: график рисует ровно те свечи, по которым взяты
 * верх и низ, поэтому линии всегда касаются самой высокой и самой низкой свечи
 * слева от входа. Разъехаться этим двум числам нельзя.
 */
const RANGE_TF_SPEC: Record<RangeTf, { interval: string; tfMs: number; window: number; lookback: number }> = {
  '15m': { interval: '15', tfMs: M15_MS, window: RANGE_WINDOW_15M, lookback: RANGE_WINDOW_15M },
  '30m': { interval: '30', tfMs: M30_MS, window: RANGE_WINDOW_30M, lookback: RANGE_WINDOW_30M },
  '1h': { interval: '60', tfMs: H1_MS, window: RANGE_WINDOW_1H, lookback: RANGE_WINDOW_1H },
  '4h': { interval: '240', tfMs: H4_MS, window: RANGE_WINDOW_4H, lookback: RANGE_WINDOW_4H },
  '1d': { interval: 'D', tfMs: D1_MS, window: RANGE_WINDOW_1D, lookback: RANGE_WINDOW_1D },
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
  rangePos15m?: number | null;
  rangePos30m?: number | null;
  rangePos1h?: number | null;
  rangePos4h?: number | null;
  rangePos1d?: number | null;
}

/** Свечи всех таймфреймов на один момент — то, из чего собирается снимок. */
export interface SnapshotCandles {
  m15: Candle[];
  m30: Candle[];
  h1: Candle[];
  h4: Candle[];
  d1: Candle[];
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
      select: {
        id: true,
        symbol: true,
        positionId: true,
        openedAt: true,
        closedAt: true,
        avgEntryPrice: true,
      },
    });

    let written = 0;
    if (pending.length > 0) {
      const bySymbol = new Map<string, typeof pending>();
      for (const t of pending) {
        const list = bySymbol.get(t.symbol);
        if (list) list.push(t);
        else bySymbol.set(t.symbol, [t]);
      }

      for (const [symbol, rows] of bySymbol) {
        try {
          written += await this.computeSymbol(symbol, rows);
        } catch (e) {
          this.logger.warn(`context compute failed for ${symbol}: ${e}`);
        }
      }
    }

    written += await this.computeMissingQuality(userId);
    return written;
  }

  /**
   * Качество входа/выхода — второй, независимый проход. Нужен закрытый выход
   * (avgExitPrice/closedAt), которого нет у ещё открытой позиции — поэтому не
   * может жить в buildSnapshot(), общем с snapshotNow(). Свой набор запросов
   * свечей, сгруппированных по (символ, интервал-по-длительности) — не
   * переиспользует диапазоны m15/h1/h4/d1 основного снимка: не рискуем уже
   * работающим rangePos/индикаторами ради экономии запросов к Bybit.
   */
  private async computeMissingQuality(userId: string): Promise<number> {
    const pending = await this.prisma.trade.findMany({
      where: { userId, context: { qualityComputed: false, ok: true } },
      orderBy: { closedAt: 'desc' },
      take: BATCH_LIMIT,
      select: {
        id: true,
        symbol: true,
        direction: true,
        positionId: true,
        openedAt: true,
        closedAt: true,
        avgEntryPrice: true,
        avgExitPrice: true,
      },
    });
    if (pending.length === 0) return 0;

    const anchors = pending.map((row) => ({ row, entryMs: entryTimeOf(row).ms }));
    const groups = new Map<string, typeof anchors>();
    for (const a of anchors) {
      const holdMs = a.row.closedAt.getTime() - a.entryMs;
      const { interval } = qualityIntervalFor(holdMs);
      const key = `${a.row.symbol}:${interval}`;
      const list = groups.get(key);
      if (list) list.push(a);
      else groups.set(key, [a]);
    }

    let written = 0;
    for (const [key, items] of groups) {
      const interval = key.slice(key.lastIndexOf(':') + 1);
      const symbol = key.slice(0, key.lastIndexOf(':'));
      const spec = QUALITY_INTERVALS_BY_KEY.get(interval)!;
      const minMs = Math.min(...items.map((a) => a.entryMs));
      const maxMs = Math.max(...items.map((a) => a.row.closedAt.getTime()));
      try {
        const candles = await this.market.getKlinesRange(symbol, interval, minMs, maxMs);
        for (const { row, entryMs } of items) {
          const window = withinTrade(candles, entryMs, row.closedAt.getTime(), spec.tfMs);
          const { entryQuality, exitQuality } = computeTradeQuality(
            row.direction,
            row.avgEntryPrice,
            row.avgExitPrice,
            window,
          );
          await this.prisma.tradeContext.update({
            where: { tradeId: row.id },
            data: { entryQuality, exitQuality, qualityComputed: true },
          });
          written++;
        }
      } catch (e) {
        this.logger.warn(`quality compute failed for ${symbol}/${interval}: ${e}`);
      }
    }
    return written;
  }

  /**
   * Drop snapshots that must be recomputed: written by an older CTX_VERSION (a
   * new field would otherwise stay null on all history), or anchored on a
   * guessed entry time while the exact one has since arrived — a position is
   * only reconstructed when its last closing fill lands, which can be several
   * ticks after the trade row itself.
   *
   * Bounded by BATCH_LIMIT like everything else here: deleting the whole
   * history at once would blank the selection page's market-context filters
   * until the backfill caught up, whereas one batch per tick keeps the hole
   * small and self-healing. Terminates: a recomputed row comes back with
   * basis 'filled' and stops matching.
   */
  private async dropStale(userId: string): Promise<void> {
    const stale = await this.prisma.tradeContext.findMany({
      where: {
        trade: { userId },
        OR: [
          { ctxVersion: { lt: CTX_VERSION } },
          { basis: { not: 'filled' }, trade: { userId, positionId: { not: null } } },
        ],
      },
      take: BATCH_LIMIT,
      select: { id: true },
    });
    if (stale.length === 0) return;
    await this.prisma.tradeContext.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });
    this.logger.log(`recomputing ${stale.length} outdated trade contexts`);
  }

  private async computeSymbol(
    symbol: string,
    rows: Array<{
      id: string;
      positionId: string | null;
      openedAt: Date | null;
      closedAt: Date;
      avgEntryPrice: number;
    }>,
  ): Promise<number> {
    const anchors = rows.map((r) => ({ row: r, ...entryTimeOf(r) }));
    const minMs = Math.min(...anchors.map((a) => a.ms));
    const maxMs = Math.max(...anchors.map((a) => a.ms));

    // Младшие ТФ и дневки служат только диапазону входа — индикаторов по ним
    // нет, поэтому символ без такой истории всё равно получит полный снимок.
    const candles: SnapshotCandles = {
      m15: await this.market.getKlinesRange(symbol, '15', minMs - M15_LOOKBACK * M15_MS, maxMs),
      m30: await this.market.getKlinesRange(symbol, '30', minMs - M30_LOOKBACK * M30_MS, maxMs),
      h1: await this.market.getKlinesRange(symbol, '60', minMs - H1_LOOKBACK * H1_MS, maxMs),
      h4: await this.market.getKlinesRange(symbol, '240', minMs - H4_LOOKBACK * H4_MS, maxMs),
      d1: await this.market.getKlinesRange(symbol, 'D', minMs - D1_LOOKBACK * D1_MS, maxMs),
    };

    const data = anchors.map((a) =>
      this.buildRow(a.row.id, a.basis, a.ms, a.row.avgEntryPrice, candles),
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
    candles: SnapshotCandles,
  ): Prisma.TradeContextCreateManyInput {
    return {
      tradeId,
      basis,
      ctxVersion: CTX_VERSION,
      ...this.buildSnapshot(anchorMs, entryPrice, candles),
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
  buildSnapshot(anchorMs: number, entryPrice: number, candles: SnapshotCandles): EntrySnapshot {
    const m15 = closedBefore(candles.m15, anchorMs, M15_MS).slice(-M15_LOOKBACK);
    const m30 = closedBefore(candles.m30, anchorMs, M30_MS).slice(-M30_LOOKBACK);
    const h1 = closedBefore(candles.h1, anchorMs, H1_MS).slice(-H1_LOOKBACK);
    const h4 = closedBefore(candles.h4, anchorMs, H4_MS).slice(-H4_LOOKBACK);
    const d1 = closedBefore(candles.d1, anchorMs, D1_MS).slice(-D1_LOOKBACK);
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
      rangePos15m: rangePos(m15, RANGE_WINDOW_15M, entryPrice),
      rangePos30m: rangePos(m30, RANGE_WINDOW_30M, entryPrice),
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
    const at = (interval: string, back: number) =>
      this.market.getKlinesRange(symbol, interval, anchorMs - back, anchorMs);
    return this.buildSnapshot(anchorMs, entryPrice, {
      m15: await at('15', M15_LOOKBACK * M15_MS),
      m30: await at('30', M30_LOOKBACK * M30_MS),
      h1: await at('60', H1_LOOKBACK * H1_MS),
      h4: await at('240', H4_LOOKBACK * H4_MS),
      d1: await at('D', D1_LOOKBACK * D1_MS),
    });
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
    if (!trade || trade.userId !== userId) throw new NotFoundException({ message: 'Сделка не найдена', code: 'TRADE_NOT_FOUND' });

    const { interval, tfMs, window, lookback } = RANGE_TF_SPEC[tf];
    const { ms: anchorMs, basis } = entryTimeOf(trade);
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
    const stored = trade.context ? storedRangePos(trade.context, tf) : null;

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
        // 'filled' = exact, from execution history; 'opened' = approximate,
        // when the sync first saw the position; 'closed' = the entry time was
        // never known and the window hangs off the exit. The chart says which.
        basis,
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
