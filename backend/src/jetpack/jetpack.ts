import { randomBytes } from 'crypto';
import { HOUSE_EDGE_BP, MAX_X100, RATE } from './jetpack.config';

/**
 * Правила джетпака чистыми функциями: без базы, таймеров и памяти процесса.
 * Множители — целыми в сотых (2.35x = 235): «успел ли» сравнивается точно.
 */

/** Числитель формулы краша в сотых: 99 при крае 1 %. Целое — без дробей double. */
const TOP = (10_000 - HOUSE_EDGE_BP) / 100;

/**
 * Точка краша из равномерного r ∈ [0, 1): floor(99 / (1 − r)) сотых, не
 * меньше 1.00x и не больше потолка. Шанс дожить до x — ровно 0.99 / x.
 * Следствие, а не отдельное правило: около 2 % раундов взрываются на старте.
 */
export function crashX100(r: number): number {
  return Math.min(MAX_X100, Math.max(100, Math.floor(TOP / (1 - r))));
}

/**
 * Криптослучайное r ∈ [0, 1) из 48 бит. Не `randomInt(0, 2 ** 48)`: у него
 * диапазон строго меньше 2^48, и такой вызов бросал — взлёт падал, и раунд
 * навсегда оставался в окне ставок.
 */
export function randomUnit(): number {
  return randomBytes(6).readUIntBE(0, 6) / 2 ** 48;
}

/** Множитель в сотых через `ms` полёта. */
export function x100At(ms: number): number {
  if (ms <= 0) return 100;
  return Math.floor(100 * Math.exp(RATE * ms));
}

/** Сколько мс полёта до множителя `x100` — момент краша и будильник автовывода. */
export function msTo(x100: number): number {
  return Math.log(x100 / 100) / RATE;
}

/** Выигрыш — ставка × множитель, вниз до целой монеты. */
export function payout(amount: number, x100: number): number {
  return Math.floor((amount * x100) / 100);
}
