import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { BinanceKlinesClient, type BinanceCandle } from './binance-klines.client';
import { MarketDataService, type Candle } from './market-data.service';
import { SYMBOL } from './timeframes';

/** Сколько последних минуток держать: синк хранилища отстаёт не больше чем на 15. */
const TAIL_SIZE = 30;
/** Не чаще одного запроса к Binance за столько на весь сервер. */
const CACHE_MS = 1500;
/** Цена исполнения ордера — из хвоста не старше этого. */
const QUOTE_MAX_AGE_MS = 1000;
/** Потолок чтения хранилища за раз — как у эндпоинта свечей. */
const STORED_LIMIT = 5000;

export interface LiveSnapshot {
  /** Когда хвост получен, мс сервера. */
  at: number;
  /** По возрастанию; последняя минутка может быть ещё недоформированной. */
  minutes: Candle[];
}

const toCandle = (k: BinanceCandle): Candle => ({
  time: new Date(k.time),
  open: k.open,
  high: k.high,
  low: k.low,
  close: k.close,
  volume: k.volume,
});

const unavailable = () =>
  new ServiceUnavailableException({ message: 'Нет живой цены BTC — биржа не ответила', code: 'LIVE_PRICE_UNAVAILABLE' });

/**
 * Живой хвост минуток BTCUSDT — для графика и движка эфира турниров.
 *
 * Хвост не пишется в `price_candles`: последняя минутка ещё формируется, а
 * таблица хранит только закрытые (см. `isClosed`). Всё старше хвоста читается из
 * хранилища — модуль по-прежнему единственный, кто отвечает за данные BTC.
 *
 * Запросов нет, пока хвост никому не нужен: кэш наполняется по требованию, а
 * требуют его только открытый график эфира и идущий эфирный турнир.
 */
@Injectable()
export class LiveMarketService {
  constructor(
    private readonly binance: BinanceKlinesClient,
    private readonly marketData: MarketDataService,
  ) {}

  /** Вынесено полем, чтобы тесты задавали время. */
  protected now: () => number = Date.now;

  private cache: LiveSnapshot | null = null;
  private inflight: Promise<LiveSnapshot> | null = null;

  /** Хвост не старше maxAgeMs; одновременные вызовы ждут один запрос. Ошибку сети отдаёт как есть. */
  async recentMinutes(maxAgeMs = CACHE_MS): Promise<LiveSnapshot> {
    if (this.cache && this.now() - this.cache.at <= maxAgeMs) return this.cache;
    if (!this.inflight) {
      this.inflight = this.binance
        .fetchRecent(SYMBOL, 1, TAIL_SIZE)
        .then((rows) => {
          this.cache = { at: this.now(), minutes: rows.map(toCandle) };
          return this.cache;
        })
        .finally(() => {
          this.inflight = null;
        });
    }
    return this.inflight;
  }

  /** Хвост для ответа наружу: без биржи — 503 с кодом, а не 500. */
  async snapshot(): Promise<LiveSnapshot> {
    try {
      return await this.recentMinutes();
    } catch {
      throw unavailable();
    }
  }

  /**
   * Цена исполнения ордера в эфире: закрытие последней минутки хвоста не старше
   * секунды, время — сервера. Цену и время из браузера эфир не читает.
   */
  async quote(): Promise<{ time: Date; price: number }> {
    let snap: LiveSnapshot;
    try {
      snap = await this.recentMinutes(QUOTE_MAX_AGE_MS);
    } catch {
      throw unavailable();
    }
    const last = snap.minutes[snap.minutes.length - 1];
    if (!last) throw unavailable();
    return { time: new Date(this.now()), price: last.close };
  }

  /**
   * Минутки 1m с `from` (по времени открытия) и раньше `until`: хранилище, поверх —
   * хвост. Если хранилище упёрлось в лимит, хвост не приклеивается — между ними
   * была бы дыра; остальное дочитает следующий вызов.
   */
  async minutesSince(from: number, until: number): Promise<Candle[]> {
    const tail = await this.recentMinutes();
    const tailStart = tail.minutes[0]?.time.getTime() ?? Number.POSITIVE_INFINITY;

    const byTime = new Map<number, Candle>();
    let truncated = false;
    if (from < tailStart) {
      const stored = await this.marketData.getCandles({
        timeframe: 1,
        from: new Date(from),
        to: new Date(Math.min(tailStart, until) - 1),
        limit: STORED_LIMIT,
      });
      truncated = stored.length >= STORED_LIMIT;
      for (const c of stored) byTime.set(c.time.getTime(), c);
    }
    if (!truncated) for (const c of tail.minutes) byTime.set(c.time.getTime(), c);

    return [...byTime.values()]
      .filter((c) => c.time.getTime() >= from && c.time.getTime() < until)
      .sort((a, b) => a.time.getTime() - b.time.getTime());
  }
}
