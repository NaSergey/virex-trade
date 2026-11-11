import type { Dir, FeatureKey, Features } from './report.types';
import { closeMs, lowerBound, Series } from './series';
import { confirmAfter, Scan } from './events';

export const FEATURE_KEYS: FeatureKey[] = [
  'session',
  'weekend',
  'daily',
  'vol',
  'stopAtr',
  'pierce',
];

/** Тейки в R от входа, равными долями; после первого стоп идёт в безубыток, дальше — за тейками. */
export const TAKES_R = [1, 3];
/** Ближайший нетронутый свинг 1H по ходу сделки должен быть не ближе стольких R от входа. */
export const CLEAR_R = 2;
/** Диапазон для положения входа — столько последних закрытых 4H-свечей. */
export const RANGE_BARS = 30;

export interface Setup {
  /** `${свеча свипа 1H}:${сторона}`. */
  id: string;
  dir: Dir;
  /** Индексы — в ряду 15m: сделка исполняется по нему. */
  sweepI: number;
  fvgI: number;
  bosI: number;
  /** Последняя свеча 15m часа, на закрытии которого сетап готов: лимит стоит со следующей. */
  e: number;
  obI: number;
  level: number;
  /** Верх часового ордерблока; низ — стоп. */
  blockTop: number;
  /** Диапазон 4H на момент решения. */
  rangeLo: number;
  rangeHi: number;
  /** ATR(14) закрытой 4H-свечи на момент решения. */
  atr4: number;
  /** Уровни входа: один лимит на границе блока. */
  entries: number[];
  stop: number;
  target: number;
  /** Тейки по возрастанию дистанции; последний — цель. */
  takes: number[];
  /** Стоп за тейками: после первого — в безубыток, после следующего — на цену предыдущего. */
  trail: boolean;
  /** Первый уровень исполняется по рынку на открытии следующей свечи. */
  market?: boolean;
  plannedR: number;
  features: Features;
}

/** Всё, что сетапу нужно знать на закрытии каждой свечи 1H. */
export interface SetupContext {
  /** Тренд 4H: 1, −1, 0. */
  htf: Int8Array;
  /** Дневная структура — признак обучения, не фильтр. */
  daily: Int8Array;
  atr: Float64Array;
  scan: Scan;
  h4: Series;
  /** ATR(14) ряда 4H. */
  atr4: Float64Array;
}

const OB_LOOKBACK = 5;
const VOL_WINDOW_MS = 90 * 86_400_000;

export function sessionOf(ms: number): string {
  const h = new Date(ms).getUTCHours();
  return h < 8 ? 'asia' : h < 14 ? 'london' : h < 21 ? 'ny' : 'night';
}

/** Доля значений ATR/цена за 90 дней до свечи, которые ниже текущего. */
function volatilityRanker(s: Series, a: Float64Array): (e: number) => number {
  const memo = new Map<number, number>();
  return (e) => {
    const hit = memo.get(e);
    if (hit !== undefined) return hit;
    const cur = a[e] / s.c[e];
    const from = lowerBound(s.t, s.t[e] - VOL_WINDOW_MS);
    let below = 0;
    let cnt = 0;
    for (let k = from; k < e; k++) {
      const v = a[k] / s.c[k];
      if (!Number.isFinite(v)) continue;
      cnt++;
      if (v < cur) below++;
    }
    const rank = cnt ? below / cnt : 0.5;
    memo.set(e, rank);
    return rank;
  };
}

interface FeatureInput {
  at: number;
  dir: Dir;
  daily: number;
  volRank: number;
  stopAtr: number;
  pierce: number;
}

function featuresOf(x: FeatureInput): Features {
  const day = new Date(x.at).getUTCDay();
  return {
    session: sessionOf(x.at),
    weekend: day === 0 || day === 6 ? 'yes' : 'no',
    daily: x.daily === -x.dir ? 'against' : 'with',
    vol: x.volRank < 1 / 3 ? 'low' : x.volRank < 2 / 3 ? 'mid' : 'high',
    stopAtr: x.stopAtr < 0.5 ? '<0.5' : x.stopAtr <= 1.5 ? '0.5-1.5' : '>1.5',
    pierce: x.pierce < 0.25 ? '<0.25' : '>=0.25',
  };
}

const H4_MS = 240 * 60_000;

