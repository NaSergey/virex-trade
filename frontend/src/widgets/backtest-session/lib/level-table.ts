import type { Direction } from '../api/types';
import { closeGridQtys, distributionWeights } from './close-grid';

export { distributionWeights };

/**
 * Таблица уровней «Сетки» и бота (спека
 * `2026-10-09-grid-tables-and-bot-everywhere-design.md`): объём уровня — доля
 * сетки, закрепляемая руками, тем же правилом, что у сетки фиксации
 * (`closeGridQtys`): закреплённые держат своё, остальные делят остаток поровну.
 */
export function levelShares(n: number, pins: Readonly<Record<number, number>>, weights?: readonly number[]) {
  if (!weights) {
    const { qtys, pinned, over } = closeGridQtys(1, n, pins);
    // Уровень без объёма — тоже перебор: закреплённые съели все 100 % (или
    // закреплён ноль), а ордер с нулевым риском сервер не примет.
    return { shares: qtys, pinned, over: over || qtys.some((q) => !(q > 1e-9)) };
  }
  // С распределением: незакреплённые делят остаток пропорционально весам, а не поровну.
  const pinned = Array.from({ length: n }, (_, i) => pins[i] != null);
  const pinnedSum = pinned.reduce((sum, on, i) => (on ? sum + pins[i] / 100 : sum), 0);
  const freeWeight = pinned.reduce((sum, on, i) => (on ? sum : sum + weights[i]), 0);
  const rest = 1 - pinnedSum;
  const shares = pinned.map((on, i) => (on ? pins[i] / 100 : rest > 0 && freeWeight > 0 ? (rest * weights[i]) / freeWeight : 0));
  return { shares, pinned, over: rest < -1e-9 || shares.some((q) => !(q > 1e-9)) };
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

/**
 * Цель «стопа после исполнения», когда её не ввели: полпути от стопа ордера до
 * последнего по исполнению уровня сетки (у лонга нижнего, у шорта верхнего —
 * ближайшего к стопу). Выше стопа — риск после первого же уровня
 * уменьшается вдвое; ниже всех уровней (у лонга) — ни один из них не стал
 * неисполнимым (`stopAfterBlocks`). Правило одно на все строки, как «вход» у
 * сетки фиксации, и любую строку можно заменить своей ценой.
 */
export function autoStopAfter(prices: readonly number[], stop: number): number {
  if (prices.length === 0) return 0;
  const last = prices.reduce((near, p) => (Math.abs(p - stop) < Math.abs(near - stop) ? p : near));
  return stop + (last - stop) / 2;
}

export interface EntryGridRow {
  price: number;
  share: number;
  qty: number;
  /** Потеря уровня до стопа, USDT. */
  riskUsd: number;
  pinned: boolean;
  /** Цель стопа после исполнения; null — галочка выключена. */
  stopAfter: number | null;
  /** Цель введена руками; иначе — правило (`autoStopAfter`). */
  stopPinned: boolean;
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
  /** Распределение объёма по цене (−100…100, 0 — равномерно). */
  tilt?: number;
}) {
  const order = [...a.prices].sort((x, y) => (a.direction === 'long' ? y - x : x - y));
  const weights = a.tilt ? distributionWeights(order, a.tilt) : undefined;
  const { shares, pinned, over } = levelShares(order.length, a.qtyPins, weights);
  const qtys = gridLevelQtys(order, a.stop, (a.balance * a.riskPct) / 100, shares);
  const riskPcts = gridRiskPcts(order, a.stop, a.riskPct, shares);
  const auto = autoStopAfter(order, a.stop);
  const targets = order.map((_, i) => (a.stopFollow ? (a.stopTargets[i] ?? auto) : 0));
  const blocks = stopAfterBlocks(a.direction, order, targets);
  const rows: EntryGridRow[] = order.map((price, i) => ({
    price,
    share: shares[i],
    qty: qtys[i],
    riskUsd: qtys[i] * Math.abs(price - a.stop),
    pinned: pinned[i],
    stopAfter: targets[i] > 0 ? targets[i] : null,
    stopPinned: a.stopFollow && a.stopTargets[i] != null,
    blocked: blocks[i],
  }));
  return { rows, prices: order, over, blocked: blocks.some(Boolean), riskPcts, stopsAfter: a.stopFollow ? targets : undefined };
}
