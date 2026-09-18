import type { Candle } from './candles';
import { findEntryFill, findExit, type CloseOrder, type Direction, type EntryFill, type EntryOrder, type Exit } from './fills';

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
  /** До какого момента реально дошли — не дальше загруженных минуток, и не дальше
   * первого касания сетки на вход (см. entryFill). */
  reach: number;
  /** Дошли до target, а не встали раньше из-за нехватки минуток. Срабатывание
   * сетки на вход `complete` не трогает — это не конец истории, а повод
   * остановиться и дать вызывающему применить результат перед следующим шагом. */
  complete: boolean;
  exits: PositionExit[];
  /** Первое сработавшее по времени касание сетки на вход, если оно раньше или
   * одновременно с любым exits — иначе null, оно ждёт следующего вызова. */
  entryFill: EntryFill | null;
}

/**
 * Продвигает момент сессии от `from` к `target`, попутно проверяя срабатывание
 * стопа/тейка каждой открытой позиции (их 0–2 — хедж, лонг и шорт разом) по настоящим
 * минуткам. Общая часть для «Шага» (target — закрытие свечи ТФ) и минутного тика
 * автопрокрутки (target — from + 1 минута): раздельные реализации однажды разошлись бы
 * в проверке срабатывания, и молча.
 *
 * Касание сетки на вход обрывает продвижение точно в свой момент, даже если
 * target дальше: сработавший уровень должен стать сделкой (openTrade/addToTrade)
 * до того, как проверяются дальнейшие минутки — иначе, например, стоп той же
 * сделки, задетый уже ПОСЛЕ этого момента, проверялся бы по ещё не открытой
 * позиции. Если в то же самое или более раннее время нашёлся exit — событие
 * решает exit, а найденное касание сетки отбрасывается и попробует снова со
 * следующего вызова (позиция, к которой оно вело, могла в этот момент как раз
 * закрыться, и сервер сам снимет остаток сетки при полном закрытии).
 */
export function advanceTo(p: {
  from: number;
  target: number;
  minutes: Candle[];
  loadedUntil: number | null;
  positions: OpenPosition[];
  /** Необязательное — без висящих лимит-ордеров ведёт себя как раньше. */
  closeOrders?: CloseOrder[];
  entryOrders?: EntryOrder[];
}): AdvanceResult {
  const historyReach = Math.min(p.target, p.loadedUntil ?? p.from);
  const complete = historyReach >= p.target;
  let exits: PositionExit[] = [];
  let entryFill: EntryFill | null = null;
  let reach = historyReach;
  if (historyReach > p.from) {
    for (const position of p.positions) {
      const orders = (p.closeOrders ?? []).filter((o) => o.tradeId === position.tradeId);
      const exit = findExit(position, p.minutes, Math.max(position.entryTime, p.from), historyReach, orders);
      if (exit) exits.push({ ...exit, tradeId: position.tradeId });
    }
    const fill = findEntryFill(p.entryOrders ?? [], p.minutes, p.from, historyReach);
    const earliestExit = exits.length > 0 ? Math.min(...exits.map((e) => e.time)) : null;
    if (fill && (earliestExit == null || fill.time <= earliestExit)) {
      reach = fill.time;
      exits = exits.filter((e) => e.time <= reach);
      entryFill = fill;
    } else if (earliestExit != null) {
      reach = earliestExit;
      exits = exits.filter((e) => e.time <= reach);
    }
  }
  return { reach, complete, exits, entryFill };
}
