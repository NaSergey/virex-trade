/**
 * Пейзаж полёта — холмы, окна корпусов, вода, облака — чистыми функциями с
 * зерном: одна и та же картинка на сервере и в браузере (гидратация не
 * расходится) и от раунда к раунду.
 */

/** ГПСЧ с зерном (LCG): без зерна картинка менялась бы при каждом рендере. */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const between = (r: () => number, lo: number, hi: number) => lo + (hi - lo) * r();

/**
 * Пологие холмы за горизонтом: гладкий силуэт — квадратичные кривые через
 * середины между вершинами, замкнутый по низу полосы. y = 0 — верх полосы,
 * `band` — её низ (горизонт).
 */
export function hills(width: number, band: number, seed: number, step: [number, number], rise: [number, number]) {
  const r = rng(seed);
  const pts: [number, number][] = [];
  for (let x = -step[1]; x < width + step[1]; x += between(r, step[0], step[1])) {
    pts.push([x, band * (1 - between(r, rise[0], rise[1]))]);
  }
  const f = (v: number) => v.toFixed(1);
  let d = `M${f(pts[0][0])} ${band} L${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 1; i < pts.length; i++) {
    const [px, py] = pts[i - 1];
    const [x, y] = pts[i];
    d += ` Q${f(px)} ${f(py)} ${f((px + x) / 2)} ${f((py + y) / 2)}`;
  }
  const last = pts[pts.length - 1];
  return `${d} L${f(last[0])} ${f(last[1])} L${f(last[0])} ${band} Z`;
}

export interface Strip {
  x: number;
  y: number;
  len: number;
  tone: number;
}

/**
 * Окна корпуса — ряды неоновых полос разной длины, как светятся этажи
 * здания ночью. `tones` — сколько цветов в палитре.
 */
export function windowStrips(width: number, rows: number, rowStep: number, seed: number, tones: number): Strip[] {
  const r = rng(seed);
  const out: Strip[] = [];
  for (let row = 0; row < rows; row++) {
    for (let x = between(r, 4, 16); x < width - 12; ) {
      const len = between(r, 10, 34);
      if (r() < 0.7) out.push({ x, y: row * rowStep, len: Math.min(len, width - 6 - x), tone: Math.floor(r() * tones) });
      x += len + between(r, 6, 18);
    }
  }
  return out;
}

/**
 * Неровная капля — гладкий замкнутый контур через точки эллипса с
 * разбросом радиуса: квадратичные кривые через середины соседних точек.
 */
export function blob(cx: number, cy: number, rx: number, ry: number, seed: number, points = 9) {
  const r = rng(seed);
  const pts = Array.from({ length: points }, (_, i) => {
    const a = (i / points) * Math.PI * 2;
    const k = between(r, 0.72, 1.12);
    return [cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k] as const;
  });
  const f = (v: number) => v.toFixed(1);
  const mid = (i: number) => {
    const [x0, y0] = pts[i % points];
    const [x1, y1] = pts[(i + 1) % points];
    return [(x0 + x1) / 2, (y0 + y1) / 2] as const;
  };
  const m0 = mid(0);
  let d = `M${f(m0[0])} ${f(m0[1])}`;
  for (let i = 1; i <= points; i++) {
    const [px, py] = pts[i % points];
    const m = mid(i);
    d += ` Q${f(px)} ${f(py)} ${f(m[0])} ${f(m[1])}`;
  }
  return `${d} Z`;
}

export interface Puddle {
  /** Контур лужи и блик внутри — готовые пути. */
  d: string;
  shine: string;
  y: number;
}

/**
 * Лужицы на земле перед площадкой: неровные плоские капли разного размера,
 * ближе к зрителю — крупнее. Внутри — блик поменьше, как отражение неба.
 * `size` — полуширина лужи у горизонта воды, к зрителю она растёт вдвое.
 */
export function puddles(width: number, depth: number, count: number, seed: number, size: [number, number]): Puddle[] {
  const r = rng(seed);
  return Array.from({ length: count }, (_, i) => {
    const y = depth * ((i + 0.15 + r() * 0.7) / count);
    const near = y / depth;
    const rx = between(r, size[0], size[1]) * (1 + near);
    const ry = rx * between(r, 0.14, 0.22);
    const cx = between(r, -0.05 * width, 1.05 * width);
    const s = Math.floor(r() * 1e6);
    return {
      d: blob(cx, y, rx, ry, s),
      shine: blob(cx - rx * 0.12, y - ry * 0.15, rx * 0.55, ry * 0.45, s + 1, 7),
      y,
    };
  });
}

export interface Cloud {
  x: number;
  y: number;
  w: number;
  tone: 'lit' | 'dim';
}

/**
 * Облака вдоль коридора полёта: на слое с параллаксом `factor` облако на
 * высоте `alt` стоит там, где ракета его пройдёт, со сдвигом в сторону. Иначе
 * облака висели бы где-то в стороне, и ракета летела бы мимо пустоты.
 * `pass(alt)` — точка встречи на слое: x, y при камере на земле.
 */
export function cloudField(
  count: number,
  seed: number,
  alts: [number, number],
  pass: (alt: number) => { x: number; y: number },
  spread: { dx: [number, number]; dy: [number, number]; w: [number, number] },
): Cloud[] {
  const r = rng(seed);
  return Array.from({ length: count }, (_, i) => {
    const alt = alts[0] + ((alts[1] - alts[0]) * (i + r() * 0.8)) / count;
    const at = pass(alt);
    return {
      x: at.x + between(r, spread.dx[0], spread.dx[1]),
      y: at.y + between(r, spread.dy[0], spread.dy[1]),
      w: between(r, spread.w[0], spread.w[1]),
      tone: alt < (alts[0] + alts[1]) / 2 ? 'lit' : 'dim',
    };
  });
}
