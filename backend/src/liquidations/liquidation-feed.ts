/**
 * Ликвидации с публичных потоков бирж — разбор сообщений и сводка по минутам.
 * Чистые функции; соединения и запись — `LiquidationRecorderService`.
 *
 * Зачем: проверить гипотезу «куда идёт цена после крупных ликвидаций» на
 * собственной записи (история ликвидаций у бирж не продаётся бесплатно).
 */

/** Монеты записи. Новая — строка здесь; прошлое по ней не восстановить, история пойдёт с момента добавления. */
export const LIQ_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'] as const;

export type LiqExchange = 'binance' | 'bybit';
/** Сторона ЛИКВИДИРОВАННОЙ позиции, а не ордера ликвидации. */
export type LiqSide = 'long' | 'short';

export interface LiqEvent {
  exchange: LiqExchange;
  symbol: string;
  side: LiqSide;
  /** Монет. */
  qty: number;
  /** Цена: у Binance — средняя исполнения, у Bybit — цена банкротства (другой у потока нет). */
  price: number;
  /** Время биржи, мс. */
  time: number;
}

/**
 * Публичный поток Bybit V5, тема `allLiquidation.<монета>`: все ликвидации,
 * пачкой раз в 500 мс. В REST-лимит 600 запросов на IP не входит; соединение
 * одно, лимит новых соединений (500 за 5 минут на IP) делится с `terminal-stream`.
 */
export const BYBIT_PUBLIC_WS = 'wss://stream.bybit.com/v5/public/linear';

/**
 * USDⓈ-M Binance: с 2026 года рыночные потоки идут маршрутом `/market` — адрес
 * без маршрута ведёт себя как `/public` и такие потоки может не отдавать.
 * `forceOrder` — снимок: на монету не больше одной ликвидации в секунду
 * (последней), поэтому суммы Binance — нижняя граница, а не полный объём.
 */
export function binanceLiqUrl(symbols: readonly string[]): string {
  const streams = symbols.map((s) => `${s.toLowerCase()}@forceOrder`).join('/');
  return `wss://fstream.binance.com/market/stream?streams=${streams}`;
}

export function bybitLiqTopics(symbols: readonly string[]): string[] {
  return symbols.map((s) => `allLiquidation.${s}`);
}

const num = (v: unknown): number =>
  typeof v === 'string' || typeof v === 'number' ? Number(v) : NaN;
const valid = (e: LiqEvent) =>
  e.symbol !== '' &&
  Number.isFinite(e.qty) &&
  e.qty > 0 &&
  Number.isFinite(e.price) &&
  e.price > 0 &&
  Number.isFinite(e.time) &&
  e.time > 0;

/**
 * Сообщение темы `allLiquidation`. Поле `S` — сторона позиции:
 * «When you receive a Buy update, this means that a long position has been liquidated».
 */
export function parseBybit(raw: string): LiqEvent[] {
  let msg: any;
  try {
    msg = JSON.parse(raw);
  } catch {
    return [];
  }
  if (
    typeof msg?.topic !== 'string' ||
    !msg.topic.startsWith('allLiquidation.') ||
    !Array.isArray(msg.data)
  )
    return [];
  const out: LiqEvent[] = [];
  for (const d of msg.data) {
    if (d?.S !== 'Buy' && d?.S !== 'Sell') continue;
    const e: LiqEvent = {
      exchange: 'bybit',
      symbol: String(d.s ?? ''),
      side: d.S === 'Buy' ? 'long' : 'short',
      qty: num(d.v),
      price: num(d.p),
      time: num(d.T),
    };
    if (valid(e)) out.push(e);
  }
  return out;
}

/**
 * Сообщение `forceOrder` (обёртка комбинированного потока `{stream, data}`).
 * `o.S` — сторона ОРДЕРА ликвидации: длинную позицию биржа закрывает продажей,
 * поэтому `SELL` — ликвидирован лонг. Объём — `z` (исполнено всего), цена — `ap`.
 */
export function parseBinance(raw: string): LiqEvent[] {
  let msg: any;
  try {
    msg = JSON.parse(raw);
  } catch {
    return [];
  }
  const ev = msg?.data ?? msg;
  const o = ev?.o;
  if (ev?.e !== 'forceOrder' || !o || (o.S !== 'BUY' && o.S !== 'SELL'))
    return [];
  const e: LiqEvent = {
    exchange: 'binance',
    symbol: String(o.s ?? ''),
    side: o.S === 'SELL' ? 'long' : 'short',
    qty: num(o.z),
    price: num(o.ap) > 0 ? num(o.ap) : num(o.p),
    time: num(o.T),
  };
  return valid(e) ? [e] : [];
}

/** Строка `liquidation_minutes`. */
export interface LiqBucket {
  exchange: LiqExchange;
  symbol: string;
  side: LiqSide;
  /** Начало минуты UTC, мс. */
  minute: number;
  count: number;
  qty: number;
  usd: number;
  /** Крупнейшая одиночная ликвидация минуты, USDT. */
  maxUsd: number;
}

export const minuteOf = (ms: number) => Math.floor(ms / 60_000) * 60_000;
const keyOf = (b: Pick<LiqBucket, 'exchange' | 'symbol' | 'side' | 'minute'>) =>
  `${b.exchange}|${b.symbol}|${b.side}|${b.minute}`;

/** Прибавить ликвидацию к корзине её минуты. */
export function addEvent(buckets: Map<string, LiqBucket>, e: LiqEvent): void {
  const minute = minuteOf(e.time);
  const usd = e.qty * e.price;
  const key = keyOf({ ...e, minute });
  const b = buckets.get(key);
  if (b) {
    b.count += 1;
    b.qty += e.qty;
    b.usd += usd;
    b.maxUsd = Math.max(b.maxUsd, usd);
  } else {
    buckets.set(key, {
      exchange: e.exchange,
      symbol: e.symbol,
      side: e.side,
      minute,
      count: 1,
      qty: e.qty,
      usd,
      maxUsd: usd,
    });
  }
}

/** Вернуть в буфер пачку, которую не удалось записать (сложением, как сделала бы база). */
export function mergeBack(
  buckets: Map<string, LiqBucket>,
  batch: LiqBucket[],
): void {
  for (const r of batch) {
    const key = keyOf(r);
    const b = buckets.get(key);
    if (b) {
      b.count += r.count;
      b.qty += r.qty;
      b.usd += r.usd;
      b.maxUsd = Math.max(b.maxUsd, r.maxUsd);
    } else {
      buckets.set(key, { ...r });
    }
  }
}
