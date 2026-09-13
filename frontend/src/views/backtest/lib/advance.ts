import type { Candle } from './candles';
import { findExit, type CloseOrder, type Direction, type Exit } from './fills';

/** Открытая позиция в виде, достаточном для проверки срабатывания. entryTime — в мс. */
export interface OpenPosition {
  tradeId: string;
  direction: Direction;
  stopLoss: number;
  takeProfit: number | null;
  entryTime: number;
}

/** Исход одной позиции — тот же `Exit`, что и раньше, плюс какой сделке он принадлежит. */
export interface PositionExit extends Exit {
  tradeId: string;
}

export interface AdvanceResult {
  /** До какого момента реально дошли — не дальше загруженных минуток. */
  reach: number;
  /** Дошли до target, а не встали раньше из-за нехватки минуток. */
  complete: boolean;
  exits: PositionExit[];
}

/**
 * Продвигает момент сессии от `from` к `target`, попутно проверяя срабатывание
 * стопа/тейка каждой открытой позиции (их 0–2 — хедж, лонг и шорт разом) по настоящим
 * минуткам. Общая часть для «Шага» (target — закрытие свечи ТФ) и минутного тика
 * автопрокрутки (target — from + 1 минута): раздельные реализации однажды разошлись бы
 * в проверке срабатывания, и молча.
 */
export function advanceTo(p: {
  from: number;
  target: number;
  minutes: Candle[];
  loadedUntil: number | null;
  positions: OpenPosition[];
  /** Необязательное — без висящих лимит-ордеров ведёт себя как раньше. */
  closeOrders?: CloseOrder[];
}): AdvanceResult {
  const reach = Math.min(p.target, p.loadedUntil ?? p.from);
  const complete = reach >= p.target;
  const exits: PositionExit[] = [];
  if (reach > p.from) {
    for (const position of p.positions) {
      const orders = (p.closeOrders ?? []).filter((o) => o.tradeId === position.tradeId);
      const exit = findExit(position, p.minutes, Math.max(position.entryTime, p.from), reach, orders);
      if (exit) exits.push({ ...exit, tradeId: position.tradeId });
    }
  }
  return { reach, complete, exits };
}
