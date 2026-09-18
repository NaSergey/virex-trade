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

/** N цен уровней сетки, равномерно на отрезке [lower, upper] включительно. N=1 — середина отрезка. */
export function gridPrices(lower: number, upper: number, count: number): number[] {
  const n = Math.max(1, Math.round(count));
  if (n === 1) return [(lower + upper) / 2];
  const step = (upper - lower) / (n - 1);
  return Array.from({ length: n }, (_, i) => lower + step * i);
}

/**
 * Предпросмотр сетки целиком, если исполнятся все уровни: риск общий,
 * поровну по уровням (`positionSize`/`previewSize` — та же формула, что на
 * каждом уровне отдельно посчитает сервер через openTrade/addToTrade).
 */
export function previewGrid(
  balance: number,
  riskPctTotal: number,
  prices: number[],
  stop: number,
  leverage: number,
  direction: Direction,
) {
  if (prices.length === 0) return null;
  const riskPerLevel = riskPctTotal / prices.length;
  let qty = 0;
  let notional = 0;
  let riskUsdt = 0;
  for (const price of prices) {
    const one = previewSize(balance, riskPerLevel, price, stop, leverage, direction);
    if (!one) return null;
    qty += one.qty;
    notional += one.notional;
    riskUsdt += one.riskUsdt;
  }
  // Средний вход — по объёму, а не простое среднее цен: доли риска равны, а
  // размер каждого уровня свой (он же риск / расстояние до стопа), и дальние
  // от стопа уровни весят в позиции меньше.
  return { qty, notional, riskUsdt, margin: notional / leverage, avgEntry: notional / qty };
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
 * с сервером) — округлена не до фиксированного знака, а до шести значащих цифр.
 * У настоящей цены BTC (пять-шесть разрядов до запятой) это те же «до десятых», что
 * и раньше: лишние знаки при быстром драге по-прежнему не рябят на глаз. Но у скрытой
 * цены (`priceScale` сессии, режим hidePrice) число нарочно сжато сервером в диапазон
 * 100–1000 (`pickPriceScale`), и фиксированная десятая там режет ползунки стопа/тейка:
 * рядом с нулём (см. `curvedSliderPos`/`SLIDER_CURVE`) один и тот же ход мыши двигает
 * цену на сотые и тысячные, округление до 0.1 схлопывает это обратно в саму цену —
 * ползунок визуально замирает точно по центру, сколько его ни тяни. Руками напечатанное
 * число это не трогает — оно остаётся как есть (поля модалки «Изменить уровни»). */
export const toInputPrice = (v: number) => {
  const integerDigits = Math.floor(Math.log10(v)) + 1;
  return v.toFixed(Math.max(0, 6 - integerDigits));
};

export type LevelError = 'stopRequired' | 'stopSide' | 'takeSide' | 'entryRangeRequired' | 'entrySide';

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
 * То же самое, что `checkLevels`, но для сетки на вход: стоп и тейк обязаны
 * быть по верную сторону КАЖДОГО уровня сетки, не только текущей цены —
 * иначе средний вход после доборов мог бы уехать за стоп ещё до того, как
 * сетка исполнится целиком.
 */
export function checkGridLevels(direction: Direction, prices: number[], stop: number, take: number | null): LevelError | null {
  if (prices.length === 0) return 'entryRangeRequired';
  if (!(stop > 0)) return 'stopRequired';
  for (const price of prices) {
    if (direction === 'long' ? stop >= price : stop <= price) return 'stopSide';
    if (take != null && (direction === 'long' ? take <= price : take >= price)) return 'takeSide';
  }
  return null;
}

/**
 * Уровни входа (сетка или одиночный отложенный ордер) — по одну сторону от
 * текущей цены: лонг покупает ниже неё, шорт продаёт выше. Ползунки верха и
 * низа крутятся независимо в обе стороны от цены, сторону решает нажатая
 * кнопка, поэтому сверять её с ценой обязана отправка: `checkGridLevels`
 * сверяет уровни только со стопом и тейком, и сетка по обе стороны цены
 * проходила бы целиком. Уровень ровно на цене — уже рынок, не отложенный
 * ордер. Цена и уровни — в одних единицах, как в `checkLevels`.
 */
