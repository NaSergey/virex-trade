import {
  CAR_HALF,
  CARS,
  clamp,
  FALL_S,
  FIN,
  HALF,
  LAMP_X,
  lerp,
  NSEG,
  PH,
  rng,
  SEG,
  segAt,
  START_SEG,
  STRIKE_S,
  TOWER_X,
  towerPhase,
  towerSpan,
  VMAX,
  WARN_S,
  type CarState,
  type Course,
  type SimEvent,
  type Strike,
} from '@/entities/race';
import { carShape } from './cars';
import { circ, ell, ellS, G, hex, line, mix, paintOn, quad, rgb, type RGB } from './paint';

/** Цвет места: 0 — янтарь (акцент игры), 1 — красный, 2 — зелёный палитры игр. */
export const SLOT_COLORS = ['#d9a14f', '#d9554f', '#65c996'];

export interface CarView extends CarState {
  /** Подпись над чужой машиной; null — без подписи. */
  tag: string | null;
  brake: boolean;
}

/** Что рисовать. Сцена не считает гонку — показывает присланное. */
export interface Frame {
  course: Course;
  /** Время гонки, на которое рисуются опоры и прицелы. */
  t: number;
  cars: CarView[];
  /** Место машины, за которой камера. */
  cam: number;
  gone: boolean[];
  towers: (number | null)[];
  strikes: Strike[];
  events: SimEvent[];
}

export interface FrameSource {
  next(dt: number): Frame | null;
}

export interface Renderer {
  resize(w: number, h: number, dpr: number): void;
  draw(f: Frame, dt: number): void;
}

const DRAW = 240;
const CAR_W = CAR_HALF * 2 * HALF;
const FALLEN = (Math.PI / 2) * 0.97;
const FOG: RGB = [23, 17, 28];
const GROUND_A: RGB = [11, 10, 14];
const GROUND_B: RGB = [14, 13, 18];
const GROUND_LIT: RGB = [44, 33, 22];
const ROAD_A: RGB = [27, 26, 31];
const ROAD_B: RGB = [31, 30, 36];
const ROAD_LIT: RGB = [82, 64, 42];
const RUMBLE_A: RGB = [122, 88, 42];
const RUMBLE_B: RGB = [24, 22, 20];
const EDGE: RGB = [196, 192, 182];
const LANE: RGB = [150, 146, 138];
const CHECK: RGB = [226, 222, 212];

const fogAt = (dz: number) => {
  const d = dz / 42000;
  return clamp(1 - Math.exp(-d * d * 2.2), 0, 1);
};

/** Опора ЛЭП: отрезки в мировых единицах, основание в (0,0), вверх — минус. */
const PYL = (() => {
  const L: number[] = [];
  const sg = (a: number, b: number, c: number, d: number) => L.push(a, b, c, d);
  const lx = (y: number) => {
    const hh = -y;
    return hh <= 1450 ? lerp(175, 42, hh / 1450) : lerp(42, 26, (hh - 1450) / (PH - 1450));
  };
  const lv = [0, -290, -590, -880, -1160, -1450, -1640, -1830, -2000];
  for (let i = 0; i < lv.length - 1; i++) {
    const a = lv[i];
    const b = lv[i + 1];
    sg(-lx(a), a, -lx(b), b);
    sg(lx(a), a, lx(b), b);
    sg(-lx(a), a, lx(b), b);
    sg(lx(a), a, -lx(b), b);
    sg(-lx(b), b, lx(b), b);
  }
  sg(-440, -1450, 440, -1450);
  sg(-440, -1450, -lx(-1310), -1310);
  sg(440, -1450, lx(-1310), -1310);
  sg(-340, -1830, 340, -1830);
  sg(-340, -1830, -lx(-1730), -1730);
  sg(340, -1830, lx(-1730), -1730);
  sg(-lx(-2000), -2000, 0, -PH);
  sg(lx(-2000), -2000, 0, -PH);
  const insulators = [
    [-430, -1450],
    [430, -1450],
    [-330, -1830],
    [330, -1830],
  ];
  for (const [x, y] of insulators) sg(x, y, x, y + 110);
  return L;
})();
const ARMS: [number, number][] = [
  [-430, -1340],
  [430, -1340],
  [-330, -1720],
  [330, -1720],
];

interface Backdrop {
  stars: { x: number; y: number; r: number; p: number }[];
  mts: HTMLCanvasElement;
  city: HTMLCanvasElement;
  sky: CanvasGradient;
}

