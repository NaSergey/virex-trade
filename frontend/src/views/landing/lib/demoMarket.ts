import { fromApi, type ApiCandle, type LiveSource, type LiveSymbol } from '@/widgets/backtest-session';

/**
 * Рынок терминала на главной — публичный API Binance прямо из браузера гостя.
 *
 * Свой рынок продукта (`/api/market-data`) закрыт авторизацией, а у гостя её
 * нет: запрос получил бы 401, и его обработчик увёл бы со страницы на вход.
 * Открывать эндпоинт ради главной не стали — лимита запросов на открытых
 * адресах нет, и он стал бы бесплатным прокси к рынку. Binance — тот же
 * источник, что у эфира бектеста для монет кроме BTC, и та же история.
 *
 * Хост — зеркало только рыночных данных (`data-api.binance.vision`): без ключей,
 * с CORS, и бан IP за частые запросы тут ложится на гостя, а не на сервер.
 */
const BINANCE = 'https://data-api.binance.vision/api/v3';

/**
 * Монеты эфира — копия серверного списка (`backend/src/market-data/symbols.ts`):
 * обычно фронт берёт его с сервера, но гостю этот запрос закрыт. Правится вместе
 * с серверным.
 */
export const DEMO_SYMBOLS: LiveSymbol[] = [
  { symbol: 'BTCUSDT', base: 'BTC', decimals: 2 },
  { symbol: 'ETHUSDT', base: 'ETH', decimals: 2 },
  { symbol: 'SOLUSDT', base: 'SOL', decimals: 2 },
  { symbol: 'BNBUSDT', base: 'BNB', decimals: 2 },
  { symbol: 'XRPUSDT', base: 'XRP', decimals: 4 },
  { symbol: 'DOGEUSDT', base: 'DOGE', decimals: 5 },
  { symbol: 'ADAUSDT', base: 'ADA', decimals: 4 },
  { symbol: 'AVAXUSDT', base: 'AVAX', decimals: 3 },
  { symbol: 'LINKUSDT', base: 'LINK', decimals: 3 },
];

export const demoDecimalsOf = (symbol: string) => DEMO_SYMBOLS.find((s) => s.symbol === symbol)?.decimals;

const INTERVAL: Record<number, string> = { 1: '1m', 5: '5m', 15: '15m', 30: '30m', 60: '1h', 240: '4h', 1440: '1d' };
/** Больше Binance за раз не отдаёт. */
const PAGE = 1000;

/** Строка свечи Binance: время открытия, OHLC, объём, время закрытия, … */
type Kline = [number, string, string, string, string, string, number, ...unknown[]];

async function klines(symbol: string, tf: number, params: { startTime?: number; endTime?: number; limit: number }): Promise<Kline[]> {
  const q = new URLSearchParams({ symbol, interval: INTERVAL[tf] ?? '1h', limit: String(params.limit) });
  if (params.startTime != null) q.set('startTime', String(params.startTime));
  if (params.endTime != null) q.set('endTime', String(params.endTime));
  const res = await fetch(`${BINANCE}/klines?${q}`);
  if (!res.ok) throw new Error(`Binance ${res.status}`);
  return (await res.json()) as Kline[];
}

const toApi = (k: Kline): ApiCandle => ({
  time: new Date(k[0]).toISOString(),
  open: Number(k[1]),
  high: Number(k[2]),
  low: Number(k[3]),
  close: Number(k[4]),
  volume: Number(k[5]),
});

/**
 * Закрытые свечи — в той же форме, что у `/api/market-data/candles`: последняя,
 * ещё формирующаяся, сюда не входит, её лента собирает из минуток хвоста.
 * `from` — постранично вперёд (минутки с позавчерашней полуночи — до 2880
 * штук), `to` — последние `limit` до него.
 */
async function candles(tf: number, range: { from?: number; to?: number; limit: number }, symbol: string) {
  const now = Date.now();
  const rows: Kline[] = [];
  if (range.from != null) {
    let start = range.from;
    while (rows.length < range.limit) {
      const page = await klines(symbol, tf, { startTime: start, endTime: range.to != null ? range.to - 1 : undefined, limit: PAGE });
      rows.push(...page);
      if (page.length < PAGE) break;
      start = page[page.length - 1][0] + 1;
    }
  } else {
    rows.push(...(await klines(symbol, tf, { endTime: range.to != null ? range.to - 1 : undefined, limit: Math.min(range.limit, PAGE) })));
  }
  return rows
    .filter((k) => k[6] < now)
    .slice(0, range.limit)
    .map((k) => fromApi(toApi(k)));
}

/** Хвост минуток: последняя ещё формируется и придёт снова, свежей. */
async function tail(symbol: string) {
  const rows = await klines(symbol, 1, { limit: 3 });
  // Часы — свои: у лент сервера время ставит сервер, а у гостя исполнитель — его же браузер.
  return { serverTime: new Date().toISOString(), minutes: rows.map(toApi) };
}

/** Константа модуля: лента перезапрашивает свечи при смене ссылки источника. */
export const DEMO_SOURCE: LiveSource = { tail, candles };

/** Последние цены монет — одним запросом на все. */
export async function fetchDemoPrices(symbols: string[]): Promise<Record<string, number>> {
  const q = new URLSearchParams({ symbols: JSON.stringify(symbols) });
  const res = await fetch(`${BINANCE}/ticker/price?${q}`);
  if (!res.ok) throw new Error(`Binance ${res.status}`);
  const rows = (await res.json()) as { symbol: string; price: string }[];
  return Object.fromEntries(rows.map((r) => [r.symbol, Number(r.price)]));
}
