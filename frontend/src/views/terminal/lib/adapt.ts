import type { Trade } from '@/entities/trade';
import type { TagItem } from '@/entities/tag';
import {
  EXCHANGE_DRAWINGS,
  type BacktestCloseOrder,
  type BacktestEntryOrder,
  type BacktestTrade,
  type SessionDetail,
} from '@/widgets/backtest-session';
import { positionKey, type TerminalOrder, type TerminalPosition, type TerminalState } from '../api/types';

/**
 * «Сессия» биржевого терминала. Настоящей сессии у него нет — счёт один и
 * живёт на бирже, — но терминал думает сессией, и этим id помечено всё, что
 * ей принадлежит: лента графика и рисунки.
 */
export const EXCHANGE_SESSION = EXCHANGE_DRAWINGS;

/** Снимок счёта в форме сессии — с самим снимком рядом: по нему считаются звуки. */
export interface ExchangeDetail extends SessionDetail {
  exchange: TerminalState;
}

/** Что о позиции знает не биржа, а мы: теги и когда её впервые увидел наш синк. */
export interface PositionMeta {
  tags: TagItem[];
  openedAt: string | null;
}

/** Ключ позиции обратно в монету и сторону — им пользуются действия терминала. */
export function parsePositionKey(id: string): { symbol: string; direction: 'long' | 'short' } | null {
  const [symbol, direction] = id.split(':');
  return symbol && (direction === 'long' || direction === 'short') ? { symbol, direction } : null;
}

const NO_TAGS: TagItem[] = [];

/**
 * Позиция биржи — сделкой терминала.
 *
 * Чего биржа не знает, сказано честно, а не выдумано: стопа может не быть (0 —
 * терминал линию не рисует), время открытия — пустая строка, пока его не
 * увидел наш синк («—» в колонке «В позиции»). Риск — не заявленный, а
 * фактический: сколько стоит путь от входа до стопа при этом размере.
 */
export function positionTrade(p: TerminalPosition, balance: number, meta: PositionMeta | undefined): BacktestTrade {
  const riskUsdt = p.stopLoss != null ? Math.abs(p.entryPrice - p.stopLoss) * p.size : 0;
  return {
    id: positionKey(p),
    sessionId: EXCHANGE_SESSION,
    symbol: p.symbol,
    direction: p.direction,
    entryTime: meta?.openedAt ?? '',
    entryPrice: p.entryPrice,
    stopLoss: p.stopLoss ?? 0,
    takeProfit: p.takeProfit,
    riskPct: balance > 0 ? (riskUsdt / balance) * 100 : 0,
    riskUsdt,
    qty: p.size,
    leverage: p.leverage ?? 1,
    closedQty: 0,
    // Стоп за тейками на бирже ведёт worker по событиям потока — флажок приходит с сервера.
    stopFollow: p.follow ?? false,
    exitTime: null,
    exitPrice: null,
    exitReason: null,
    fee: null,
    pnl: null,
    r: null,
    tags: meta?.tags ?? NO_TAGS,
    entries: [],
    liqPrice: p.liqPrice,
    markPrice: p.markPrice,
    unrealisedPnl: p.unrealisedPnl,
  };
}

/**
 * Закрытая сделка журнала — сделкой терминала. Нужна ради стрелок входа и
 * выхода на графике; саму историю показывает таблица журнала, а не эта форма,
 * поэтому плана входа (стоп, риск) здесь нет и выдумывать его незачем.
 */
export function journalTrade(x: Trade): BacktestTrade {
  return {
    id: x.id,
    sessionId: EXCHANGE_SESSION,
    symbol: x.symbol,
    direction: x.direction,
    // У старых сделок времени входа нет — стрелка входа тогда не ставится вовсе.
    entryTime: x.openedAt ?? '',
    entryPrice: x.avgEntryPrice,
    stopLoss: 0,
    takeProfit: null,
    riskPct: 0,
    riskUsdt: 0,
    qty: x.qty,
    leverage: x.leverage ?? 1,
    closedQty: x.qty,
    stopFollow: false,
    exitTime: x.closedAt,
    exitPrice: x.avgExitPrice,
    exitReason: null,
    fee: x.openFee + x.closeFee,
    pnl: x.closedPnl,
    r: null,
    tags: x.tags ?? NO_TAGS,
    entries: [],
  };
}

/** Лимит на вход: объём зафиксирован биржей, а риск выводится из него обратно — для колонки «Риск». */
export function entryOrder(o: TerminalOrder, state: TerminalState): BacktestEntryOrder {
  const riskUsdt = o.stopLoss != null ? Math.abs(o.price - o.stopLoss) * o.qty : 0;
  return {
    id: o.id,
    sessionId: EXCHANGE_SESSION,
    symbol: o.symbol,
    direction: o.direction,
    price: o.price,
    riskPct: state.balance > 0 ? (riskUsdt / state.balance) * 100 : 0,
    stopLoss: o.stopLoss ?? 0,
    takeProfit: o.takeProfit,
    leverage: 1,
    createdAt: o.createdAt ?? state.serverTime,
    qty: o.qty,
  };
}

/** Лимит закрытия — уровень своей позиции: на бирже она одна на (монету, сторону). */
export function closeOrder(o: TerminalOrder, state: TerminalState): BacktestCloseOrder {
  return { id: o.id, tradeId: positionKey(o), price: o.price, qty: o.qty, createdAt: o.createdAt ?? state.serverTime };
}

const NO_START = new Date(0).toISOString();

const ZERO_SUMMARY ={ trades: 0, wins: 0, winRate: 0, totalR: 0, avgR: 0, pnl: 0, maxDrawdownPct: 0 };

/**
 * Счёт на бирже в форме сессии — то, что рисует терминал. Сделки — закрытые из
 * журнала (стрелки на графике) и открытые позиции; ордера разложены так же,
 * как у сессии: лимиты на вход отдельно, лимиты закрытия — при своих позициях.
 *
 * Лимит закрытия без позиции (она уже закрыта, а ордер ещё не снят биржей)
 * терминалу привязать не к чему — он пропускается.
 */
export function toDetail(
  state: TerminalState,
  meta: ReadonlyMap<string, PositionMeta>,
  closed: readonly Trade[],
): ExchangeDetail {
  const open = new Set(state.positions.map(positionKey));
  return {
    exchange: state,
    session: {
      id: EXCHANGE_SESSION,
      // Начала у счёта нет. Постоянная, а не время снимка: от неё зависят подписи
      // графика, и значение, меняющееся с каждым опросом, перерисовывало бы его зря.
      startTime: NO_START,
      cursorTime: NO_START,
      startBalance: state.balance,
      balance: state.balance,
      hideDate: false,
      hidePrice: false,
      priceScale: 1,
      // Живой рынок: время идёт само, исполняет не браузер — как эфир.
      dataSource: 'live',
      status: 'active',
      createdAt: NO_START,
      finishedAt: null,
      tournamentId: null,
      endTime: null,
    },
    tournament: null,
    synthOutdated: false,
    trades: [
      ...closed.map(journalTrade),
      ...state.positions.map((p) => positionTrade(p, state.balance, meta.get(positionKey(p)))),
    ],
    closeOrders: state.orders.filter((o) => o.kind === 'close' && open.has(positionKey(o))).map((o) => closeOrder(o, state)),
    entryOrders: state.orders.filter((o) => o.kind === 'entry').map((o) => entryOrder(o, state)),
    summary: ZERO_SUMMARY,
  };
}
