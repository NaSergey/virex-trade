/**
 * Чистая арифметика биржевого терминала: объём от риска, шаги лота и цены,
 * режим позиций, перевод строк Bybit в вид терминала.
 *
 * Здесь нет ни сети, ни ключей — это то, что решает, сколько монет уйдёт в
 * настоящий ордер, и проверяется оно тестами, а не биржей.
 */

export type Direction = 'long' | 'short';

/** Один ордер на сторону (one-way) или лонг и шорт раздельно (hedge) — настройка аккаунта на Bybit. */
export type PositionMode = 'oneWay' | 'hedge';

export interface Instrument {
  symbol: string;
  base: string;
  /** Шаг цены и шаг объёма — строками, как их отдаёт биржа: в них же число знаков. */
  tickSize: string;
  qtyStep: string;
  minQty: number;
  maxQty: number;
  /** Потолок объёма рыночного ордера — у биржи он ниже лимитного. */
  maxMarketQty: number;
  /** Наименьшая стоимость ордера в USDT. */
  minNotional: number;
  minLeverage: number;
  maxLeverage: number;
}

export interface TerminalPosition {
  symbol: string;
  direction: Direction;
  size: number;
  entryPrice: number;
  markPrice: number | null;
  positionValue: number | null;
  unrealisedPnl: number | null;
  leverage: number | null;
  liqPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  /** Есть активный план стопа за тейками — ставит `TerminalService.state`, у строки биржи его нет. */
  follow?: boolean;
}

export interface TerminalOrder {
  id: string;
  symbol: string;
  /** Сторона ПОЗИЦИИ, к которой ордер относится: лимит закрытия лонга — `long`, хотя сам он продажа. */
  direction: Direction;
  /** `entry` открывает или доливает позицию, `close` — только уменьшает её (reduce-only). */
  kind: 'entry' | 'close';
  price: number;
  /** Неисполненный остаток. */
  qty: number;
  stopLoss: number | null;
  takeProfit: number | null;
  createdAt: string | null;
}

/** Знаков после запятой в шаге биржи: "0.001" → 3, "1" → 0, "0.10" → 2. */
export function stepDecimals(step: string): number {
  const s = String(step).toLowerCase();
  const exp = s.indexOf('e-');
  if (exp >= 0) return Number(s.slice(exp + 2)) || 0;
  const dot = s.indexOf('.');
  return dot < 0 ? 0 : s.length - dot - 1;
}

/**
 * Объём вниз до шага лота — строкой, которую примет биржа.
 *
 * Вниз, а не к ближайшему: округление вверх ставит на кон больше, чем человек
 * выбрал риском. Поправка 1e-9 — на двоичную дробь: 0.3 / 0.1 в double это
 * 2.9999999999999996, и без неё ровные три шага превратились бы в два.
 */
export function floorToStep(value: number, step: string): string {
  const st = Number(step);
  const decimals = stepDecimals(step);
  if (!(st > 0) || !Number.isFinite(value) || value <= 0) return (0).toFixed(decimals);
  return (Math.floor(value / st + 1e-9) * st).toFixed(decimals);
}

/** Цена к ближайшему шагу цены: жест на графике и ползунок дают произвольные дроби, биржа их отклоняет. */
export function roundToTick(price: number, tick: string): string {
  const st = Number(tick);
  const decimals = stepDecimals(tick);
  if (!(st > 0) || !Number.isFinite(price)) return String(price);
  return (Math.round(price / st) * st).toFixed(decimals);
}

/**
 * Объём от риска: столько монет, чтобы путь от входа до стопа стоил ровно
 * `riskPct` процентов баланса. Та же формула, что в бектесте (`positionSize`),
 * — терминал один, и размер в нём обязан считаться одинаково.
 */
export function qtyByRisk(balance: number, riskPct: number, entry: number, stop: number): number | null {
  const dist = Math.abs(entry - stop);
  if (!(dist > 0) || !(balance > 0) || !(riskPct > 0)) return null;
  return (balance * riskPct) / 100 / dist;
}

export type LevelsError = 'stopSide' | 'takeSide';

/** Стоп и тейк по верные стороны от цены входа: у лонга стоп ниже, тейк выше. */
export function levelsError(
  direction: Direction,
  entry: number,
  stop: number,
  take: number | null,
): LevelsError | null {
  if (direction === 'long' ? stop >= entry : stop <= entry) return 'stopSide';
  if (take != null && (direction === 'long' ? take <= entry : take >= entry)) return 'takeSide';
  return null;
}

/**
 * Режим позиций по строкам `position/list` одного символа: биржа отдаёт их и
 * без открытой позиции — одну с индексом 0 в one-way, две (1 и 2) в hedge.
 * Пустой ответ читается как one-way: индекс 0 биржа в hedge отклонит сама, а
 * выдуманный 1 или 2 в one-way — тоже, так что угадывать здесь нечего.
 */
