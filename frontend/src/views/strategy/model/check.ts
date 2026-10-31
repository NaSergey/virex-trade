/** Снимок `backend/src/scripts/strategy-coins.ts` от 2026-10-31: в отчёте только BTC. */
export interface CoinRow {
  coin: string;
  n: number;
  winrate: number;
  expectancy: number;
  sumR: number;
  /** Мат ожидание за всю историю с 2018 года. */
  allExpectancy: number;
  allN: number;
}

export const COINS: CoinRow[] = [
  { coin: 'BTC', n: 12, winrate: 10 / 12, expectancy: 0.977, sumR: 11.7, allExpectancy: 0.23, allN: 57 },
  { coin: 'ETH', n: 20, winrate: 14 / 20, expectancy: 0.551, sumR: 11, allExpectancy: 0.314, allN: 74 },
  { coin: 'XRP', n: 12, winrate: 9 / 12, expectancy: 0.325, sumR: 3.9, allExpectancy: 0.07, allN: 54 },
  { coin: 'SOL', n: 8, winrate: 3 / 8, expectancy: -0.143, sumR: -1.1, allExpectancy: 0.039, allN: 36 },
  { coin: 'BNB', n: 14, winrate: 9 / 14, expectancy: -0.125, sumR: -1.7, allExpectancy: -0.15, allN: 69 },
];
export const SAVED_COINS: CoinRow[] = [
  { coin: 'BTC', n: 18, winrate: 11 / 18, expectancy: 0.677, sumR: 12.2, allExpectancy: 0.292, allN: 75 },
  { coin: 'ETH', n: 28, winrate: 15 / 28, expectancy: 0.513, sumR: 14.4, allExpectancy: 0.346, allN: 91 },
  { coin: 'XRP', n: 16, winrate: 9 / 16, expectancy: 0.323, sumR: 5.2, allExpectancy: 0.132, allN: 71 },
  { coin: 'SOL', n: 11, winrate: 3 / 11, expectancy: -0.632, sumR: -7, allExpectancy: 0.102, allN: 48 },
  { coin: 'BNB', n: 17, winrate: 8 / 17, expectancy: -0.248, sumR: -4.2, allExpectancy: -0.109, allN: 86 },
];
/** Вход в случайный момент с теми же сторонами и стопами: 20 прогонов на BTC и на ETH, сколько из них не хуже настоящей стратегии. */
export const PLACEBO = { runs: 20, above: 1, savedAbove: 0 };
