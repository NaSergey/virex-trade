import { Injectable } from '@nestjs/common';
import { isClosed } from '../market-data/timeframes';
import { BybitTerminalClient } from './bybit-terminal.client';
import { priceUnavailable, symbolUnknown, timeframeUnknown } from './terminal-errors';
import { bybitInterval, stepDecimals, toInstrument, type Instrument } from './terminal-math';

/** Инструменты меняются редко: шаги цены и лота биржа правит раз в месяцы. */
const INSTRUMENTS_TTL_MS = 10 * 60_000;
/** Порядок монет по обороту — не цена: пяти минут хватает с запасом. */
const SYMBOLS_TTL_MS = 5 * 60_000;
/** Хвост графика — не чаще одного запроса к Bybit за столько на монету на весь сервер. */
const TAIL_TTL_MS = 1500;
/** Сколько последних минуток в хвосте — столько же, сколько у эфира бектеста. */
const TAIL_SIZE = 30;
/** Больше Bybit за один запрос свечей не отдаёт. */
const PAGE = 1000;
/** Потолок страниц на один запрос истории: шесть тысяч свечей — больше, чем просит график. */
const MAX_PAGES = 6;

export interface TerminalCandle {
  time: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TerminalSymbol {
  symbol: string;
  base: string;
  /** Знаков цены — по шагу цены биржи. */
  decimals: number;
  maxLeverage: number;
}

export interface CandleQuery {
  timeframe: number;
  from?: Date;
  to?: Date;
  limit: number;
}

interface Cached<T> {
  at: number;
  value: T;
}

// Bybit: [startTime, open, high, low, close, volume, turnover], новые первыми.
const toCandle = (k: string[]): TerminalCandle => ({
  time: new Date(Number(k[0])),
  open: parseFloat(k[1]),
  high: parseFloat(k[2]),
  low: parseFloat(k[3]),
  close: parseFloat(k[4]),
  volume: parseFloat(k[5]),
});

/**
 * Рынок терминала — свечи, цены и список монет самого Bybit.
 *
 * Не `LiveMarketService`: тот читает Binance, и для бектеста это годится —
 * сделки там исполняет наш движок по тем же ценам, что на графике. Здесь
 * исполняет Bybit, и график обязан показывать его цену: стоп, поставленный по
 * свечам другой биржи, стоял бы в нескольких пунктах от того, что видно.
 *
 * Список монет — все торгуемые USDT-перпы биржи. Он же и белый список: символ
 * из адреса сверяется с ним прежде, чем попасть в запрос к бирже, — иначе
 * эндпоинты свечей были бы прокси к чему угодно.
 */
@Injectable()
export class TerminalMarketService {
  constructor(private readonly bybit: BybitTerminalClient) {}

  /** Вынесено полем, чтобы тесты задавали время. */
  protected now: () => number = Date.now;

  private instrumentsCache: Cached<Map<string, Instrument>> | null = null;
  private instrumentsInflight: Promise<Map<string, Instrument>> | null = null;
  private symbolsCache: Cached<TerminalSymbol[]> | null = null;
  private tails = new Map<string, { cache: Cached<TerminalCandle[]> | null; inflight: Promise<TerminalCandle[]> | null }>();

  async instruments(): Promise<Map<string, Instrument>> {
    const hit = this.instrumentsCache;
    if (hit && this.now() - hit.at < INSTRUMENTS_TTL_MS) return hit.value;
    if (!this.instrumentsInflight) {
      this.instrumentsInflight = this.fetchInstruments()
        .then((value) => {
          this.instrumentsCache = { at: this.now(), value };
          return value;
        })
        .catch((e) => {
          // Биржа не ответила, а прежний список есть — торговать по нему можно:
          // шаги лота за десять минут не меняются, а отказ остановил бы всё.
          if (hit) return hit.value;
          throw e;
        })
        .finally(() => {
          this.instrumentsInflight = null;
        });
    }
    return this.instrumentsInflight;
  }

  private async fetchInstruments(): Promise<Map<string, Instrument>> {
    const map = new Map<string, Instrument>();
    let cursor = '';
    for (let page = 0; page < 5; page++) {
      const params: Record<string, string> = { category: 'linear', limit: '1000' };
      if (cursor) params.cursor = cursor;
      const result = await this.bybit.publicGet('/market/instruments-info', params);
      for (const row of result.list ?? []) {
        const inst = toInstrument(row);
        if (inst) map.set(inst.symbol, inst);
      }
      cursor = result.nextPageCursor || '';
      if (!cursor) break;
    }
    return map;
  }

