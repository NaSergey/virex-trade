/**
 * Ряд свечей одного таймфрейма в типизированных массивах: на 15m с 2018 года
 * это ~300 тыс. свечей, и массив объектов стоил бы worker в разы больше памяти.
 */
export interface Series {
  /** Минут в свече. */
  tf: number;
  n: number;
  /** Время открытия, мс. */
  t: Float64Array;
  o: Float64Array;
  h: Float64Array;
  l: Float64Array;
  c: Float64Array;
}

export interface CandleRow {
  time: Date | number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export function toSeries(tf: number, rows: CandleRow[]): Series {
  const n = rows.length;
  const s: Series = {
    tf,
    n,
    t: new Float64Array(n),
    o: new Float64Array(n),
    h: new Float64Array(n),
    l: new Float64Array(n),
    c: new Float64Array(n),
  };
  for (let i = 0; i < n; i++) {
    const r = rows[i];
    s.t[i] = typeof r.time === 'number' ? r.time : r.time.getTime();
    s.o[i] = r.open;
    s.h[i] = r.high;
    s.l[i] = r.low;
    s.c[i] = r.close;
  }
  return s;
}

/** Время закрытия свечи i — момент, когда о ней известно всё. */
export const closeMs = (s: Series, i: number): number => s.t[i] + s.tf * 60_000;

/** Первый индекс, где arr[i] ≥ x (arr по возрастанию). */
export function lowerBound(arr: Float64Array, x: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** ATR по Уайлдеру; до набора периода — NaN. */
export function atr(s: Series, period = 14): Float64Array {
  const out = new Float64Array(s.n).fill(NaN);
  let sum = 0;
  let prev = NaN;
  for (let i = 0; i < s.n; i++) {
    const tr =
      i === 0
        ? s.h[i] - s.l[i]
        : Math.max(
            s.h[i] - s.l[i],
            Math.abs(s.h[i] - s.c[i - 1]),
            Math.abs(s.l[i] - s.c[i - 1]),
          );
    if (i < period) {
      sum += tr;
      if (i === period - 1) {
        prev = sum / period;
        out[i] = prev;
      }
    } else {
      prev = (prev * (period - 1) + tr) / period;
      out[i] = prev;
    }
  }
  return out;
}

/** Свинг — пятисвечный фрактал; known — свеча, на закрытии которой он подтверждён. */
export interface Swing {
  i: number;
  price: number;
  known: number;
}

/** Свинг-хай: хай строго выше двух свечей слева и двух справа (лоу — зеркально). */
export function swings(s: Series): { highs: Swing[]; lows: Swing[] } {
  const highs: Swing[] = [];
  const lows: Swing[] = [];
  for (let i = 2; i + 2 < s.n; i++) {
    const h = s.h[i];
    if (h > s.h[i - 1] && h > s.h[i - 2] && h > s.h[i + 1] && h > s.h[i + 2]) {
      highs.push({ i, price: h, known: i + 2 });
    }
    const l = s.l[i];
    if (l < s.l[i - 1] && l < s.l[i - 2] && l < s.l[i + 1] && l < s.l[i + 2]) {
      lows.push({ i, price: l, known: i + 2 });
    }
  }
  return { highs, lows };
}

/**
 * Тренд по свинг-структуре на закрытии каждой свечи: 1 — последний слом вверх
 * (закрытие выше последнего подтверждённого непробитого свинг-хая), −1 — вниз,
 * 0 — сломов ещё не было. «Сильный/слабый HL» автора не формализован.
 */
export function structure(
  s: Series,
  sw: { highs: Swing[]; lows: Swing[] } = swings(s),
): Int8Array {
  const out = new Int8Array(s.n);
  let trend = 0;
  let hi = NaN;
  let lo = NaN;
  let a = 0;
  let b = 0;
  for (let i = 0; i < s.n; i++) {
    while (a < sw.highs.length && sw.highs[a].known <= i) {
      hi = sw.highs[a++].price;
    }
    while (b < sw.lows.length && sw.lows[b].known <= i) {
      lo = sw.lows[b++].price;
    }
    if (!Number.isNaN(hi) && s.c[i] > hi) {
      trend = 1;
      hi = NaN;
    }
    if (!Number.isNaN(lo) && s.c[i] < lo) {
      trend = -1;
      lo = NaN;
    }
    out[i] = trend;
  }
  return out;
}

/** Значение старшего ряда на закрытии каждой свечи младшего: последняя старшая, закрытая не позже. */
export function alignToClose(
  s: Series,
  htf: Series,
  values: Int8Array,
): Int8Array {
  const out = new Int8Array(s.n);
  let j = -1;
  for (let i = 0; i < s.n; i++) {
    const at = closeMs(s, i);
    while (j + 1 < htf.n && closeMs(htf, j + 1) <= at) j++;
    out[i] = j >= 0 ? values[j] : 0;
  }
  return out;
}
