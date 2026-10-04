import type { Direction } from '@/widgets/backtest-session';

/** Открытая позиция на бирже, как её отдаёт `/api/terminal/state`. Числа уже разобраны сервером. */
export interface TerminalPosition {
  symbol: string;
  direction: Direction;
  size: number;
  entryPrice: number;
  markPrice: number | null;
  positionValue: number | null;
  unrealisedPnl: number | null;
  leverage: number | null;
  liqPrice: number | null;
  /** null — стопа у позиции нет: на бирже так бывает, в бектесте — нет. */
  stopLoss: number | null;
  takeProfit: number | null;
  /** Есть план стопа за тейками: его ведёт worker, и окно сетки открывается с флажком. */
  follow?: boolean;
}

/** Висящий лимит. Стопы и тейки позиций сюда не входят — они её уровни. */
export interface TerminalOrder {
  id: string;
  symbol: string;
  /** Сторона позиции, к которой ордер относится: лимит закрытия лонга — `long`. */
  direction: Direction;
  kind: 'entry' | 'close';
  price: number;
  /** Неисполненный остаток. */
  qty: number;
  stopLoss: number | null;
  takeProfit: number | null;
  createdAt: string | null;
}

/** Снимок счёта: баланс, позиции и лимиты одним ответом. */
export interface TerminalState {
  serverTime: string;
  /** USDT кошелька — от него считается риск. */
  balance: number;
  available: number | null;
  positions: TerminalPosition[];
  orders: TerminalOrder[];
}

/** Монета терминала — USDT-перп Bybit. Список и порядок (по обороту) держит сервер. */
export interface TerminalSymbol {
  symbol: string;
  base: string;
  decimals: number;
  maxLeverage: number;
  /** Оборот за 24 часа в USDT (Bybit), на момент загрузки списка. */
  turnover24h: number;
}

/** Как монета настроена на счёте: плечо и режим позиций. */
export interface SymbolInfo {
  symbol: string;
  decimals: number;
  minQty: number;
  maxLeverage: number;
  leverage: number | null;
  mode: 'oneWay' | 'hedge';
}

/** Ключ позиции на экране: на бирже она одна на (монету, сторону). */
export const positionKey = (p: { symbol: string; direction: Direction }) => `${p.symbol}:${p.direction}`;
