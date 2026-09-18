/**
 * Ось сессии сгенерированного рынка: от SYNTH_EPOCH до конца сессии.
 *
 * Путь цены последовательный, а свечи запрашивают кусками и в любом порядке.
 * Поэтому у каждых суток свой поток случайности, а состояние на начало суток
 * запоминается контрольной точкой: сутки, построенные с точки, дают ровно те
 * же минутки, что и сплошной прогон.
 */
import * as P from './params';
import { type Bar, type State, cloneState, initialState, stepMinute } from './model';
import { mulberry32, streamSeed } from './rng';

export interface Axis {
  seed: number;
  start: number;
  /** Конец сессии, мс, не включительно: минуток с t ≥ end нет. */
  end: number;
  /** Сколько суток (включая неполные последние) покрывает ось. */
  days: number;
  anchorPrice: number;
}

export interface Series {
  axis: Axis;
  /** Состояние на начало каждых суток; последний элемент — после последних. */
  checkpoints: State[];
  daily: Bar[];
}

export interface SeriesQuery {
  timeframe: number;
  from?: number;
  to?: number;
  limit: number;
}

const AXIS_STREAM = -1;
const INITIAL_STREAM = -2;

export function axisFor(seed: number): Axis {
  const rng = mulberry32(streamSeed(seed, AXIS_STREAM));
  const start = P.SYNTH_EPOCH + P.HISTORY_DAYS * P.DAY_MS + Math.floor(rng() * 7 * P.MINUTES_PER_DAY) * P.MINUTE_MS;
  const end = start + P.SESSION_MS;
  const lo = Math.log(P.ANCHOR_PRICE_MIN);
  const hi = Math.log(P.ANCHOR_PRICE_MAX);
  return {
    seed,
    start,
    end,
    days: Math.ceil((end - P.SYNTH_EPOCH) / P.DAY_MS),
    anchorPrice: Math.exp(lo + rng() * (hi - lo)),
  };
}

/** Сворачивает минутки в корзины таймфрейма по UTC — той же границей, что bucketStart на фронте. */
export class BucketFold {
  readonly out: Bar[] = [];
  constructor(private readonly tfMs: number) {}

  push(b: Bar) {
    const start = Math.floor(b.t / this.tfMs) * this.tfMs;
    const cur = this.out[this.out.length - 1];
    if (!cur || cur.t !== start) {
      this.out.push({ t: start, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v });
    } else {
      cur.h = Math.max(cur.h, b.h);
      cur.l = Math.min(cur.l, b.l);
      cur.c = b.c;
      cur.v += b.v;
    }
  }
}

/**
 * Минутки суток day из состояния на их начало. Сутки прогоняются целиком
 * всегда — иначе состояние на конец не совпало бы с контрольной точкой; until
 * отсекает только выдачу.
 */
export function simulateDay(state: State, seed: number, day: number, onBar: (b: Bar) => void, until = Infinity) {
  const rng = mulberry32(streamSeed(seed, day));
  const t0 = P.SYNTH_EPOCH + day * P.DAY_MS;
  for (let i = 0; i < P.MINUTES_PER_DAY; i++) {
    const t = t0 + i * P.MINUTE_MS;
    const bar = stepMinute(state, rng, t);
    if (t < until) onBar(bar);
  }
}

export function buildSeries(seed: number): Series {
  const axis = axisFor(seed);
  const state = initialState(axis.anchorPrice, mulberry32(streamSeed(seed, INITIAL_STREAM)));
  const checkpoints: State[] = [];
  const daily = new BucketFold(P.DAY_MS);
  for (let d = 0; d < axis.days; d++) {
    checkpoints.push(cloneState(state));
    simulateDay(state, seed, d, (b) => daily.push(b), axis.end);
  }
  checkpoints.push(cloneState(state));
  return { axis, checkpoints, daily: daily.out };
}

/** Та же семантика, что у MarketDataService.getCandles: from/to по времени открытия, to включительно. */
export function querySeries(series: Series, q: SeriesQuery): Bar[] {
  const tfMs = q.timeframe * P.MINUTE_MS;
  const floorB = (t: number) => Math.floor(t / tfMs) * tfMs;
  const lastOpen = floorB(series.axis.end - 1);
  const hi = q.to != null ? Math.min(lastOpen, floorB(q.to)) : lastOpen;
  let a: number;
  let b: number;
  if (q.from != null) {
    a = Math.max(P.SYNTH_EPOCH, Math.ceil(q.from / tfMs) * tfMs);
    b = Math.min(hi, a + (q.limit - 1) * tfMs);
  } else {
    b = hi;
    a = Math.max(P.SYNTH_EPOCH, b - (q.limit - 1) * tfMs);
  }
  if (a > b) return [];
  if (q.timeframe === P.MINUTES_PER_DAY) return series.daily.filter((d) => d.t >= a && d.t <= b);

  const fold = new BucketFold(tfMs);
  const firstDay = Math.floor((a - P.SYNTH_EPOCH) / P.DAY_MS);
  const lastDay = Math.min(series.axis.days - 1, Math.floor((b + tfMs - 1 - P.SYNTH_EPOCH) / P.DAY_MS));
  for (let d = firstDay; d <= lastDay; d++) {
    simulateDay(
      cloneState(series.checkpoints[d]),
      series.axis.seed,
      d,
      (bar) => {
        if (bar.t >= a && bar.t < b + tfMs) fold.push(bar);
      },
      series.axis.end,
    );
  }
  return fold.out;
}

/** Момент старта и цена в нём — закрытие минутки, которая кончается в момент старта. */
export function startOf(series: Series): { start: number; price: number } {
  const { start } = series.axis;
  const [last] = querySeries(series, { timeframe: 1, to: start - P.MINUTE_MS, limit: 1 });
  return { start, price: last.c };
}
