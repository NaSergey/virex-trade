/**
 * Модель цены сгенерированного рынка: одна минута из состояния. Три слоя —
 * волатильность (серии спокойных и горячих дней, час суток, выходные),
 * режимы (тренд ногами, флэт коридором, сжатие) и память уровней (отбои,
 * ретесты, выносы). Всё состояние — в State: сутки строятся с контрольной точки.
 */
import * as P from './params';
import { type Rng, normal, studentT4, uniform } from './rng';

export type RegimeKind = 'trend' | 'range' | 'squeeze';

export interface Regime {
  kind: RegimeKind;
  /** Минут до конца режима. */
  left: number;
  /** Направление тренда; у флэта и сжатия не используется. */
  dir: 1 | -1;
  /** Логарифм цены на входе в режим — центр коридора или сжатия. */
  center: number;
  /** Полуширина коридора в логарифме цены; у тренда и сжатия 0. */
  halfWidth: number;
  leg: 'impulse' | 'pullback';
  legLeft: number;
  /** Снос ноги в базовых минутных волатильностях; у отката отрицательный. */
  kappa: number;
  /** Пробитый край коридора, к которому идёт первый откат; null — ретеста нет. */
  retest: number | null;
}

export interface State {
  /** Логарифм закрытия последней минутки. */
  logPrice: number;
  /** Логарифм базовой минутной волатильности — без часа суток и режима. */
  logVol: number;
  /** Логарифм якоря цены сессии. */
  anchor: number;
  regime: Regime;
  /** Значимые уровни (логарифм цены), новые в конце. */
  levels: number[];
  /** Уровень, в зоне которого цена: реакция разыгрывается один раз на вход в зону. */
  zoneLevel: number | null;
}

