import type { RawOpenOrder } from './hl-types';

/** Сколько строк отдаём: у маркет-мейкера открытых ордеров сотни, глазами их не читают. */
export const MAX_ORDERS = 300;

export interface HlOrder {
  coin: string;
  side: 'buy' | 'sell';
  price: number;
  size: number;
  /** Объём при выставлении: размер меньше него — ордер уже исполнен частично. */
  origSize: number;
  type: string;
  reduceOnly: boolean;
  triggerPx: number | null;
  time: number;
}

export interface HlFill {
  coin: string;
  side: 'buy' | 'sell';
  price: number;
  size: number;
  time: number;
  /** Как Hyperliquid подписывает сделку: «Open Long», «Close Short», «Long > Short». */
  dir: string;
  closedPnl: number;
  fee: number;
  /** Забрал ликвидность (тейкер) — иначе выставил лимит (мейкер). */
  taker: boolean;
}

const sideOf = (s: 'A' | 'B') =>
  s === 'B' ? ('buy' as const) : ('sell' as const);

/** Новые ордера первыми — их и смотрят. */
export function ordersOf(raw: RawOpenOrder[]): HlOrder[] {
  return (raw ?? [])
    .map((o) => ({
      coin: o.coin,
      side: sideOf(o.side),
      price: Number(o.limitPx),
      size: Number(o.sz),
      origSize: Number(o.origSz),
      type: o.orderType,
      reduceOnly: !!o.reduceOnly,
      triggerPx: o.isTrigger ? Number(o.triggerPx) : null,
      time: o.timestamp,
    }))
    .sort((a, b) => b.time - a.time)
    .slice(0, MAX_ORDERS);
}

