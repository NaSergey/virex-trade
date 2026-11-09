/**
 * Арифметика бектеста без Nest и без базы: размер позиции, результат сделки,
 * окно точки старта, масштаб скрытой цены и итоги. Всё, что проверяется
 * числом, живёт здесь; сервис только достаёт данные и сохраняет.
 */

/** Ставка тейкера с каждой стороны — та же, что в демо (`scripts/seed-demo.ts`, TAKER_FEE). */
export const FEE_RATE = 0.00055;

export const MINUTE_MS = 60_000;
export const DAY_MS = 86_400_000;
/** Сколько дневной истории нужно до старта, чтобы на дневках было что анализировать. */
export const HISTORY_BEFORE_MS = 200 * DAY_MS;
/** Минутки нужны с начала суток старта: из них собирается недоформированная дневка. */
export const MINUTES_BEFORE_MS = DAY_MS;
/** Сколько истории должно остаться после старта, чтобы было куда крутить. */
export const FUTURE_AFTER_MS = 30 * DAY_MS;

/** Скрытая цена: стартовая цена показывается случайным числом из этого диапазона. */
export const SCALED_MIN = 100;
export const SCALED_MAX = 1000;

export type Direction = 'long' | 'short';
export type ExitReason = 'stop' | 'take' | 'manual' | 'finish' | 'limit' | 'liquidation';

/**
 * Ликвидация — упрощённо, без поддерживающей маржи и комиссий: long ниже входа, short выше,
 * на 1/плечо. Та же формула, что у фронта (`liquidationPrice` в `lib/money.ts`): по ней
 * линия на графике и исполнение в движке эфира.
 */
export function liquidationPrice(direction: Direction, entry: number, leverage: number): number {
  return direction === 'long' ? entry * (1 - 1 / leverage) : entry * (1 + 1 / leverage);
}

/**
 * Самый маленький ордер на вход, USDT: `minNotionalValue` перпов Bybit, у всех
 * монет продукта один (сверено 2026-11-10). Копия — `MIN_ORDER_USDT` во фронте
 * (`lib/money.ts`).
 */
export const MIN_ORDER_USDT = 5;

/** Знаков после запятой у шага лота: 0.001 → 3, 1 → 0. */
const lotDecimals = (step: number) => {
  const s = String(step);
  const dot = s.indexOf('.');
  return dot < 0 ? 0 : s.length - dot - 1;
};

/**
 * Объём вниз до шага лота монеты (`qtyStepOf`), как у биржи: 0.00347 BTC
 * ордером не встанет, встанет 0.003. Вниз, а не к ближайшему: вверх — больше
 * выбранного риска. Допуск — на двоичную дробь: объём, собранный обратно из
 * риска ровно этого объёма, бывает 0.0029999999, и без допуска три шага стали
 * бы двумя. Шаг 0 — без округления.
 */
export function floorToLot(qty: number, step: number): number {
  if (!(step > 0)) return qty;
  if (!(qty > 0)) return 0;
  return Number((Math.floor(qty / step + 1e-6) * step).toFixed(lotDecimals(step)));
}

/**
 * Ордер, которого биржа не примет: объём меньше шага лота (у всех монет списка
 * шаг и есть минимальный ордер) или на сумму меньше `MIN_ORDER_USDT`.
 */
export const belowMinOrder = (qty: number, price: number, step: number) =>
  (step > 0 && qty < step - 1e-12) || !(qty > 0) || qty * price < MIN_ORDER_USDT;

/**
 * Объём от риска: `риск / |вход − стоп|`, вниз до шага лота. Риск — того
 * объёма, что встал, а не запрошенный: стоп и есть −1R, как у ордера на бирже.
 */
export function positionSize(balance: number, riskPct: number, entry: number, stop: number, step = 0) {
  const planned = (balance * riskPct) / 100;
  const dist = Math.abs(entry - stop);
  if (!(step > 0)) return { riskUsdt: planned, qty: planned / dist };
  const qty = floorToLot(planned / dist, step);
  return { riskUsdt: qty * dist, qty };
}

