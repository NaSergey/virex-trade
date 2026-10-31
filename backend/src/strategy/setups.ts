import type { Dir, FeatureKey, Features } from './report.types';
import { closeMs, lowerBound, Series } from './series';
import { confirmAfter, fvgAt, Scan } from './events';

export const FEATURE_KEYS: FeatureKey[] = [
  'session',
  'weekend',
  'daily',
  'vol',
  'stopAtr',
  'plannedR',
  'pierce',
];

/** План сделки — от первого ордера сетки, строго 3–5R. */
export const MIN_R = 3;
export const MAX_R = 5;
/** Уровни сетки входа — доли расстояния от первого ордера до стопа. */
export const GRID_STEPS = [0, 0.25, 0.5, 0.75];
/** Тейки — доли пути от первого ордера до цели. */
export const TAKE_STEPS = [1 / 3, 2 / 3, 1];

export interface Setup {
  /** `${свеча свипа 1H}:${сторона}`. */
  id: string;
  dir: Dir;
  /** Индексы — в ряду 15m: сделка исполняется по нему. */
  sweepI: number;
  fvgI: number;
  bosI: number;
  /** Последняя свеча 15m часа подтверждения: на её закрытии выставляется сетка. */
  e: number;
  obI: number;
  level: number;
  /** Уровни входа, от первого ордера к стопу. */
  entries: number[];
  stop: number;
  /** Последний тейк. */
  target: number;
  takes: number[];
  /** Стоп за тейками и снятие входа после первого тейка. */
  trail: boolean;
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
  plannedR: number;
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
    plannedR: x.plannedR < 4 ? '3-4' : '4-5',
    pierce: x.pierce < 0.25 ? '<0.25' : '>=0.25',
  };
}

/**
 * Подтверждение входа: имбаланс 15m в сторону сделки внутри часового ордерблока
 * [stop, top]. Из нескольких — тот, чей ближний край цена встретит первым на
 * откате. −1 — такого нет, и сделки нет.
 */
function entryGap(
  m15: Series,
  from: number,
  to: number,
  d: Dir,
  top: number,
  stop: number,
): number {
  const nearOf = (k: number) => (d === 1 ? m15.l[k] : m15.h[k]);
  let best = -1;
  for (let k = from + 2; k <= to; k++) {
    if (!fvgAt(m15, k, d)) continue;
    const far = d === 1 ? m15.h[k - 2] : m15.l[k - 2];
    if (d * (top - nearOf(k)) < 0 || d * (far - stop) < 0) continue;
    if (best < 0 || d * (nearOf(k) - nearOf(best)) > 0) best = k;
  }
  return best;
}

/**
 * Сетапы стратегии: контекст 4H → на 1H свип, FVG и слом в окне, ордерблок и
 * ликвидность → на 15m имбаланс внутри блока, от него сетка входа, стоп, цель
 * 3–5R и сетка тейков. Всё решается на закрытии часа подтверждения `e`.
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
    if (!(d * (top - stop) > 0)) continue;
    if (d * (s.c[e] - top) <= 0) continue; // цена уже в блоке

    const e15 = lastOf(e);
    const gap = entryGap(m15, firstOf(obI), e15, d, top, stop);
    if (gap < 0) continue;
    const entry = d === 1 ? m15.l[gap] : m15.h[gap];
    const h = d * (entry - stop);
    if (!(h > 0)) continue;

    const liq = d === 1 ? ctx.scan.nearHigh[e] : ctx.scan.nearLow[e];
    if (!Number.isFinite(liq)) continue;
    const rLiq = (d * (liq - entry)) / h;
    if (rLiq < MIN_R) continue; // ликвидность ближе 3R
    const plannedR = Math.min(rLiq, MAX_R);
    const target = entry + d * plannedR * h;

    out.push({
      id: `${sw.i}:${d}`,
      dir: d,
      sweepI: firstOf(sw.i),
      fvgI: gap,
      bosI: lastOf(conf.bos),
      e: e15,
      obI: firstOf(obI),
      level: sw.level,
      entries: GRID_STEPS.map((k) => entry - d * k * h),
      stop,
      target,
      takes: TAKE_STEPS.map((k) => entry + (target - entry) * k),
      trail: true,
      plannedR,
      features: featuresOf({
        at: closeMs(s, e),
        dir: d,
        daily: ctx.daily[e],
        volRank: volRank(e),
        stopAtr: h / ctx.atr[e],
        plannedR,
        pierce: sw.pierceAtr,
      }),
    });
  }
  return out;
}
