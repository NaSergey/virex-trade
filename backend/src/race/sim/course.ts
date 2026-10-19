import { FIN, LANES, NSEG, SEG, START_SEG, TOWER_LEN, TOWER_X } from './config';
import { clamp, easeInOut, lerp, rng, type Rnd } from './math';

/** Отрезок дороги: кривизна, высота краёв и свет фонаря на нём (0–1). */
export interface Seg {
  curve: number;
  y1: number;
  y2: number;
  pool: number;
}

export interface Lamp {
  z: number;
  side: 1 | -1;
}

/** Опора ЛЭП у обочины. `prev` — номер ближней опоры той же стороны (провода), −1 — нет. */
export interface Pylon {
  seg: number;
  z: number;
  side: 1 | -1;
  /** Упадёт ли за гонку. */
  falls: boolean;
  /** За сколько секунд до подъезда первой машины загорается красная зона. */
  lead: number;
  prev: number;
}

export interface Mine {
  z: number;
  x: number;
  /** Фаза мигания — только для картинки. */
  ph: number;
}

export interface Oil {
  z: number;
  x: number;
  len: number;
  r: number;
}

/** Всё, что выводится из зерна: дорога и расклад опасностей. Не меняется за гонку. */
export interface Course {
  seed: number;
  segs: Seg[];
  lamps: Lamp[];
  pylons: Pylon[];
  mines: Mine[];
  oils: Oil[];
}

function buildSegs(R: Rnd): Seg[] {
  const out: Seg[] = [];
  let y = 0;
  const add = (n: number, curve: number, dy: number) => {
    const y0 = y;
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const env = Math.min(1, t / 0.3, (1 - t) / 0.3);
      out.push({
        curve: curve * easeInOut(env),
        y1: y0 + dy * easeInOut(k / n),
        y2: y0 + dy * easeInOut((k + 1) / n),
        pool: 0,
      });
    }
    y = y0 + dy;
  };
  add(START_SEG + 26, 0, 0);
  while (out.length < FIN - 70) {
    const n = Math.min(FIN - 70 - out.length, 50 + Math.floor(R() * 80));
    const turn = R() < 0.3 ? 0 : (R() < 0.5 ? -1 : 1) * (1.2 + R() * 2.4);
    const dy = R() < 0.45 ? 0 : (R() * 2 - 1) * 900;
    add(n, turn, dy);
  }
  add(NSEG - out.length, 0, 0);
  return out;
}

/**
 * Трасса из зерна. Порядок вызовов генератора — часть формата: сервер и
 * браузер строят одну и ту же трассу, только пока вызывают его одинаково.
 */
export function buildCourse(seed: number): Course {
  const R = rng(seed);
  const segs = buildSegs(R);

  const lamps: Lamp[] = [];
  for (let i = START_SEG + 2; i < NSEG - 2; i += 8) {
    lamps.push({ z: i * SEG + 100, side: Math.floor(i / 8) % 2 ? 1 : -1 });
    for (let d = -2; d <= 2; d++) {
      const s = segs[i + d];
      if (s) s.pool = Math.max(s.pool, 1 - Math.abs(d) / 2.6);
    }
  }

  const pylons: Pylon[] = [];
  let lastL = -1;
  let lastR = -1;
  for (let i = 14; i < NSEG - 4; i += 20) {
    const side = Math.floor(i / 20) % 2 ? 1 : -1;
    pylons.push({
      seg: i,
      z: i * SEG + 100,
      side,
      falls: false,
      lead: 0,
      prev: side > 0 ? lastR : lastL,
    });
    if (side > 0) lastR = pylons.length - 1;
    else lastL = pylons.length - 1;
  }
  let lastFall = -999;
  for (const p of pylons) {
    const q = p.seg / FIN;
    if (q < 0.1 || q > 0.95 || p.seg - lastFall < 50) continue;
    if (R() < lerp(0.3, 0.75, q)) {
      p.falls = true;
      p.lead = 1.25 + R() * 0.6;
      lastFall = p.seg;
    }
  }

  // У упавшей опоры свободна одна полоса — мина рядом закрыла бы и её.
  const nearFall = (s: number) =>
    pylons.some((p) => p.falls && p.seg - s < 34 && s - p.seg < 22);
  const mines: Mine[] = [];
  const oils: Oil[] = [];
  const mine = (z: number, x: number) => mines.push({ z, x, ph: R() * 6.28 });
  let s = Math.round(FIN * 0.05);
  for (;;) {
    const q = s / FIN;
    // Шаг между минами к финишу сжимается: от 35 до 14 отрезков (подобрано прогоном ботов).
    s += Math.round(lerp(35, 14.5, q) + R() * 11);
    if (s > FIN * 0.97) break;
    if (nearFall(s)) continue;
    const z = s * SEG + 100;
    const r = R();
    if (q > 0.14 && r < 0.12) {
      oils.push({
        z,
        len: 520,
        x: LANES[Math.floor(R() * 3)] + (R() - 0.5) * 0.2,
        r: 0.24,
      });
      continue;
    }
    if (r < 0.45) mine(z, LANES[Math.floor(R() * 3)] + (R() - 0.5) * 0.24);
    else if (r < 0.78) {
      const free = Math.floor(R() * 3);
      for (let l = 0; l < 3; l++)
        if (l !== free)
          mine(z + (R() - 0.5) * 60, LANES[l] + (R() - 0.5) * 0.1);
    } else {
      // «Лесенка» через три полосы: тянется на 28 отрезков, и проверять надо все её мины.
      const dir = R() < 0.5;
      if (!nearFall(s + 14) && !nearFall(s + 28))
        for (let k = 0; k < 3; k++)
          mine(z + k * 14 * SEG, LANES[dir ? k : 2 - k]);
      s += 30;
    }
  }

  return { seed, segs, lamps, pylons, mines, oils };
}

export const segAt = (c: Course, z: number): Seg =>
  c.segs[clamp(Math.floor(z / SEG), 0, NSEG - 1)];

/** Где лежит упавшая опора: от основания за обочиной до верхушки поперёк дороги. */
export function towerSpan(p: Pylon): [number, number] {
  const a = p.side * TOWER_X;
  const b = p.side * (TOWER_X - TOWER_LEN);
  return p.side > 0 ? [b, a + 0.2] : [a - 0.2, b];
}