export function tradeResult(t: {
  direction: Direction;
  entryPrice: number;
  exitPrice: number;
  qty: number;
  riskUsdt: number;
}) {
  const sign = t.direction === 'long' ? 1 : -1;
  const fee = (t.entryPrice + t.exitPrice) * t.qty * FEE_RATE;
  const pnl = sign * (t.exitPrice - t.entryPrice) * t.qty - fee;
  return { fee, pnl, r: pnl / t.riskUsdt };
}

export const stopOnRightSide = (d: Direction, entry: number, stop: number) =>
  d === 'long' ? stop < entry : stop > entry;

export const takeOnRightSide = (d: Direction, entry: number, take: number) =>
  d === 'long' ? take > entry : take < entry;

export interface CoverageSpan {
  from: Date | null;
  to: Date | null;
}

export interface StartWindow {
  from: number;
  to: number;
}

/**
 * Где можно ставить точку старта: после 200 дней дневной истории и суток
 * минутной, и не позже чем за 30 дней до конца минуток. null — такого окна нет
 * (минутки не докачаны), и сессию начинать не на чем.
 */
export function startWindow(daily?: CoverageSpan, minute?: CoverageSpan): StartWindow | null {
  if (!daily?.from || !minute?.from || !minute.to) return null;
  const from = Math.max(daily.from.getTime() + HISTORY_BEFORE_MS, minute.from.getTime() + MINUTES_BEFORE_MS);
  const to = minute.to.getTime() - FUTURE_AFTER_MS;
  return from <= to ? { from, to } : null;
}

/** Случайная точка в окне, выровненная на минуту: момент сессии — всегда граница минутки. */
export function pickStart(win: StartWindow, rnd: () => number): number {
  const t = Math.floor((win.from + rnd() * (win.to - win.from)) / MINUTE_MS) * MINUTE_MS;
  return Math.min(win.to, Math.max(win.from, t));
}

/** Коэффициент, при котором стартовая цена становится случайным числом от 100 до 1000. */
export function pickPriceScale(startPrice: number, rnd: () => number): number {
  return (SCALED_MIN + rnd() * (SCALED_MAX - SCALED_MIN)) / startPrice;
}

export interface Summary {
  trades: number;
  wins: number;
  winRate: number; // 0..100
  totalR: number;
  avgR: number;
  pnl: number;
}

/** Числа закрытой сделки для итогов; у закрытой pnl и r всегда есть. */
export const closedNumbers = (t: { pnl: number | null; r: number | null }) => ({ pnl: t.pnl ?? 0, r: t.r ?? 0 });

export function summarize(rows: { pnl: number; r: number }[]): Summary {
  const trades = rows.length;
  const wins = rows.filter((x) => x.pnl > 0).length;
  const totalR = rows.reduce((s, x) => s + x.r, 0);
  const pnl = rows.reduce((s, x) => s + x.pnl, 0);
  return {
    trades,
    wins,
    winRate: trades ? (wins / trades) * 100 : 0,
    totalR,
    avgR: trades ? totalR / trades : 0,
    pnl,
  };
}

/**
 * Средний R прибыльных и средний |R| убыточных — из них терминал выводит
 * винрейт безубыточности тега (спека 2026-10-25). Ноль — таких сделок нет.
 */
export function winLossR(rows: { pnl: number; r: number }[]): { avgWinR: number; avgLossR: number } {
  const mean = (xs: { r: number }[]) => (xs.length ? xs.reduce((s, x) => s + Math.abs(x.r), 0) / xs.length : 0);
  return { avgWinR: mean(rows.filter((x) => x.pnl > 0)), avgLossR: mean(rows.filter((x) => x.pnl < 0)) };
}

/** Наибольшая просадка депозита от пика, в процентах; pnls — в порядке закрытия сделок. */
export function maxDrawdownPct(startBalance: number, pnls: number[]): number {
  let balance = startBalance;
  let peak = startBalance;
  let dd = 0;
  for (const p of pnls) {
    balance += p;
    peak = Math.max(peak, balance);
    dd = Math.max(dd, ((peak - balance) / peak) * 100);
  }
  return dd;
}

/** Средневзвешенная цена входа после добора тем же qty*entry-весом с обеих сторон. */
export function averageIn(qtyA: number, entryA: number, qtyB: number, entryB: number): number {
  return (qtyA * entryA + qtyB * entryB) / (qtyA + qtyB);
}
