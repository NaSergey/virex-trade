import type { Direction } from './backtest-math';

/**
 * Срабатывание стопа, тейка и лимит-ордеров на закрытие — серверная копия
 * `frontend/src/widgets/backtest-session/lib/fills.ts`, те же правила и те же тесты.
 *
 * Копия, а не вторая логика одного режима: историю бектеста и турнира исполняет
 * браузер, эфир турнира — сервер (`tournaments/tournament-runner.service.ts`),
 * потому что время там идёт и без открытой вкладки. Внутри режима реализация одна.
 *
 * Время выхода задаёт вызывающий: у отрезка эфира это время тика, а не
 * закрытие минутки.
 */

/** Отрезок движения цены: минутка истории или кусок живой минутки между тиками. `t` — начало, мс. */
export interface Bar {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
}

export interface Position {
  direction: Direction;
  stopLoss: number;
  takeProfit: number | null;
}

export interface CloseOrder {
  id: string;
  price: number;
  qty: number;
}

export interface Exit {
  reason: 'stop' | 'take' | 'limit';
  price: number;
  /** Только у 'limit' — частичный выход на объём ордера, а не весь остаток. */
  qty?: number;
  closeOrderId?: string;
}

/** Ближайший к открытию отрезка среди кандидатов — его цена достигла бы первым. */
function closestToOpen(candidates: CloseOrder[], open: number): CloseOrder | null {
  if (candidates.length === 0) return null;
  return candidates.reduce((best, o) => (Math.abs(o.price - open) < Math.abs(best.price - open) ? o : best));
}

/** Правила в порядке спеки бектеста; первое совпавшее решает. */
export function checkMinute(p: Position, m: Bar, closeOrders: CloseOrder[] = []): Exit | null {
  const long = p.direction === 'long';
  const s = p.stopLoss;
  const tp = p.takeProfit;

  // 1. Гэп за стопом — по открытию, то есть хуже стопа, как на бирже.
  if (long ? m.o <= s : m.o >= s) return { reason: 'stop', price: m.o };
  // 2. Гэп за тейком — по тейку: лучше заявленного тейк не исполняется.
  if (tp != null && (long ? m.o >= tp : m.o <= tp)) return { reason: 'take', price: tp };
  // 3 и 5. Касание стопа — стоп, даже если задет и тейк: порядок внутри отрезка
  // не восстановить, честнее предполагать худшее.
  if (long ? m.l <= s : m.h >= s) return { reason: 'stop', price: s };
  // 4. Касание тейка.
  if (tp != null && (long ? m.h >= tp : m.l <= tp)) return { reason: 'take', price: tp };
  // 6. Касание лимит-ордера на закрытие. Гэпа у него нет: стороны от входа у
  // лимитки нет, и диапазон, не задевший уровень, её просто не исполнил.
  const touched = closeOrders.filter((o) => o.price <= m.h && o.price >= m.l);
  const fired = closestToOpen(touched, m.o);
  if (fired) return { reason: 'limit', price: fired.price, qty: fired.qty, closeOrderId: fired.id };
  return null;
}
