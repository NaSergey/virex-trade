import { FIB_LEVELS, priceOnLine } from './geometry';
import type { DPoint } from './types';

/**
 * Геометрия новых инструментов (спека 2026-11-17): чистые функции от точек
 * фигуры, в координатах графика (время, цена). Отрисовка — `components/drawings/shapes/`.
 */

export interface FibLevel {
  level: number;
  price: number;
  color: string;
}

/** Расширение Фибоначчи по тренду: уровни от C на долях хода A→B — набор `FIB_LEVELS`. */
export function fibExtLevels(a: DPoint, b: DPoint, c: DPoint): FibLevel[] {
  return FIB_LEVELS.map(({ level, color }) => ({ level, color, price: c.p + (b.p - a.p) * level }));
}

/** Доли ширины канала Фибоначчи. */
export const FIB_CHANNEL_KS = [0, 0.382, 0.5, 0.618, 1, 1.618] as const;

/** Цвет доли из набора Фибоначчи — тот же, что у сетки коррекции. */
export const fibColor = (k: number): string => FIB_LEVELS.find((l) => l.level === k)?.color ?? '#787b86';

/**
 * Канал Фибоначчи: линии, параллельные AB, на долях ширины. Ширина — расстояние по
 * цене от линии AB до третьей точки в её же момент.
 */
export function fibChannelLines(a: DPoint, b: DPoint, c: DPoint): { k: number; from: DPoint; to: DPoint }[] {
  const width = c.p - priceOnLine(a, b, c.t);
  return FIB_CHANNEL_KS.map((k) => ({ k, from: { t: a.t, p: a.p + width * k }, to: { t: b.t, p: b.p + width * k } }));
}

/** Доли веера Фибоначчи. */
export const FIB_FAN_KS = [0.382, 0.5, 0.618, 1] as const;

/** Веер Фибоначчи: лучи из A через точки на вертикали B, на долях хода цены A→B. */
export function fibFanTargets(a: DPoint, b: DPoint): { k: number; to: DPoint }[] {
  return FIB_FAN_KS.map((k) => ({ k, to: { t: b.t, p: a.p + (b.p - a.p) * k } }));
}

/** Шаги временных зон Фибоначчи — сам ряд. */
export const FIB_TIME_NS = [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89] as const;

/** Временные зоны: моменты `A + (B − A) × n`. */
export function fibTimeTs(a: DPoint, b: DPoint): { n: number; t: number }[] {
  return FIB_TIME_NS.map((n) => ({ n, t: a.t + (b.t - a.t) * n }));
}

/** Углы веера Ганна — цена × время относительно угла 1×1 (A→B). */
export const GANN_ANGLES = [
  [1, 8],
  [1, 4],
  [1, 3],
  [1, 2],
  [1, 1],
  [2, 1],
  [3, 1],
  [4, 1],
  [8, 1],
] as const;

/** Веер Ганна: лучи из A через точки на вертикали B, наклон — доля угла 1×1. */
export function gannTargets(a: DPoint, b: DPoint): { label: string; to: DPoint }[] {
  return GANN_ANGLES.map(([p, t]) => ({ label: `${p}×${t}`, to: { t: b.t, p: a.p + ((b.p - a.p) * p) / t } }));
}

/**
 * Вилы Эндрюса: срединная линия — от P0 через середину P1P2, две крайние —
 * параллельно ей через P1 и P2. Каждая — две точки направления.
 */
export function pitchforkLines(p0: DPoint, p1: DPoint, p2: DPoint): { median: [DPoint, DPoint]; upper: [DPoint, DPoint]; lower: [DPoint, DPoint] } {
  const mid = { t: (p1.t + p2.t) / 2, p: (p1.p + p2.p) / 2 };
  const dt = mid.t - p0.t;
  const dp = mid.p - p0.p;
  const shift = (q: DPoint): [DPoint, DPoint] => [q, { t: q.t + dt, p: q.p + dp }];
  return { median: [p0, mid], upper: shift(p1), lower: shift(p2) };
}

/**
 * Контрольная точка квадратичной кривой Безье из A в B, проходящей через C в
 * середине хода (s = ½): `2C − (A + B) / 2`. Человек ставит точку на самой кривой,
 * а не невидимую контрольную.
 */
export function quadThrough(a: DPoint, b: DPoint, c: DPoint): DPoint {
  return { t: 2 * c.t - (a.t + b.t) / 2, p: 2 * c.p - (a.p + b.p) / 2 };
}

/** Отношения ходов XABCD: XB = AB/XA, AC = BC/AB, BD = CD/BC, XD = AD/XA. Деление на ноль — null. */
export function xabcdRatios(x: DPoint, a: DPoint, b: DPoint, c: DPoint, d: DPoint): { xb: number | null; ac: number | null; bd: number | null; xd: number | null } {
  const r = (num: number, den: number) => (den === 0 ? null : Math.abs(num) / Math.abs(den));
  return {
    xb: r(b.p - a.p, a.p - x.p),
    ac: r(c.p - b.p, b.p - a.p),
    bd: r(d.p - c.p, c.p - b.p),
    xd: r(d.p - a.p, a.p - x.p),
  };
}

/**
 * Линия шеи «головы и плеч» — через две шеи (точки 3 и 5 из семи), протянутая от
 * левого основания до правого.
 */
export function necklineOf(pts: readonly DPoint[]): [DPoint, DPoint] {
  const [l0, , n1, , n2, , r0] = pts;
  return [
    { t: l0.t, p: priceOnLine(n1, n2, l0.t) },
    { t: r0.t, p: priceOnLine(n1, n2, r0.t) },
  ];
}

/** Циклические линии: от левой из двух точек вправо с шагом |B − A| до `tEnd`, не больше `max`. */
export function cycleTs(a: DPoint, b: DPoint, tEnd: number, max = 200): number[] {
  const step = Math.abs(b.t - a.t);
  const start = Math.min(a.t, b.t);
  if (step === 0) return [start];
  const out: number[] = [];
  for (let t = start; t <= tEnd && out.length < max; t += step) out.push(t);
  return out;
}
