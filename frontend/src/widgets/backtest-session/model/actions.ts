'use client';

import {
  useAddToTrade,
  useCancelCloseOrder,
  useCancelEntryOrder,
  useCloseTrade,
  useCreateCloseGrid,
  useCreateCloseOrder,
  useCreateEntryOrders,
  useFinishSession,
  useModifyTrade,
  useMoveCloseOrder,
  useMoveEntryOrder,
  useOpenTrade,
  useSetBacktestTags,
} from '../api/hooks';
import type { Direction, ExitReason } from '../api/types';

/**
 * Одно действие терминала — то, что экрану нужно от мутации: отправить,
 * узнать, что она в полёте, и показать её отказ. Это подмножество результата
 * `useMutation`, поэтому любая мутация react-query годится сюда как есть.
 */
export interface TerminalAction<TVars> {
  mutate: (vars: TVars, options?: { onSuccess?: () => void; onSettled?: () => void }) => void;
  mutateAsync: (vars: TVars) => Promise<unknown>;
  isPending: boolean;
  isError: boolean;
  error: unknown;
  /** С чем действие отправили в последний раз — для «Повторить». */
  variables: TVars | undefined;
}

export interface OpenTradeVars {
  /** Не задана — BTC. */
  symbol?: string;
  direction: Direction;
  entryTime: string;
  entryPrice: number;
  stopLoss: number;
  takeProfit?: number;
  riskPct: number;
  leverage: number;
  entryOrderId?: string;
}

export interface AddToTradeVars {
  tradeId: string;
  entryTime: string;
  entryPrice: number;
  riskPct: number;
  entryOrderId?: string;
}

export interface CloseTradeVars {
  tradeId: string;
  exitTime: string;
  exitPrice: number;
  reason: ExitReason;
  qty?: number;
  closeOrderId?: string;
}

export interface EntryOrdersVars {
  symbol?: string;
  direction: Direction;
  stopLoss: number;
  takeProfit?: number;
  /** Риск НА УРОВЕНЬ: общий риск сетки экран делит сам. */
  riskPct: number;
  leverage: number;
  prices: number[];
}

/**
 * Всё, что терминал умеет делать со счётом. Экран один на бектест, турнир и
 * биржу — а куда уходит действие, решает этот набор: у сессии это наш сервер и
 * его движок, у биржевого терминала — ордера на Bybit.
 *
 * Входы — в форме сессии (момент и цена исполнения, id сделки): ею экран и
 * думает. Исполнитель, которому что-то из этого не нужно (бирже — время и
 * цена: их ставит она сама), лишнее просто не читает.
 */
export interface TerminalActions {
  open: TerminalAction<OpenTradeVars>;
  addToTrade: TerminalAction<AddToTradeVars>;
  modify: TerminalAction<{ tradeId: string; stopLoss?: number; takeProfit?: number | null }>;
  close: TerminalAction<CloseTradeVars>;
  createCloseOrder: TerminalAction<{ tradeId: string; price: number; qty: number }>;
  cancelCloseOrder: TerminalAction<string>;
  createEntryOrders: TerminalAction<EntryOrdersVars>;
  cancelEntryOrder: TerminalAction<string>;
  moveEntryOrder: TerminalAction<{ orderId: string; price: number }>;
  moveCloseOrder: TerminalAction<{ orderId: string; price: number }>;
  closeGrid: TerminalAction<{ tradeId: string; prices: number[]; stopFollow: boolean }>;
  finish: TerminalAction<void>;
  tags: TerminalAction<{ tradeId: string; tagIds: string[] }>;
}

/** Действия сессии бектеста и турнира — те же мутации, что и раньше, одним набором. */
export function useSessionActions(sessionId: string): TerminalActions {
  return {
    open: useOpenTrade(sessionId),
    addToTrade: useAddToTrade(sessionId),
    modify: useModifyTrade(sessionId),
    close: useCloseTrade(sessionId),
    createCloseOrder: useCreateCloseOrder(sessionId),
    cancelCloseOrder: useCancelCloseOrder(sessionId),
    createEntryOrders: useCreateEntryOrders(sessionId),
    cancelEntryOrder: useCancelEntryOrder(sessionId),
    moveEntryOrder: useMoveEntryOrder(sessionId),
    moveCloseOrder: useMoveCloseOrder(sessionId),
    closeGrid: useCreateCloseGrid(sessionId),
    finish: useFinishSession(sessionId),
    tags: useSetBacktestTags(sessionId),
  };
}