/** Минутка генератора. t — время открытия, мс; v — условный объём. */
export interface Bar {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export const MEAN_LOG_VOL = Math.log(P.BASE_DAILY_VOL / Math.sqrt(P.MINUTES_PER_DAY));
const VOL_PHI = Math.exp(-1 / P.LOG_VOL_MEMORY_MIN);
const VOL_ETA = P.LOG_VOL_SD * Math.sqrt(1 - VOL_PHI * VOL_PHI);
const RANGE_PULL = Math.LN2 / P.RANGE_PULL_HALF_LIFE_MIN;
const EDGE_PULL = Math.LN2 / P.RANGE_EDGE_HALF_LIFE_MIN;
const SQUEEZE_PULL = Math.LN2 / P.SQUEEZE_PULL_HALF_LIFE_MIN;
const ANCHOR_PULL = Math.LN2 / P.ANCHOR_HALF_LIFE_MIN;
const HOUR_MS = 3_600_000;

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const tick = (x: number) => Math.round(x * 10) / 10;

/** Пик — пересечение Европы и США, минимум — азиатская ночь. */
const HOUR_SHAPE = Array.from(
  { length: 24 },
  (_, h) =>
    1 +
    P.HOUR_PEAK * Math.exp(-((h - 14.5) ** 2) / (2 * 2.2 ** 2)) -
    P.HOUR_TROUGH * Math.exp(-((h - 5) ** 2) / (2 * 2.5 ** 2)),
);

/** 168 множителей «день недели (UTC, 0 — воскресенье) × час», в среднем по неделе ровно 1. */
const SEASON: number[] = (() => {
  const raw: number[] = [];
  for (let wd = 0; wd < 7; wd++) {
    for (let h = 0; h < 24; h++) raw.push(HOUR_SHAPE[h] * (wd === 0 || wd === 6 ? P.WEEKEND_VOL : 1));
  }
  const mean = raw.reduce((a, x) => a + x, 0) / raw.length;
  return raw.map((x) => x / mean);
})();

/** Без new Date на каждую минуту: 1970-01-01 — четверг. */
export function seasonAt(t: number): number {
  const day = Math.floor(t / P.DAY_MS);
  return SEASON[((day + 4) % 7) * 24 + Math.floor((t - day * P.DAY_MS) / HOUR_MS)];
}

const dailyVol = (s: State) => Math.exp(s.logVol) * Math.sqrt(P.MINUTES_PER_DAY);
const zone = (s: State) => P.LEVEL_ZONE * dailyVol(s);

const duration = (rng: Rng, medianH: number) =>
  Math.max(P.MIN_DURATION_MIN, Math.round(medianH * 60 * Math.exp(P.DURATION_SPREAD * normal(rng))));

function startImpulse(r: Regime, rng: Rng) {
  r.leg = 'impulse';
  r.legLeft = duration(rng, P.IMPULSE.medianH);
  r.kappa = uniform(rng, P.IMPULSE.kappaMin, P.IMPULSE.kappaMax);
}

function startPullback(s: State, rng: Rng) {
  const r = s.regime;
  r.leg = 'pullback';
  r.legLeft = duration(rng, P.PULLBACK.medianH);
  r.kappa = -Math.abs(r.kappa) * uniform(rng, P.PULLBACK.shareMin, P.PULLBACK.shareMax);
  // Ретест имеет смысл, только если импульс увёл цену за пробитый край.
  if (r.retest != null && r.dir * (s.logPrice - r.retest) <= 0) r.retest = null;
}

function trend(s: State, rng: Rng, dir: 1 | -1, retest: number | null): Regime {
  const r: Regime = {
    kind: 'trend',
    left: duration(rng, P.REGIME.trend.medianH),
    dir,
    center: s.logPrice,
    halfWidth: 0,
    leg: 'impulse',
    legLeft: 0,
    kappa: 0,
    retest,
  };
  startImpulse(r, rng);
  return r;
}

const flat = (s: State, rng: Rng, kind: 'range' | 'squeeze'): Regime => ({
  kind,
  left: duration(rng, P.REGIME[kind].medianH),
  dir: 1,
  center: s.logPrice,
  halfWidth: kind === 'range' ? uniform(rng, P.RANGE_WIDTH.min, P.RANGE_WIDTH.max) * dailyVol(s) : 0,
  leg: 'impulse',
  legLeft: 0,
  kappa: 0,
  retest: null,
});

function remember(s: State, level: number) {
  s.levels.push(level);
  if (s.levels.length > P.MAX_LEVELS) s.levels.shift();
}

/** Куда выходить из флэта или сжатия: к краю, у которого цена, иначе жребий. */
function exitSide(s: State, rng: Rng): 1 | -1 {
  const r = s.regime;
  const off = s.logPrice - r.center;
  const threshold = r.halfWidth > 0 ? P.BREAKOUT_SIDE * r.halfWidth : zone(s);
  if (Math.abs(off) > threshold) return off > 0 ? 1 : -1;
  return rng() < 0.5 ? 1 : -1;
}

function nextRegime(s: State, rng: Rng) {
  const r = s.regime;
  const roll = rng();
  if (r.kind === 'trend') {
    remember(s, s.logPrice);
    if (roll < P.FROM_TREND.range) s.regime = flat(s, rng, 'range');
    else if (roll < P.FROM_TREND.range + P.FROM_TREND.squeeze) s.regime = flat(s, rng, 'squeeze');
    else s.regime = trend(s, rng, r.dir === 1 ? -1 : 1, null);
  } else if (r.kind === 'range') {
    remember(s, r.center - r.halfWidth);
    remember(s, r.center + r.halfWidth);
    if (roll < P.FROM_RANGE.trend) {
      const dir = exitSide(s, rng);
      s.regime = trend(s, rng, dir, r.center + dir * r.halfWidth);
    } else {
      s.regime = flat(s, rng, 'squeeze');
    }
  } else {
    const dir = exitSide(s, rng);
    s.logVol += P.SQUEEZE_EXIT_KICK;
    s.regime = trend(s, rng, dir, null);
  }
}

function nextLeg(s: State, rng: Rng) {
  const r = s.regime;
  if (r.leg === 'impulse') {
    remember(s, s.logPrice);
    startPullback(s, rng);
  } else {
    r.retest = null;
    startImpulse(r, rng);
  }
}

function reactToLevels(s: State, rng: Rng) {
  const width = zone(s);
  const near = s.levels.find((level) => Math.abs(level - s.logPrice) < width) ?? null;
  if (near === s.zoneLevel) return;
  s.zoneLevel = near;
  const r = s.regime;
  if (near == null || r.kind !== 'trend' || r.leg !== 'impulse') return;
  if (r.dir * (near - s.logPrice) > 0 && rng() < P.LEVEL_REACT_P) startPullback(s, rng);
}

function drift(s: State): number {
  const r = s.regime;
  let d = -ANCHOR_PULL * (s.logPrice - s.anchor);
  if (r.kind === 'trend') {
    d += r.dir * r.kappa * Math.exp(s.logVol);
  } else if (r.kind === 'range') {
    const off = s.logPrice - r.center;
    d -= RANGE_PULL * off;
    const excess = Math.abs(off) - r.halfWidth;
    if (excess > 0) d -= Math.sign(off) * EDGE_PULL * excess;
  } else {
    d -= SQUEEZE_PULL * (s.logPrice - r.center);
  }
  return d;
}

const regimeVol = (r: Regime) =>
  P.REGIME[r.kind].volMult * (r.kind === 'trend' && r.leg === 'pullback' ? P.PULLBACK.volMult : 1);

export function initialState(anchorPrice: number, rng: Rng): State {
  const anchor = Math.log(anchorPrice);
  const s: State = { logPrice: anchor, logVol: MEAN_LOG_VOL, anchor, regime: undefined, levels: [], zoneLevel: null };
  s.regime = flat(s, rng, 'range');
  return s;
}

export const cloneState = (s: State): State => ({ ...s, regime: { ...s.regime }, levels: [...s.levels] });

/** Одна минута: меняет состояние на месте и отдаёт свечу. */
export function stepMinute(s: State, rng: Rng, t: number): Bar {
  if (--s.regime.left <= 0) nextRegime(s, rng);
  const r = s.regime;
  if (r.kind === 'trend') {
    const retested = r.leg === 'pullback' && r.retest != null && r.dir * (s.logPrice - r.retest) <= 0;
    if (--r.legLeft <= 0 || retested) nextLeg(s, rng);
  }
  reactToLevels(s, rng);

  const sigma = Math.exp(s.logVol) * seasonAt(t) * regimeVol(s.regime);
  const z = clamp(studentT4(rng), -P.NOISE_CLAMP, P.NOISE_CLAMP);
  const ret = drift(s) + sigma * z;
  const from = s.logPrice;

  // Экстремумы пути внутри минуты — выборка максимума и минимума броуновского
  // моста от 0 до ret: P(max > m) = exp(−2m(m − ret)/σ²).
  const bridge = -2 * sigma * sigma;
  let hi = from + (ret + Math.sqrt(ret * ret + bridge * Math.log(1 - rng()))) / 2;
  let lo = from + (ret - Math.sqrt(ret * ret + bridge * Math.log(1 - rng()))) / 2;

  const near = s.zoneLevel;
  if (rng() < P.SWEEP_P * (near == null ? 1 : P.SWEEP_NEAR_LEVEL)) {
    if (near != null) {
      // У уровня тень прокалывает его: снятие стопов за уровнем.
      const pierce = Math.abs(near - from) + uniform(rng, 0.2, 1) * zone(s);
      if (near > from) hi = Math.max(hi, from + pierce);
      else lo = Math.min(lo, from - pierce);
    } else {
      const ext = uniform(rng, P.SWEEP_SIGMAS.min, P.SWEEP_SIGMAS.max) * sigma;
      if (rng() < 0.5) hi = Math.max(hi, from + ext);
      else lo = Math.min(lo, from - ext);
    }
  }

  s.logPrice = from + ret;
  const o = tick(Math.exp(from));
  const c = tick(Math.exp(s.logPrice));
  const bar: Bar = {
    t,
    o,
    h: Math.max(tick(Math.exp(hi)), o, c),
    l: Math.min(tick(Math.exp(lo)), o, c),
    c,
    v: seasonAt(t) * (0.5 + Math.abs(z)) * 10,
  };

  s.logVol = MEAN_LOG_VOL + VOL_PHI * (s.logVol - MEAN_LOG_VOL) + VOL_ETA * normal(rng);
  if (Math.abs(z) > P.SHOCK_Z) s.logVol += P.SHOCK_KICK;
  s.logVol = clamp(s.logVol, MEAN_LOG_VOL - P.LOG_VOL_BAND, MEAN_LOG_VOL + P.LOG_VOL_BAND);
  return bar;
}
