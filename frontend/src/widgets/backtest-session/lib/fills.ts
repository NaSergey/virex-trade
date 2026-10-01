import { MINUTE, type Candle } from './candles';

/**
 * Срабатывание стопа и тейка. Проверяется по минуткам, какой бы таймфрейм ни
 * был на экране: иначе нельзя сказать, что сработало первым, если оба уровня
 * попали в одну свечу часовика.
 *
 * Логика живёт только здесь: сервер получает готовые время, цену и причину и
 * лишь пересчитывает по ним деньги. Вторая реализация на бэкенде однажды
 * разошлась бы с этой — и молча.
 */

export type Direction = 'long' | 'short';

export interface Position {
  direction: Direction;
  stopLoss: number;
  takeProfit: number | null;
}

export interface CloseOrder {
  id: string;
  price: number;
  qty: number;
  tradeId: string;
}

export interface Exit {
  reason: 'stop' | 'take' | 'limit';
  price: number;
  /** Закрытие минутки, в которой сработало. */
  time: number;
  /** Заполнено только у 'limit' — частичный выход на свой объём, не весь остаток. */
  qty?: number;
  closeOrderId?: string;
}

/** Допуск на погрешность сложения долей — тот же, что `QTY_EPS` на сервере. */
const QTY_EPS = 1e-8;

/**
 * Частичное закрытие — лимит закрытия на часть остатка (ступень сетки
 * фиксации): позиция после него остаётся открытой, и прятать её до перечитки
 * нельзя. Стоп и тейк закрывают остаток целиком.
 */
export function isPartialExit(trade: { qty: number; closedQty: number }, exit: Exit): boolean {
  return exit.reason === 'limit' && exit.qty != null && exit.qty < trade.qty - trade.closedQty - QTY_EPS;
}

/** Уровень сетки на вход (Scaled order) — до срабатывания цены сделки ещё нет. */
export interface EntryOrder {
  id: string;
  direction: Direction;
  price: number;
}

export interface EntryFill {
  orderId: string;
  direction: Direction;
  price: number;
  /** Закрытие минутки, в которой сработало. */
  time: number;
}

/** Ближайший к цене открытия свечи среди кандидатов — тот, кого price достиг бы первым. */
function closestToOpen<T extends { price: number }>(candidates: T[], open: number): T | null {
  if (candidates.length === 0) return null;
  return candidates.reduce((best, o) => (Math.abs(o.price - open) < Math.abs(best.price - open) ? o : best));
}

/** Правила в порядке спеки; первое совпавшее решает. */
export function checkMinute(p: Position, m: Candle, closeOrders: CloseOrder[] = []): Exit | null {
  const long = p.direction === 'long';
  const s = p.stopLoss;
  const tp = p.takeProfit;
  const time = m.t + MINUTE;

  // 1. Гэп за стопом — по открытию, то есть хуже стопа, как на бирже.
  if (long ? m.o <= s : m.o >= s) return { reason: 'stop', price: m.o, time };
  // 2. Гэп за тейком — по тейку: лучше заявленного тейк не исполняется.
  if (tp != null && (long ? m.o >= tp : m.o <= tp)) return { reason: 'take', price: tp, time };
  // 3 и 5. Касание стопа — стоп, даже если в той же минутке задет и тейк:
  // порядок внутри минутки не восстановить, честнее предполагать худшее.
  if (long ? m.l <= s : m.h >= s) return { reason: 'stop', price: s, time };
  // 4. Касание тейка.
  if (tp != null && (long ? m.h >= tp : m.l <= tp)) return { reason: 'take', price: tp, time };
  // 6. Касание лимит-ордера на закрытие — у него, в отличие от стопа/тейка,
  // нет фиксированной стороны от входа, поэтому гэпа для него нет (см. спеку):
  // диапазон свечи не задел уровень — ордер просто не исполнился в эту минутку.
  const touched = closeOrders.filter((o) => o.price <= m.h && o.price >= m.l);
  const fired = closestToOpen(touched, m.o);
  if (fired) return { reason: 'limit', price: fired.price, time, qty: fired.qty, closeOrderId: fired.id };
  return null;
}

/** Первая сработавшая минутка среди открытых не раньше from и закрытых не позже to. */
export function findExit(p: Position, minutes: Candle[], from: number, to: number, closeOrders: CloseOrder[] = []): Exit | null {
  for (const m of minutes) {
    if (m.t < from) continue;
    if (m.t + MINUTE > to) break;
    const exit = checkMinute(p, m, closeOrders);
    if (exit) return exit;
  }
  return null;
}

/**
 * Первое касание любого уровня сетки на вход среди minutes в [from, to).
 * Как и у close-ордеров, гэпа нет: уровень либо в диапазоне свечи, либо не
 * сработал в эту минутку и ждёт следующей. Несколько уровней в одной минутке —
 * срабатывает ближайший к open, остальные ждут своей минутки (см. checkMinute).
 */
export function findEntryFill(orders: EntryOrder[], minutes: Candle[], from: number, to: number): EntryFill | null {
  if (orders.length === 0) return null;
  for (const m of minutes) {
    if (m.t < from) continue;
    if (m.t + MINUTE > to) break;
    const touched = orders.filter((o) => o.price <= m.h && o.price >= m.l);
    const fired = closestToOpen(touched, m.o);
    if (fired) return { orderId: fired.id, direction: fired.direction, price: fired.price, time: m.t + MINUTE };
  }
  return null;
}
