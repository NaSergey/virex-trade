/**
 * Расчёт сетки грид-бота — серверная копия
 * `frontend/src/widgets/backtest-session/lib/bot-grid.ts`, те же правила и те
 * же тесты (приём `fills.ts`): панель показывает то, что сервер выставит.
 *
 * Уровни покупок — `низ + j·шаг`, j = 0…N−1, `шаг = (верх − низ) / N`; продажа
 * каждой покупки — на шаг выше, поэтому верхняя стоит на верхней границе.
 * Объём уровня — его доля (`shares`, в сумме 1; пусто — поровну) от общего
 * объёма, а общий подобран так, что если исполнились все покупки и сработал
 * стоп, потеря — ровно риск.
 */
export const BOT_MIN_LEVELS = 2;
export const BOT_MAX_LEVELS = 20;

export interface BotGrid {
  lower: number;
  upper: number;
  levels: number;
  stopLoss: number;
  /** Доли уровней снизу вверх, в сумме 1; пусто — поровну. */
  shares?: readonly number[];
}

export type BotGridError =
  | 'BACKTEST_BOT_RANGE'
  | 'BACKTEST_BOT_STOP'
  | 'BACKTEST_BOT_LEVELS'
  | 'BACKTEST_BOT_PRICE_OUTSIDE'
  | 'BACKTEST_BOT_SHARES';

export const botStep = (g: BotGrid) => (g.upper - g.lower) / g.levels;

export const botPrices = (g: BotGrid) => Array.from({ length: g.levels }, (_, j) => g.lower + j * botStep(g));

/** Доля уровня j: заданная или поровну. */
const shareOf = (g: BotGrid, j: number) => (g.shares && g.shares.length === g.levels ? g.shares[j] : 1 / g.levels);

/** Σ доля·(уровень − стоп): во сколько раз потеря на стопе больше общего объёма. */
const spread = (g: BotGrid) => botPrices(g).reduce((a, p, j) => a + shareOf(g, j) * (p - g.stopLoss), 0);

/** Общий объём сетки: потеря при всех покупках и стопе — ровно риск. */
const totalQty = (g: BotGrid, balance: number, riskPct: number) => (balance * riskPct) / 100 / spread(g);

/** Объём уровня j в монете. */
export const botQty = (g: BotGrid, balance: number, riskPct: number, j = 0) => shareOf(g, j) * totalQty(g, balance, riskPct);

/** Номер уровня ближайшей к цене покупки — у перенесённой жестом тоже. */
export const botLevelOf = (g: BotGrid, price: number) =>
  Math.min(g.levels - 1, Math.max(0, Math.round((price - g.lower) / botStep(g))));

/**
 * Риск уровня: лимит на вход сервер исполняет объёмом `депозит · риск / (цена − стоп)`,
 * и с этой долей общего риска выходит объём уровня j.
 */
export const levelRiskPct = (g: BotGrid, riskPct: number, price: number, j = botLevelOf(g, price)) =>
  (riskPct * shareOf(g, j) * (price - g.stopLoss)) / spread(g);

/**
 * Уровни на цене и выше покупаются при запуске по рынку — как у сеточного бота
 * Bybit в режиме «лонг»: лимит на покупку выше цены биржа исполнила бы сразу, а
 * прокрутка бектеста — на касании снизу, покупкой на росте.
 */
export function splitAtPrice(prices: number[], price: number): { market: number[]; limit: number[] } {
  return { market: prices.filter((p) => p >= price), limit: prices.filter((p) => p < price) };
}

export function botGridError(g: BotGrid, price: number): BotGridError | null {
  if (!(g.lower > 0) || !(g.upper > g.lower)) return 'BACKTEST_BOT_RANGE';
  if (!(g.stopLoss > 0) || g.stopLoss >= g.lower) return 'BACKTEST_BOT_STOP';
  if (!Number.isInteger(g.levels) || g.levels < BOT_MIN_LEVELS || g.levels > BOT_MAX_LEVELS) return 'BACKTEST_BOT_LEVELS';
  if (g.shares && g.shares.length > 0) {
    const sum = g.shares.reduce((a, s) => a + s, 0);
    if (g.shares.length !== g.levels || g.shares.some((s) => !(s > 0)) || Math.abs(sum - 1) > 1e-6) return 'BACKTEST_BOT_SHARES';
  }
  if (!(price >= g.lower && price <= g.upper)) return 'BACKTEST_BOT_PRICE_OUTSIDE';
  return null;
}
