import { CAR_HALF, CARS, CENTRI, COUNTDOWN, STRIKE_S, VMAX } from './config';
import { segAt, towerSpan } from './course';
import { clamp, type Rnd } from './math';
import type { CarState, Input, RaceState } from './state';

/**
 * Бот видит только то, что видно игроку: опасность — с её появления на дороге,
 * реагирует с задержкой и иногда не замечает. Состояние бота — только у того,
 * кто его ведёт (сервер, витрина), в снимок оно не входит.
 */
export interface Bot {
  reaction: number;
  miss: number;
  targetX: number;
  timer: number;
  /** Задержка старта: не все трогаются в одно мгновение. */
  wake: number;
  seen: Map<string, number>;
  skip: Set<string>;
}

export function createBot(rnd: Rnd, x: number): Bot {
  return {
    reaction: 0.26 + rnd() * 0.22,
    miss: 0.03 + rnd() * 0.04,
    targetX: x,
    timer: rnd() * 0.1,
    wake: rnd() * 0.3,
    seen: new Map(),
    skip: new Set(),
  };
}

interface Threat {
  t: number;
  a: number;
  b: number;
  w: number;
}

function threats(s: RaceState, car: CarState, bot: Bot, rnd: Rnd): Threat[] {
  const out: Threat[] = [];
  const sp = Math.max(car.speed, 1800);
  const reach = sp * 1.9;
  const c = s.course;
  const add = (key: string, z: number, a: number, b: number, w: number) => {
    const dz = z - car.z;
    if (dz < -260 || dz > reach) return;
    let seen = bot.seen.get(key);
    if (seen === undefined) {
      seen = s.t;
      bot.seen.set(key, s.t);
      if (rnd() < bot.miss) bot.skip.add(key);
    }
    if (bot.skip.has(key) || s.t - seen < bot.reaction) return;
    out.push({ t: Math.max(0, dz) / sp, a, b, w });
  };
  c.mines.forEach((m, i) => {
    if (!s.gone[i]) add('m' + i, m.z, m.x - 0.09, m.x + 0.09, 10);
  });
  c.oils.forEach((o, i) =>
    add('o' + i, o.z + o.len / 2, o.x - o.r, o.x + o.r, 4),
  );
  for (const st of s.strikes)
    if (s.t >= st.at - STRIKE_S)
      add('s' + st.id, st.z, st.x - st.r, st.x + st.r, 12);
  c.pylons.forEach((p, i) => {
    const at = s.towers[i];
    if (!p.falls || at === null || s.t < at) return;
    const [a, b] = towerSpan(p);
    add('p' + i, p.z, a, b, 14);
  });
  for (const o of s.cars)
    if (o.dead && o !== car)
      add('w' + o.slot, o.z, o.x - CAR_HALF, o.x + CAR_HALF, 9);
  return out;
}

/**
 * Куда рулить: из 21 точки поперёк дороги — та, где сумма опасностей меньше,
 * с учётом того, куда машина успеет доехать к каждой из них.
 */
export function botThink(
  s: RaceState,
  car: CarState,
  bot: Bot,
  dt: number,
  rnd: Rnd,
): Input {
  if (s.t - COUNTDOWN < bot.wake)
    return { left: false, right: false, brake: true };
  const steer = CARS[car.car].steer;
  bot.timer -= dt;
  if (bot.timer <= 0) {
    bot.timer = 0.08 + rnd() * 0.05;
    const th = threats(s, car, bot, rnd);
    let best = bot.targetX;
    let bestS = Infinity;
    for (let k = -10; k <= 10; k++) {
      const x = k * 0.085;
      let sc =
        Math.abs(x - car.x) * 0.35 +
        Math.abs(x) * 0.15 -
        (Math.abs(x - bot.targetX) < 0.05 ? 0.1 : 0);
      for (const h of th) {
        const reach = steer * Math.max(0, h.t - 0.06);
        const px = car.x + clamp(x - car.x, -reach, reach);
        if (px + CAR_HALF + 0.04 > h.a && px - CAR_HALF - 0.04 < h.b)
          sc += h.w * (2.2 - Math.min(h.t, 2));
      }
      if (sc < bestS) {
        bestS = sc;
        best = x;
      }
    }
    bot.targetX = best;
  }
  const sp = car.speed / VMAX;
  const want =
    (bot.targetX - car.x) * 7 +
    (segAt(s.course, car.z).curve * sp * sp * CENTRI) / steer;
  return { left: false, right: false, brake: false, steer: clamp(want, -1, 1) };
}
