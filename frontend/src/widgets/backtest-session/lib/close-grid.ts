import type { Direction } from '../api/types';
import type { Level } from '../components/ReplayChart';
import { fromScreen, gridPrices, toScreen, unrealizedPnl } from './money';

/**
 * Сетка фиксации позиции — лимиты закрытия на ценах от первого тейка до
 * последнего (спеки `2026-09-30-close-grid-design.md`,
 * `2026-10-04-close-grid-custom-levels-design.md`). Объём уровня и цель стопа
 * после него можно закрепить руками; остальное считается здесь и уходит на
 * сервер явно — панель показывает ровно то, что случится.
 */

/** Допуск на погрешность float-сложений объёмов. */
const QTY_EPS = 1e-9;

/** Цены уровней от первого тейка к последнему с равным шагом. */
export function closeGridPrices(first: number, last: number, count: number): number[] {
  const up = gridPrices(Math.min(first, last), Math.max(first, last), count);
  if (up.length === 1) return [first];
  return first <= last ? up : up.reverse();
}

export interface CloseGridQtys {
  qtys: number[];
  /** Закреплён ли объём уровня руками. */
  pinned: boolean[];
  /** Закреплённые вместе больше позиции. */
  over: boolean;
}

/**
 * Объёмы уровней в монете. Закреплённые — доля позиции в процентах (`pins`):
 * держат её, незакреплённые делят остаток поровну, последний из них забирает
 * остаток деления — сумма ровно равна позиции. Закреплены все — остаток
 * остаётся в позиции под стопом. Закрепления за последним уровнем (число
 * ордеров уменьшили) не действуют.
 */
export function closeGridQtys(remaining: number, n: number, pins: Readonly<Record<number, number>>): CloseGridQtys {
  const pinned = Array.from({ length: n }, (_, i) => pins[i] != null);
  const pinnedQty = (i: number) => (pins[i] / 100) * remaining;
  const pinnedSum = pinned.reduce((sum, on, i) => (on ? sum + pinnedQty(i) : sum), 0);
  const free = pinned.filter((on) => !on).length;
  const rest = remaining - pinnedSum;
  const share = free > 0 && rest > 0 ? rest / free : 0;
  const qtys = pinned.map((on, i) => (on ? pinnedQty(i) : share));
  const lastFree = pinned.lastIndexOf(false);
  if (lastFree >= 0 && rest > 0) qtys[lastFree] = remaining - qtys.reduce((sum, q, i) => (i === lastFree ? sum : sum + q), 0);
  return { qtys, pinned, over: rest < -QTY_EPS * Math.max(1, remaining) };
}

export interface CloseGridRow {
  price: number;
  qty: number;
  /** Результат уровня в USDT, с комиссиями — та же формула, что у «Сейчас» позиции. */
  pnl: number;
  /** Цель стопа на исполнении уровня — уходит на сервер; null — переноса нет или позиция закрыта. */
  stopTarget: number | null;
  /** Куда встанет стоп на самом деле: цель, если она теснее прежнего и по свою сторону. */
  stopAfter: number | null;
}

/**
 * Уровни сетки и итог при исполнении всех. Цель стопа уровня — закреплённая
 * (`targets`) или правило `followStop`: первый уровень — безубыток, следующий —
 * цена предыдущего. Стоп только подтягивается и не встаёт по ту сторону цены
 * уровня — как на сервере.
 */
