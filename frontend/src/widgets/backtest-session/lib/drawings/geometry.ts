import { indexAtOrAfter } from '../motion';
import type { DPoint, Drawing, DrawingKind } from './types';

/** Сколько кликов ставит фигуру. `drag` — кисть: рисуется, пока указатель прижат. */
export function placement(kind: DrawingKind): 1 | 2 | 'drag' {
  switch (kind) {
    case 'hline':
    case 'vline':
    case 'arrowUp':
    case 'arrowDown':
    case 'long':
    case 'short':
      return 1;
    case 'brush':
      return 'drag';
    default:
      return 2;
  }
}

/**
 * Уровни и цвета — набор TradingView по умолчанию, включая расширения за 1:
 * трейдер узнаёт сетку по цветам, и своя палитра заставила бы переучиваться.
 */
export const FIB_LEVELS = [
  { level: 0, color: '#787b86' },
  { level: 0.236, color: '#f23645' },
  { level: 0.382, color: '#ff9800' },
  { level: 0.5, color: '#4caf50' },
  { level: 0.618, color: '#089981' },
  { level: 0.786, color: '#00bcd4' },
  { level: 1, color: '#787b86' },
  { level: 1.618, color: '#2962ff' },
  { level: 2.618, color: '#f23645' },
  { level: 3.618, color: '#9c27b0' },
  { level: 4.236, color: '#e91e63' },
] as const;

/** Уровни Фибоначчи: 1 — у первой точки, 0 — у второй, как у сетки коррекции в терминалах. */
export function fibLevels(a: DPoint, b: DPoint): { level: number; price: number; color: string }[] {
  return FIB_LEVELS.map(({ level, color }) => ({ level, color, price: b.p + (a.p - b.p) * level }));
}

/**
 * Позиция для сетапа по одному клику: стоп на `riskSpan` от входа, тейк на 2R,
 * правый край на `timeSpan` вперёд. Дальше её правят якорями.
 */
export function makePosition(kind: 'long' | 'short', entry: DPoint, riskSpan: number, timeSpan: number): DPoint[] {
  const sign = kind === 'long' ? 1 : -1;
  const tEnd = entry.t + timeSpan;
  return [entry, { t: tEnd, p: entry.p - sign * riskSpan }, { t: tEnd, p: entry.p + sign * 2 * riskSpan }];
}

/** Проценты до стопа и тейка и R:R. R:R — null, пока стоп стоит на входе. */
export function positionStats(entry: number, stop: number, take: number): { riskPct: number; rewardPct: number; rr: number | null } {
  const risk = Math.abs(entry - stop);
  const reward = Math.abs(take - entry);
  return {
    riskPct: entry !== 0 ? (risk / entry) * 100 : 0,
    rewardPct: entry !== 0 ? (reward / entry) * 100 : 0,
    rr: risk > 0 ? reward / risk : null,
  };
}

/** Линейка: разница цены, процент от первой точки, число свечей и длительность. */
export function rulerStats(a: DPoint, b: DPoint, tfMs: number): { dp: number; pct: number; bars: number; ms: number } {
  const ms = b.t - a.t;
  return {
    dp: b.p - a.p,
    pct: a.p !== 0 ? ((b.p - a.p) / a.p) * 100 : 0,
    bars: tfMs > 0 ? Math.round(ms / tfMs) : 0,
    ms,
  };
}

/**
 * Якоря, за которые фигуру тянут. У позиции — не её точки: вход, стоп и тейк
 * тянутся с левого края, длина — за правый край на уровне входа.
 */
export function anchorsOf(d: Drawing): DPoint[] {
  if (d.kind === 'long' || d.kind === 'short') {
    const [entry, stop, take] = d.points;
    return [entry, { t: entry.t, p: stop.p }, { t: entry.t, p: take.p }, { t: stop.t, p: entry.p }];
  }
  return d.points;
}

/** Фигура с перетащенным якорем `i`. Стоп и тейк позиции не переходят на чужую сторону входа. */
export function moveAnchor(d: Drawing, i: number, pt: DPoint): Drawing {
  if (d.kind === 'long' || d.kind === 'short') {
    const [entry, stop, take] = d.points;
    const long = d.kind === 'long';
    const below = (p: number) => Math.min(p, entry.p);
    const above = (p: number) => Math.max(p, entry.p);
    switch (i) {
      case 0: {
        const t = Math.min(pt.t, stop.t);
        // Вход тянет за собой стоп и тейк, если перешёл за них: иначе зона вывернулась бы.
        const s = long ? Math.min(stop.p, pt.p) : Math.max(stop.p, pt.p);
        const k = long ? Math.max(take.p, pt.p) : Math.min(take.p, pt.p);
        return { ...d, points: [{ t, p: pt.p }, { ...stop, p: s }, { ...take, p: k }] };
      }
      case 1:
        return { ...d, points: [entry, { ...stop, p: long ? below(pt.p) : above(pt.p) }, take] };
      case 2:
        return { ...d, points: [entry, stop, { ...take, p: long ? above(pt.p) : below(pt.p) }] };
      default: {
        const t = Math.max(pt.t, entry.t);
        return { ...d, points: [entry, { ...stop, t }, { ...take, t }] };
      }
    }
  }
  return { ...d, points: d.points.map((q, k) => (k === i ? pt : q)) };
}

