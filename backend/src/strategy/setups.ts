import type { Dir, FeatureKey, Features } from './report.types';
import { closeMs, lowerBound, Series, Swing, swings } from './series';
import { confirmAfter, Scan } from './events';

export const FEATURE_KEYS: FeatureKey[] = [
  'session',
  'weekend',
  'daily',
  'vol',
  'stopAtr',
  'pierce',
];

/** Выход всем объёмом — столько процентов от входа. */
export const TARGET_PCT = 1.5;
/** Диапазон для положения входа — столько последних закрытых 4H-свечей. */
export const RANGE_BARS = 30;

/** Сколько свечей 15m сетап ждёт возврата в блок и слома: 48 часов. */
export const CONFIRM_LIFE = 192;

export interface Setup {
  /** `${свеча свипа 1H}:${сторона}`. */
  id: string;
  dir: Dir;
  /** Индексы — в ряду 15m: сделка исполняется по нему. */
  sweepI: number;
  fvgI: number;
  bosI: number;
  /** Свеча 15m со сломом: первый вход — по открытию следующей. */
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
  /** Уровни входа: один, по рынку. */
  entries: number[];
  stop: number;
  target: number;
  /** Тейки: один, на цели. */
  takes: number[];
  /** Стоп за тейками и снятие входа после первого тейка; при одном тейке сделка им и кончается. */
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
 * Подтверждение входа: цена вернулась в часовой блок, затем свеча 15m закрылась за
 * последним свингом 15m, известным на момент касания. Пробой стопа раньше слома или
 * истечение срока — сделки нет; −1. Часовой сетап этим не меняется: стоп и цель от него.
 */
function confirmOn15m(
  m15: Series,
  list: Swing[],
  from: number,
  d: Dir,
  top: number,
  stop: number,
): number {
  let ref = NaN;
  const end = Math.min(m15.n - 1, from + CONFIRM_LIFE);
  for (let j = from + 1; j <= end; j++) {
    if (d === 1 ? m15.l[j] <= stop : m15.h[j] >= stop) return -1;
    if (Number.isNaN(ref)) {
      if (d === 1 ? m15.l[j] > top : m15.h[j] < top) continue;
      let lo = 0;
      let hi = list.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (list[mid].known <= j) lo = mid + 1;
        else hi = mid;
      }
      if (!lo) return -1;
      ref = list[lo - 1].price;
      continue;
    }
    if (d === 1 ? m15.c[j] > ref : m15.c[j] < ref) return j;
  }
  return -1;
}

/**
 * Сетапы стратегии: контекст 4H → на 1H свип, FVG и слом в окне, ордерблок и стоп →
 * на 15m возврат в блок и слом, от него один вход и выход на +TARGET_PCT %; на 4H положение
 * входа. Решение — на закрытии свечи слома 15m; будущих свечей оно не видит.
 */
export function findSetups(m15: Series, s: Series, ctx: SetupContext): Setup[] {
  const out: Setup[] = [];
  const volRank = volatilityRanker(s, ctx.atr);
  const firstOf = (i: number) => lowerBound(m15.t, s.t[i]);
  const lastOf = (i: number) => lowerBound(m15.t, closeMs(s, i)) - 1;
  const sw15 = swings(m15);
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

    const list = d === 1 ? sw15.highs : sw15.lows;
    const e15 = confirmOn15m(m15, list, lastOf(e), d, top, stop);
    if (e15 < 0) continue;
    const entry = m15.c[e15];
    const h = d * (entry - stop);
    if (!(h > 0)) continue;

    // 4H — только закрытые свечи на момент решения.
    const i4 = lowerBound(ctx.h4.t, closeMs(m15, e15) - H4_MS + 1) - 1;
    const atr4 = i4 >= 0 && Number.isFinite(ctx.atr4[i4]) ? ctx.atr4[i4] : null;
    const range = rangeAt(ctx.h4, i4);
    if (!range || atr4 == null) continue;
    const pos = (entry - range.lo) / (range.hi - range.lo);
    if (pos > 1 / 3 && pos < 2 / 3) continue;
    const move = (TARGET_PCT / 100) * Math.abs(entry);
    const target = entry + d * move;
    const plannedR = move / h;

    out.push({
      id: `${sw.i}:${d}`,
      dir: d,
      sweepI: firstOf(sw.i),
      fvgI: lastOf(conf.fvg),
      bosI: e15,
      e: e15,
      obI: firstOf(obI),
      level: sw.level,
      blockTop: top,
      rangeLo: range.lo,
      rangeHi: range.hi,
      atr4,
      entries: [entry],
      stop,
      target,
      takes: [target],
      trail: true,
      market: true,
      plannedR,
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