/** Небо, хребет и город — один раз на размер: слои рисуются в свои холсты и дальше только сдвигаются. */
function buildBackdrop(ctx: CanvasRenderingContext2D, w: number, h: number, hy: number): Backdrop {
  const R = rng(11);
  const S = Math.max(0.6, h / 720);
  const span = Math.max(1800, Math.round(w * 1.5));
  const stars = Array.from({ length: 150 }, () => ({ x: R(), y: R() * 0.9, r: 0.6 + R() * 1.1, p: R() * 6.28 }));
  const mts = document.createElement('canvas');
  const mh = Math.round(150 * S);
  mts.width = span;
  mts.height = mh;
  const m = mts.getContext('2d')!;
  m.fillStyle = '#110c17';
  m.beginPath();
  m.moveTo(0, mh);
  for (let x = 0; x <= span; x += 6) {
    const t = (x / span) * Math.PI * 2;
    m.lineTo(x, mh * (0.5 - 0.2 * Math.sin(t * 2 + 1.3) - 0.12 * Math.sin(t * 5 + 0.4) - 0.07 * Math.sin(t * 13 + 2.1)));
  }
  m.lineTo(span, mh);
  m.fill();
  const city = document.createElement('canvas');
  const ch = Math.round(118 * S);
  city.width = span;
  city.height = ch;
  const c = city.getContext('2d')!;
  let x = 0;
  while (x < span - 20) {
    const bw = Math.min((16 + R() * 44) * S, span - x);
    const bh = (12 + R() * (R() < 0.15 ? 96 : 52)) * S;
    c.fillStyle = R() < 0.5 ? '#0a0910' : '#0d0b13';
    c.fillRect(x, ch - bh, bw, bh);
    for (let wy = ch - bh + 4 * S; wy < ch - 4 * S; wy += 6 * S)
      for (let wx = x + 3 * S; wx < x + bw - 4 * S; wx += 5 * S)
        if (R() < 0.15) {
          c.fillStyle = R() < 0.72 ? 'rgba(255,196,120,.5)' : 'rgba(196,206,255,.36)';
          c.fillRect(wx, wy, 2 * S, 2.4 * S);
        }
    if (bh > 70 * S && R() < 0.6) {
      c.fillStyle = '#ff4a3a';
      c.fillRect(x + bw / 2 - S, ch - bh - 5 * S, 2.2 * S, 2.2 * S);
    }
    x += bw + R() * 5 * S;
  }
  const sky = ctx.createLinearGradient(0, 0, 0, hy);
  sky.addColorStop(0, '#040406');
  sky.addColorStop(0.6, '#0a0811');
  sky.addColorStop(1, '#1d1322');
  return { stars, mts, city, sky };
}

type PartKind = 'fire' | 'smoke' | 'dust' | 'spark' | 'debris';
interface Part {
  k: PartKind;
  z: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  size: number;
}
interface Ring {
  z: number;
  x: number;
  t: number;
  max: number;
  r: number;
}
interface Mark {
  z: number;
  x: number;
  r: number;
}
interface P {
  X: number;
  Y: number;
  k: number;
  clip: number;
  dz: number;
  fog: number;
}

function fireCol(u: number) {
  const a = (1 - u) * 0.9;
  if (u < 0.12) return `rgba(255,246,220,${a})`;
  if (u < 0.35) return `rgba(255,196,92,${a})`;
  if (u < 0.65) return `rgba(255,118,44,${a * 0.85})`;
  return `rgba(150,40,18,${a * 0.6})`;
}

/**
 * Сцена гонки на холсте: псевдо-3D отрезками (приём OutRun), туман, фонари,
 * опоры с проводами, машины сзади, мины, прицелы, огонь и дым. Частицы и
 * вспышки — её собственное состояние: из событий кадра и из времени опор и
 * ударов, взрыв одной причины (`src`) — один раз. Перенос эскиза
 * `2026-10-18-race-sketch.html`.
 */
