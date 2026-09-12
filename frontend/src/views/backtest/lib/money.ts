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

/**
 * Риск в USDT по проценту от депозита — не зависит от стопа, в отличие от
 * `previewSize`: слайдер риска обязан показывать сумму сразу, даже пока стоп
 * ещё не введён (`previewSize` без стопа вернёт null целиком).
 */
export function riskAmount(balance: number, riskPct: number): number | null {
  if (!(balance > 0) || !(riskPct > 0)) return null;
  return (balance * riskPct) / 100;
}

/** Максимальное отклонение стопа от цены — шире не даёт слить депозит одним движением слайдера. */
const STOP_PCT = 0.07;
/** Тейк не так рискован ограничивать — размах шире, ±20%. */
const TAKE_PCT = 0.2;

/**
 * Диапазон слайдера стопа/тейка — по правильную сторону от цены. Стоп зажат
 * ±7%: шире слайдер уже не «риск на сделку», а «половина депозита одним
 * движением». Тейк свободнее, ±20% — далёкий тейк не опасен так, как далёкий
 * стоп.
 *
 * Пока сделка не открыта, направление ещё не выбрано: пользователь вправе
 * поставить стоп по любую сторону цены — сторону в итоге определяют сами
 * уровни через `checkLevels`, когда он нажмёт «Лонг» или «Шорт», а не
 * наоборот. Поэтому без направления диапазон симметричный вокруг цены, а не
 * заранее сужен в одну сторону.
 */
export function levelSliderRange(
  kind: 'stop' | 'take',
  price: number,
  direction: Direction | null,
): { min: number; max: number } {
  const pct = kind === 'stop' ? STOP_PCT : TAKE_PCT;
  const lo = price * (1 - pct);
  const hi = price * (1 + pct);
  if (direction == null) return { min: lo, max: hi };
  const long = direction === 'long';
  const belowSide = kind === 'stop' ? long : !long;
  return belowSide ? { min: lo, max: price } : { min: price, max: hi };
}

/**
 * Что случится, если цена дойдёт до уровня: движение в процентах от точки
 * отсчёта (вход у открытой сделки, текущая цена у ещё не открытой) и
 * результат в USDT при данном размере позиции — та же формула, что и у
 * «Сейчас» в панели ордера (`unrealizedPnl`), только на гипотетической цене
 * уровня вместо текущей. Проценты не заходят через `toScreen`/`fromScreen`:
 * отношение двух цен не меняется от того, что обе умножены на один масштаб.
 */
export function levelImpact(direction: Direction, refPrice: number, levelPrice: number, qty: number): { pct: number; usdt: number } {
  const pct = ((levelPrice - refPrice) / refPrice) * 100;
  const usdt = unrealizedPnl(direction, refPrice, levelPrice, qty);
  return { pct, usdt };
}
