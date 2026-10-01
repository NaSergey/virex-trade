import type { Direction } from '../api/types';
import { gridPrices, unrealizedPnl } from './money';

/**
 * Сетка фиксации позиции — лимиты закрытия равными частями остатка на ценах от
 * первого тейка до последнего (спека `2026-09-30-close-grid-design.md`).
 * Делит объём и двигает стоп сервер (`createCloseGrid`, `followStop`); здесь —
 * те же правила, чтобы окно показывало ровно то, что случится.
 */

/** Цены уровней от первого тейка к последнему с равным шагом. */
export function closeGridPrices(first: number, last: number, count: number): number[] {
  const up = gridPrices(Math.min(first, last), Math.max(first, last), count);
  if (up.length === 1) return [first];
  return first <= last ? up : up.reverse();
}

export interface CloseGridRow {
  price: number;
  qty: number;
  /** Результат уровня в USDT, с комиссиями — та же формула, что у «Сейчас» позиции. */
  pnl: number;
  /** Куда встанет стоп, когда уровень исполнится; null — переноса нет или позиция закрыта. */
  stopAfter: number | null;
}

/**
 * Уровни сетки и итог при исполнении всех. Объём — как на сервере: поровну,
 * последний забирает остаток деления. Стоп за тейками — как `followStop`:
 * первый уровень — безубыток, следующий — цена предыдущего; только подтягивается.
 */
export function closeGridPlan(
  trade: { direction: Direction; entryPrice: number; stopLoss: number },
  prices: number[],
  remaining: number,
  stopFollow: boolean,
): { rows: CloseGridRow[]; avgExit: number | null; pnl: number } {
  const n = prices.length;
  const part = n > 0 ? remaining / n : 0;
  const long = trade.direction === 'long';
  let stop = trade.stopLoss;
  const rows = prices.map((price, i) => {
    const qty = i === n - 1 ? remaining - part * (n - 1) : part;
    let stopAfter: number | null = null;
    if (stopFollow && i < n - 1) {
      const target = i === 0 ? trade.entryPrice : prices[i - 1];
      const onSide = long ? target < price : target > price;
      if (onSide && (long ? target > stop : target < stop)) stop = target;
      stopAfter = stop;
    }
    return { price, qty, pnl: unrealizedPnl(trade.direction, trade.entryPrice, price, qty), stopAfter };
  });
  const total = rows.reduce((s, r) => s + r.qty, 0);
  return {
    rows,
    avgExit: total > 0 ? rows.reduce((s, r) => s + r.price * r.qty, 0) / total : null,
    pnl: rows.reduce((s, r) => s + r.pnl, 0),
  };
}

/**
 * Откуда отсчитываются тейки — из двух точек та, что дальше в сторону прибыли:
 * вход или текущая цена. Позиция в минусе — вход: тейк ниже входа лонга был бы
 * убытком, а не фиксацией. Позиция в плюсе — текущая цена: лимит закрытия ближе
 * неё уже рынок, а прокрутка исполнила бы его, только когда цена вернётся, то
 * есть как стоп.
 */
export function closeGridAnchor(direction: Direction, entry: number, price: number): number {
  return direction === 'long' ? Math.max(entry, price) : Math.min(entry, price);
}

/** Каждый тейк — дальше точки отсчёта (`closeGridAnchor`): лонг — выше, шорт — ниже. */
export function checkCloseGridSide(direction: Direction, prices: number[], anchor: number): 'closeGridSide' | null {
  for (const p of prices) {
    if (direction === 'long' ? p <= anchor : p >= anchor) return 'closeGridSide';
  }
  return null;
}
