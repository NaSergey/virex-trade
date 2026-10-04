import { stopOnRightSide } from '../../backtest/backtest-math';
import type { Direction } from '../terminal-math';

/**
 * Цель стопа после исполненного тейка — то же правило, что у бектеста
 * (`BacktestService.followStop`): после первого — вход позиции, после каждого
 * следующего — цена предыдущего исполненного. `fills` — цены исполненных тейков
 * в порядке исполнения.
 *
 * `explicit` — цель, заданная у самого уровня в сетке фиксации (спека
 * `2026-10-04-close-grid-custom-levels-design.md`); null или 0 — правило.
 *
 * null — не ставить. Цель не по свою сторону от цены только что исполненного
 * тейка (тейки исполнились не по порядку): стоп над ценой лонга закрыл бы
 * остаток сразу. Цель не теснее нынешнего стопа: стоп только подтягивается,
 * поставленный руками тесный не ослабляется. Своя цель уровня проходит те же
 * проверки.
 */
export function followTarget(
  direction: Direction,
  entryPrice: number,
  fills: readonly number[],
  currentStop: number | null,
  explicit: number | null = null,
): number | null {
  const n = fills.length;
  if (n === 0) return null;
  const target = explicit != null && explicit > 0 ? explicit : n >= 2 ? fills[n - 2] : entryPrice;
  if (!stopOnRightSide(direction, fills[n - 1], target)) return null;
  if (currentStop != null && currentStop > 0) {
    const tighter = direction === 'long' ? target > currentStop : target < currentStop;
    if (!tighter) return null;
  }
  return target;
}

/** Цена уже за стопом — стоп сработал бы сразу. */
export const crossed = (direction: Direction, mark: number, stop: number): boolean =>
  direction === 'long' ? mark <= stop : mark >= stop;
