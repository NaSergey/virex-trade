/** Ответы Hyperliquid — ровно те поля, что читает бот (проверены живыми запросами 2026-10-19). */
export type Point = [number, string];

export interface PortfolioWindow {
  accountValueHistory: Point[];
  pnlHistory: Point[];
  vlm: string;
}

/** `type: portfolio` — пары [окно, данные]: day, week, month, allTime и их perp*. */
export type Portfolio = [string, PortfolioWindow][];

export interface LeaderboardRow {
  ethAddress: string;
  accountValue: string;
  windowPerformances: [string, { pnl: string; roi: string; vlm: string }][];
  displayName: string | null;
}

export interface ClearinghouseState {
  assetPositions: {
    position: {
      coin: string;
      szi: string;
      entryPx: string | null;
      positionValue: string;
      unrealizedPnl: string;
      leverage: { type: string; value: number };
      liquidationPx: string | null;
    };
  }[];
}

/** `type: frontendOpenOrders` — открытые ордера кошелька. */
export interface RawOpenOrder {
  coin: string;
  side: 'A' | 'B';
  limitPx: string;
  sz: string;
  origSz: string;
  timestamp: number;
  orderType: string;
  reduceOnly: boolean;
  isTrigger: boolean;
  triggerPx: string;
}

/** `type: userFills` — последние сделки кошелька (до 2000, старые первыми). */
export interface RawFill {
  coin: string;
  px: string;
  sz: string;
  side: 'A' | 'B';
  time: number;
  dir: string;
  /** Размер позиции до этого исполнения (со знаком): по нему сделки и собираются. */
  startPosition?: string;
  closedPnl: string;
  fee: string;
  crossed: boolean;
}
