import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BybitMarketService } from '../bybit/services/bybit-market.service';
import { IndicatorsService, Candle } from './indicators.service';

const H1_MS = 3600_000;
const H4_MS = 4 * H1_MS;
// EMA200 needs 200 closed 1h candles before the anchor; +20 slack.
const H1_LOOKBACK = 220;
// computeSnapshot wants >= 60 candles; ~200 gives stable ADX/EMA50 on 4h.
const H4_LOOKBACK = 210;
const MIN_CANDLES = 60;
// Cap per user per sync tick so the initial backfill spreads over a few
// ticks instead of stalling one tick for minutes.
const BATCH_LIMIT = 400;

/** Last EMA value (SMA seed + standard smoothing), values oldest-first. */
function emaLast(values: number[], period: number): number {
  const k = 2 / (period + 1);
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) prev = values[i] * k + prev * (1 - k);
  return prev;
}

/** Candles fully closed before `anchorMs` (candle.time is the OPEN time). */
function closedBefore(candles: Candle[], anchorMs: number, tfMs: number): Candle[] {
  return candles.filter((c) => c.time + tfMs <= anchorMs);
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
    const pending = await this.prisma.trade.findMany({
      where: { userId, context: null },
      orderBy: { closedAt: 'desc' },
      take: BATCH_LIMIT,
      select: { id: true, symbol: true, openedAt: true, closedAt: true },
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

  private async computeSymbol(
    symbol: string,
    rows: Array<{ id: string; openedAt: Date | null; closedAt: Date }>,
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

    const data = anchors.map((a) => this.buildRow(a.row.id, a.basis, a.ms, c1, c4));
    // skipDuplicates: a concurrent run (manual sync + timer) must not throw
    // on the unique tradeId.
    const res = await this.prisma.tradeContext.createMany({ data, skipDuplicates: true });
    return res.count;
  }

  private buildRow(
    tradeId: string,
    basis: string,
    anchorMs: number,
    c1: Candle[],
    c4: Candle[],
  ): Prisma.TradeContextCreateManyInput {
    const h1 = closedBefore(c1, anchorMs, H1_MS).slice(-H1_LOOKBACK);
    const h4 = closedBefore(c4, anchorMs, H4_MS).slice(-H4_LOOKBACK);
    // Not enough history (delisted symbol, very old trade beyond kline paging):
    // write ok=false so we don't retry this trade forever.
    if (h1.length < MIN_CANDLES || h4.length < MIN_CANDLES) {
      return { tradeId, basis, ok: false };
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
      tradeId,
      basis,
      ok: true,
      price,
      atrPct: price > 0 ? Number(((s1.atr / price) * 100).toFixed(4)) : null,
      rsi: Number(s1.rsi.toFixed(2)),
      volRel: volRel != null ? Number(volRel.toFixed(4)) : null,
      ema200Above,
      ema200DistPct,
      trend4h: s4.regime,
    };
  }
}
