/** Поиск улучшений. Строки таблицы — живые варианты отчёта, поэтому тут только их места. */
export interface SearchRow {
  id: string;
  direction: string;
  /** Выбран по сделкам до 2023 года и открыт на сделках после. */
  finalist: boolean;
}

export const SEARCH: SearchRow[] = [
  { id: 'minstop', direction: 'Стоп не тоньше', finalist: false },
  { id: 'reg15-buf', direction: 'Стоп не тоньше', finalist: true },
  { id: 'main', direction: 'Старший таймфрейм', finalist: true },
  { id: 'h1', direction: 'Старший таймфрейм', finalist: false },
  { id: 'reg15', direction: 'Режим рынка MA200', finalist: false },
  { id: 'reg1h', direction: 'Режим рынка MA200', finalist: true },
  { id: 'reg1h-fvg', direction: 'Режим рынка MA200', finalist: true },
  { id: 'buf5', direction: 'Запас к стопу', finalist: true },
  { id: 'mkt15', direction: 'Вход по рынку', finalist: false },
];

export const isSearch = (id: string) => id !== 'main' && SEARCH.some((r) => r.id === id);

/** Условие зачёта, заданное до просмотра сделок 2023+: мат ожидание выше нуля и столько сделок. */
export const MIN_TEST_N = 15;
/** Снимок прогона `backend/src/scripts/strategy-research.ts` от 2026-10-31: в отчёте только BTC. */
export const TRIED = 32;

export interface CoinRow {
  coin: string;
  n: number;
  winrate: number;
  expectancy: number;
  sumR: number;
}

/** То же правило 4H без единой правки. */
export const COINS: CoinRow[] = [
  { coin: 'BTC', n: 21, winrate: 13 / 21, expectancy: 0.816, sumR: 17.2 },
  { coin: 'ETH', n: 13, winrate: 7 / 13, expectancy: 0.077, sumR: 1 },
  { coin: 'BNB', n: 16, winrate: 4 / 16, expectancy: -0.594, sumR: -9.5 },
  { coin: 'XRP', n: 13, winrate: 4 / 13, expectancy: -0.469, sumR: -6.1 },
  { coin: 'Все четыре', n: 63, winrate: 28 / 63, expectancy: 0.041, sumR: 2.6 },
];
export const POOLED_CI = { lo: -0.364, hi: 0.446 };
/** Те же стороны и размеры стопа, но вход в случайный момент: 20 прогонов на BTC. */
export const PLACEBO = { median: -0.11, max: 0.269, runs: 20, above: 0 };
