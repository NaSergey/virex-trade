/**
 * Расчёты инструментов по свечам графика (спека 2026-11-17): канал регрессии,
 * профиль объёма участка, привязанный VWAP. Свечи — те, что загружены на
 * графике (`LayerGeo.candles`), по возрастанию времени, в экранной цене.
 */

export interface SeriesCandle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v?: number;
}

const inRange = (candles: readonly SeriesCandle[], t1: number, t2: number) => {
  const lo = Math.min(t1, t2);
  const hi = Math.max(t1, t2);
  return candles.filter((c) => c.t >= lo && c.t <= hi);
};

/**
 * Канал регрессии: прямая МНК по закрытиям свечей участка (цена от времени) и σ
 * остатков. Меньше двух свечей — null.
 */
export function regression(
  candles: readonly SeriesCandle[],
  t1: number,
  t2: number,
): { from: { t: number; p: number }; to: { t: number; p: number }; sigma: number } | null {
  const rows = inRange(candles, t1, t2);
  const n = rows.length;
  if (n < 2) return null;
  // Время — от первой свечи: миллисекунды эпохи в квадрате теряли бы точность.
  const t0 = rows[0].t;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  for (const r of rows) {
    const x = r.t - t0;
    sx += x;
    sy += r.c;
    sxx += x * x;
    sxy += x * r.c;
  }
  const den = n * sxx - sx * sx;
  const slope = den === 0 ? 0 : (n * sxy - sx * sy) / den;
  const icpt = (sy - slope * sx) / n;
  let ss = 0;
  for (const r of rows) ss += (r.c - (icpt + slope * (r.t - t0))) ** 2;
  const last = rows[n - 1].t;
  return {
    from: { t: t0, p: icpt },
    to: { t: last, p: icpt + slope * (last - t0) },
    sigma: Math.sqrt(ss / n),
  };
}

export interface VolumeProfile {
  lo: number;
  hi: number;
  /** Объём по строкам цены снизу вверх. */
  rows: number[];
  /** Строка наибольшего объёма. */
  poc: number;
  /** Строки зоны 70 % объёма вокруг POC — включительно. */
  vaLo: number;
  vaHi: number;
}

/** Доля объёма в зоне вокруг POC. */
export const VALUE_AREA = 0.7;

/**
 * Профиль объёма участка: диапазон цен свечей участка делится на `count` строк,
 * объём каждой свечи — поровну по строкам, которые задевает её диапазон. Зона —
 * от POC в сторону большей соседней строки, пока не наберётся 70 % объёма.
 * Без объёма у свечей участка — null.
 */
export function volumeProfile(candles: readonly SeriesCandle[], t1: number, t2: number, count = 24): VolumeProfile | null {
  const rows = inRange(candles, t1, t2);
  const lo = Math.min(...rows.map((r) => r.l));
  const hi = Math.max(...rows.map((r) => r.h));
  if (rows.length === 0 || !(hi > lo)) return null;
  const step = (hi - lo) / count;
  const vol = new Array<number>(count).fill(0);
  let total = 0;
  for (const r of rows) {
    const v = r.v ?? 0;
    if (!(v > 0)) continue;
    const a = Math.min(count - 1, Math.floor((r.l - lo) / step));
    const b = Math.min(count - 1, Math.floor((r.h - lo) / step));
    const share = v / (b - a + 1);
    for (let i = a; i <= b; i++) vol[i] += share;
    total += v;
  }
  if (!(total > 0)) return null;
  let poc = 0;
  for (let i = 1; i < count; i++) if (vol[i] > vol[poc]) poc = i;
  let vaLo = poc;
  let vaHi = poc;
  let acc = vol[poc];
  while (acc < total * VALUE_AREA && (vaLo > 0 || vaHi < count - 1)) {
    const down = vaLo > 0 ? vol[vaLo - 1] : -1;
    const up = vaHi < count - 1 ? vol[vaHi + 1] : -1;
    if (up >= down) acc += vol[++vaHi];
    else acc += vol[--vaLo];
  }
  return { lo, hi, rows: vol, poc, vaLo, vaHi };
}

/**
 * Привязанный VWAP: от свечи, на которой стоит якорь (первая с `t` не раньше
 * `anchor`), до последней — `Σ(типичная × объём) / Σ объём`, типичная — (H+L+C)/3.
 * Свечи без объёма линию не двигают; без объёма вовсе — пусто.
 */
export function anchoredVwap(candles: readonly SeriesCandle[], anchor: number): { t: number; p: number }[] {
  const out: { t: number; p: number }[] = [];
  let pv = 0;
  let vv = 0;
  for (const c of candles) {
    if (c.t < anchor) continue;
    const v = c.v ?? 0;
    if (v > 0) {
      pv += ((c.h + c.l + c.c) / 3) * v;
      vv += v;
    }
    if (vv > 0) out.push({ t: c.t, p: pv / vv });
  }
  return out;
}
