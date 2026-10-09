import type { Candle } from './candles';

/**
 * Боковик после импульса — перенос прототипа исследования 2026-10-09 (спека
 * `2026-10-09-range-indicator-and-grid-bot-design.md`): правила подобраны на
 * свечах 4ч BTC с 2017 года, длительность боковика в них не задана.
 *
 * Детектор не перерисовывается: всё, что он знает на свече i, посчитано по
 * свечам 0..i. Вершина ZigZag засчитывается в момент подтверждения, рамка
 * появляется на свече, где цена развернулась от дна отката, а не «с начала
 * боковика», — иначе задним числом любая рамка выглядела бы идеально.
 */
export const RANGE_RULES = {
  atrLen: 14,
  /** Порог большого ZigZag — им ищутся импульсы. */
  zz: 4,
  /** Порог малого: разворот от дна отката и касания стороны импульса. */
  zzMinor: 1.5,
  impA: 8,
  impZ: 1.5,
  maxRetr: 0.6,
  minW: 3,
  tol: 0.25,
  brk: 0.5,
  brkN: 6,
} as const;

export const H4 = 4 * 3_600_000;

export interface Swing {
  kind: 'H' | 'L';
  price: number;
  /** Свеча вершины. */
  at: number;
  /** Свеча, на которой вершина засчитана. */
  conf: number;
}

export interface RangeStep {
  at: number;
  lo: number;
  hi: number;
}

/** Рамка боковика; все поля `*At` — индексы свечей. */
export interface RangeBox {
  dir: 'up' | 'down';
  impFrom: number;
  impTo: number;
  seenAt: number;
  retestAt: number | null;
  endAt: number | null;
  end: 'up' | 'down' | null;
  /** Границы, какими их знали: с какой свечи какие. Первая — на `seenAt`. */
  steps: RangeStep[];
}

export interface ChartRange {
  id: string;
  /** `range` — рамка индикатора, `bot` — диапазон грид-бота. */
  kind: 'range' | 'bot';
  /** С какого времени рамку видно задним числом (вершина импульса). */
  from: number;
  /** С какого времени о ней знали. */
  seen: number;
  /** Пробой; null — живёт. */
  end: number | null;
  /** Экранные цены; `t` — с какого времени границы такие. */
  steps: { t: number; lo: number; hi: number }[];
}

/** ATR Уайлдера; на первых n свечах — среднее накопленного. */
export function atrOf(bars: Candle[], n: number): number[] {
  const out: number[] = [];
  let a = 0;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const tr = i === 0 ? b.h - b.l : Math.max(b.h - b.l, Math.abs(b.h - bars[i - 1].c), Math.abs(b.l - bars[i - 1].c));
    a = i < n ? (a * i + tr) / (i + 1) : (a * (n - 1) + tr) / n;
    out.push(a);
  }
  return out;
}

/** ZigZag по ATR: вершина засчитывается на свече, где цена отошла от неё на k·ATR. */
export function zigzagOf(bars: Candle[], atr: number[], k: number): Swing[] {
  const out: Swing[] = [];
  if (bars.length === 0) return out;
  let dir: 0 | 1 | -1 = 0;
  let hi = bars[0].h;
  let hiAt = 0;
  let lo = bars[0].l;
  let loAt = 0;
  for (let i = 1; i < bars.length; i++) {
    const b = bars[i];
    if (dir >= 0 && b.h > hi) {
      hi = b.h;
      hiAt = i;
    }
    if (dir <= 0 && b.l < lo) {
      lo = b.l;
      loAt = i;
    }
    if (dir >= 0 && hi - b.l >= k * atr[i] && hiAt < i) {
      if (dir === 0 && loAt < hiAt) out.push({ kind: 'L', price: lo, at: loAt, conf: i });
      out.push({ kind: 'H', price: hi, at: hiAt, conf: i });
      dir = -1;
      lo = b.l;
      loAt = i;
    } else if (dir <= 0 && b.h - lo >= k * atr[i] && loAt < i) {
      if (dir === 0 && hiAt < loAt) out.push({ kind: 'H', price: hi, at: hiAt, conf: i });
      out.push({ kind: 'L', price: lo, at: loAt, conf: i });
      dir = 1;
      hi = b.h;
      hiAt = i;
    }
  }
  return out;
}

