import { Injectable, Logger } from '@nestjs/common';
import { toBinanceInterval } from './timeframes';

export interface BinanceCandle {
  time: number; // миллисекунды, время ОТКРЫТИЯ свечи
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const BASE_URL = 'https://api.binance.com/api/v3/klines';
const TICKER_URL = 'https://api.binance.com/api/v3/ticker/24hr';
const MAX_RETRIES = 3;

/**
 * Публичные свечи Binance spot. Ключей не требует, к аккаунтам пользователей
 * отношения не имеет — поэтому живёт здесь, а не среди адаптеров бирж в
 * `exchanges/adapters/`.
 *
 * ВНИМАНИЕ: пагинация здесь противоположна бибитовской. Bybit на диапазон
 * отдаёт самые НОВЫЕ свечи, и `BybitMarketService.getKlinesRange` вынужден
 * листаться назад, двигая `end`. Binance отдаёт `limit` свечей начиная от
 * `startTime`, по возрастанию — двигать надо начало. Код, скопированный
 * оттуда по аналогии, поедет не в ту сторону и не пожалуется.
 */
@Injectable()
export class BinanceKlinesClient {
  private readonly logger = new Logger(BinanceKlinesClient.name);

  /** Вынесено полем, чтобы тест на 429 не спал по-настоящему. */
  protected sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

  async fetchKlines(
    symbol: string,
    timeframe: number,
    startTimeMs: number,
    limit = 1000,
  ): Promise<BinanceCandle[]> {
    return this.klines(
      `${BASE_URL}?symbol=${symbol}&interval=${toBinanceInterval(timeframe)}` +
        `&startTime=${startTimeMs}&limit=${limit}`,
    );
  }

  /**
   * Последние `limit` свечей, включая ещё формирующуюся: без `startTime` Binance
   * отдаёт хвост. Нужен живому графику и движку эфира турниров, а не синку —
   * формирующуюся свечу в хранилище писать нельзя (см. `isClosed`).
   */
  async fetchRecent(symbol: string, timeframe: number, limit: number): Promise<BinanceCandle[]> {
    return this.klines(`${BASE_URL}?symbol=${symbol}&interval=${toBinanceInterval(timeframe)}&limit=${limit}`);
  }

  /**
   * Свечи диапазона — для истории монет эфира, которых нет в хранилище. Только
   * `endTime` — последние `limit` свечей, открытых не позже него (листать назад);
   * со `startTime` — первые `limit` от него (листать вперёд).
   */
  async fetchRange(
    symbol: string,
    timeframe: number,
    range: { startTime?: number; endTime?: number; limit: number },
  ): Promise<BinanceCandle[]> {
    const params =
      `symbol=${symbol}&interval=${toBinanceInterval(timeframe)}` +
      (range.startTime != null ? `&startTime=${range.startTime}` : '') +
      (range.endTime != null ? `&endTime=${range.endTime}` : '') +
      `&limit=${range.limit}`;
    return this.klines(`${BASE_URL}?${params}`);
  }

  /**
   * Цена и изменение за 24 ч монет списком — один запрос на весь список (вес 2
   * до двадцати монет). Список монет справа от графика эфира.
   */
  async fetchTickers24h(symbols: string[]): Promise<{ symbol: string; last: number; change24h: number }[]> {
    const url = `${TICKER_URL}?symbols=${encodeURIComponent(JSON.stringify(symbols))}`;
    const rows = (await this.getJson(url)) as { symbol: string; lastPrice: string; priceChangePercent: string }[];
    return rows.map((r) => ({
      symbol: r.symbol,
      last: parseFloat(r.lastPrice),
      change24h: parseFloat(r.priceChangePercent) || 0,
    }));
  }

  /**
   * Пауза после 429/418 — общая на все запросы процесса. Историю монет эфира
   * запрашивают пользователи, и параллельные запросы не должны долбить биржу,
   * пока один из них ждёт: 418 — это бан IP, и он остановил бы и синк BTC.
   */
  private pause: Promise<void> | null = null;

  private async getJson(url: string): Promise<unknown> {
    for (let attempt = 0; ; attempt++) {
      if (this.pause) await this.pause;
      // Умолчания undici — 300 секунд: зависший запрос держал бы флаг
      // занятости синка до пяти минут и съедал бы тик таймера. 15 секунд
      // хватает публичному klines с запасом и не путается с ретраями на 429.
      const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });

      // 429 — превышен вес запросов; 418 — бан за то, что 429 игнорировали.
      if (res.status === 429 || res.status === 418) {
        if (attempt >= MAX_RETRIES) {
          throw new Error(`Binance: ${res.status} после ${MAX_RETRIES} повторов`);
        }
        const wait = this.backoffMs(res, attempt);
        this.logger.warn(`Binance ответил ${res.status}, повтор через ${wait} мс`);
        // Уже идущую паузу не продлеваем: её поставил запрос, получивший отказ
        // раньше, и до её конца к бирже не ходит никто.
        this.pause ??= this.sleep(wait).finally(() => {
          this.pause = null;
        });
        await this.pause;
        continue;
      }

      if (!res.ok) throw new Error(`Binance: HTTP ${res.status}`);
      return res.json();
    }
  }

  private async klines(url: string): Promise<BinanceCandle[]> {
    // [openTime, open, high, low, close, volume, closeTime, ...] — по возрастанию.
    const rows = (await this.getJson(url)) as unknown[][];
    return rows.map((k) => ({
      time: Number(k[0]),
      open: parseFloat(String(k[1])),
      high: parseFloat(String(k[2])),
      low: parseFloat(String(k[3])),
      close: parseFloat(String(k[4])),
      volume: parseFloat(String(k[5])),
    }));
  }

  private backoffMs(res: { headers: { get(name: string): string | null } }, attempt: number): number {
    const retryAfter = Number(res.headers.get('Retry-After'));
    if (Number.isFinite(retryAfter) && retryAfter > 0) return retryAfter * 1000;
    return 1000 * 2 ** attempt;
  }
}
