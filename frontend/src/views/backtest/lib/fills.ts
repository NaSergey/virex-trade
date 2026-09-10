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

export interface Exit {
  reason: 'stop' | 'take';
  price: number;
  /** Закрытие минутки, в которой сработало. */
  time: number;
}

/** Правила в порядке спеки; первое совпавшее решает. */
export function checkMinute(p: Position, m: Candle): Exit | null {
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
  return null;
}

/** Первая сработавшая минутка среди открытых не раньше from и закрытых не позже to. */
export function findExit(p: Position, minutes: Candle[], from: number, to: number): Exit | null {
  for (const m of minutes) {
    if (m.t < from) continue;
    if (m.t + MINUTE > to) break;
    const exit = checkMinute(p, m);
    if (exit) return exit;
  }
  return null;
}
