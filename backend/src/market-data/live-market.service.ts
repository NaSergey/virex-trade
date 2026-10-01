import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { BinanceKlinesClient, type BinanceCandle } from './binance-klines.client';
import { MarketDataService, type Candle } from './market-data.service';
import { DEFAULT_SYMBOL } from './symbols';
import { SYMBOL, TIMEFRAMES, isClosed, isValidTimeframe } from './timeframes';

/** Сколько последних минуток держать: синк хранилища отстаёт не больше чем на 15. */
const TAIL_SIZE = 30;
/** Не чаще одного запроса к Binance за столько на монету на весь сервер. */
const CACHE_MS = 1500;
/** Цена исполнения ордера — из хвоста не старше этого. */
const QUOTE_MAX_AGE_MS = 1000;
/** Потолок чтения хранилища за раз — как у эндпоинта свечей. */
const STORED_LIMIT = 5000;
/** Больше Binance за один запрос свечей не отдаёт. */
const BINANCE_PAGE = 1000;

export interface LiveSnapshot {
  /** Когда хвост получен, мс сервера. */
  at: number;
  /** По возрастанию; последняя минутка может быть ещё недоформированной. */
  minutes: Candle[];
}

export interface HistoryQuery {
  timeframe: number;
  from?: Date;
  to?: Date;
  limit: number;
}

const toCandle = (k: BinanceCandle): Candle => ({
  time: new Date(k.time),
  open: k.open,
  high: k.high,
  low: k.low,
  close: k.close,
  volume: k.volume,
});

const unavailable = (symbol: string) =>
  new ServiceUnavailableException({
    message: `Нет живой цены ${symbol} — биржа не ответила`,
    code: 'LIVE_PRICE_UNAVAILABLE',
  });

/** Хвост одной монеты: последний ответ и запрос, который сейчас в пути. */
interface Tail {
  cache: LiveSnapshot | null;
  inflight: Promise<LiveSnapshot> | null;
}

/**
 * Живой рынок монет эфира (`symbols.ts`) — для графика и движка эфира.
 *
 * Хвост минуток у каждой монеты свой и не пишется в `price_candles`: последняя
 * минутка ещё формируется, а таблица хранит только закрытые (см. `isClosed`).
 * Всё старше хвоста у BTC читается из хранилища, у остальных монет — у Binance:
 * их история не хранится (спека 2026-09-26), эфиру нужен только правый край
 * графика и догон движка после перезапуска.
 *
 * Запросов нет, пока монета никому не нужна: кэш наполняется по требованию, а
 * требуют его открытый график эфира и позиции, которые держит движок.
 */
@Injectable()
export class LiveMarketService {
  constructor(
    private readonly binance: BinanceKlinesClient,
    private readonly marketData: MarketDataService,
  ) {}

  /** Вынесено полем, чтобы тесты задавали время. */
  protected now: () => number = Date.now;

  private tails = new Map<string, Tail>();

  /** Хвост монеты не старше maxAgeMs; одновременные вызовы ждут один запрос. Ошибку сети отдаёт как есть. */
  async recentMinutes(symbol: string = DEFAULT_SYMBOL, maxAgeMs = CACHE_MS): Promise<LiveSnapshot> {
    let tail = this.tails.get(symbol);
    if (!tail) {
      tail = { cache: null, inflight: null };
      this.tails.set(symbol, tail);
    }
    const state = tail;
    if (state.cache && this.now() - state.cache.at <= maxAgeMs) return state.cache;
    if (!state.inflight) {
      state.inflight = this.binance
        .fetchRecent(symbol, 1, TAIL_SIZE)
        .then((rows) => {
          state.cache = { at: this.now(), minutes: rows.map(toCandle) };
          return state.cache;
        })
        .finally(() => {
          state.inflight = null;
        });
    }
    return state.inflight;
  }

  /** Хвост для ответа наружу: без биржи — 503 с кодом, а не 500. */
  async snapshot(symbol: string = DEFAULT_SYMBOL): Promise<LiveSnapshot> {
    try {
      return await this.recentMinutes(symbol);
    } catch {
      throw unavailable(symbol);
    }
  }

  /**
   * Цена исполнения ордера в эфире: закрытие последней минутки хвоста монеты не
   * старше секунды, время — сервера. Цену и время из браузера эфир не читает.
   */
  async quote(symbol: string = DEFAULT_SYMBOL): Promise<{ time: Date; price: number }> {
    let snap: LiveSnapshot;
    try {
      snap = await this.recentMinutes(symbol, QUOTE_MAX_AGE_MS);
    } catch {
      throw unavailable(symbol);
    }
    const last = snap.minutes[snap.minutes.length - 1];
    if (!last) throw unavailable(symbol);
    return { time: new Date(this.now()), price: last.close };
  }

