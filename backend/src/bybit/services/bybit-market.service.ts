import { Injectable } from '@nestjs/common';
import { BybitAuthService } from './bybit-auth.service';

// Public market data barely changes within a tick, but the bot engines and
// filter evaluation request it repeatedly (every bot, every level, every
// timeframe). A small in-memory TTL cache collapses those into one upstream
// call. Failures (null/empty) are never cached, so errors stay retryable.
const PRICE_TTL_MS = 3_000;
const KLINES_TTL_MS = 10_000;
const SYMBOL_INFO_TTL_MS = 10 * 60_000;

@Injectable()
export class BybitMarketService extends BybitAuthService {
  private readonly cache = new Map<string, { exp: number; val: unknown }>();
  private readonly inflight = new Map<string, Promise<unknown>>();

  // Cache + request coalescing: concurrent callers for the same key share one
  // upstream request instead of racing duplicates.
  private async cached<T>(key: string, ttlMs: number, fetcher: () => Promise<T>, cacheable: (v: T) => boolean): Promise<T> {
    const hit = this.cache.get(key);
    if (hit && hit.exp > Date.now()) return hit.val as T;

    const running = this.inflight.get(key);
    if (running) return running as Promise<T>;

    const p = (async () => {
      try {
        const val = await fetcher();
        if (cacheable(val)) this.cache.set(key, { exp: Date.now() + ttlMs, val });
        return val;
      } finally {
        this.inflight.delete(key);
      }
    })();
    this.inflight.set(key, p);
    return p;
  }

  // Get list of all coins with prices (public endpoint)
  async getTickers() {
    try {
      const response = await fetch(`${this.baseUrl}/market/tickers?category=linear`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.retCode === 0 && data.result?.list) {
        // Filter only USDT pairs and sort by turnover in USD
        const tickers = data.result.list
          .filter((ticker: any) => ticker.symbol.endsWith('USDT'))
          .map((ticker: any) => ({
            symbol: ticker.symbol,
            lastPrice: ticker.lastPrice,
            price24hPcnt: ticker.price24hPcnt,
            volume24h: ticker.volume24h,
            turnover24h: ticker.turnover24h, // Trading volume in USD
            highPrice24h: ticker.highPrice24h,
            lowPrice24h: ticker.lowPrice24h,
          }))
          .sort((a: any, b: any) => parseFloat(b.turnover24h) - parseFloat(a.turnover24h)); // Sort by turnover in USD

        return { tickers, success: true };
      }

      return { tickers: [], success: false, error: data.retMsg };
    } catch (error: any) {
      return { tickers: [], success: false, error: error.message };
    }
  }

  // Last traded price for a single symbol (public endpoint, cached ~3s)
  async getLastPrice(symbol: string): Promise<number | null> {
    return this.cached(`price:${symbol}`, PRICE_TTL_MS, () => this.fetchLastPrice(symbol), (v) => v != null);
  }

  private async fetchLastPrice(symbol: string): Promise<number | null> {
    try {
      const response = await fetch(
        `${this.baseUrl}/market/tickers?category=linear&symbol=${symbol}`,
        { method: 'GET', headers: { 'Content-Type': 'application/json' } },
      );
      if (!response.ok) return null;
      const data = await response.json();
      const price = parseFloat(data?.result?.list?.[0]?.lastPrice ?? '');
      return Number.isFinite(price) ? price : null;
    } catch (error) {
      console.error('getLastPrice error:', error);
      return null;
    }
  }

  // Historical candles (public endpoint, cached ~10s). Returned oldest-first.
  // interval: Bybit format — '1','5','15','60','240','D',...
  async getKlines(
    symbol: string,
    interval: string,
    limit = 200,
  ): Promise<Array<{ time: number; open: number; high: number; low: number; close: number; volume: number }>> {
    return this.cached(
      `klines:${symbol}:${interval}:${limit}`,
      KLINES_TTL_MS,
      () => this.fetchKlines(symbol, interval, limit),
      (v) => v.length > 0,
    );
  }

  private async fetchKlines(
    symbol: string,
    interval: string,
    limit = 200,
  ): Promise<Array<{ time: number; open: number; high: number; low: number; close: number; volume: number }>> {
    try {
      const response = await fetch(
        `${this.baseUrl}/market/kline?category=linear&symbol=${symbol}&interval=${interval}&limit=${limit}`,
        { method: 'GET', headers: { 'Content-Type': 'application/json' } },
      );
      if (!response.ok) return [];
      const data = await response.json();
      if (data.retCode !== 0 || !data.result?.list) return [];
      // Bybit returns newest-first: [startTime, open, high, low, close, volume, turnover]
      return data.result.list
        .map((k: string[]) => ({
          time: Number(k[0]),
          open: parseFloat(k[1]),
          high: parseFloat(k[2]),
          low: parseFloat(k[3]),
          close: parseFloat(k[4]),
          volume: parseFloat(k[5]),
        }))
        .reverse();
    } catch (error) {
      console.error('getKlines error:', error);
      return [];
    }
  }

  /**
   * Historical candles for an arbitrary time range (backtesting). Pages
   * forward through /market/kline (1000 candles/request), oldest-first.
   * maxPages caps the download so a 1m filter over 60 days can't turn into
   * hundreds of requests — callers get what fits and report partial coverage.
   */
  async getKlinesRange(
    symbol: string,
    interval: string,
    startMs: number,
    endMs: number,
    maxPages = 25,
  ): Promise<Array<{ time: number; open: number; high: number; low: number; close: number; volume: number }>> {
    // Bybit returns the NEWEST candles of a [start, end] range, so pagination
    // must walk backwards: fetch, then move `end` to just before the oldest
    // candle received, prepending chunks until `start` is reached.
    const chunks: Array<Array<{ time: number; open: number; high: number; low: number; close: number; volume: number }>> = [];
    let curEnd = endMs;
    try {
      for (let page = 0; page < maxPages && curEnd > startMs; page++) {
        const response = await fetch(
          `${this.baseUrl}/market/kline?category=linear&symbol=${symbol}&interval=${interval}&start=${startMs}&end=${curEnd}&limit=1000`,
          { method: 'GET', headers: { 'Content-Type': 'application/json' } },
        );
        if (!response.ok) break;
        const data = await response.json();
        if (data.retCode !== 0 || !data.result?.list?.length) break;
        // Newest-first -> oldest-first.
        const chunk = data.result.list
          .map((k: string[]) => ({
            time: Number(k[0]),
            open: parseFloat(k[1]),
            high: parseFloat(k[2]),
            low: parseFloat(k[3]),
            close: parseFloat(k[4]),
            volume: parseFloat(k[5]),
          }))
          .reverse();
        chunks.unshift(chunk);
        curEnd = chunk[0].time - 1;
        if (chunk.length < 1000) break; // no more history before this
      }
    } catch (error) {
      console.error('getKlinesRange error:', error);
    }
    return chunks.flat();
  }

  // Get symbol information (lot size filter). Instrument filters change very
  // rarely — cached for 10 minutes; every order placement reads this.
  async getSymbolInfo(symbol: string) {
    return this.cached(`info:${symbol}`, SYMBOL_INFO_TTL_MS, () => this.fetchSymbolInfo(symbol), (v) => v != null);
  }

  private async fetchSymbolInfo(symbol: string) {
    try {
      const response = await fetch(`${this.baseUrl}/market/instruments-info?category=linear&symbol=${symbol}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      if (data.retCode === 0 && data.result?.list?.length > 0) {
        return data.result.list[0];
      }
      return null;
    } catch (error) {
      console.error('Error fetching symbol info:', error);
      return null;
    }
  }
}

