import type { Candle } from './candles';

/**
 * Зоны Smart Money на графике терминала (экспериментальные, 2026-11-15): имбалансы
 * (FVG) и ордерблоки — по свечам того таймфрейма, что открыт на графике.
 *
 * Не перерисовывается: зона появляется на свече, где о ней узнали (FVG — на третьей
 * свече тройки, ордерблок — на закрытии за свингом), и кончается на свече, где её
 * закрыли. Последнюю, формирующуюся свечу вызывающий сюда не передаёт.
 */
export interface Zone {
  kind: 'fvg' | 'ob';
  /** 1 — бычья (поддержка снизу), −1 — медвежья. */
  dir: 1 | -1;
  /** Время открытия свечи, с которой зона рисуется. */
  from: number;
  /** Время открытия свечи, на которой о зоне узнали. */
  seen: number;
  /** Время открытия свечи, закрывшей зону; null — зона жива. */
  end: number | null;
  hi: number;
  lo: number;
}

export const ZONE_RULES = {
  atrLen: 14,
  /** FVG меньше этой доли ATR — шум, не рисуется. */
  minFvgAtr: 0.1,
  /** Свинг — вершина, выше (ниже) которой нет `pivot` свечей с каждой стороны. */
  pivot: 3,
  /** Живых зон одного вида — не больше: самые старые отпадают. */
  maxActive: 30,
} as const;

/** Простой ATR по истинному диапазону; до `n` свечей — NaN. */
function atr(bars: Candle[], n: number): number[] {
  const out = new Array<number>(bars.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const pc = i > 0 ? bars[i - 1].c : b.c;
    const tr = Math.max(b.h - b.l, Math.abs(b.h - pc), Math.abs(b.l - pc));
    sum += tr;
    if (i >= n) {
      const old = bars[i - n];
      const opc = i - n > 0 ? bars[i - n - 1].c : old.c;
      sum -= Math.max(old.h - old.l, Math.abs(old.h - opc), Math.abs(old.l - opc));
    }
    if (i >= n - 1) out[i] = sum / n;
  }
  return out;
}

/** Живые зоны: старейшая отпадает с концом в `t`, когда их больше предела. */
function pushActive(active: Zone[], z: Zone, t: number): void {
  active.push(z);
  if (active.length > ZONE_RULES.maxActive) active.shift()!.end = t;
}

/**
 * Имбаланс на тройке свечей k−2, k−1, k: бычий — лоу k выше хая k−2, медвежий —
 * хай k ниже лоу k−2. Зона — разрыв между ними, рисуется со средней свечи.
 * Закрыт, когда цена прошла его целиком (лоу ниже низа бычьего, хай выше верха
 * медвежьего).
 */
export function findFvgs(bars: Candle[]): Zone[] {
  const out: Zone[] = [];
  const a = atr(bars, ZONE_RULES.atrLen);
  const active: Zone[] = [];
  for (let k = 0; k < bars.length; k++) {
    const b = bars[k];
    for (let j = active.length - 1; j >= 0; j--) {
      const z = active[j];
      if (z.dir === 1 ? b.l <= z.lo : b.h >= z.hi) {
        z.end = b.t;
        active.splice(j, 1);
      }
    }
    if (k < 2 || !Number.isFinite(a[k])) continue;
    const p = bars[k - 2];
    const min = ZONE_RULES.minFvgAtr * a[k];
    let z: Zone | null = null;
    if (b.l - p.h > min) z = { kind: 'fvg', dir: 1, from: bars[k - 1].t, seen: b.t, end: null, hi: b.l, lo: p.h };
    else if (p.l - b.h > min) z = { kind: 'fvg', dir: -1, from: bars[k - 1].t, seen: b.t, end: null, hi: p.l, lo: b.h };
    if (z) {
      out.push(z);
      pushActive(active, z, b.t);
    }
  }
  return out;
}

/**
 * Ордерблок — последняя свеча против движения, сломавшего структуру. Свинг-хай
 * засчитан, когда справа от него закрылись `pivot` свечей; закрытие выше него —
 * слом вверх: от самого низкого лоу между свингом и сломом ищется назад последняя
 * падающая свеча, её диапазон и есть бычий ордерблок (зеркально — медвежий).
 * Каждый свинг ломается один раз. Ордерблок кончается закрытием за его дальним краем.
 */
export function findOrderBlocks(bars: Candle[]): Zone[] {
  const out: Zone[] = [];
  const n = ZONE_RULES.pivot;
  const active: Zone[] = [];
  let high: number | null = null;
  let low: number | null = null;

  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    for (let j = active.length - 1; j >= 0; j--) {
      const z = active[j];
      if (z.dir === 1 ? b.c < z.lo : b.c > z.hi) {
        z.end = b.t;
        active.splice(j, 1);
      }
    }

    // Свинг с вершиной на i − n засчитывается этой свечой.
    const p = i - n;
    if (p >= n) {
      let isHigh = true;
      let isLow = true;
      for (let k = p - n; k <= p + n && (isHigh || isLow); k++) {
        if (k === p) continue;
        if (bars[k].h >= bars[p].h) isHigh = false;
        if (bars[k].l <= bars[p].l) isLow = false;
      }
      if (isHigh) high = p;
      if (isLow) low = p;
    }

    if (high != null && b.c > bars[high].h) {
      let m = high + 1;
      for (let k = high + 1; k <= i; k++) if (bars[k].l < bars[m].l) m = k;
      let ob = m;
      for (let k = m; k > high; k--) {
        if (bars[k].c < bars[k].o) {
          ob = k;
          break;
        }
      }
      const z: Zone = { kind: 'ob', dir: 1, from: bars[ob].t, seen: b.t, end: null, hi: bars[ob].h, lo: bars[ob].l };
      out.push(z);
      pushActive(active, z, b.t);
      high = null;
    }
    if (low != null && b.c < bars[low].l) {
      let m = low + 1;
      for (let k = low + 1; k <= i; k++) if (bars[k].h > bars[m].h) m = k;
      let ob = m;
      for (let k = m; k > low; k--) {
        if (bars[k].c > bars[k].o) {
          ob = k;
          break;
        }
      }
      const z: Zone = { kind: 'ob', dir: -1, from: bars[ob].t, seen: b.t, end: null, hi: bars[ob].h, lo: bars[ob].l };
      out.push(z);
      pushActive(active, z, b.t);
      low = null;
    }
  }
  return out;
}