  /**
   * Последние цены монет — отметка позиций по монетам, которых нет на графике.
   * Монета, по которой биржа не ответила, в ответ не попадает: отметка без цены
   * лучше, чем один сбой, роняющий цены всех позиций.
   */
  async prices(symbols: string[]): Promise<Record<string, number>> {
    const rows = await Promise.allSettled(symbols.map((s) => this.recentMinutes(s)));
    const out: Record<string, number> = {};
    rows.forEach((r, i) => {
      const last = r.status === 'fulfilled' ? r.value.minutes.at(-1) : undefined;
      if (last) out[symbols[i]] = last.close;
    });
    return out;
  }

  /**
   * Минутки 1m монеты с `from` (по времени открытия) и раньше `until`: до хвоста —
   * хранилище (BTC) или Binance, поверх — хвост. Если старая часть упёрлась в
   * лимит, хвост не приклеивается — между ними была бы дыра; остальное дочитает
   * следующий вызов.
   */
  async minutesSince(symbol: string, from: number, until: number): Promise<Candle[]> {
    const tail = await this.recentMinutes(symbol);
    const tailStart = tail.minutes[0]?.time.getTime() ?? Number.POSITIVE_INFINITY;

    const byTime = new Map<number, Candle>();
    let truncated = false;
    if (from < tailStart) {
      const older = await this.olderMinutes(symbol, from, Math.min(tailStart, until));
      truncated = older.truncated;
      for (const c of older.rows) byTime.set(c.time.getTime(), c);
    }
    if (!truncated) for (const c of tail.minutes) byTime.set(c.time.getTime(), c);

    return [...byTime.values()]
      .filter((c) => c.time.getTime() >= from && c.time.getTime() < until)
      .sort((a, b) => a.time.getTime() - b.time.getTime());
  }

  /** Минутки `[from, to)` старше хвоста: BTC — из хранилища, остальные — у Binance. */
  private async olderMinutes(symbol: string, from: number, to: number): Promise<{ rows: Candle[]; truncated: boolean }> {
    if (symbol === SYMBOL) {
      const rows = await this.marketData.getCandles({
        timeframe: 1,
        from: new Date(from),
        to: new Date(to - 1),
        limit: STORED_LIMIT,
      });
      return { rows, truncated: rows.length >= STORED_LIMIT };
    }
    // Тот же потолок, что у хранилища: окно догона после простоя воркера не
    // должно зависеть от того, хранится монета или нет.
    const rows = await this.history(symbol, { timeframe: 1, from: new Date(from), to: new Date(to - 1), limit: STORED_LIMIT });
    return { rows, truncated: rows.length >= STORED_LIMIT };
  }

  /**
   * История монеты, которой нет в хранилище, — в той же форме, что отдаёт
   * хранилище: только закрытые свечи, по возрастанию, `from`/`to` — по времени
   * открытия. Без `from` — последние `limit` свечей не позже `to` (листается
   * назад), с `from` — первые `limit` от него (вперёд). Binance отдаёт не больше
   * тысячи за раз, поэтому запрос собирается страницами.
   */
  async history(symbol: string, q: HistoryQuery): Promise<Candle[]> {
    if (!isValidTimeframe(q.timeframe)) {
      throw new BadRequestException(`Неизвестный таймфрейм: ${q.timeframe}. Допустимы: ${TIMEFRAMES.join(', ')}`);
    }
    const tf = q.timeframe;
    const endTime = q.to?.getTime();
    const rows: BinanceCandle[] = [];

    if (q.from) {
      let start = q.from.getTime();
      while (rows.length < q.limit) {
        const want = Math.min(BINANCE_PAGE, q.limit - rows.length);
        const page = await this.binance.fetchRange(symbol, tf, { startTime: start, endTime, limit: want });
        rows.push(...page);
        if (page.length < want) break;
        start = page[page.length - 1].time + 1;
      }
    } else {
      let end = endTime;
      while (rows.length < q.limit) {
        const want = Math.min(BINANCE_PAGE, q.limit - rows.length);
        const page = await this.binance.fetchRange(symbol, tf, { endTime: end, limit: want });
        rows.unshift(...page);
        if (page.length < want) break;
        end = page[0].time - 1;
      }
    }

    // Незакрытая свеча в ответе значилась бы окончательной — у хранилища её нет,
    // и граница «хранилище / минутки» на графике (`liveAnchor`) считается от этого.
    const now = this.now();
    return rows.filter((k) => isClosed(k.time, tf, now)).map(toCandle);
  }
}
