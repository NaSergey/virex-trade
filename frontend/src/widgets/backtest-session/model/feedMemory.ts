import type { Candle } from '../lib/candles';
import type { LiveSource } from './useLiveFeed';

/**
 * Память живой ленты — что терминал знает о рынке, пока вкладка открыта.
 *
 * Терминал — главная страница, и вернувшийся на него с другой страницы не
 * должен видеть заглушку графика (владелец 2026-10-17): свечи жили в
 * состоянии `useLiveFeed` и пропадали при каждом уходе. Теперь лента пишет их
 * сюда, а на монтировании берёт отсюда — график рисуется сразу, свежие свечи
 * ложатся поверх за долю секунды. Сюда же кладёт свечи прогрев терминала
 * (`prefetchLiveFeed`), если приложение открыли на другой странице.
 *
 * По источнику — по ссылке на него (`WeakMap`): свечи Bybit и рынка продукта
 * под одной монетой — разные свечи. Внутри — по монете; закрытые свечи — ещё и
 * по таймфрейму, минутки — общие: из них собирается текущая свеча любого.
 *
 * Это рынок, а не данные человека: выход из аккаунта память не чистит. Пишут в
 * неё только эффекты ленты и прогрев — то есть браузер; на сервере она пуста.
 */

/** Закрытые свечи таймфрейма и граница, до которой они загружены (`liveAnchor`). */
export interface ClosedMemo {
  rows: Candle[];
  anchor: number;
}

/** Что лента помнит о монете. */
export interface FeedMemo {
  /** Закрытые свечи запрошенного таймфрейма; null — его не загружали. */
  closed: ClosedMemo | null;
  minutes: Candle[];
  /** Часы браузера минус часы сервера источника; null — хвост ещё не приходил. */
  skew: number | null;
}

interface CoinMemo {
  closed: Map<number, ClosedMemo>;
  minutes: Candle[];
}

interface SourceMemo {
  skew: number | null;
  coins: Map<string, CoinMemo>;
}

const memory = new WeakMap<LiveSource, SourceMemo>();

function sourceMemo(source: LiveSource): SourceMemo {
  let memo = memory.get(source);
  if (!memo) {
    memo = { skew: null, coins: new Map() };
    memory.set(source, memo);
  }
  return memo;
}

function coinMemo(source: LiveSource, symbol: string): CoinMemo {
  const coins = sourceMemo(source).coins;
  let memo = coins.get(symbol);
  if (!memo) {
    memo = { closed: new Map(), minutes: [] };
    coins.set(symbol, memo);
  }
  return memo;
}

/** Что известно о монете на таймфрейме; null — о монете у этого источника ничего. */
export function recallFeed(source: LiveSource, symbol: string, tf: number): FeedMemo | null {
  const src = memory.get(source);
  const coin = src?.coins.get(symbol);
  if (!src || !coin) return null;
  return { closed: coin.closed.get(tf) ?? null, minutes: coin.minutes, skew: src.skew };
}

export function rememberClosed(source: LiveSource, symbol: string, tf: number, closed: ClosedMemo): void {
  coinMemo(source, symbol).closed.set(tf, closed);
}

export function rememberMinutes(source: LiveSource, symbol: string, minutes: Candle[]): void {
  coinMemo(source, symbol).minutes = minutes;
}

export function rememberSkew(source: LiveSource, skew: number): void {
  sourceMemo(source).skew = skew;
}
