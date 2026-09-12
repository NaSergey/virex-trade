import type { Candle } from './candles';
import { findExit, type CloseOrder, type Direction, type Exit } from './fills';

/** Открытая позиция в виде, достаточном для проверки срабатывания. entryTime — в мс. */
export interface OpenPosition {
  direction: Direction;
  stopLoss: number;
  takeProfit: number | null;
  entryTime: number;
}

export interface AdvanceResult {
  /** До какого момента реально дошли — не дальше загруженных минуток. */
  reach: number;
  /** Дошли до target, а не встали раньше из-за нехватки минуток. */
  complete: boolean;
  exit: Exit | null;
}

/**
 * Продвигает момент сессии от `from` к `target`, попутно проверяя срабатывание
 * стопа/тейка открытой позиции по настоящим минуткам. Общая часть для «Шага»
 * (target — закрытие свечи ТФ) и минутного тика автопрокрутки (target — from + 1
 * минута): раздельные реализации однажды разошлись бы в проверке срабатывания,
 * и молча.
 */
export function advanceTo(p: {
  from: number;
  target: number;
  minutes: Candle[];
  loadedUntil: number | null;
  position: OpenPosition | null;
  /** Необязательное — без висящих лимит-ордеров ведёт себя как раньше. */
  closeOrders?: CloseOrder[];
}): AdvanceResult {
  const reach = Math.min(p.target, p.loadedUntil ?? p.from);
  const complete = reach >= p.target;
  let exit: Exit | null = null;
  if (reach > p.from && p.position) {
    exit = findExit(p.position, p.minutes, Math.max(p.position.entryTime, p.from), reach, p.closeOrders ?? []);
  }
  return { reach, complete, exit };
}
