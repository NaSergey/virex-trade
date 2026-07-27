import { Injectable } from '@nestjs/common';
import { BybitMarketService } from '../bybit/services/bybit-market.service';
import { DcaFilterConfig, DcaFilterResult } from './dca-filters';

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// Snapshot of every indicator the bot engine and the suggest endpoint use.
export interface IndicatorSnapshot {
  price: number;
  rsi: number;
  emaFast: number; // EMA 20
  emaSlow: number; // EMA 50
  atr: number; // ATR 14
  adx: number; // ADX 14
  bbUpper: number; // Bollinger 20, 2σ
  bbLower: number;
  bbMiddle: number;
  regime: 'range' | 'trend_up' | 'trend_down';
}

// Entry gate the engine applies each tick: in a strong trend a grid bleeds
// money on the losing side, so we pause entries against the trend direction
// and at RSI extremes (blow-off tops / capitulation bottoms).
export interface EntryGate {
  allowLong: boolean;
  allowShort: boolean;
  reasons: string[];
}

export interface RangeSuggestion {
  symbol: string;
  timeframe: string;
  price: number;
  lowerPrice: number;
  upperPrice: number;
  gridLevels: number;
  snapshot: IndicatorSnapshot;
  comment: string;
}

const ADX_TREND_THRESHOLD = 25;
const RSI_OVERBOUGHT = 72;
const RSI_OVERSOLD = 28;

@Injectable()
export class IndicatorsService {
  constructor(private readonly market: BybitMarketService) {}

  // ── Math primitives ──────────────────────────────────────────────────────

