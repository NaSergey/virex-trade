/**
 * Свечи движка прокрутки. Время сессии идёт по минуткам, а свеча любого
 * таймфрейма — это корзина минуток: так на старшем таймфрейме последняя свеча
 * выглядит ровно такой, какой была в текущую минуту, и будущее не видно ни на
 * одном таймфрейме.
 *
 * «Момент сессии» (cursor) здесь везде — время ЗАКРЫТИЯ последней показанной
 * минутки: минутка с открытием t показана, если t < cursor.
 */

/** Свеча во внутреннем виде. `t` — время ОТКРЫТИЯ, мс. */
export interface Candle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
}

/** Свеча, как её отдаёт `/api/market-data/candles`: время открытия ISO-строкой. */
export interface ApiCandle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export const MINUTE = 60_000;
export const DAY = 86_400_000;
export const TIMEFRAMES = [1, 5, 15, 60, 240, 1440] as const;

export const fromApi = (c: ApiCandle): Candle => ({ t: Date.parse(c.time), o: c.open, h: c.high, l: c.low, c: c.close });

/** Свеча, домноженная на масштаб скрытой цены сессии; scale=1 — тот же объект, без копии. */
export function scaleCandle(c: Candle, scale: number): Candle {
  return scale === 1 ? c : { t: c.t, o: c.o * scale, h: c.h * scale, l: c.l * scale, c: c.c * scale };
}

export const tfMs = (tf: number) => tf * MINUTE;

/** Начало корзины таймфрейма, куда попадает момент t. Корзины выровнены по UTC — как у биржи. */
export const bucketStart = (t: number, tf: number) => Math.floor(t / tfMs(tf)) * tfMs(tf);

/**
 * Корзина, которой принадлежит последняя показанная минутка. Ищем по моменту
 * минус минута: ровно на границе часа последняя показанная минутка — 11:59, и
 * текущая часовая свеча — 11:00, уже целиком закрытая.
 */
export const currentBucket = (cursor: number, tf: number) => bucketStart(cursor - MINUTE, tf);

/** Куда ведёт «Шаг»: до закрытия текущей свечи таймфрейма, а если она уже закрыта — следующей. */
export const nextStop = (cursor: number, tf: number) => bucketStart(cursor, tf) + tfMs(tf);

/** Сворачивает отсортированные минутки с from ≤ t < to в свечи таймфрейма. */
export function aggregate(minutes: Candle[], tf: number, from: number, to: number): Candle[] {
  const out: Candle[] = [];
  let cur: Candle | null = null;
  for (const m of minutes) {
    if (m.t < from) continue;
    if (m.t >= to) break;
    const b = bucketStart(m.t, tf);
    if (!cur || cur.t !== b) {
      if (cur) out.push(cur);
      cur = { t: b, o: m.o, h: m.h, l: m.l, c: m.c };
    } else {
      cur.h = Math.max(cur.h, m.h);
      cur.l = Math.min(cur.l, m.l);
      cur.c = m.c;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/**
 * Что видно на графике в момент cursor: закрытые свечи таймфрейма из API (все
 * раньше anchor — момента, до которого их загрузили) и дальше свечи, собранные
 * из минуток до cursor; последняя из них — недоформированная.
 */
export function visibleCandles(p: { closed: Candle[]; anchor: number; minutes: Candle[]; tf: number; cursor: number }): Candle[] {
  const past = p.closed.filter((c) => c.t < p.anchor);
  return [...past, ...aggregate(p.minutes, p.tf, p.anchor, p.cursor)];
}

/** Цена последней показанной минутки — по ней входят и закрываются вручную. */
export function lastPrice(minutes: Candle[], cursor: number): number | null {
  for (let i = minutes.length - 1; i >= 0; i--) {
    if (minutes[i].t < cursor) return minutes[i].c;
  }
  return null;
}

/** Время закрытия последней загруженной минутки. */
export const loadedUntil = (minutes: Candle[]) => (minutes.length ? minutes[minutes.length - 1].t + MINUTE : null);

/** Номер дня от старта по местному календарю: день старта — первый. Для скрытой даты. */
export function dayNumber(t: number, start: number): number {
  const a = new Date(start);
  a.setHours(0, 0, 0, 0);
  const b = new Date(t);
  b.setHours(0, 0, 0, 0);
  // round, а не floor: переход на летнее время делает сутки на час короче или длиннее.
  return Math.round((b.getTime() - a.getTime()) / DAY) + 1;
}

/** Откуда брать свечи: реальная сессия — хранилище BTC, тренажёр — генератор этой сессии. */
export const candlesPath = (s: { id: string; dataSource: 'real' | 'synthetic' }) =>
  s.dataSource === 'synthetic' ? `/api/backtest/sessions/${s.id}/candles` : '/api/market-data/candles';