export function closeGridPlan(
  trade: { direction: Direction; entryPrice: number; stopLoss: number },
  prices: number[],
  qtys: number[],
  stopFollow: boolean,
  targets: readonly (number | null)[] = [],
): { rows: CloseGridRow[]; avgExit: number | null; pnl: number } {
  const n = prices.length;
  const long = trade.direction === 'long';
  let stop = trade.stopLoss;
  const rows = prices.map((price, i) => {
    const qty = qtys[i] ?? 0;
    let stopTarget: number | null = null;
    let stopAfter: number | null = null;
    if (stopFollow && i < n - 1) {
      stopTarget = targets[i] ?? (i === 0 ? trade.entryPrice : prices[i - 1]);
      const onSide = long ? stopTarget < price : stopTarget > price;
      if (onSide && (long ? stopTarget > stop : stopTarget < stop)) stop = stopTarget;
      stopAfter = stop;
    }
    return { price, qty, pnl: unrealizedPnl(trade.direction, trade.entryPrice, price, qty), stopTarget, stopAfter };
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

const MIN_ORDERS = 1;
const MAX_ORDERS = 10;

/** Число ордеров из поля панели: целое от 1 до 10, недописанное — один. */
export function closeGridCount(count: string): number {
  return Math.max(MIN_ORDERS, Math.min(MAX_ORDERS, Math.round(Number(count) || MIN_ORDERS)));
}

/**
 * Черновик сетки — у экрана, а не у панели: его читают и панель, и график
 * (линии, перетаскивание). Тейки — в экранных ценах, число ордеров — строкой
 * поля, как его набирает человек. Закрепления — по номеру уровня: объём —
 * доля позиции в процентах, цель стопа — экранная цена.
 */
export interface CloseGridDraft {
  tradeId: string;
  first: number;
  last: number;
  count: string;
  stopFollow: boolean;
  qtyPins: Record<number, number>;
  stopPins: Record<number, number>;
}

/**
 * Черновик, с которым открывается панель: тейки в 1 % и 3 % от точки отсчёта
 * (`closeGridAnchor`), три ордера. Позиция без лимитов закрытия — перенос стопа
 * включён: ради него сетку обычно и ставят; уже включённый не выключается молча.
 */
export function initCloseGrid(
  trade: { id: string; direction: Direction; entryPrice: number; stopFollow: boolean },
  scale: number,
  screenPrice: number,
  closeOrdersCount: number,
): CloseGridDraft {
  const sign = trade.direction === 'long' ? 1 : -1;
  const anchor = closeGridAnchor(trade.direction, toScreen(trade.entryPrice, scale), screenPrice);
  return {
    tradeId: trade.id,
    first: anchor * (1 + sign * 0.01),
    last: anchor * (1 + sign * 0.03),
    count: '3',
    stopFollow: trade.stopFollow || closeOrdersCount === 0,
    qtyPins: {},
    stopPins: {},
  };
}

type GridTrade = { direction: Direction; entryPrice: number; stopLoss: number; qty: number; closedQty: number };

/**
 * Всё, что следует из черновика: цены уровней (экранные и настоящие), объёмы
 * с закреплениями и план с целями стопа — одно на панель и график.
 */
export function closeGridFromDraft(trade: GridTrade, draft: CloseGridDraft, scale: number) {
  const screenPrices = closeGridPrices(draft.first, draft.last, closeGridCount(draft.count));
  const prices = screenPrices.map((p) => fromScreen(p, scale));
  const split = closeGridQtys(trade.qty - trade.closedQty, prices.length, draft.qtyPins);
  const targets = prices.map((_, i) => (draft.stopPins[i] != null ? fromScreen(draft.stopPins[i], scale) : null));
  const plan = closeGridPlan(trade, prices, split.qtys, draft.stopFollow, targets);
  return { screenPrices, prices, split, plan };
}

/** Id линий первого и последнего тейка — только их график даёт тянуть. */
export const CLOSE_GRID_FIRST_ID = 'close-grid-first';
export const CLOSE_GRID_LAST_ID = 'close-grid-last';

/**
 * Линии черновика сетки на графике: по линии на уровень, с объёмом и
 * результатом, как у лимита закрытия. Тянутся первый и последний тейк,
 * промежуточные стоят с равным шагом между ними и пересчитываются сами.
 * Недописанное число в поле — линий нет, а не линия в нуле.
 */
export function closeGridLevels(trade: GridTrade, draft: CloseGridDraft, scale: number): Level[] {
  const valid = (p: number) => Number.isFinite(p) && p > 0;
  if (!valid(draft.first) || !valid(draft.last)) return [];
  const { screenPrices: prices, plan } = closeGridFromDraft(trade, draft, scale);
  const lastIndex = prices.length - 1;
  return prices.map((price, i) => {
    const qty = plan.rows[i].qty;
    const id = i === 0 ? CLOSE_GRID_FIRST_ID : i === lastIndex ? CLOSE_GRID_LAST_ID : `close-grid-${i}`;
    return {
      id,
      kind: 'gridTake',
      price,
      draggable: i === 0 || i === lastIndex,
      qty,
      impactAt: (p: number) => unrealizedPnl(trade.direction, trade.entryPrice, fromScreen(p, scale), qty),
    };
  });
}
