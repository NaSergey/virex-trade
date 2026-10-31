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
];

/** План сделки — от первого ордера сетки, строго 3–5R. */
export const MIN_R = 3;
export const MAX_R = 5;
/** Уровни сетки входа — доли высоты блока от его верха. */
export const GRID_STEPS = [0, 0.25, 0.5, 0.75];
/** Тейки — доли пути от верха блока до цели. */
export const TAKE_STEPS = [1 / 3, 2 / 3, 1];

export interface Variant {
  id: string;
  label: string;
  /** ТФ сетапа, минут. */
  tf: 15 | 60 | 240;
  fvg: boolean;
  bos: boolean;
  context: boolean;
  /** Сетка входа и тейков со стопом за тейками; false — один лимит и один тейк. */
  grid: boolean;
  /** Отбор сторон: лонги все, шорты по вероятности и не больше 30 %. */
  odds: boolean;
  /** Правила обучения на ошибках (с 2020-Q1, вперёд по кварталам). */
  learn: boolean;
  /** Запас к стопу за блоком, в ATR ТФ сетапа. */
  stopBufAtr?: number;
  /** Стоп тоньше этой доли цены — пропуск: комиссия съедает R. */
  minStopPct?: number;
  /** Вход по рынку на открытии следующей свечи вместо лимитов в блоке. */
  market?: boolean;
  /** Режим рынка: лонг только над MA200 дня, шорт только под ней. */
  regime?: boolean;
  /** Срок удержания, мс; нет — MAX_HOLD_MS. */
  holdMs?: number;
}

export const MAIN: Variant = {
  id: 'main',
  label: 'Основной (4H)',
  tf: 240,
  fvg: true,
  bos: true,
  context: true,
  grid: true,
  odds: true,
  learn: false,
};
const M15: Variant = { ...MAIN, tf: 15 };
const H1: Variant = { ...MAIN, tf: 60 };

/**
 * Варианты отчёта: сначала отличающиеся от основного одним правилом, затем прошлый
 * основной на 15m и поиск улучшений (`src/scripts/strategy-research.ts`).
 */
export const VARIANTS: Variant[] = [
  MAIN,
  { ...MAIN, id: 'sweep', label: '4H, только свип', fvg: false, bos: false },
  { ...MAIN, id: 'sweep-fvg', label: '4H, свип + FVG', bos: false },
  { ...MAIN, id: 'sweep-bos', label: '4H, свип + BOS', fvg: false },
  { ...MAIN, id: 'no-context', label: '4H, без контекста 1D', context: false },
  { ...MAIN, id: 'no-odds', label: '4H, без отбора сторон', odds: false },
  { ...MAIN, id: 'single', label: '4H, одиночный вход и выход', grid: false },
  {
    ...M15,
    id: 'v3',
    label: '15m с обучением (прошлый основной)',
    learn: true,
  },
  { ...M15, id: 'base15', label: '15m без обучения' },
  { ...M15, id: 'minstop', label: '15m, стоп от 0,5 %', minStopPct: 0.005 },
  { ...H1, id: 'h1', label: '1H' },
  { ...M15, id: 'reg15', label: '15m, MA200', regime: true },
  { ...H1, id: 'reg1h', label: '1H, MA200', regime: true },
  {
    ...H1,
    id: 'reg1h-fvg',
    label: '1H, MA200, свип + FVG',
    regime: true,
    bos: false,
  },
  {
    ...M15,
    id: 'reg15-buf',
    label: '15m, MA200, запас 0,5 ATR, стоп от 0,5 %',
    regime: true,
    stopBufAtr: 0.5,
    minStopPct: 0.005,
  },
  { ...M15, id: 'buf5', label: '15m, запас 0,5 ATR', stopBufAtr: 0.5 },
  { ...M15, id: 'mkt15', label: '15m, вход по рынку', market: true },
];

export interface Setup {
  /** `${вариант}:${свеча свипа}:${сторона}` — уникален внутри варианта. */
  id: string;
  dir: Dir;
  sweepI: number;
  /** −1 — вариант условия не требует. */
  fvgI: number;
  bosI: number;
  /** Свеча подтверждения: на её закрытии выставляется сетка. */
  e: number;
  obI: number;
  level: number;
  /** Уровни входа, от верха блока к стопу. */
  entries: number[];
  stop: number;
  /** Последний тейк. */
  target: number;
  takes: number[];
  /** Стоп за тейками и снятие входа после первого тейка. */
  trail: boolean;
  plannedR: number;
  /** Вход по рынку на открытии свечи после подтверждения. */
  market?: boolean;
  holdMs?: number;
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
  /** Цена относительно MA200 дня: 1, −1, 0 (истории ещё нет). */
  regime?: Int8Array;
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
 * Сетапы варианта: свип → (FVG, BOS в окне) → контекст → ордерблок → сетка
 * входа, стоп, цель 3–5R и сетка тейков. Всё решается на закрытии свечи
 * подтверждения `e`.
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
    if (v.regime && ctx.regime?.[e] !== d) continue;

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

    const entry = v.market ? s.c[e] : top;
    const stop = bottom - d * (v.stopBufAtr ?? 0) * ctx.atr[e];
    const h = d * (entry - stop);
    if (!(h > 0)) continue;
    if (!v.market && d * (s.c[e] - top) <= 0) continue; // цена уже в блоке
    if (v.minStopPct && h / Math.abs(entry) < v.minStopPct) continue;
    const liq = d === 1 ? ctx.scan.nearHigh[e] : ctx.scan.nearLow[e];
    if (!Number.isFinite(liq)) continue;
    const rLiq = (d * (liq - entry)) / h;
    if (rLiq < MIN_R) continue; // ликвидность ближе 3R
    const plannedR = Math.min(rLiq, MAX_R);
    const target = entry + d * plannedR * h;
    const entries =
      v.grid && !v.market ? GRID_STEPS.map((k) => entry - d * k * h) : [entry];
    const takes = v.grid
      ? TAKE_STEPS.map((k) => entry + (target - entry) * k)
      : [target];

    out.push({
      id: `${v.id}:${sw.i}:${d}`,
      dir: d,
      sweepI: sw.i,
      fvgI: v.fvg ? conf.fvg : -1,
      bosI: v.bos ? conf.bos : -1,
      e,
      obI,
      level: sw.level,
      entries,
      stop,
      target,
      takes,
      trail: v.grid,
      plannedR,
      market: v.market,
      holdMs: v.holdMs,
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
