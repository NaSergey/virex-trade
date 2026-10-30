import type { Dir } from './report.types';
import type { Series, Swing } from './series';

export interface Sweep {
  i: number;
  /** Куда ждём разворот: 1 — сняты лоу (ждём рост), −1 — сняты хаи. */
  dir: Dir;
  /** Снятый уровень — самый дальний из проколотых. */
  level: number;
  /** Экстремум свечи свипа: лоу для dir 1, хай для −1. */
  extreme: number;
  /** Насколько тень ушла за уровень, в ATR свечи свипа. */
  pierceAtr: number;
  /**
   * Последний подтверждённый свинг по другую сторону: хай для dir 1 (закрытие
   * выше него — слом структуры), лоу для −1. NaN — свингов ещё не было.
   */
  ref: number;
}

export interface Break {
  i: number;
  /** Направление пробоя: −1 — закрылись под лоу, 1 — над хаем. */
  dir: Dir;
  level: number;
  depthAtr: number;
}

export interface Scan {
  sweeps: Sweep[];
  breaks: Break[];
  /** После свечи i — ближайший нетронутый свинг-хай выше цены (NaN — нет). */
  nearHigh: Float64Array;
  /** После свечи i — ближайший нетронутый свинг-лоу ниже цены (NaN — нет). */
  nearLow: Float64Array;
}

/** Окно «сразу после свипа», свечей. */
export const WINDOW = 10;

function insertSorted(arr: number[], x: number, desc: boolean): void {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (desc ? arr[mid] > x : arr[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  arr.splice(lo, 0, x);
}

/**
 * Один проход по ряду: пулы ликвидности (подтверждённые свинги, ещё не снятые
 * ценой), их свипы и пробои. Лоу хранятся по возрастанию, хаи — по убыванию:
 * снимаемые уровни всегда в конце массива, и проход линейный.
 */
export function scanLevels(
  s: Series,
  a: Float64Array,
  sw: { highs: Swing[]; lows: Swing[] },
): Scan {
  const lows: number[] = [];
  const highs: number[] = [];
  const sweeps: Sweep[] = [];
  const breaks: Break[] = [];
  const nearHigh = new Float64Array(s.n).fill(NaN);
  const nearLow = new Float64Array(s.n).fill(NaN);
  let ha = 0;
  let lb = 0;
  let lastHigh = NaN;
  let lastLow = NaN;

  for (let i = 0; i < s.n; i++) {
    const takenLows: number[] = [];
    while (lows.length && lows[lows.length - 1] > s.l[i]) {
      takenLows.push(lows.pop());
    }
    const takenHighs: number[] = [];
    while (highs.length && highs[highs.length - 1] < s.h[i]) {
      takenHighs.push(highs.pop());
    }
    const ai = a[i];
    const measurable = Number.isFinite(ai) && ai > 0;

    if (takenLows.length && measurable) {
      const nearest = takenLows[0];
      const deepest = takenLows[takenLows.length - 1];
      if (s.c[i] > nearest) {
        sweeps.push({
          i,
          dir: 1,
          level: deepest,
          extreme: s.l[i],
          pierceAtr: (deepest - s.l[i]) / ai,
          ref: lastHigh,
        });
      } else {
        breaks.push({
          i,
          dir: -1,
          level: nearest,
          depthAtr: (nearest - s.c[i]) / ai,
        });
      }
    }
    if (takenHighs.length && measurable) {
      const nearest = takenHighs[0];
      const deepest = takenHighs[takenHighs.length - 1];
      if (s.c[i] < nearest) {
        sweeps.push({
          i,
          dir: -1,
          level: deepest,
          extreme: s.h[i],
          pierceAtr: (s.h[i] - deepest) / ai,
          ref: lastLow,
        });
      } else {
        breaks.push({
          i,
          dir: 1,
          level: nearest,
          depthAtr: (s.c[i] - nearest) / ai,
        });
      }
    }

    // Свинги, подтверждённые этой свечой, становятся пулами со следующей.
    while (ha < sw.highs.length && sw.highs[ha].known <= i) {
      lastHigh = sw.highs[ha++].price;
      insertSorted(highs, lastHigh, true);
    }
    while (lb < sw.lows.length && sw.lows[lb].known <= i) {
      lastLow = sw.lows[lb++].price;
      insertSorted(lows, lastLow, false);
    }
    nearHigh[i] = highs.length ? highs[highs.length - 1] : NaN;
    nearLow[i] = lows.length ? lows[lows.length - 1] : NaN;
  }
  return { sweeps, breaks, nearHigh, nearLow };
}

/** Имбаланс на свече k (свечи k−2, k−1, k): бычий — лоу k выше хая k−2. */
export const fvgAt = (s: Series, k: number, dir: Dir): boolean =>
  k >= 2 && (dir === 1 ? s.l[k] > s.h[k - 2] : s.h[k] < s.l[k - 2]);

export interface Confirm {
  /** Свеча, на которой сложился имбаланс; −1 — не было. */
  fvg: number;
  /** Свеча, закрывшаяся за `ref`; −1 — не было. */
  bos: number;
}

/**
 * Имбаланс и слом структуры в окне после свипа. Первая свеча имбаланса — не
 * раньше свипа. Новый экстремум за свипом ломает сетап: поиск на нём обрывается.
 */
export function confirmAfter(s: Series, sw: Sweep, window = WINDOW): Confirm {
  let fvg = -1;
  let bos = -1;
  const end = Math.min(s.n - 1, sw.i + window);
  for (let k = sw.i + 1; k <= end; k++) {
    if (sw.dir === 1 ? s.l[k] < sw.extreme : s.h[k] > sw.extreme) break;
    if (fvg < 0 && k - 2 >= sw.i && fvgAt(s, k, sw.dir)) fvg = k;
    if (
      bos < 0 &&
      Number.isFinite(sw.ref) &&
      (sw.dir === 1 ? s.c[k] > sw.ref : s.c[k] < sw.ref)
    ) {
      bos = k;
    }
  }
  return { fvg, bos };
}
