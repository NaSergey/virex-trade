import type { Direction } from '../api/types';
import { closeGridQtys } from './close-grid';

/**
 * Таблица уровней «Сетки» и бота (спека
 * `2026-10-09-grid-tables-and-bot-everywhere-design.md`): объём уровня — доля
 * сетки, закрепляемая руками, тем же правилом, что у сетки фиксации
 * (`closeGridQtys`): закреплённые держат своё, остальные делят остаток поровну.
 */
export function levelShares(n: number, pins: Readonly<Record<number, number>>) {
  const { qtys, pinned, over } = closeGridQtys(1, n, pins);
  // Уровень без объёма — тоже перебор: закреплённые съели все 100 % (или
  // закреплён ноль), а ордер с нулевым риском сервер не примет.
  return { shares: qtys, pinned, over: over || qtys.some((q) => !(q > 1e-9)) };
}

/**
 * Объёмы уровней в монете: общий объём подобран так, что если исполнились все
 * уровни и сработал стоп, потеря — ровно `riskUsd`.
 */
export function gridLevelQtys(prices: readonly number[], stop: number, riskUsd: number, shares: readonly number[]): number[] {
  const spread = prices.reduce((a, p, i) => a + shares[i] * Math.abs(p - stop), 0);
  const total = spread > 0 ? riskUsd / spread : 0;
  return prices.map((_, i) => shares[i] * total);
}

/**
 * Риск каждого уровня в процентах депозита: сервер исполняет лимит на вход
 * объёмом `депозит · риск / |цена − стоп|`, и с этим риском выходит объём уровня.
 * В сумме — общий риск сетки.
 */
export function gridRiskPcts(prices: readonly number[], stop: number, riskPct: number, shares: readonly number[]): number[] {
  const spread = prices.reduce((a, p, i) => a + shares[i] * Math.abs(p - stop), 0);
  return prices.map((p, i) => (spread > 0 ? (riskPct * shares[i] * Math.abs(p - stop)) / spread : 0));
}

/**
 * Какие цели «стопа после исполнения» не встанут: цель по ту сторону цены
 * самого уровня (сервер отклонит сетку), или на цене уровня, исполняющегося
 * позже, и за ней — лонг-сетка исполняется сверху вниз, и такой стоп сделал бы
 * нижний уровень неисполнимым. 0 — цели нет.
 */
export function stopAfterBlocks(direction: Direction, prices: readonly number[], targets: readonly number[]): boolean[] {
  const long = direction === 'long';
  return prices.map((price, i) => {
    const t = targets[i];
    if (!(t > 0)) return false;
    if (long ? t >= price : t <= price) return true;
    const later = prices.filter((p) => (long ? p < price : p > price));
    return later.some((p) => (long ? t >= p : t <= p));
  });
}

export interface EntryGridRow {
  price: number;
  share: number;
  qty: number;
  /** Потеря уровня до стопа, USDT. */
  riskUsd: number;
  pinned: boolean;
  /** Цель стопа после исполнения; null — стоп не двигается. */
  stopAfter: number | null;
  /** Цель перекрывает уровни, исполняющиеся позже. */
  blocked: boolean;
}

/**
 * Строки таблицы «Сетки» в порядке исполнения (лонг — сверху вниз, шорт — снизу
 * вверх) и то, что уйдёт на сервер: риск и цель стопа каждого уровня в том же
 * порядке. Цены — настоящие; закрепления и цели — по номеру строки.
 */
export function entryGridTable(a: {
  prices: readonly number[];
  direction: Direction;
  stop: number;
  riskPct: number;
  balance: number;
  qtyPins: Readonly<Record<number, number>>;
  stopTargets: Readonly<Record<number, number>>;
  stopFollow: boolean;
}) {
  const order = [...a.prices].sort((x, y) => (a.direction === 'long' ? y - x : x - y));
  const { shares, pinned, over } = levelShares(order.length, a.qtyPins);
  const qtys = gridLevelQtys(order, a.stop, (a.balance * a.riskPct) / 100, shares);
  const riskPcts = gridRiskPcts(order, a.stop, a.riskPct, shares);
  const targets = order.map((_, i) => (a.stopFollow ? (a.stopTargets[i] ?? 0) : 0));
  const blocks = stopAfterBlocks(a.direction, order, targets);
  const rows: EntryGridRow[] = order.map((price, i) => ({
    price,
    share: shares[i],
    qty: qtys[i],
    riskUsd: qtys[i] * Math.abs(price - a.stop),
    pinned: pinned[i],
    stopAfter: targets[i] > 0 ? targets[i] : null,
    blocked: blocks[i],
  }));
  return { rows, prices: order, over, blocked: blocks.some(Boolean), riskPcts, stopsAfter: a.stopFollow ? targets : undefined };
}