export function modeOf(rows: readonly { positionIdx?: number | string }[]): PositionMode {
  return rows.some((r) => Number(r.positionIdx) > 0) ? 'hedge' : 'oneWay';
}

/** `positionIdx` нового ордера: 0 в one-way, 1 — лонг и 2 — шорт в hedge. */
export function positionIdxOf(mode: PositionMode, direction: Direction): 0 | 1 | 2 {
  if (mode === 'oneWay') return 0;
  return direction === 'long' ? 1 : 2;
}

/** Сторона ордера Bybit, открывающего позицию этой стороны. */
export const entrySide = (direction: Direction): 'Buy' | 'Sell' => (direction === 'long' ? 'Buy' : 'Sell');

/** Сторона ордера, закрывающего позицию: противоположная. */
export const closeSide = (direction: Direction): 'Buy' | 'Sell' => (direction === 'long' ? 'Sell' : 'Buy');

/** Таймфрейм в минутах → интервал Bybit. Неизвестный — null. */
export function bybitInterval(tf: number): string | null {
  const map: Record<number, string> = { 1: '1', 5: '5', 15: '15', 60: '60', 240: '240', 1440: 'D' };
  return map[tf] ?? null;
}

// Bybit шлёт числа строками, а «нет значения» — пустой строкой или "0".
const num = (v: unknown): number | null => {
  const n = parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : null;
};
const positive = (v: unknown): number | null => {
  const n = num(v);
  return n != null && n > 0 ? n : null;
};
const iso = (v: unknown): string | null => {
  const ms = Number(v);
  return Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : null;
};

/** Строка `position/list` → позиция терминала; пустая (размер 0) — null. */
export function toPosition(row: any): TerminalPosition | null {
  const size = positive(row?.size);
  if (size == null || (row.side !== 'Buy' && row.side !== 'Sell')) return null;
  return {
    symbol: String(row.symbol),
    direction: row.side === 'Buy' ? 'long' : 'short',
    size,
    entryPrice: num(row.avgPrice) ?? 0,
    markPrice: positive(row.markPrice),
    positionValue: positive(row.positionValue),
    unrealisedPnl: num(row.unrealisedPnl),
    leverage: positive(row.leverage),
    liqPrice: positive(row.liqPrice),
    stopLoss: positive(row.stopLoss),
    takeProfit: positive(row.takeProfit),
  };
}

const ACTIVE = new Set(['New', 'PartiallyFilled']);

/**
 * Строка `order/realtime` → ордер терминала, или null для того, что терминал
 * не показывает: рыночные, уже неактивные и условные ордера. Условные — это в
 * первую очередь стоп и тейк позиции (`stopOrderType`), которые терминал и так
 * рисует её уровнями; вторая строка про то же самое читалась бы вторым ордером.
 */
export function toOrder(row: any): TerminalOrder | null {
  if (row?.orderType !== 'Limit' || row.stopOrderType || !ACTIVE.has(row.orderStatus)) return null;
  if (row.side !== 'Buy' && row.side !== 'Sell') return null;
  const price = positive(row.price);
  const qty = positive(row.leavesQty) ?? positive(row.qty);
  if (price == null || qty == null || !row.orderId) return null;
  const close = row.reduceOnly === true || row.reduceOnly === 'true';
  const buy = row.side === 'Buy';
  return {
    id: String(row.orderId),
    symbol: String(row.symbol),
    // Покупка открывает лонг, но закрывает шорт.
    direction: close ? (buy ? 'short' : 'long') : buy ? 'long' : 'short',
    kind: close ? 'close' : 'entry',
    price,
    qty,
    stopLoss: positive(row.stopLoss),
    takeProfit: positive(row.takeProfit),
    createdAt: iso(row.createdTime),
  };
}

/** Строка `instruments-info` → инструмент терминала; не торгуемый USDT-перп — null. */
export function toInstrument(row: any): Instrument | null {
  if (row?.status !== 'Trading' || row.quoteCoin !== 'USDT' || row.contractType !== 'LinearPerpetual') return null;
  const tickSize = String(row.priceFilter?.tickSize ?? '');
  const qtyStep = String(row.lotSizeFilter?.qtyStep ?? '');
  if (!(Number(tickSize) > 0) || !(Number(qtyStep) > 0)) return null;
  const maxQty = positive(row.lotSizeFilter?.maxOrderQty) ?? Number.POSITIVE_INFINITY;
  return {
    symbol: String(row.symbol),
    base: String(row.baseCoin ?? row.symbol),
    tickSize,
    qtyStep,
    minQty: positive(row.lotSizeFilter?.minOrderQty) ?? Number(qtyStep),
    maxQty,
    maxMarketQty: positive(row.lotSizeFilter?.maxMktOrderQty) ?? maxQty,
    minNotional: positive(row.lotSizeFilter?.minNotionalValue) ?? 0,
    minLeverage: positive(row.leverageFilter?.minLeverage) ?? 1,
    maxLeverage: positive(row.leverageFilter?.maxLeverage) ?? 1,
  };
}