/** Границы диапазона из RANGE_BARS закрытых 4H-свечей по свечу i4; null — столько ещё нет. */
function rangeAt(h4: Series, i4: number): { lo: number; hi: number } | null {
  if (i4 + 1 < RANGE_BARS) return null;
  let lo = Infinity;
  let hi = -Infinity;
  for (let k = i4 - RANGE_BARS + 1; k <= i4; k++) {
    lo = Math.min(lo, h4.l[k]);
    hi = Math.max(hi, h4.h[k]);
  }
  return hi > lo ? { lo, hi } : null;
}

/**
 * Сетапы стратегии, основной таймфрейм — 1H: контекст 4H → свип, FVG и слом в окне,
 * ордерблок и стоп → лимит на границе блока, тейки на TAKES_R со стопом за ними.
 * Отбор: положение входа в диапазоне 4H и свободный ход CLEAR_R до ближайшего свинга.
 * Решение — на закрытии часовой свечи, где сетап сложился; будущих свечей оно не видит.
 * Ряд 15m нужен только исполнению.
 */
export function findSetups(m15: Series, s: Series, ctx: SetupContext): Setup[] {
  const out: Setup[] = [];
  const volRank = volatilityRanker(s, ctx.atr);
  const firstOf = (i: number) => lowerBound(m15.t, s.t[i]);
  const lastOf = (i: number) => lowerBound(m15.t, closeMs(s, i)) - 1;
  for (const sw of ctx.scan.sweeps) {
    const d = sw.dir;
    const conf = confirmAfter(s, sw);
    if (conf.fvg < 0 || conf.bos < 0) continue;
    const e = Math.max(conf.fvg, conf.bos);
    if (ctx.htf[e] !== d) continue;

    // Самая дальняя точка движения [свип, e] — от неё ищется ордерблок.
    let low = sw.i;
    for (let k = sw.i; k <= e; k++) {
      if (d === 1 ? s.l[k] < s.l[low] : s.h[k] > s.h[low]) low = k;
    }
    let obI = -1;
    for (let k = low; k >= Math.max(0, low - OB_LOOKBACK); k--) {
      if (d === 1 ? s.c[k] < s.o[k] : s.c[k] > s.o[k]) {
        obI = k;
        break;
      }
    }
    if (obI < 0) obI = sw.i;
    const top =
      d === 1 ? Math.max(s.o[obI], s.c[obI]) : Math.min(s.o[obI], s.c[obI]);
    let bottom = d === 1 ? Infinity : -Infinity;
    for (let k = obI; k <= e; k++) {
      bottom = d === 1 ? Math.min(bottom, s.l[k]) : Math.max(bottom, s.h[k]);
    }

    const stop = bottom;
    const entry = top;
    const h = d * (entry - stop);
    if (!(h > 0)) continue;
    if (d * (s.c[e] - top) <= 0) continue; // цена уже в блоке

    // Препятствие — ближайший нетронутый свинг 1H по ходу сделки, известный на решении.
    const near = d === 1 ? ctx.scan.nearHigh[e] : ctx.scan.nearLow[e];
    if (Number.isFinite(near) && d * (near - entry) < CLEAR_R * h) continue;

    // 4H — только закрытые свечи на момент решения.
    const i4 = lowerBound(ctx.h4.t, closeMs(s, e) - H4_MS + 1) - 1;
    const atr4 = i4 >= 0 && Number.isFinite(ctx.atr4[i4]) ? ctx.atr4[i4] : null;
    const range = rangeAt(ctx.h4, i4);
    if (!range || atr4 == null) continue;
    const pos = (entry - range.lo) / (range.hi - range.lo);
    if (pos > 1 / 3 && pos < 2 / 3) continue;
    const takes = TAKES_R.map((r) => entry + d * r * h);
    const e15 = lastOf(e);

    out.push({
      id: `${sw.i}:${d}`,
      dir: d,
      sweepI: firstOf(sw.i),
      fvgI: lastOf(conf.fvg),
      bosI: lastOf(conf.bos),
      e: e15,
      obI: firstOf(obI),
      level: sw.level,
      blockTop: top,
      rangeLo: range.lo,
      rangeHi: range.hi,
      atr4,
      entries: [entry],
      stop,
      target: takes[takes.length - 1],
      takes,
      trail: true,
      plannedR: TAKES_R[TAKES_R.length - 1],
      features: featuresOf({
        at: closeMs(s, e),
        dir: d,
        daily: ctx.daily[e],
        volRank: volRank(e),
        stopAtr: h / ctx.atr[e],
        pierce: sw.pierceAtr,
      }),
    });
  }
  return out;
}