/** Рамки боковиков на закрытых свечах 4ч. */
export function findRanges(bars: Candle[]): RangeBox[] {
  const R = RANGE_RULES;
  const a = atrOf(bars, R.atrLen);
  const major = zigzagOf(bars, a, R.zz);
  const minor = zigzagOf(bars, a, R.zzMinor);
  const out: RangeBox[] = [];
  for (let k = 1; k < major.length; k++) {
    const s = major[k - 1];
    const e = major[k];
    const amp = Math.abs(e.price - s.price);
    const ref = a[s.at];
    const z = amp / (ref * Math.sqrt(Math.max(1, e.at - s.at)));
    if (amp < R.impA * ref || z < R.impZ) continue;
    // Импульс, начатый на разгоне ATR (первые свечи загруженного ряда), не мерится:
    // его ATR — среднее нескольких свечей, а не 14.
    if (s.at < 2 * R.atrLen) continue;
    // Рамка одна за раз: импульс внутри живой рамки — её качание, а не новый боковик.
    const prev = out.at(-1);
    if (prev && (prev.endAt === null || prev.endAt >= e.conf)) continue;

    // Дно отката (у импульса вниз — вершина отскока): бегущий экстремум после E;
    // рамка известна, когда цена развернулась от него на zzMinor·ATR закрытием.
    const up = e.kind === 'H';
    let ext = up ? Infinity : -Infinity;
    let extAt = e.at;
    let seen = -1;
    let dead = false;
    for (let i = e.at + 1; i < bars.length; i++) {
      const b = bars[i];
      if (up ? b.l < ext : b.h > ext) {
        ext = up ? b.l : b.h;
        extAt = i;
      }
      if (Math.abs(e.price - ext) / amp > R.maxRetr) {
        dead = true;
        break;
      }
      if (i < e.conf) continue;
      const turn = up ? b.c - ext : ext - b.c;
      if (extAt < i && turn >= R.zzMinor * a[i]) {
        seen = i;
        break;
      }
    }
    if (dead || seen < 0) continue;
    let lo = Math.min(e.price, ext);
    let hi = Math.max(e.price, ext);
    if (hi - lo < R.minW * a[seen]) continue;

    const box: RangeBox = {
      dir: up ? 'up' : 'down',
      impFrom: s.at,
      impTo: e.at,
      seenAt: seen,
      retestAt: null,
      endAt: null,
      end: null,
      steps: [{ at: seen, lo, hi }],
    };
    let mi = minor.findIndex((m) => m.conf > seen);
    let outUp = 0;
    let outDn = 0;
    for (let i = seen + 1; i < bars.length; i++) {
      const b = bars[i];
      // До ретеста рамка ещё складывается: дальняя от импульса граница уходит за откатом.
      if (box.retestAt === null) {
        const lo0 = lo;
        const hi0 = hi;
        if (up && b.l < lo && (e.price - b.l) / amp <= R.maxRetr) lo = b.l;
        if (!up && b.h > hi && (b.h - e.price) / amp <= R.maxRetr) hi = b.h;
        if (lo !== lo0 || hi !== hi0) box.steps.push({ at: i, lo, hi });
      }
      const pad = R.brk * a[i];
      outUp = b.c > hi + pad ? outUp + 1 : 0;
      outDn = b.c < lo - pad ? outDn + 1 : 0;
      if (outUp >= R.brkN || outDn >= R.brkN) {
        box.endAt = i;
        box.end = outUp >= R.brkN ? 'up' : 'down';
        break;
      }
      // Ретест — вершина малого ZigZag у стороны импульса, засчитанная не позже этой свечи.
      if (box.retestAt === null && mi >= 0) {
        while (mi < minor.length && minor[mi].conf <= i) {
          const m = minor[mi++];
          if (m.at <= extAt || m.kind !== e.kind) continue;
          const w = hi - lo;
          if (up ? m.price >= hi - R.tol * w : m.price <= lo + R.tol * w) {
            box.retestAt = m.conf;
            break;
          }
        }
      }
    }
    out.push(box);
  }
  return out;
}

/** Что из рамок известно на свече t: будущие ступени, ретест и пробой срезаны. */
export function visibleAt(boxes: RangeBox[], t: number): RangeBox[] {
  return boxes
    .filter((b) => b.seenAt <= t)
    .map((b) => ({
      ...b,
      retestAt: b.retestAt !== null && b.retestAt <= t ? b.retestAt : null,
      endAt: b.endAt !== null && b.endAt <= t ? b.endAt : null,
      end: b.endAt !== null && b.endAt <= t ? b.end : null,
      steps: b.steps.filter((s) => s.at <= t),
    }));
}

/** Рамки — во времени и экранных ценах для графика. Свеча известна с её закрытия. */
export function toChartRanges(boxes: RangeBox[], bars: Candle[], toScreen: (p: number) => number): ChartRange[] {
  return boxes.map((b) => ({
    id: `range-${bars[b.impTo].t}`,
    kind: 'range',
    from: bars[b.impTo].t,
    seen: bars[b.seenAt].t + H4,
    end: b.endAt !== null ? bars[b.endAt].t + H4 : null,
    steps: b.steps.map((s) => ({ t: bars[s.at].t + H4, lo: toScreen(s.lo), hi: toScreen(s.hi) })),
  }));
}
