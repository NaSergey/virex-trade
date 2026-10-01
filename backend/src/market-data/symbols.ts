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
 */
export const LIVE_SYMBOLS = [
  { symbol: 'BTCUSDT', base: 'BTC', decimals: 2 },
  { symbol: 'ETHUSDT', base: 'ETH', decimals: 2 },
  { symbol: 'SOLUSDT', base: 'SOL', decimals: 2 },
  { symbol: 'BNBUSDT', base: 'BNB', decimals: 2 },
  { symbol: 'XRPUSDT', base: 'XRP', decimals: 4 },
  { symbol: 'DOGEUSDT', base: 'DOGE', decimals: 5 },
  { symbol: 'ADAUSDT', base: 'ADA', decimals: 4 },
  { symbol: 'AVAXUSDT', base: 'AVAX', decimals: 3 },
  { symbol: 'LINKUSDT', base: 'LINK', decimals: 3 },
] as const;

export type LiveSymbol = (typeof LIVE_SYMBOLS)[number];

/**
 * Монета по умолчанию: у истории и тренажёра она единственная, а в эфире с неё
 * начинается график. Прежние сделки без монеты — тоже она (дефолт колонки).
 */
export const DEFAULT_SYMBOL = 'BTCUSDT';

export const LIVE_SYMBOL_IDS: string[] = LIVE_SYMBOLS.map((s) => s.symbol);

export const isLiveSymbol = (s: string): boolean => LIVE_SYMBOL_IDS.includes(s);
