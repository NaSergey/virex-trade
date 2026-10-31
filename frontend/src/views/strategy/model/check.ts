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
  { coin: 'BTC', n: 18, winrate: 11 / 18, expectancy: 0.677, sumR: 12.2, allExpectancy: 0.292, allN: 75 },
  { coin: 'ETH', n: 28, winrate: 15 / 28, expectancy: 0.513, sumR: 14.4, allExpectancy: 0.346, allN: 91 },
  { coin: 'XRP', n: 16, winrate: 9 / 16, expectancy: 0.323, sumR: 5.2, allExpectancy: 0.132, allN: 71 },
  { coin: 'SOL', n: 11, winrate: 3 / 11, expectancy: -0.632, sumR: -7, allExpectancy: 0.102, allN: 48 },
  { coin: 'BNB', n: 17, winrate: 8 / 17, expectancy: -0.248, sumR: -4.2, allExpectancy: -0.109, allN: 86 },
];
/** Вход в случайный момент с теми же сторонами и стопами: 20 прогонов, настоящая стратегия не обогнана ни разу. */
export const PLACEBO = { runs: 20 };