export function translate(d: Drawing, dt: number, dp: number): Drawing {
  return { ...d, points: d.points.map((q) => ({ t: q.t + dt, p: q.p + dp })) };
}

/**
 * Индексы точек ломаной, оставшихся после упрощения Рамера–Дугласа–Пекера.
 * Считается в экранных координатах: допуск — пиксели, а не цена и время, у
 * которых разный масштаб.
 */
export function simplifyIdx(xs: number[], ys: number[], eps: number): number[] {
  const n = xs.length;
  if (n <= 2) return xs.map((_, i) => i);
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const dx = xs[b] - xs[a];
    const dy = ys[b] - ys[a];
    const len = Math.hypot(dx, dy);
    let maxD = -1;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = len === 0 ? Math.hypot(xs[i] - xs[a], ys[i] - ys[a]) : Math.abs(dy * xs[i] - dx * ys[i] + xs[b] * ys[a] - ys[b] * xs[a]) / len;
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > eps) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  const out: number[] = [];
  keep.forEach((k, i) => k && out.push(i));
  return out;
}

/**
 * Магнит: цена прилипает к ближайшему из O/H/L/C свечи, если тот ближе
 * `thresholdPx` на экране. `yOf` переводит цену в экранную координату.
 */
export function magnetPrice(
  candle: { o: number; h: number; l: number; c: number } | null,
  price: number,
  yOf: (p: number) => number,
  thresholdPx: number,
): number {
  if (!candle) return price;
  const y = yOf(price);
  let best = price;
  let bestD = thresholdPx;
  for (const v of [candle.o, candle.h, candle.l, candle.c]) {
    const d = Math.abs(yOf(v) - y);
    if (d <= bestD) {
      bestD = d;
      best = v;
    }
  }
  return best;
}

/**
 * Как сыграла позиция-рисунок на показанных свечах: где начинается и где
 * кончается подсветка пройденной части зоны.
 *
 * Вход — отложенный, как лимитный ордер: позиция открывается на первой свече
 * от свечи входа до правого края зоны, чей диапазон дошёл до цены входа
 * (`from`). Не дошла ни одна — позиции не было, `null`: закрашивать нечего,
 * даже если цена всё это время стояла на стороне тейка.
 *
 * Дальше первая свеча, задевшая стоп или тейк, закрывает позицию на этом
 * уровне, и вправо позиция не идёт. Задеты оба в одной свече — стоп, как в
 * бектесте (`checkMinute`): честнее предполагать худшее. Не задето ничего —
 * конец на закрытии последней свечи диапазона.
 *
 * Внутри свечи, где открылась позиция, порядок цены неизвестен. На свече самого
 * входа выход не проверяется: вход ставят на неё «сейчас», и её хвосты были до
 * него. На более поздней свече выход засчитывается, только если точно случился
 * после входа — цена входа лежит между открытием свечи и уровнем выхода.
 */
export function positionOutcome(
  kind: 'long' | 'short',
  points: DPoint[],
  candles: { t: number; o: number; h: number; l: number; c: number }[],
): { from: number; t: number; p: number; result: 'take' | 'stop' | 'open' } | null {
  const [entry, stop, take] = points;
  const long = kind === 'long';
  type Bar = (typeof candles)[number];
  const hitsStop = (c: Bar) => (long ? c.l <= stop.p : c.h >= stop.p);
  const hitsTake = (c: Bar) => (long ? c.h >= take.p : c.l <= take.p);

  let i = indexAtOrAfter(candles, entry.t);
  while (i < candles.length && candles[i].t <= stop.t && !(candles[i].l <= entry.p && candles[i].h >= entry.p)) i++;
  if (i >= candles.length || candles[i].t > stop.t) return null;
  const fill = candles[i];
  const from = fill.t;

  if (fill.t > entry.t) {
    const afterEntry = (level: number) => Math.min(fill.o, level) <= entry.p && entry.p <= Math.max(fill.o, level);
    if (afterEntry(stop.p) && hitsStop(fill)) return { from, t: fill.t, p: stop.p, result: 'stop' };
    if (afterEntry(take.p) && hitsTake(fill)) return { from, t: fill.t, p: take.p, result: 'take' };
  }

  let last = fill;
  for (i++; i < candles.length && candles[i].t <= stop.t; i++) {
    const c = candles[i];
    if (hitsStop(c)) return { from, t: c.t, p: stop.p, result: 'stop' };
    if (hitsTake(c)) return { from, t: c.t, p: take.p, result: 'take' };
    last = c;
  }
  return { from, t: last.t, p: last.c, result: 'open' };
}

/** Конец отрезка, продолженного за вторую точку на `reach` единиц холста — дальше обрезает clipPath. */
export function extend(x1: number, y1: number, x2: number, y2: number, reach: number): [number, number] {
  const len = Math.hypot(x2 - x1, y2 - y1);
  if (len === 0) return [x2, y2];
  const k = reach / len;
  return [x1 + (x2 - x1) * k, y1 + (y2 - y1) * k];
}