export function createRenderer(canvas: HTMLCanvasElement, opts: { reduced: boolean }): Renderer {
  const ctx = canvas.getContext('2d')!;
  const mono = getComputedStyle(canvas).getPropertyValue('--font-mono').trim() || 'Consolas, monospace';
  const view = { w: 0, h: 0, dpr: 1, f: 800, camH: 1000, dp: 2600, hy: 0 };
  const cam = { z: 0, x: 0, y: 0, base: 0, end: 0 };
  const cx1 = new Float64Array(NSEG);
  const cx2 = new Float64Array(NSEG);
  const clipY = new Float64Array(NSEG);
  let bd: Backdrop | null = null;
  let course: Course | null = null;
  let parts: Part[] = [];
  let rings: Ring[] = [];
  let scorches: Mark[] = [];
  const fired = new Set<string>();
  const emitIn = [0, 0, 0];
  let shake = 0;
  let flash = 0;
  let fade = 0;
  let skyOff = 0;
  let camLat = 0;
  let lastCam = -1;
  let clock = 0;

  function resize(w: number, h: number, dpr: number) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    // Машина стоит на hy + k·h: в ширину — на 0,85 высоты, в вертикальном кадре выше.
    const wide = w > h;
    view.w = w;
    view.h = h;
    view.dpr = dpr;
    view.hy = h * (wide ? 0.4 : 0.3);
    const k = wide ? 0.45 : 0.4;
    const roadPx = wide ? 0.62 * w : 0.95 * w;
    view.camH = (2 * HALF * k * h) / roadPx;
    view.f = (view.dp * k * h) / view.camH;
    bd = buildBackdrop(ctx, w, h, view.hy);
  }

  function proj(z: number, xn: number, yw = 0): P | null {
    const i = Math.floor(z / SEG);
    if (i < cam.base || i >= cam.end) return null;
    const dz = z - cam.z;
    if (dz < 50) return null;
    const s = course!.segs[i];
    const t = (z - i * SEG) / SEG;
    const k = view.f / dz;
    return {
      X: view.w / 2 + (lerp(cx1[i], cx2[i], t) + xn * HALF - cam.x) * k,
      Y: view.hy + (cam.y - lerp(s.y1, s.y2, t) - yw) * k,
      k,
      clip: clipY[i],
      dz,
      fog: fogAt(dz),
    };
  }

  function withClip(y: number, fn: () => void) {
    G.save();
    G.beginPath();
    G.rect(-60, -60, view.w + 120, y + 60);
    G.clip();
    fn();
    G.restore();
  }

  const flatR = (p: P, r: number): [number, number] => {
    const rx = r * HALF * p.k;
    return [rx, rx * clamp(view.camH / p.dz, 0.05, 1)];
  };

  // ── частицы ───────────────────────────────────────────────────

  function puff(k: PartKind, z: number, x: number, y: number, o: Partial<Part>) {
    parts.push({ k, z, x, y, vx: 0, vy: 0, vz: 0, life: 0, max: 1, size: 100, ...o });
  }

  function sparks(z: number, x: number, n: number, y = 40) {
    const R = Math.random;
    for (let i = 0; i < n; i++)
      puff('spark', z, x, y, {
        vx: (R() - 0.5) * 3,
        vy: 400 + R() * 1600,
        vz: (R() - 0.5) * 2400,
        max: 0.35 + R() * 0.5,
        size: 16,
      });
  }

  function boom(z: number, x: number, big: boolean, f: Frame) {
    const R = Math.random;
    const m = big ? 1.35 : 0.85;
    for (let i = 0; i < (big ? 30 : 16); i++)
      puff('fire', z + (R() - 0.5) * 160, x + (R() - 0.5) * 0.1, 20 + R() * 140, {
        vx: (R() - 0.5) * 1.1,
        vy: (300 + R() * 1100) * m,
        vz: (R() - 0.5) * 1100,
        max: 0.45 + R() * 0.45,
        size: (90 + R() * 110) * m,
      });
    for (let i = 0; i < (big ? 12 : 7); i++)
      puff('smoke', z, x + (R() - 0.5) * 0.1, 120 + R() * 200, {
        vx: (R() - 0.5) * 0.4,
        vy: 200 + R() * 300,
        vz: (R() - 0.5) * 300,
        max: 1.5 + R() * 1.2,
        size: (150 + R() * 110) * m,
      });
    for (let i = 0; i < (big ? 10 : 4); i++)
      puff('debris', z, x, 60, {
        vx: (R() - 0.5) * 2.4,
        vy: 700 + R() * 1400,
        vz: (R() - 0.5) * 1800,
        max: 1.1 + R() * 0.5,
        size: 22 + R() * 20,
      });
    sparks(z, x, big ? 22 : 12, 80);
    rings.push({ z, x, t: 0, max: 0.5, r: big ? 0.6 : 0.36 });
    const dz = Math.abs(z - f.cars[f.cam].z);
    if (dz < 7000) {
      flash = Math.max(flash, (big ? 0.32 : 0.18) * (1 - dz / 7000));
      shake = Math.max(shake, (big ? 16 : 8) * (1 - dz / 7000));
    }
  }

  function landDust(i: number, f: Frame) {
    if (fired.has('p' + i)) return;
    fired.add('p' + i);
    const p = course!.pylons[i];
    const [a, b] = towerSpan(p);
    const R = Math.random;
    for (let k = 0; k < 16; k++)
      puff('dust', p.z + (R() - 0.5) * 300, lerp(Math.max(a, -1.1), Math.min(b, 1.1), R()), 40, {
        vx: (R() - 0.5) * 0.5,
        vy: 120 + R() * 260,
        vz: (R() - 0.5) * 600,
        max: 1.2 + R(),
        size: 150 + R() * 120,
      });
    sparks(p.z, lerp(a, b, 0.5), 26, 60);
    const dz = Math.abs(p.z - f.cars[f.cam].z);
    if (dz < 6000) shake = Math.max(shake, 12 * (1 - dz / 6000));
  }

  /** События кадра и то, что выводится из времени: взрыв прицела, легла опора. */
  function applyEvents(f: Frame) {
    for (const e of f.events) {
      if (e.k === 'boom') {
        if (fired.has(e.src)) continue;
        fired.add(e.src);
        boom(e.z, e.x, e.big, f);
        if (e.src[0] === 's') scorches.push({ z: e.z, x: e.x, r: 0.27 });
      } else if (e.k === 'hit') {
        const c = f.cars[e.slot];
        if (c) sparks(c.z, c.x, 14);
        if (e.slot === f.cam && e.dmg > 0) shake = Math.max(shake, e.dmg > 1 ? 22 : 14);
      } else if (e.k === 'land') landDust(e.pylon, f);
    }
    for (const st of f.strikes)
      if (f.t >= st.at && !fired.has('s' + st.id)) {
        fired.add('s' + st.id);
        boom(st.z, st.x, true, f);
        scorches.push({ z: st.z, x: st.x, r: 0.27 });
      }
    course!.pylons.forEach((p, i) => {
      if (p.falls && !fired.has('p' + i) && towerPhase(f.towers[i], f.t) === 'down') landDust(i, f);
    });
  }

  function stepFx(dt: number, f: Frame) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life += dt;
      if (p.life >= p.max) {
        parts[i] = parts[parts.length - 1];
        parts.pop();
        continue;
      }
      p.z += p.vz * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.k === 'spark' || p.k === 'debris') {
        p.vy -= 2800 * dt;
        if (p.y < 0) {
          p.y = 0;
          p.vy *= -0.3;
          p.vz *= 0.6;
          p.vx *= 0.6;
        }
      } else {
        const drag = p.k === 'fire' ? 0.3 : 0.55;
        p.vy *= Math.pow(p.k === 'fire' ? 0.35 : 0.65, dt);
        p.vz *= Math.pow(drag, dt);
        p.vx *= Math.pow(drag, dt);
      }
    }
    if (parts.length > 800) parts.splice(0, parts.length - 800);
    for (const g of rings) g.t += dt;
    rings = rings.filter((g) => g.t < g.max);
    if (scorches.length > 40) scorches = scorches.slice(-40);
    // Опора в красной зоне сыплет искрами у основания.
    course!.pylons.forEach((p, i) => {
      if (towerPhase(f.towers[i], f.t) === 'warn' && Math.random() < 0.35) sparks(p.z, p.side * TOWER_X, 1, 30);
    });
    // Обломки горят 8 с и дымят 14.
    for (const c of f.cars) {
      if (!c.dead) continue;
      emitIn[c.slot] -= dt;
      if (emitIn[c.slot] > 0) continue;
      emitIn[c.slot] = 0.05;
      const age = f.t - c.deadAt;
      const R = Math.random;
      if (age < 8)
        puff('fire', c.z + R() * 60, c.x + (R() - 0.5) * 0.1, 50 + R() * 50, {
          vx: (R() - 0.5) * 0.1,
          vy: 300 + R() * 400,
          max: 0.35 + R() * 0.3,
          size: 55 + R() * 45,
        });
      if (age < 14)
        puff('smoke', c.z, c.x + (R() - 0.5) * 0.08, 150, {
          vx: (R() - 0.5) * 0.08,
          vy: 350 + R() * 200,
          max: 2 + R(),
          size: 110 + R() * 60,
        });
    }
    shake *= Math.pow(0.015, dt);
    flash *= Math.pow(0.004, dt);
    fade *= Math.pow(0.02, dt);
  }

  // ── фон и полотно ─────────────────────────────────────────────

  function tile(img: HTMLCanvasElement, off: number, y: number) {
    const o = ((off % img.width) + img.width) % img.width;
    for (let x = -o; x < view.w; x += img.width) G.drawImage(img, x, y);
  }

  function drawBackdrop() {
    const { w, h, hy } = view;
    const b = bd!;
    G.fillStyle = b.sky;
    G.fillRect(-30, -30, w + 60, hy + 32);
    for (const s of b.stars) {
      G.fillStyle = `rgba(232,230,242,${0.3 + 0.35 * Math.sin(clock * 1.2 + s.p)})`;
      G.fillRect(s.x * w, s.y * hy * 0.85, s.r, s.r);
    }
    const mr = Math.max(14, h * 0.038);
    const wrap = w * 1.4;
    const mx = w * 0.76 - ((((skyOff * 0.05) % wrap) + wrap) % wrap) + w * 0.2;
    const my = hy * 0.32;
    G.save();
    G.globalCompositeOperation = 'lighter';
    const halo = G.createRadialGradient(mx, my, mr, mx, my, mr * 4);
    halo.addColorStop(0, 'rgba(232,226,210,.09)');
    halo.addColorStop(1, 'rgba(232,226,210,0)');
    G.fillStyle = halo;
    G.fillRect(mx - mr * 4, my - mr * 4, mr * 8, mr * 8);
    G.restore();
    G.fillStyle = '#e6e0d0';
    circ(mx, my, mr);
    G.fillStyle = 'rgba(40,30,30,.08)';
    circ(mx - mr * 0.3, my - mr * 0.2, mr * 0.28);
    circ(mx + mr * 0.35, my + mr * 0.25, mr * 0.18);
    circ(mx + mr * 0.1, my - mr * 0.5, mr * 0.12);
    tile(b.mts, skyOff * 0.22, hy - b.mts.height);
    const glow = G.createLinearGradient(0, hy - 70, 0, hy);
    glow.addColorStop(0, 'rgba(217,161,79,0)');
    glow.addColorStop(1, 'rgba(217,161,79,.10)');
    G.fillStyle = glow;
    G.fillRect(-30, hy - 70, w + 60, 70);
    tile(b.city, skyOff * 0.5, hy - b.city.height);
    G.fillStyle = '#0b0a0e';
    G.fillRect(-30, hy, w + 60, h - hy + 60);
  }

  function drawSeg(i: number, X1: number, Y1: number, R1: number, X2: number, Y2: number, R2: number, dz: number) {
    const s = course!.segs[i];
    const fog = fogAt(dz);
    const alt = Math.floor(i / 3) % 2;
    let gc = alt ? GROUND_A : GROUND_B;
    if (s.pool) gc = mix(gc, GROUND_LIT, s.pool * 0.5);
    G.fillStyle = rgb(mix(gc, FOG, fog));
    G.fillRect(-30, Y2, view.w + 60, Math.min(Y1, view.h + 30) - Y2 + 1);
    G.fillStyle = rgb(mix(Math.floor(i / 2) % 2 ? RUMBLE_A : RUMBLE_B, FOG, fog));
    quad(X1 - R1 * 1.09, Y1, X1 - R1, Y1, X2 - R2, Y2, X2 - R2 * 1.09, Y2);
    quad(X1 + R1, Y1, X1 + R1 * 1.09, Y1, X2 + R2 * 1.09, Y2, X2 + R2, Y2);
    let rc = alt ? ROAD_A : ROAD_B;
    if (s.pool) rc = mix(rc, ROAD_LIT, s.pool * 0.55);
    G.fillStyle = rgb(mix(rc, FOG, fog));
    quad(X1 - R1, Y1, X1 + R1, Y1, X2 + R2, Y2, X2 - R2, Y2);
    if (i === START_SEG || i === FIN) {
      G.fillStyle = rgb(mix(CHECK, FOG, fog));
      for (let row = 0; row < 2; row++) {
        const ya = lerp(Y1, Y2, row / 2);
        const yb = lerp(Y1, Y2, (row + 1) / 2);
        const xa = lerp(X1, X2, row / 2);
        const xb = lerp(X1, X2, (row + 1) / 2);
        const ra = lerp(R1, R2, row / 2);
        const rb = lerp(R1, R2, (row + 1) / 2);
        for (let col = 0; col < 14; col++) {
          if ((col + row) % 2) continue;
          const u0 = -1 + col / 7;
          const u1 = -1 + (col + 1) / 7;
          quad(xa + u0 * ra, ya, xa + u1 * ra, ya, xb + u1 * rb, yb, xb + u0 * rb, yb);
        }
      }
      return;
    }
    const e1 = R1 * 0.016;
    const e2 = R2 * 0.016;
    G.fillStyle = rgb(mix(EDGE, FOG, fog));
    for (const sd of [-0.965, 0.965])
      quad(X1 + sd * R1 - e1, Y1, X1 + sd * R1 + e1, Y1, X2 + sd * R2 + e2, Y2, X2 + sd * R2 - e2, Y2);
    if (i % 4 < 2) {
      G.fillStyle = rgb(mix(LANE, FOG, fog));
      for (const L of [-1 / 3, 1 / 3])
        quad(
          X1 + L * R1 - e1 * 0.8,
          Y1,
          X1 + L * R1 + e1 * 0.8,
          Y1,
          X2 + L * R2 + e2 * 0.8,
          Y2,
          X2 + L * R2 - e2 * 0.8,
          Y2,
        );
    }
  }

  // ── предметы ──────────────────────────────────────────────────

  function drawCar(c: CarView, f: Frame) {
    const p = proj(c.z, c.x);
    if (!p) return;
    const k = (p.k * CAR_W) / 200;
    const tgt = f.cars[f.cam];
    const def = CARS[c.car];
    withClip(p.clip, () => {
      G.save();
      G.translate(p.X, p.Y);
      let rot = (c.vx / def.steer) * 0.05;
      if (c.spin > 0) rot += Math.sin(clock * 24) * 0.3 * Math.min(1, c.spin / def.stun);
      if (c.dead) rot += c.slot % 2 ? 0.2 : -0.2;
      G.rotate(rot);
      G.scale(k, k);
      G.globalAlpha = (1 - p.fog * 0.8) * (c.inv > 0 && Math.floor(clock * 12) % 2 ? 0.55 : 1);
      carShape(c.car, hex(SLOT_COLORS[c.slot]), { dead: c.dead, brake: c.brake || c.spin > 0, t: clock });
      G.restore();
      if (c.slot === f.cam || c.dead || !c.tag || p.dz > 20000 || c.z < tgt.z + 200) return;
      const ty = p.Y - 150 * k - 12;
      G.font = `600 11px ${mono}`;
      const tw = G.measureText(c.tag).width;
      G.globalAlpha = 1 - p.fog;
      G.fillStyle = 'rgba(5,5,5,.75)';
      G.fillRect(p.X - tw / 2 - 14, ty - 9, tw + 22, 17);
      G.fillStyle = SLOT_COLORS[c.slot];
      G.fillRect(p.X - tw / 2 - 9, ty - 3, 6, 6);
      G.fillStyle = '#f2f0ea';
      G.textBaseline = 'middle';
      G.fillText(c.tag, p.X - tw / 2 + 2, ty);
    });
  }

  function drawBeam(c: CarView) {
    const a = proj(c.z + 160, c.x);
    const b = proj(c.z + 3800, c.x);
    if (!a || !b) return;
    const wa = 0.13 * HALF * a.k;
    const wb = 0.52 * HALF * b.k;
    withClip(a.clip, () => {
      G.globalCompositeOperation = 'lighter';
      const g = G.createLinearGradient(0, a.Y, 0, b.Y);
      g.addColorStop(0, `rgba(255,236,200,${0.15 * (1 - a.fog)})`);
      g.addColorStop(1, 'rgba(255,236,200,0)');
      G.fillStyle = g;
      quad(a.X - wa, a.Y, a.X + wa, a.Y, b.X + wb, b.Y, b.X - wb, b.Y);
    });
  }

  function pylonTheta(i: number, f: Frame) {
    const at = f.towers[i];
    const ph = towerPhase(at, f.t);
    if (ph === 'stand' || at === null) return 0;
    if (ph === 'warn') return 0.035 * Math.sin((f.t - at) * 38);
    if (ph === 'fall') {
      const u = Math.min(1, (f.t - at - WARN_S) / FALL_S);
      return 0.04 + (FALLEN - 0.04) * u * u;
    }
    return FALLEN;
  }

  function drawPylon(i: number, f: Frame) {
    const p = course!.pylons[i];
    const q = proj(p.z, p.side * TOWER_X);
    if (!q) return;
    const ph = towerPhase(f.towers[i], f.t);
    withClip(q.clip, () => {
      G.globalAlpha = 1 - q.fog * 0.9;
      const prev = p.prev >= 0 ? course!.pylons[p.prev] : null;
      const prevPh = prev ? towerPhase(f.towers[p.prev], f.t) : 'stand';
      if (prev && (ph === 'stand' || ph === 'warn') && (prevPh === 'stand' || prevPh === 'warn')) {
        G.strokeStyle = 'rgba(150,154,170,.3)';
        G.lineWidth = 1;
        for (const [ax, ay] of ARMS) {
          const a = proj(p.z, p.side * TOWER_X + ax / HALF, -ay);
          const b = proj(prev.z, prev.side * TOWER_X + ax / HALF, -ay);
          if (!a || !b) continue;
          G.beginPath();
          G.moveTo(a.X, a.Y);
          G.quadraticCurveTo(
            (a.X + b.X) / 2,
            (a.Y + b.Y) / 2 + Math.abs(b.X - a.X) * 0.06 + (b.Y - a.Y) * 0.08,
            b.X,
            b.Y,
          );
          G.stroke();
        }
      }
      G.save();
      G.translate(q.X, q.Y);
      G.rotate(-p.side * pylonTheta(i, f));
      G.scale(q.k, q.k);
      G.strokeStyle = p.falls && ph !== 'stand' ? '#a39690' : '#767a87';
      G.lineWidth = Math.max(13, 0.9 / q.k);
      G.beginPath();
      for (let j = 0; j < PYL.length; j += 4) {
        G.moveTo(PYL[j], PYL[j + 1]);
        G.lineTo(PYL[j + 2], PYL[j + 3]);
      }
      G.stroke();
      const on =
        ph === 'warn' || ph === 'fall' ? Math.floor(clock * 10) % 2 === 0 : Math.sin(clock * 2.6 + p.seg) > 0.3;
      if (on) {
        G.globalCompositeOperation = 'lighter';
        G.fillStyle = 'rgba(255,60,50,.35)';
        circ(0, -PH - 10, Math.max(70, 3 / q.k));
        G.fillStyle = '#ff4a3a';
        circ(0, -PH - 10, Math.max(24, 1.2 / q.k));
      }
      G.restore();
    });
  }

  function drawZone(i: number) {
    const p = course!.pylons[i];
    const [a, b] = towerSpan(p);
    const A = Math.max(a, -1.12);
    const B = Math.min(b, 1.12);
    const n = proj(p.z - 170, 0);
    const fz = proj(p.z + 170, 0);
    if (!n || !fz) return;
    const pulse = 0.5 + 0.5 * Math.sin(clock * 18);
    withClip(n.clip, () => {
      G.fillStyle = `rgba(217,60,50,${0.18 + 0.16 * pulse})`;
      quad(
        n.X + A * HALF * n.k,
        n.Y,
        n.X + B * HALF * n.k,
        n.Y,
        fz.X + B * HALF * fz.k,
        fz.Y,
        fz.X + A * HALF * fz.k,
        fz.Y,
      );
      G.strokeStyle = 'rgba(255,96,84,.9)';
      G.lineWidth = Math.max(1, 16 * n.k);
      line(n.X + A * HALF * n.k, n.Y, n.X + B * HALF * n.k, n.Y);
      line(fz.X + A * HALF * fz.k, fz.Y, fz.X + B * HALF * fz.k, fz.Y);
    });
  }

  function drawLamp(z: number, side: number) {
    const p = proj(z, side * LAMP_X);
    if (!p) return;
    const k = p.k;
    const top = p.Y - 1000 * k;
    const ax = p.X - side * 300 * k;
    withClip(p.clip, () => {
      G.globalAlpha = 1 - p.fog * 0.85;
      G.strokeStyle = '#2b2a30';
      G.lineWidth = Math.max(1, 24 * k);
      line(p.X, p.Y, p.X, top);
      line(p.X, top, ax, top + 20 * k);
      G.fillStyle = '#ffd99a';
      G.fillRect(ax - 40 * k, top + 10 * k, 80 * k, 16 * k);
      G.globalCompositeOperation = 'lighter';
      const R = 360 * k;
      const cy = top + 22 * k;
      const g = G.createRadialGradient(ax, cy, 0, ax, cy, R);
      g.addColorStop(0, 'rgba(255,200,120,.32)');
      g.addColorStop(1, 'rgba(255,200,120,0)');
      G.fillStyle = g;
      G.fillRect(ax - R, cy - R, R * 2, R * 2);
    });
  }

  function drawMine(i: number) {
    const m = course!.mines[i];
    const p = proj(m.z, m.x);
    if (!p) return;
    const [rx, ry] = flatR(p, 0.085);
    withClip(p.clip, () => {
      G.globalAlpha = 1 - p.fog * 0.6;
      G.fillStyle = '#0c0c0f';
      ell(p.X, p.Y, rx * 1.15, ry * 1.15);
      G.fillStyle = '#3a3940';
      ell(p.X, p.Y - 26 * p.k, rx * 0.8, Math.max(ry * 0.8, 22 * p.k));
      G.fillStyle = '#56555d';
      ell(p.X, p.Y - 46 * p.k, rx * 0.3, Math.max(ry * 0.3, 10 * p.k));
      if (Math.sin(clock * 9 + m.ph) > 0) {
        G.globalAlpha = 1;
        G.globalCompositeOperation = 'lighter';
        G.fillStyle = 'rgba(255,50,40,.22)';
        ell(p.X, p.Y - 40 * p.k, Math.max(4, rx * 0.8), Math.max(3, rx * 0.5));
        G.fillStyle = '#ff3b30';
        circ(p.X, p.Y - 50 * p.k, Math.max(1.6, 14 * p.k));
      }
    });
  }

  function drawOil(i: number) {
    const o = course!.oils[i];
    const n = proj(o.z, o.x);
    const f = proj(o.z + o.len, o.x);
    if (!n || !f) return;
    const rx = (o.r * HALF * (n.k + f.k)) / 2;
    const ry = Math.max(1, (n.Y - f.Y) / 2);
    const cx = (n.X + f.X) / 2;
    const cy = (n.Y + f.Y) / 2;
    withClip(n.clip, () => {
      G.globalAlpha = 1 - n.fog * 0.7;
      G.fillStyle = 'rgba(5,5,8,.94)';
      ell(cx, cy, rx, ry);
      G.lineWidth = Math.max(1, 14 * n.k);
      G.strokeStyle = 'rgba(150,110,210,.3)';
      ellS(cx - rx * 0.1, cy, rx * 0.66, ry * 0.6);
      G.strokeStyle = 'rgba(90,180,170,.22)';
      ellS(cx + rx * 0.12, cy + ry * 0.05, rx * 0.4, ry * 0.36);
    });
  }

  function drawStrike(s: Strike, t: number) {
    const p = proj(s.z, s.x);
    if (!p) return;
    const u = clamp((t - (s.at - STRIKE_S)) / STRIKE_S, 0, 1);
    const [R0, ry0] = flatR(p, s.r);
    const g = 1 + 0.7 * (1 - u);
    const R = R0 * g;
    const ry = ry0 * g;
    withClip(p.clip, () => {
      const fast = Math.sin(clock * (10 + u * 34)) > 0;
      G.fillStyle = `rgba(217,60,50,${0.1 + 0.14 * u})`;
      ell(p.X, p.Y, R, ry);
      G.strokeStyle = fast ? '#ff5b4f' : 'rgba(255,91,79,.5)';
      G.lineWidth = Math.max(1.4, 30 * p.k);
      ellS(p.X, p.Y, R, ry);
      G.lineWidth = Math.max(1, 16 * p.k);
      ellS(p.X, p.Y, R0 * 0.32, ry0 * 0.32);
      line(p.X - R * 1.18, p.Y, p.X - R * 0.62, p.Y);
      line(p.X + R * 0.62, p.Y, p.X + R * 1.18, p.Y);
      line(p.X, p.Y - ry * 1.4, p.X, p.Y - ry * 0.62);
      line(p.X, p.Y + ry * 0.62, p.X, p.Y + ry * 1.4);
    });
    if (t > s.at - 0.42) {
      const v = (s.at - t) / 0.42;
      const top = proj(s.z, s.x, v * 9000 + 1100);
      const bot = proj(s.z, s.x, v * 9000);
      if (top && bot) {
        G.save();
        G.globalCompositeOperation = 'lighter';
        G.strokeStyle = 'rgba(255,120,60,.35)';
        G.lineWidth = Math.max(6, 120 * p.k);
        line(top.X, top.Y, bot.X, bot.Y);
        G.strokeStyle = 'rgba(255,226,180,.95)';
        G.lineWidth = Math.max(2, 40 * p.k);
        line(top.X, top.Y, bot.X, bot.Y);
        G.restore();
      }
    }
  }

  function drawScorch(d: Mark) {
    const p = proj(d.z, d.x);
    if (!p) return;
    const [rx, ry] = flatR(p, d.r);
    withClip(p.clip, () => {
      G.fillStyle = `rgba(4,4,5,${0.62 * (1 - p.fog)})`;
      ell(p.X, p.Y, rx, ry);
      G.fillStyle = `rgba(4,4,5,${0.4 * (1 - p.fog)})`;
      ell(p.X + rx * 0.3, p.Y + ry * 0.1, rx * 0.6, ry * 0.7);
    });
  }

  function drawRing(g: Ring) {
    const p = proj(g.z, g.x);
    if (!p) return;
    const u = g.t / g.max;
    const [rx, ry] = flatR(p, g.r * (0.3 + u * 1.3));
    G.globalCompositeOperation = 'lighter';
    G.strokeStyle = `rgba(255,170,90,${0.7 * (1 - u)})`;
    G.lineWidth = Math.max(1.5, 50 * p.k * (1 - u));
    ellS(p.X, p.Y, rx, ry);
  }

  function drawPart(pt: Part) {
    const p = proj(pt.z, pt.x, pt.y);
    if (!p) return;
    const u = pt.life / pt.max;
    if (pt.k === 'fire') {
      G.globalCompositeOperation = 'lighter';
      G.fillStyle = fireCol(u);
      circ(p.X, p.Y, pt.size * (0.5 + u) * p.k);
    } else if (pt.k === 'smoke') {
      G.fillStyle = `rgba(26,24,30,${0.55 * (1 - u) * (1 - p.fog)})`;
      circ(p.X, p.Y, pt.size * (1 + u * 2.2) * p.k);
    } else if (pt.k === 'dust') {
      G.fillStyle = `rgba(110,102,96,${0.32 * (1 - u) * (1 - p.fog)})`;
      circ(p.X, p.Y, pt.size * (1 + u * 1.6) * p.k);
    } else if (pt.k === 'spark') {
      G.globalCompositeOperation = 'lighter';
      G.strokeStyle = `rgba(255,${(214 - u * 120) | 0},130,${1 - u})`;
      G.lineWidth = Math.max(1, 10 * p.k);
      line(p.X, p.Y, p.X - pt.vx * HALF * p.k * 0.018, p.Y + pt.vy * p.k * 0.018);
    } else {
      const r = Math.max(1, pt.size * p.k);
      G.fillStyle = '#19181c';
      G.fillRect(p.X - r, p.Y - r, r * 2, r * 2);
    }
  }

  function drawGate() {
    const L = proj(FIN * SEG + 1, -1.3);
    const R = proj(FIN * SEG + 1, 1.3);
    if (!L || !R) return;
    const k = L.k;
    const top = L.Y - 1600 * k;
    const h = 380 * k;
    const cell = h / 4;
    withClip(L.clip, () => {
      G.globalAlpha = 1 - L.fog * 0.8;
      G.fillStyle = '#1d1c21';
      G.fillRect(L.X - 30 * k, top, 60 * k, L.Y - top);
      G.fillRect(R.X - 30 * k, top, 60 * k, R.Y - top);
      G.fillStyle = '#0e0d11';
      G.fillRect(L.X, top, R.X - L.X, h);
      const cols = Math.max(2, Math.round((R.X - L.X) / cell));
      const cw = (R.X - L.X) / cols;
      G.fillStyle = '#e2ded4';
      for (let c = 0; c < cols; c++)
        for (const row of [0, 3]) if ((c + row) % 2 === 0) G.fillRect(L.X + c * cw, top + row * cell, cw, cell);
      G.fillStyle = '#d9a14f';
      G.font = `600 ${Math.max(6, cell * 1.35) | 0}px ${mono}`;
      G.textAlign = 'center';
      G.textBaseline = 'middle';
      G.fillText('FINISH', (L.X + R.X) / 2, top + h / 2);
    });
  }

  // ── кадр ──────────────────────────────────────────────────────

  function draw(f: Frame, dt: number) {
    if (!view.w || !bd) return;
    if (f.course !== course) {
      // Новая трасса — новая гонка: прошлые частицы прочь, а уже лёгшие опоры
      // не должны пыхнуть все разом при входе посреди гонки.
      course = f.course;
      parts = [];
      rings = [];
      scorches = [];
      fired.clear();
      lastCam = -1;
      course.pylons.forEach((p, i) => {
        if (towerPhase(f.towers[i], f.t) === 'down') fired.add('p' + i);
      });
    }
    const c = course;
    clock += dt;
    paintOn(ctx);
    const tgt = f.cars[f.cam];
    if (f.cam !== lastCam) {
      if (lastCam >= 0) fade = 1;
      camLat = tgt.x * HALF * 0.72;
      lastCam = f.cam;
    }
    applyEvents(f);
    stepFx(dt, f);

    const { w, h, dpr } = view;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sh = opts.reduced ? 0 : shake;
    ctx.translate((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);
    skyOff += segAt(c, tgt.z).curve * (tgt.speed / VMAX) * dt * 40;
    drawBackdrop();

    const camZ = tgt.z - view.dp;
    const base = clamp(Math.floor(camZ / SEG), 0, NSEG - 2);
    const bp = clamp((camZ - base * SEG) / SEG, 0, 1);
    const end = Math.min(NSEG, base + DRAW);
    const segs = c.segs;
    let x = 0;
    let dx = -(segs[base].curve * bp);
    for (let i = base; i < end; i++) {
      cx1[i] = x;
      cx2[i] = x + dx;
      x += dx;
      dx += segs[i].curve;
    }
    const ti = clamp(Math.floor(tgt.z / SEG), base, end - 1);
    const tt = (tgt.z - ti * SEG) / SEG;
    camLat += (tgt.x * HALF * 0.72 - camLat) * Math.min(1, dt * 7);
    cam.z = camZ;
    cam.base = base;
    cam.end = end;
    cam.x = lerp(cx1[ti], cx2[ti], tt) + camLat;
    cam.y = view.camH + lerp(segs[ti].y1, segs[ti].y2, tt);

    let maxY = h + 30;
    for (let i = base; i < end; i++) {
      const s = segs[i];
      clipY[i] = maxY;
      const z1 = i * SEG - camZ;
      if (z1 < 40) continue;
      const s1 = view.f / z1;
      const s2 = view.f / (z1 + SEG);
      const X1 = w / 2 + (cx1[i] - cam.x) * s1;
      const Y1 = view.hy + (cam.y - s.y1) * s1;
      const X2 = w / 2 + (cx2[i] - cam.x) * s2;
      const Y2 = view.hy + (cam.y - s.y2) * s2;
      if (Y2 >= maxY) continue;
      drawSeg(i, X1, Y1, HALF * s1, X2, Y2, HALF * s2, z1);
      maxY = Y2;
    }

    // Предметы — от дальних к ближним; пометки на дороге — раньше того, что стоит на том же месте.
    const D: { d: number; fn: () => void }[] = [];
    const zMin = camZ + 60;
    const zMax = end * SEG;
    const put = (z: number, bias: number, fn: () => void) => {
      if (z > zMin && z < zMax) D.push({ d: z - camZ + bias, fn });
    };
    for (const l of c.lamps) put(l.z, 0, () => drawLamp(l.z, l.side));
    c.pylons.forEach((p, i) => {
      put(p.z, 0, () => drawPylon(i, f));
      const ph = towerPhase(f.towers[i], f.t);
      if (p.falls && (ph === 'warn' || ph === 'fall')) put(p.z, 4, () => drawZone(i));
    });
    for (const d of scorches) put(d.z, 6, () => drawScorch(d));
    c.mines.forEach((m, i) => {
      if (!f.gone[i]) put(m.z, 3, () => drawMine(i));
    });
    c.oils.forEach((o, i) => put(o.z, 3, () => drawOil(i)));
    for (const s of f.strikes)
      if (f.t >= s.at - STRIKE_S && f.t < s.at + 0.05) put(s.z, 2, () => drawStrike(s, f.t));
    for (const g of rings) put(g.z, 1, () => drawRing(g));
    for (const car of f.cars) {
      if (!car.dead) put(car.z, 5, () => drawBeam(car));
      put(car.z, 0, () => drawCar(car, f));
    }
    for (const pt of parts) put(pt.z, -1, () => drawPart(pt));
    put(FIN * SEG + 1, 0, drawGate);
    D.sort((a, b) => b.d - a.d);
    for (const it of D) {
      G.save();
      it.fn();
      G.restore();
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (flash > 0.01 && !opts.reduced) {
      G.fillStyle = `rgba(255,214,170,${flash})`;
      G.fillRect(0, 0, w, h);
    }
    if (fade > 0.01) {
      G.fillStyle = `rgba(5,5,5,${fade})`;
      G.fillRect(0, 0, w, h);
    }
    const vg = G.createRadialGradient(w / 2, h * 0.55, Math.min(w, h) * 0.45, w / 2, h * 0.55, Math.max(w, h) * 0.8);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,.45)');
    G.fillStyle = vg;
    G.fillRect(0, 0, w, h);
  }

  return { resize, draw };
}
