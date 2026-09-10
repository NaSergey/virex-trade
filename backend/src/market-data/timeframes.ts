/**
 * Шесть таймфреймов графика BTC — в МИНУТАХ, а не строками.
 *
 * Строка расползлась бы так же, как расползся бы таймфрейм сделки, будь он
 * тегом: '15m' у Binance, '15' у Bybit, 'M15' у следующего источника. Число
 * даёт ещё и арифметику — правило закрытия свечи получается одно на все
 * шесть, а не шесть частных случаев.
 */
export const TIMEFRAMES = [1, 5, 15, 60, 240, 1440] as const;

export type Timeframe = (typeof TIMEFRAMES)[number];

/**
 * Порядок обхода при синхронизации — от крупного к мелкому.
 *
 * На пустой базе дневной график с 2018 года становится доступен через минуту
 * после первого старта, а минутка доезжает последней. В обратном порядке все
 * шесть таймфреймов стояли бы пустыми примерно полчаса.
 */
export const SYNC_ORDER: Timeframe[] = [1440, 240, 60, 15, 5, 1];

/**
 * Символ и начало истории — здесь, а не в сервисе синка: их читают и синк, и
 * сервис чтения, и контроллер. Сервис чтения не должен зависеть от сервиса
 * записи ради константы.
 */
export const SYMBOL = 'BTCUSDT';
export const START_MS = Date.UTC(2018, 0, 1);

const BINANCE_INTERVAL: Record<number, string> = {
  1: '1m',
  5: '5m',
  15: '15m',
  60: '1h',
  240: '4h',
  1440: '1d',
};

export const isValidTimeframe = (tf: number): tf is Timeframe =>
  (TIMEFRAMES as readonly number[]).includes(tf);

export const timeframeMs = (tf: number): number => tf * 60_000;

export const toBinanceInterval = (tf: number): string => {
  const interval = BINANCE_INTERVAL[tf];
  if (!interval) throw new Error(`Неизвестный таймфрейм: ${tf}`);
  return interval;
};

/**
 * Свеча закрыта, когда её окно целиком в прошлом. Незакрытую писать нельзя:
 * она ещё меняется, а в базе значилась бы окончательной.
 */
export const isClosed = (openTimeMs: number, tf: number, nowMs: number): boolean =>
  openTimeMs + timeframeMs(tf) <= nowMs;
