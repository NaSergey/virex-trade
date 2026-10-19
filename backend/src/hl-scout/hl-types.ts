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