  /** Инструмент монеты; не из списка — 400: дальше символ уходит в запрос к бирже. */
  async requireInstrument(symbol: string): Promise<Instrument> {
    const inst = (await this.instruments()).get(symbol);
    if (!inst) throw symbolUnknown(symbol);
    return inst;
  }

  /** Монеты терминала, самые торгуемые первыми. */
  async symbols(): Promise<TerminalSymbol[]> {
    const hit = this.symbolsCache;
    if (hit && this.now() - hit.at < SYMBOLS_TTL_MS) return hit.value;
    const [instruments, tickers] = await Promise.all([
      this.instruments(),
      // Оборот нужен только для порядка: без него список всё равно годится.
      this.bybit.publicGet('/market/tickers', { category: 'linear' }).catch(() => ({ list: [] })),
    ]);
    const turnover = new Map<string, number>();
    for (const t of tickers.list ?? []) turnover.set(String(t.symbol), parseFloat(t.turnover24h) || 0);
    const value = [...instruments.values()]
      .map((i) => ({ symbol: i.symbol, base: i.base, decimals: stepDecimals(i.tickSize), maxLeverage: i.maxLeverage }))
      .sort((a, b) => (turnover.get(b.symbol) ?? 0) - (turnover.get(a.symbol) ?? 0) || a.symbol.localeCompare(b.symbol));
    this.symbolsCache = { at: this.now(), value };
    return value;
  }

  /** Последняя цена монеты — от неё считается объём рыночного ордера. Без кэша: устаревшая цена — неверный размер. */
  async lastPrice(symbol: string): Promise<number> {
    const result = await this.bybit.publicGet('/market/tickers', { category: 'linear', symbol });
    const price = parseFloat(result.list?.[0]?.lastPrice ?? '');
    if (!(price > 0)) throw priceUnavailable(symbol);
    return price;
  }

  /** Хвост последних минуток монеты, по возрастанию; последняя ещё формируется. */
  async tail(symbol: string): Promise<TerminalCandle[]> {
    await this.requireInstrument(symbol);
    let state = this.tails.get(symbol);
    if (!state) {
      state = { cache: null, inflight: null };
      this.tails.set(symbol, state);
    }
    const tail = state;
    if (tail.cache && this.now() - tail.cache.at <= TAIL_TTL_MS) return tail.cache.value;
    if (!tail.inflight) {
      tail.inflight = this.bybit
        .publicGet('/market/kline', { category: 'linear', symbol, interval: '1', limit: String(TAIL_SIZE) })
        .then((result) => {
          const value = ((result.list ?? []) as string[][]).map(toCandle).reverse();
          tail.cache = { at: this.now(), value };
          return value;
        })
        .finally(() => {
          tail.inflight = null;
        });
    }
    return tail.inflight;
  }

  /**
   * История монеты — в той же форме, что `/api/market-data/candles`: только
   * закрытые свечи, по возрастанию, `from`/`to` — по времени открытия. График
   * терминала — тот же, что у бектеста, и граница «история / минутки» на нём
   * (`liveAnchor`) считается от того, что незакрытой свечи в истории нет.
   *
   * Bybit отдаёт НОВЕЙШИЕ свечи окна, поэтому окно листается назад от правого
   * края, пока не наберётся `limit` или не кончится `from`.
   */
  async candles(symbol: string, q: CandleQuery): Promise<TerminalCandle[]> {
    await this.requireInstrument(symbol);
    const interval = bybitInterval(q.timeframe);
    if (!interval) throw timeframeUnknown(q.timeframe);

    const now = this.now();
    const from = q.from?.getTime();
    let end = q.to?.getTime() ?? now;
    const rows: TerminalCandle[] = [];

    for (let page = 0; page < MAX_PAGES; page++) {
      // С `from` окно читается целиком и режется в конце: нужны ПЕРВЫЕ limit свечей от него.
      const want = from != null ? PAGE : Math.min(PAGE, q.limit - rows.length);
      if (want <= 0) break;
      const params: Record<string, string> = { category: 'linear', symbol, interval, end: String(end), limit: String(want) };
      if (from != null) params.start = String(from);
      const result = await this.bybit.publicGet('/market/kline', params);
      const chunk = ((result.list ?? []) as string[][]).map(toCandle).reverse();
      if (chunk.length === 0) break;
      rows.unshift(...chunk);
      if (chunk.length < want) break;
      end = chunk[0].time.getTime() - 1;
      if (from != null && end < from) break;
    }

    const closed = rows.filter((c) => isClosed(c.time.getTime(), q.timeframe, now));
    return from != null ? closed.slice(0, q.limit) : closed.slice(-q.limit);
  }
}
