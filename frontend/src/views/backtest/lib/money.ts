import type { Direction } from './fills';

/**
 * Деньги на экране прокрутки — предпросмотр. Окончательные размер, PnL и R
 * считает сервер (`backend/src/backtest/backtest-math.ts`); здесь те же формулы,
 * чтобы число до отправки не расходилось с тем, что вернётся.
 */

/** Та же ставка, что на сервере (`FEE_RATE` в backtest-math.ts). */
export const FEE_RATE = 0.00055;

/**
 * Предпросмотр размера и маржи — те же формулы, что на сервере при открытии
 * (`positionSize`/margin-проверка в `backtest.service.ts`), чтобы число до
 * отправки не расходилось с тем, что вернётся.
 */
export function previewSize(balance: number, riskPct: number, entry: number, stop: number, leverage: number, direction: Direction) {
  const dist = Math.abs(entry - stop);
  if (!(dist > 0) || !(balance > 0) || !(riskPct > 0)) return null;
  const riskUsdt = (balance * riskPct) / 100;
  const qty = riskUsdt / dist;
  const notional = qty * entry;
  return { riskUsdt, qty, notional, margin: notional / leverage, liqPrice: liquidationPrice(direction, entry, leverage) };
}

/** Ликвидация — упрощённо, без поддерживающей маржи и комиссий: long ниже входа, short выше, на 1/leverage. */
export function liquidationPrice(direction: Direction, entry: number, leverage: number): number {
  return direction === 'long' ? entry * (1 - 1 / leverage) : entry * (1 + 1 / leverage);
}

/** Средневзвешенная цена входа после добора — тот же расчёт, что на сервере (backtest-math.ts). */
export function averageIn(qtyA: number, entryA: number, qtyB: number, entryB: number): number {
  return (qtyA * entryA + qtyB * entryB) / (qtyA + qtyB);
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

/** Цена стопа/тейка, выставленная программно (слайдер, зеркалирование, синхронизация
 * с сервером) — округлена до десятых: точнее для входа/выхода в бэктесте не нужно, а
 * лишние знаки при быстром драге только рябят на глаз. Руками напечатанное число это
 * не трогает — оно остаётся как есть, см. `setStopText` в OrderPanel. */
export const toInputPrice = (v: number) => v.toFixed(1);

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
/** То же самое в процентных пунктах слайдера стопа — ±7. */
export const STOP_RISK_PCT = STOP_PCT * 100;
/** Тейк не так рискован ограничивать — размах шире, ±20%. */
const TAKE_PCT = 0.2;

/**
 * Слайдер стопа задаёт сразу направление и дистанцию одним числом: центр —
 * цена, направления ещё нет; вправо (положительный процент) — лонг, стоп
 * встаёт настолько ниже цены; влево (отрицательный) — шорт, стоп настолько
 * выше. Раздельные кнопка направления и диапазон в одну сторону путали —
 * положение слайдера физически (правее/левее) не совпадало с тем, какую
 * сделку он готовит, и приводило именно к той стороне, что не ожидал
 * пользователь.
 *
 * Формула одна на оба знака: `price × (1 − pct/100)` при pct=−3 даёт
 * `price × 1.03` — стоп на 3 % выше цены, ровно то же самое, что и `price ×
 * (1 + 0.03)` для шорта.
 */
export function stopFromSignedPct(pct: number, price: number): number {
  return price * (1 - pct / 100);
}

/** Обратное преобразование — положение слайдера по уже введённой (или снесённой драгом) цене стопа. */
export function signedPctFromStop(stopPrice: number, price: number): number {
  return ((price - stopPrice) / price) * 100;
}

/**
 * Направление, которое подразумевают уже введённые уровни, — до того, как
 * нажали «Лонг»/«Шорт». Открытая сделка отвечает сама (её направление уже
 * решено); иначе сторону подсказывает то, что уже набрано: стоп ниже цены
 * или тейк выше — лонг, и наоборот. Стоп в приоритете перед тейком — именно
 * его сторона определяет сделку (`checkLevels` тоже смотрит от направления
 * к стопу, не наоборот).
 *
 * Без единого направления диапазоны стопа и тейка выбирались бы независимо:
 * стоп ниже цены (подразумевает лонг), а тейк как ни в чём не бывало
 * доступен по обе стороны — слайдер тейка на глаз никак не связан со
 * стопом, хотя в одной сделке они обязаны быть по разные стороны цены.
 */
export function impliedDirection(
  openDirection: Direction | null,
  stop: number,
  take: number | null,
  price: number,
): Direction | null {
  if (openDirection) return openDirection;
  if (stop > 0) return stop < price ? 'long' : 'short';
  if (take != null && take > 0) return take > price ? 'long' : 'short';
  return null;
}

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
 * Черновик стопа и тейка после того, как стоп получил новую цену — общая
 * точка для всех трёх мест, откуда стоп можно подвинуть (слайдер, текстовое
 * поле, драг уровня прямо по графику).
 *
 * Если новый стоп меняет подразумеваемое направление (`impliedDirection`),
 * уже введённый тейк был по правильную сторону для прежнего направления и
 * стал неверным для нового — зеркалим его через цену: та же дистанция,
 * другая сторона, а не молча оставляем то, что стало противоречить самому
 * стопу.
 *
 * Синхронно и чисто (без стейта, без эффекта): вызывающий обязан применить
 * оба поля одним обновлением состояния, в том же обработчике, что и сам
 * стоп — иначе один кадр между «стоп уже новый» и «тейк ещё старый» успел бы
 * отрисоваться на графике.
 */
export function applyStopChange(
  prev: { stop: string; take: string },
  newStopScreen: number,
  screenPrice: number,
  openDirection: Direction | null,
): { stop: string; take: string } {
  const prevStop = Number(prev.stop);
  const prevTake = prev.take.trim() ? Number(prev.take) : null;
  const prevDirection = impliedDirection(openDirection, prevStop, prevTake, screenPrice);
  const nextDirection = impliedDirection(openDirection, newStopScreen, prevTake, screenPrice);
  const stop = toInputPrice(newStopScreen);
  if (prevDirection != null && nextDirection != null && prevDirection !== nextDirection && prevTake != null) {
    return { stop, take: toInputPrice(2 * screenPrice - prevTake) };
  }
  return { stop, take: prev.take };
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
