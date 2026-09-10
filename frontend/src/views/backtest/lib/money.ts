import type { Direction } from './fills';

/**
 * Деньги на экране прокрутки — предпросмотр. Окончательные размер, PnL и R
 * считает сервер (`backend/src/backtest/backtest-math.ts`); здесь те же формулы,
 * чтобы число до отправки не расходилось с тем, что вернётся.
 */

/** Та же ставка, что на сервере (`FEE_RATE` в backtest-math.ts). */
export const FEE_RATE = 0.00055;

export function previewSize(balance: number, riskPct: number, entry: number, stop: number) {
  const dist = Math.abs(entry - stop);
  if (!(dist > 0) || !(balance > 0) || !(riskPct > 0)) return null;
  const riskUsdt = (balance * riskPct) / 100;
  const qty = riskUsdt / dist;
  const notional = qty * entry;
  // Плечо справочное: маржа и ликвидация в бектесте не моделируются.
  return { riskUsdt, qty, notional, leverage: notional / balance };
}

/** Результат, если закрыть сейчас: с комиссией входа и выхода. */
export function unrealizedPnl(direction: Direction, entry: number, price: number, qty: number): number {
  const sign = direction === 'long' ? 1 : -1;
  return sign * (price - entry) * qty - (entry + price) * qty * FEE_RATE;
}

/**
 * Скрытая цена — только способ показа. В базе цены настоящие; на экран они
 * идут умноженными на масштаб сессии, а введённое пользователем делится обратно.
 * На R и PnL масштаб не влияет: размер — риск / |вход − стоп|, и он сокращается.
 */
export const toScreen = (price: number, scale: number) => price * scale;
export const fromScreen = (price: number, scale: number) => price / scale;

export const formatR = (r: number) => `${r >= 0 ? '+' : '−'}${Math.abs(r).toFixed(2)}R`;

/** Число для поля ввода: после умножения на масштаб без хвоста из пятнадцати знаков. */
export const toInput = (v: number) => String(Number(v.toPrecision(8)));

export type LevelError = 'stopRequired' | 'stopSide' | 'takeSide';

/**
 * Уровни относительно текущей цены (в одних единицах — экранных или
 * настоящих). Проверка браузера: при правке открытой сделки сервер сторону не
 * проверяет, потому что текущей цены не знает.
 */
export function checkLevels(direction: Direction, price: number, stop: number, take: number | null): LevelError | null {
  if (!(stop > 0)) return 'stopRequired';
  if (direction === 'long' ? stop >= price : stop <= price) return 'stopSide';
  if (take != null && (direction === 'long' ? take <= price : take >= price)) return 'takeSide';
  return null;
}
