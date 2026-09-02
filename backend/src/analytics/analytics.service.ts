import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface VolatilitySnapshot {
  currentVolPct: number; // realized vol, last 24h, scaled to a daily-equivalent %
  avgVolPct: number; // realized vol over the baseline window, same scaling
  elevated: boolean; // currentVolPct > avgVolPct
  volume24hUsd: number;
  avgDailyVolumeUsd: number; // baseline window's average daily volume
  volumeChangePct: number; // volume24hUsd vs avgDailyVolumeUsd
  volumeRising: boolean; // volumeChangePct > 0
  // Bybit klines carry no taker buy/sell split — proxy by candle direction:
  // an hourly candle's whole turnover counts as "buy" if it closed green,
  // "sell" if red. Approximate (intra-candle buys/sells both happen), but
  // cheap — reuses the same candles already fetched for volatility.
  buyVolumeUsd: number;
  sellVolumeUsd: number;
  dominantSide: 'buy' | 'sell' | 'neutral';
}

export interface LiquidityPoint {
  ts: number;
  price: number;
  bidCenter: number; // средневзвешенная по объёму цена бид-стороны книги
  askCenter: number; // то же для аск-стороны
}

export interface LiquidityHistory {
  points: LiquidityPoint[];
}

const VOLATILITY_BASELINE_DAYS = 7;
const VOLATILITY_CACHE_TTL_MS = 5 * 60_000;

// Верхняя граница строк на один символ — при снимке раз в 15 минут это
// ~52 дня. Ограничение оберегает ответ и график от неограниченного роста
// по мере накопления истории; поднять его, когда набежит больше, — вопрос
// одной константы, не пересчёта.
const LIQUIDITY_HISTORY_MAX_POINTS = 5_000;

