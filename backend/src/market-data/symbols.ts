import { START_MS } from './timeframes';

/**
 * Монеты эфира — единственный список в продукте. Фронт своей копии не держит,
 * он получает его с `GET /api/market-data/live/symbols`.
 *
 * Список фиксированный, а не «любой символ Binance»: эндпоинт истории для не-BTC
 * — прокси к бирже, и открытый набор символов сделал бы из сервера бесплатный
 * прокси ко всему рынку. Новая монета — запись здесь.
 *
 * `decimals` — шаг цены Binance spot (`exchangeInfo`, PRICE_FILTER.tickSize,
 * сверено 2026-09-26): с двумя знаками XRP по 2.51 и DOGE по 0.2 на графике
 * слипались бы в одинаковые подписи. TON не вошёл — у `TONUSDT` статус BREAK.
 *
 * `historySince` — монета есть и в истории бектеста, минутки у неё с этого
 * момента: у BTC — начало хранилища, у остальных — первая минутка Binance spot
 * (`klines?startTime=0`, сверено 2026-10-23). Свечи не-BTC история берёт у
 * Binance тем же прокси, что и эфир, — не хранит.
 *
 * `qtyStep` — шаг лота перпа Bybit (`instruments-info`, lotSizeFilter.qtyStep,
 * сверено 2026-11-10); у всех монет списка он же и минимальный ордер. Объём
 * сессии бектеста округляется вниз до него — ордер, которого биржа не примет
 * (0.00347 BTC), сессия не ставит.
 */
export const LIVE_SYMBOLS = [
  { symbol: 'BTCUSDT', base: 'BTC', decimals: 2, qtyStep: 0.001, historySince: START_MS },
  { symbol: 'ETHUSDT', base: 'ETH', decimals: 2, qtyStep: 0.01, historySince: Date.UTC(2017, 7, 17, 4) },
  { symbol: 'SOLUSDT', base: 'SOL', decimals: 2, qtyStep: 0.1, historySince: Date.UTC(2020, 7, 11, 6) },
  { symbol: 'BNBUSDT', base: 'BNB', decimals: 2, qtyStep: 0.01, historySince: Date.UTC(2017, 10, 6, 3, 54) },
  { symbol: 'XRPUSDT', base: 'XRP', decimals: 4, qtyStep: 0.1, historySince: Date.UTC(2018, 4, 4, 8, 11) },
  { symbol: 'DOGEUSDT', base: 'DOGE', decimals: 5, qtyStep: 1 },
  { symbol: 'ADAUSDT', base: 'ADA', decimals: 4, qtyStep: 1 },
  { symbol: 'AVAXUSDT', base: 'AVAX', decimals: 3, qtyStep: 0.1 },
  { symbol: 'LINKUSDT', base: 'LINK', decimals: 3, qtyStep: 0.1 },
] as const;

export type LiveSymbol = (typeof LIVE_SYMBOLS)[number];

/**
 * Монета по умолчанию: у тренажёра она единственная, у истории — когда монету
 * не выбрали, а в эфире с неё начинается график. Прежние сделки и сессии без
 * монеты — тоже она (дефолт колонки).
 */
export const DEFAULT_SYMBOL = 'BTCUSDT';

export const LIVE_SYMBOL_IDS: string[] = LIVE_SYMBOLS.map((s) => s.symbol);

export const isLiveSymbol = (s: string): boolean => LIVE_SYMBOL_IDS.includes(s);

/** Начало минуток монеты в истории бектеста; null — монеты в истории нет. */
export const historySince = (symbol: string): number | null => {
  const s = LIVE_SYMBOLS.find((x) => x.symbol === symbol);
  return s && 'historySince' in s ? s.historySince : null;
};

/** Монеты истории бектеста — в порядке списка. */
export const HISTORY_SYMBOL_IDS: string[] = LIVE_SYMBOL_IDS.filter((s) => historySince(s) != null);

/** Шаг лота монеты; 0 — монеты нет в списке, объём не округляется. */
export const qtyStepOf = (symbol: string): number => LIVE_SYMBOLS.find((x) => x.symbol === symbol)?.qtyStep ?? 0;