export function checkEntrySide(direction: Direction, prices: number[], price: number): LevelError | null {
  for (const p of prices) {
    if (direction === 'long' ? p >= price : p <= price) return 'entrySide';
  }
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
/** Тейк не так рискован ограничивать — размах шире, ±10%. */
const TAKE_PCT = 0.1;

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
 * движением». Тейк свободнее, ±10% — далёкий тейк не опасен так, как далёкий
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

/** Степень дуги ползунков риска/стопа/тейка — см. `curvedSliderPos`. */
const SLIDER_CURVE = 2;

const clampUnit = (t: number) => Math.min(1, Math.max(0, t));

/**
 * Экранная позиция ползунка (−100…100) по уже посчитанному значению — риска,
 * стопа или тейка. Линейный `<input type="range">` даёт одно и то же
 * приращение значения на любом участке трека; рабочие значения у всех трёх
 * ползунков лежат рядом с `zero` (риск обычно в пределах пары процентов,
 * стоп и тейк — рядом с ценой), а редкий крайний случай — у края диапазона.
 * Дуга даёт точный подбор там, где им пользуются каждый раз, ценой более
 * грубого шага у края, который двигают редко.
 *
 * `zero` — точка без смещения (0% риска, цена для стопа/тейка) — может быть
 * и краем диапазона (риск; тейк/стоп после выбора стороны сделки), и его
 * серединой (стоп и тейк, пока сторона ещё не выбрана): считаем расстояние
 * до зажатой границы отдельно на каждую сторону, поэтому формула одна на
 * оба случая.
 */
export function curvedSliderPos(value: number, min: number, max: number, zero: number, curve = SLIDER_CURVE): number {
  if (!(value > zero) && !(value < zero)) return 0;
  const bound = value > zero ? max : min;
  if (bound === zero) return 0;
  const t = clampUnit(Math.abs((value - zero) / (bound - zero)));
  return Math.sign(value - zero) * Math.pow(t, 1 / curve) * 100;
}

/** Обратное преобразование — значение по позиции ползунка (−100…100), см. `curvedSliderPos`. */
export function curvedSliderValue(pos: number, min: number, max: number, zero: number, curve = SLIDER_CURVE): number {
  if (pos === 0) return zero;
  const bound = pos > 0 ? max : min;
  const t = Math.pow(clampUnit(Math.abs(pos) / 100), curve);
  return zero + Math.sign(pos) * t * Math.abs(bound - zero);
}

/**
 * Тейк черновика по верную сторону от цены: сторону сделки задаёт стоп
 * (`impliedDirection`), и тейк лонга обязан быть выше цены, шорта — ниже.
 * Пока стопа нет, сторону задаёт сам тейк, и подходит любой.
 *
 * Это свойство самого черновика при текущей цене, а не результат правки:
 * черновик хранит цены, а цена прокрутки идёт дальше, поэтому тейк
 * перестаёт подходить и без единого действия пользователя — достаточно,
 * чтобы цена прошла за тейк или за стоп. Отсюда проверка там, где черновик
 * показывается, а не только там, где его правят.
 */
export function draftTakeFits(stop: number, take: number, price: number): boolean {
  const direction = impliedDirection(null, stop, null, price);
  if (direction == null) return true;
  return direction === 'long' ? take > price : take < price;
}

/**
 * Черновик стопа и тейка после того, как стоп получил новое значение — общая
 * точка для всех трёх мест, откуда стоп можно подвинуть (слайдер, текстовое
 * поле, драг уровня прямо по графику). `nextStop` — ровно та строка, что
 * ляжет в черновик: слайдер и график округляют (`toInputPrice`), поле ввода
 * передаёт напечатанное как есть.
 *
 * Тейк зеркалится через цену (та же дистанция, другая сторона), когда новый
 * стоп делает неверным тейк, который до этого был верным. Раньше правило
 * звучало «стоп сменил сторону» — и ломалось двумя путями. Сторона считалась
 * по сырому числу, а в черновик ложилось округлённое, и у самой цены они
 * расходились. И тейк, который уже стоял со стопом по одну сторону (цена
 * прошла за уровень), при каждом перебросе стопа зеркалился вслед за ним и
 * так и оставался на его стороне.
 *
 * Синхронно и чисто (без стейта, без эффекта): вызывающий обязан применить
 * оба поля одним обновлением состояния, в том же обработчике, что и сам
 * стоп — иначе один кадр между «стоп уже новый» и «тейк ещё старый» успел бы
 * отрисоваться на графике.
 */
export function applyStopChange(
  prev: { stop: string; take: string },
  nextStop: string,
  screenPrice: number,
  openDirection: Direction | null,
): { stop: string; take: string } {
  const prevTake = prev.take.trim() ? Number(prev.take) : null;
  if (openDirection != null || prevTake == null) return { stop: nextStop, take: prev.take };
  const breaksTake =
    draftTakeFits(Number(prev.stop), prevTake, screenPrice) && !draftTakeFits(Number(nextStop), prevTake, screenPrice);
  return { stop: nextStop, take: breaksTake ? toInputPrice(2 * screenPrice - prevTake) : prev.take };
}

/**
 * Черновик стопа и тейка отложенного ордера после того, как ЕГО ВХОД
 * получил новую цену. Оба уровня отсчитываются от входа, а не от рыночной
 * цены (см. комментарий у `lAnchor` в OrderPanel): без этой функции
 * абсолютная цена, набранная под старый вход, при переносе входа просто
 * остаётся на месте — не едет вслед за ним и, если вход перепрыгнул через
 * рыночную цену (сделка перевернулась из лонга в шорт), оказывается вовсе
 * не по ту сторону.
 *
 * Дистанция от входа в процентах переносится на новый вход как есть,
 * сторона — та, что требует направление входа относительно рыночной цены
 * (`impliedDirection`), а не сторона, в которой уровень стоял раньше: так
 * переворот направления переворачивает и уровень вместе с ним, не оставляя
 * стоп лонга висеть выше входа, ставшего шортовым.
 */
export function applyEntryChange(
  prev: { entry: string; stop: string; take: string },
  nextEntry: string,
  screenPrice: number,
): { entry: string; stop: string; take: string } {
  const oldEntry = prev.entry.trim() ? Number(prev.entry) : null;
  const oldAnchor = oldEntry != null && oldEntry > 0 ? oldEntry : screenPrice;
  const newEntry = Number(nextEntry);
  const direction = newEntry > 0 ? impliedDirection(null, newEntry, null, screenPrice) : null;

  const moveLevel = (kind: 'stop' | 'take', raw: string): string => {
    if (!raw.trim() || direction == null) return raw;
    const value = Number(raw);
    if (!(value > 0)) return raw;
    const distPct = Math.abs(signedPctFromStop(value, oldAnchor));
    const long = direction === 'long';
    const belowSide = kind === 'stop' ? long : !long;
    return toInputPrice(stopFromSignedPct(belowSide ? distPct : -distPct, newEntry));
  };

  return { entry: nextEntry, stop: moveLevel('stop', prev.stop), take: moveLevel('take', prev.take) };
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