const stdev = (xs: number[]): number => {
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
  const variance = xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length;
  return Math.sqrt(variance);
};

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  private volatilityCache: { exp: number; data: VolatilitySnapshot } | null = null;

  async getMarketData(): Promise<{ marketCap: number; marketCapChange24h: number }> {
    try {
      const response = await fetch('https://api.coingecko.com/api/v3/global');
      if (!response.ok) {
        throw new Error(`CoinGecko responded with status ${response.status}`);
      }
      const json = await response.json();
      return {
        marketCap: json.data.total_market_cap.usd,
        marketCapChange24h: json.data.market_cap_change_percentage_24h_usd,
      };
    } catch (error) {
      throw new HttpException('External API error', HttpStatus.BAD_GATEWAY);
    }
  }

  async getCMC20(): Promise<{ index: number; change24h: number }> {
    try {
      if (process.env.CMC_API_KEY) {
        const response = await fetch(
          'https://pro-api.coinmarketcap.com/v3/index/pricing/latest',
          {
            headers: { 'X-CMC_PRO_API_KEY': process.env.CMC_API_KEY },
          },
        );
        if (response.ok) {
          const json = await response.json();
          const items: any[] = Array.isArray(json.data)
            ? json.data
            : Object.values(json.data ?? {});
          const idx =
            items.find(
              (item: any) =>
                item.slug === 'cmc20' ||
                String(item.name ?? '').toLowerCase().includes('cmc20') ||
                String(item.name ?? '').toLowerCase().includes('crypto 20'),
            ) ?? items[0];
          if (idx) {
            return {
              index: idx.score ?? idx.close ?? idx.last ?? 0,
              change24h: idx.percent_change_24h ?? idx.change_24h ?? 0,
            };
          }
        }
        // Index endpoint unavailable on this plan — fall through to CoinGecko
      }
      const response = await fetch(
        'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=20&page=1',
      );
      if (!response.ok) {
        throw new Error(`CoinGecko responded with status ${response.status}`);
      }
      const coins: any[] = await response.json();
      const totalMarketCap = coins.reduce((sum, coin) => sum + coin.market_cap, 0);
      const weightedIndex = coins.reduce(
        (sum, coin) => sum + (coin.current_price * coin.market_cap) / totalMarketCap,
        0,
      );
      const change24h =
        coins.reduce((sum, coin) => sum + (coin.price_change_percentage_24h ?? 0), 0) /
        coins.length;
      return { index: weightedIndex, change24h };
    } catch (error) {
      throw new HttpException('External API error', HttpStatus.BAD_GATEWAY);
    }
  }

  async getFearAndGreed(): Promise<{ value: number; classification: string }> {
    try {
      const response = await fetch('https://api.alternative.me/fng/');
      if (!response.ok) {
        throw new Error(`Alternative.me responded with status ${response.status}`);
      }
      const json = await response.json();
      return {
        value: Number(json.data[0].value),
        classification: json.data[0].value_classification,
      };
    } catch (error) {
      throw new HttpException('External API error', HttpStatus.BAD_GATEWAY);
    }
  }

  async getDeFiTVL(): Promise<{ tvl: Array<{ date: number; tvl: number }> }> {
    try {
      const response = await fetch('https://api.llama.fi/v2/historicalChainTvl');
      if (!response.ok) {
        throw new Error(`DeFiLlama responded with status ${response.status}`);
      }
      const json = await response.json();
      return { tvl: json as Array<{ date: number; tvl: number }> };
    } catch (error) {
      throw new HttpException('External API error', HttpStatus.BAD_GATEWAY);
    }
  }

  /**
   * Накопленная история центра ликвидности — то, что копит
   * `LiquiditySnapshotService` раз в 15 минут в `liquidity_snapshots`, отдаём
   * как есть. Раньше не возвращалась строкой за строкой: до сегодняшнего дня
   * этого ряда не существовало вовсе — читать здесь нечего, кроме того, что
   * накопилось после первого запуска сервиса.
   */
  async getLiquidityHistory(symbol = 'BTCUSDT'): Promise<LiquidityHistory> {
    const rows = await this.prisma.liquiditySnapshot.findMany({
      where: { symbol: symbol || 'BTCUSDT' },
      orderBy: { ts: 'desc' },
      take: LIQUIDITY_HISTORY_MAX_POINTS,
    });
    return {
      points: rows
        .reverse()
        .map((r) => ({ ts: r.ts.getTime(), price: r.price, bidCenter: r.bidCenter, askCenter: r.askCenter })),
    };
  }

  async getLongShortRatio(
    symbol: string,
  ): Promise<{
    points: Array<{
      timestamp: number;
      buyRatio: number;
      sellRatio: number;
      openInterest: number;
      openInterestUsd: number;
    }>;
  }> {
    try {
      const sym = symbol || 'BTCUSDT';
      const [ratioResp, oiResp, klineResp] = await Promise.all([
        fetch(
          `https://api.bybit.com/v5/market/account-ratio?category=linear&symbol=${encodeURIComponent(sym)}&period=1h&limit=200`,
        ),
        fetch(
          `https://api.bybit.com/v5/market/open-interest?category=linear&symbol=${encodeURIComponent(sym)}&intervalTime=1h&limit=200`,
        ),
        // Hourly closes over the same window: OI comes in base-coin units
        // (BTC for BTCUSDT); the client shows it in dollars — OI × close of
        // the same hour.
        fetch(
          `https://api.bybit.com/v5/market/kline?category=linear&symbol=${encodeURIComponent(sym)}&interval=60&limit=200`,
        ),
      ]);
      if (!ratioResp.ok || !oiResp.ok || !klineResp.ok) {
        throw new Error('Bybit market data error');
      }
      const ratioJson = await ratioResp.json();
      const oiJson = await oiResp.json();
      const klineJson = await klineResp.json();

      const ratioList: any[] = ratioJson.result?.list ?? [];
      const oiList: any[] = oiJson.result?.list ?? [];
      const klineList: any[] = klineJson.result?.list ?? [];

      // Build OI map keyed by timestamp for quick lookup
      const oiMap = new Map<number, number>();
      for (const r of oiList) {
        oiMap.set(Number(r.timestamp), parseFloat(r.openInterest));
      }
      // Hourly close by candle open time: [startTime, open, high, low, close, ...]
      const closeMap = new Map<number, number>();
      let lastClose = 0;
      for (const k of klineList) {
        closeMap.set(Number(k[0]), parseFloat(k[4]));
      }

      const points = ratioList
        .map((r: any) => {
          const ts = Number(r.timestamp);
          const oi = oiMap.get(ts) ?? 0;
          // Fall back to the previous known close when the hour is missing —
          // better a near-exact dollar figure than a zero that hides the point.
          const close = closeMap.get(ts) ?? lastClose;
          if (close > 0) lastClose = close;
          return {
            timestamp: ts,
            buyRatio: parseFloat(r.buyRatio),
            sellRatio: parseFloat(r.sellRatio),
            openInterest: oi,
            openInterestUsd: oi * close,
          };
        })
        .sort((a, b) => a.timestamp - b.timestamp);

      return { points };
    } catch (error) {
      throw new HttpException('External API error', HttpStatus.BAD_GATEWAY);
    }
  }

  /**
   * Текущая волатильность BTC против её собственной 7-дневной базы: часовые
   * log-returns за окно, stdev последних 24ч сравнивается со stdev всего
   * окна (масштаб — на "дневной" горизонт через √24, читается как типичный
   * дневной размах). Объём — turnover тех же свечей (USDT), тем же образом.
   */
  async getVolatility(symbol = 'BTCUSDT'): Promise<VolatilitySnapshot> {
    if (this.volatilityCache && this.volatilityCache.exp > Date.now()) {
      return this.volatilityCache.data;
    }
    try {
      const hours = VOLATILITY_BASELINE_DAYS * 24;
      const response = await fetch(
        `https://api.bybit.com/v5/market/kline?category=linear&symbol=${encodeURIComponent(symbol)}&interval=60&limit=${hours + 1}`,
      );
      if (!response.ok) {
        throw new Error(`Bybit kline responded with status ${response.status}`);
      }
      const json = await response.json();
      // [startTime, open, high, low, close, volume, turnover] — oldest first.
      const list: any[] = (json.result?.list ?? [])
        .slice()
        .sort((a: any, b: any) => Number(a[0]) - Number(b[0]));
      if (list.length < 2) {
        throw new Error('Not enough Bybit kline data for volatility');
      }

      const opens = list.map((k) => parseFloat(k[1]));
      const closes = list.map((k) => parseFloat(k[4]));
      const turnovers = list.map((k) => parseFloat(k[6]));

      const logReturns: number[] = [];
      for (let i = 1; i < closes.length; i++) logReturns.push(Math.log(closes[i] / closes[i - 1]));

      const currentVolPct = stdev(logReturns.slice(-24)) * Math.sqrt(24) * 100;
      const avgVolPct = stdev(logReturns) * Math.sqrt(24) * 100;

      const recentTurnovers = turnovers.slice(-hours);
      const volume24hUsd = turnovers.slice(-24).reduce((s, v) => s + v, 0);
      const avgDailyVolumeUsd = recentTurnovers.reduce((s, v) => s + v, 0) / VOLATILITY_BASELINE_DAYS;
      const volumeChangePct =
        avgDailyVolumeUsd > 0 ? ((volume24hUsd - avgDailyVolumeUsd) / avgDailyVolumeUsd) * 100 : 0;

      let buyVolumeUsd = 0;
      let sellVolumeUsd = 0;
      for (let i = list.length - 24; i < list.length; i++) {
        if (closes[i] >= opens[i]) buyVolumeUsd += turnovers[i];
        else sellVolumeUsd += turnovers[i];
      }
      const dominantSide: VolatilitySnapshot['dominantSide'] =
        buyVolumeUsd === sellVolumeUsd ? 'neutral' : buyVolumeUsd > sellVolumeUsd ? 'buy' : 'sell';

      const data: VolatilitySnapshot = {
        currentVolPct,
        avgVolPct,
        elevated: currentVolPct > avgVolPct,
        volume24hUsd,
        avgDailyVolumeUsd,
        volumeChangePct,
        volumeRising: volumeChangePct > 0,
        buyVolumeUsd,
        sellVolumeUsd,
        dominantSide,
      };
      this.volatilityCache = { exp: Date.now() + VOLATILITY_CACHE_TTL_MS, data };
      return data;
    } catch (error) {
      if (this.volatilityCache) return this.volatilityCache.data;
      throw new HttpException('External API error', HttpStatus.BAD_GATEWAY);
    }
  }
}
