import type { Dir, FeatureKey, Features } from './report.types';
import { closeMs, lowerBound, Series } from './series';
import { confirmAfter, Scan } from './events';

export const FEATURE_KEYS: FeatureKey[] = [
  'session',
  'weekend',
  'daily',
  'vol',
  'stopAtr',
  'plannedR',
  'pierce',
  'deep',
];

export interface Variant {
  id: string;
  label: string;
  /** ТФ сетапа, минут. */
  tf: 15 | 60;
  fvg: boolean;
  bos: boolean;
  context: boolean;
  entry: 'top' | 'mid';
  /** 'liquidity' — ближайший нетронутый свинг; число — фиксированная цель в R. */
  target: 'liquidity' | 2 | 3;
}

export const MAIN: Variant = {
  id: 'main',
  label: 'Основной',
  tf: 15,
  fvg: true,
  bos: true,
  context: true,
  entry: 'top',
  target: 'liquidity',
};

/** Варианты отчёта: каждый отличается от основного одним правилом. */
export const VARIANTS: Variant[] = [
  MAIN,
  { ...MAIN, id: 'sweep', label: 'Только свип', fvg: false, bos: false },
  { ...MAIN, id: 'sweep-fvg', label: 'Свип + FVG', bos: false },
  { ...MAIN, id: 'sweep-bos', label: 'Свип + BOS', fvg: false },
  { ...MAIN, id: 'no-context', label: 'Без контекста 4H', context: false },
  { ...MAIN, id: 'mid', label: 'Вход от 50 % блока', entry: 'mid' },
  { ...MAIN, id: 'r2', label: 'Цель 2R', target: 2 },
  { ...MAIN, id: 'r3', label: 'Цель 3R', target: 3 },
  { ...MAIN, id: 'h1', label: 'ТФ сетапа 1H', tf: 60 },
];

export interface Setup {
  /** `${вариант}:${свеча свипа}` — уникален внутри варианта. */
  id: string;
  dir: Dir;
  sweepI: number;
  /** −1 — вариант условия не требует. */
  fvgI: number;
  bosI: number;
  /** Свеча подтверждения: на её закрытии выставляется лимит. */
  e: number;
  obI: number;
  level: number;
  entry: number;
  stop: number;
  target: number;
  plannedR: number;
  features: Features;
}

/** Всё, что сетапу нужно знать на закрытии каждой свечи своего ряда. */
export interface SetupContext {
  /** Тренд старшего ТФ (4H для 15m, 1D для 1H): 1, −1, 0. */
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
  deep: number;
}

function featuresOf(x: FeatureInput): Features {
  const day = new Date(x.at).getUTCDay();
  return {
    session: sessionOf(x.at),
    weekend: day === 0 || day === 6 ? 'yes' : 'no',
    daily: x.daily === -x.dir ? 'against' : 'with',
    vol: x.volRank < 1 / 3 ? 'low' : x.volRank < 2 / 3 ? 'mid' : 'high',
    stopAtr: x.stopAtr < 0.5 ? '<0.5' : x.stopAtr <= 1.5 ? '0.5-1.5' : '>1.5',
    plannedR: x.plannedR < 2 ? '1-2' : x.plannedR <= 3 ? '2-3' : '>3',
    pierce: x.pierce < 0.25 ? '<0.25' : '>=0.25',
    deep: x.deep < 0.25 ? 'yes' : 'no',
  };
}

/**
 * Сетапы варианта: свип → (FVG, BOS в окне) → контекст → ордерблок → вход,
 * стоп, цель. Всё решается на закрытии свечи подтверждения `e`.
 */
export function findSetups(s: Series, ctx: SetupContext, v: Variant): Setup[] {
  const out: Setup[] = [];
  const volRank = volatilityRanker(s, ctx.atr);
  for (const sw of ctx.scan.sweeps) {
    const d = sw.dir;
    const conf = confirmAfter(s, sw);
    let e = sw.i;
    if (v.fvg) {
      if (conf.fvg < 0) continue;
      e = Math.max(e, conf.fvg);
    }
    if (v.bos) {
      if (conf.bos < 0) continue;
      e = Math.max(e, conf.bos);
    }
    if (v.context && ctx.htf[e] !== d) continue;

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

    const entry = v.entry === 'top' ? top : (top + bottom) / 2;
    const stop = bottom;
    const risk = d * (entry - stop);
    if (!(risk > 0)) continue;
    if (d * (s.c[e] - entry) <= 0) continue; // цена уже в блоке

    let target: number;
    if (v.target === 'liquidity') {
      target = d === 1 ? ctx.scan.nearHigh[e] : ctx.scan.nearLow[e];
      if (!Number.isFinite(target)) continue;
    } else {
      target = entry + d * v.target * risk;
    }
    const plannedR = (d * (target - entry)) / risk;
    if (v.target === 'liquidity' && plannedR < 1) continue; // вход не в дискаунте

    out.push({
      id: `${v.id}:${sw.i}`,
      dir: d,
      sweepI: sw.i,
      fvgI: v.fvg ? conf.fvg : -1,
      bosI: v.bos ? conf.bos : -1,
      e,
      obI,
      level: sw.level,
      entry,
      stop,
      target,
      plannedR,
      features: featuresOf({
        at: closeMs(s, e),
        dir: d,
        daily: ctx.daily[e],
        volRank: volRank(e),
        stopAtr: risk / ctx.atr[e],
        plannedR,
        pierce: sw.pierceAtr,
        deep: (d * (entry - stop)) / (d * (target - stop)),
      }),
    });
  }
  return out;
}