  private ema(values: number[], period: number): number[] {
    const k = 2 / (period + 1);
    const out: number[] = [];
    let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = 0; i < values.length; i++) {
      if (i < period - 1) {
        out.push(NaN);
      } else if (i === period - 1) {
        out.push(prev);
      } else {
        prev = values[i] * k + prev * (1 - k);
        out.push(prev);
      }
    }
    return out;
  }

  private rsi(closes: number[], period = 14): number {
    if (closes.length < period + 1) return 50;
    // Wilder smoothing over the whole series for a stable value.
    let avgGain = 0;
    let avgLoss = 0;
    for (let i = 1; i <= period; i++) {
      const d = closes[i] - closes[i - 1];
      if (d > 0) avgGain += d;
      else avgLoss -= d;
    }
    avgGain /= period;
    avgLoss /= period;
    for (let i = period + 1; i < closes.length; i++) {
      const d = closes[i] - closes[i - 1];
      avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
    }
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - 100 / (1 + rs);
  }

  private atr(candles: Candle[], period = 14): number {
    if (candles.length < period + 1) return 0;
    const trs: number[] = [];
    for (let i = 1; i < candles.length; i++) {
      const c = candles[i];
      const prevClose = candles[i - 1].close;
      trs.push(
        Math.max(
          c.high - c.low,
          Math.abs(c.high - prevClose),
          Math.abs(c.low - prevClose),
        ),
      );
    }
    // Wilder smoothing
    let atr = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < trs.length; i++) {
      atr = (atr * (period - 1) + trs[i]) / period;
    }
    return atr;
  }

  private adx(candles: Candle[], period = 14): number {
    if (candles.length < period * 2 + 1) return 0;
    const plusDM: number[] = [];
    const minusDM: number[] = [];
    const trs: number[] = [];
    for (let i = 1; i < candles.length; i++) {
      const up = candles[i].high - candles[i - 1].high;
      const down = candles[i - 1].low - candles[i].low;
      plusDM.push(up > down && up > 0 ? up : 0);
      minusDM.push(down > up && down > 0 ? down : 0);
      const prevClose = candles[i - 1].close;
      trs.push(
        Math.max(
          candles[i].high - candles[i].low,
          Math.abs(candles[i].high - prevClose),
          Math.abs(candles[i].low - prevClose),
        ),
      );
    }
    const smooth = (arr: number[]): number[] => {
      const out: number[] = [];
      let sum = arr.slice(0, period).reduce((a, b) => a + b, 0);
      out.push(sum);
      for (let i = period; i < arr.length; i++) {
        sum = sum - sum / period + arr[i];
        out.push(sum);
      }
      return out;
    };
    const sTR = smooth(trs);
    const sPlus = smooth(plusDM);
    const sMinus = smooth(minusDM);
    const dxs: number[] = [];
    for (let i = 0; i < sTR.length; i++) {
      if (sTR[i] === 0) {
        dxs.push(0);
        continue;
      }
      const pdi = (sPlus[i] / sTR[i]) * 100;
      const mdi = (sMinus[i] / sTR[i]) * 100;
      const sum = pdi + mdi;
      dxs.push(sum === 0 ? 0 : (Math.abs(pdi - mdi) / sum) * 100);
    }
    if (dxs.length < period) return 0;
    let adx = dxs.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < dxs.length; i++) {
      adx = (adx * (period - 1) + dxs[i]) / period;
    }
    return adx;
  }

  private bollinger(closes: number[], period = 20, mult = 2) {
    const slice = closes.slice(-period);
    const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
    const variance =
      slice.reduce((a, b) => a + (b - mean) ** 2, 0) / slice.length;
    const sd = Math.sqrt(variance);
    return { upper: mean + mult * sd, lower: mean - mult * sd, middle: mean };
  }

  // ── Public API ───────────────────────────────────────────────────────────

  async getSnapshot(
    symbol: string,
    timeframe: string,
  ): Promise<IndicatorSnapshot | null> {
    const candles = await this.market.getKlines(symbol, timeframe, 200);
    if (candles.length < 60) return null;
    return this.computeSnapshot(candles);
  }

  computeSnapshot(candles: Candle[]): IndicatorSnapshot {
    const closes = candles.map((c) => c.close);
    const price = closes[closes.length - 1];
    const emaFastArr = this.ema(closes, 20);
    const emaSlowArr = this.ema(closes, 50);
    const emaFast = emaFastArr[emaFastArr.length - 1];
    const emaSlow = emaSlowArr[emaSlowArr.length - 1];
    const adx = this.adx(candles);
    const bb = this.bollinger(closes);

    let regime: IndicatorSnapshot['regime'] = 'range';
    if (adx > ADX_TREND_THRESHOLD) {
      regime = emaFast >= emaSlow ? 'trend_up' : 'trend_down';
    }

    return {
      price,
      rsi: this.rsi(closes),
      emaFast,
      emaSlow,
      atr: this.atr(candles),
      adx,
      bbUpper: bb.upper,
      bbLower: bb.lower,
      bbMiddle: bb.middle,
      regime,
    };
  }

  // Decide which grid entries are allowed right now.
  entryGate(s: IndicatorSnapshot): EntryGate {
    const reasons: string[] = [];
    let allowLong = true;
    let allowShort = true;

    if (s.regime === 'trend_down') {
      allowLong = false;
      reasons.push(
        `Сильный нисходящий тренд (ADX ${s.adx.toFixed(1)}, EMA20 < EMA50) — покупки на паузе`,
      );
    }
    if (s.regime === 'trend_up') {
      allowShort = false;
      reasons.push(
        `Сильный восходящий тренд (ADX ${s.adx.toFixed(1)}, EMA20 > EMA50) — продажи на паузе`,
      );
    }
    if (s.rsi >= RSI_OVERBOUGHT) {
      allowLong = false;
      reasons.push(
        `RSI ${s.rsi.toFixed(1)} — перекупленность, покупки на паузе`,
      );
    }
    if (s.rsi <= RSI_OVERSOLD) {
      allowShort = false;
      reasons.push(
        `RSI ${s.rsi.toFixed(1)} — перепроданность, продажи на паузе`,
      );
    }
    return { allowLong, allowShort, reasons };
  }

  // ── DCA entry filters ────────────────────────────────────────────────────

  // Metric value for one filter, given a snapshot of its timeframe.
  // Public: the backtester extracts the same metrics from historical snapshots.
  filterMetric(
    s: IndicatorSnapshot,
    indicator: DcaFilterConfig['indicator'],
  ): number {
    switch (indicator) {
      case 'rsi':
        return s.rsi;
      case 'adx':
        return s.adx;
      case 'bb_pctb': {
        const width = s.bbUpper - s.bbLower;
        return width > 0 ? ((s.price - s.bbLower) / width) * 100 : 50;
      }
      case 'ema_spread':
        return s.emaSlow !== 0
          ? ((s.emaFast - s.emaSlow) / s.emaSlow) * 100
          : 0;
      case 'atr_pct':
        return s.price > 0 ? (s.atr / s.price) * 100 : 0;
    }
  }

  /**
   * Evaluate a DCA bot's entry filters. Klines are fetched once per distinct
   * (timeframe, barClose) pair; barClose drops the forming candle so the value
   * matches "на закрытии бара". A filter with no candle data fails closed —
   * better to skip an entry than trade blind.
   */
  async evaluateFilters(
    symbol: string,
    filters: DcaFilterConfig[],
  ): Promise<{ passed: boolean; results: DcaFilterResult[] }> {
    const snapshots = new Map<string, IndicatorSnapshot | null>();
    for (const f of filters) {
      const key = `${f.timeframe}|${f.barClose ? 1 : 0}`;
      if (!snapshots.has(key)) {
        const candles = await this.market.getKlines(symbol, f.timeframe, 200);
        const usable = f.barClose ? candles.slice(0, -1) : candles;
        snapshots.set(
          key,
          usable.length >= 60 ? this.computeSnapshot(usable) : null,
        );
      }
    }

    const results: DcaFilterResult[] = filters.map((f) => {
      const s = snapshots.get(`${f.timeframe}|${f.barClose ? 1 : 0}`);
      if (!s) return { ...f, current: null, passed: false };
      const current = this.filterMetric(s, f.indicator);
      const passed = f.op === 'lt' ? current < f.value : current > f.value;
      return { ...f, current, passed };
    });

    return {
      passed: results.length > 0 && results.every((r) => r.passed),
      results,
    };
  }

  // Suggest a grid range for the symbol: Bollinger band width blended with an
  // ATR envelope around the current price, and a level count sized so that one
  // grid step ≈ 0.6 × ATR (each cycle clears fees with margin, fills stay frequent).
  async suggestRange(
    symbol: string,
    timeframe: string,
  ): Promise<RangeSuggestion | null> {
    const candles = await this.market.getKlines(symbol, timeframe, 200);
    if (candles.length < 60) return null;
    const s = this.computeSnapshot(candles);

    const atrHalfWidth = s.atr * 3;
    let lower = Math.max(
      Math.min(s.bbLower, s.price - s.atr),
      s.price - atrHalfWidth,
    );
    let upper = Math.min(
      Math.max(s.bbUpper, s.price + s.atr),
      s.price + atrHalfWidth,
    );

    // In a trend, shift the range in the trend direction so the grid isn't
    // instantly one-sided.
    if (s.regime === 'trend_up') {
      lower = s.price - s.atr * 1.5;
      upper = s.price + s.atr * 3.5;
    } else if (s.regime === 'trend_down') {
      lower = s.price - s.atr * 3.5;
      upper = s.price + s.atr * 1.5;
    }

    const step = Math.max(s.atr * 0.6, (upper - lower) / 40);
    const gridLevels = Math.min(
      30,
      Math.max(5, Math.round((upper - lower) / step) + 1),
    );

    const comment =
      s.regime === 'range'
        ? `Боковик (ADX ${s.adx.toFixed(1)}): диапазон по Bollinger ± ATR, шаг ≈ 0.6×ATR.`
        : s.regime === 'trend_up'
          ? `Восходящий тренд (ADX ${s.adx.toFixed(1)}): диапазон смещён вверх. Сеточная торговля в тренде рискованнее.`
          : `Нисходящий тренд (ADX ${s.adx.toFixed(1)}): диапазон смещён вниз. Сеточная торговля в тренде рискованнее.`;

    return {
      symbol,
      timeframe,
      price: s.price,
      lowerPrice: lower,
      upperPrice: upper,
      gridLevels,
      snapshot: s,
      comment,
    };
  }
}
