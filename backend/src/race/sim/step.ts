import { botThink, type Bot } from './bot';
import {
  AFTER_FIRST,
  MAX_RACE_S,
  ANNOUNCE,
  CAR_HALF,
  CARS,
  CENTRI,
  COUNTDOWN,
  FALL_S,
  HIT,
  STRIKE_S,
  TRACK_LEN,
  VMAX,
  WARN_S,
} from './config';
import { segAt, towerSpan } from './course';
import type { Cause, SimEvent } from './events';
import { clamp, lerp, type Rnd } from './math';
import { progressOf, type CarState, type Input, type RaceState } from './state';

export interface StepCtx {
  /** Нажатия места. У бота не спрашиваются — его ведёт `bots`. */
  input: (slot: number) => Input;
  /** Случайность хода: удары с неба и боты. null — шаг без них (предсказание в браузере). */
  rnd: Rnd | null;
  bots: Map<number, Bot> | null;
}

/**
 * Удар: крутит, отнимает скорость, снимает прочность. В неуязвимости — только
 * крутит (событие с нулём): машину тряхнуло, но второй раз за то же она не платит.
 */
export function hurt(
  s: RaceState,
  car: CarState,
  dmg: number,
  cause: Cause,
  ev: SimEvent[],
): void {
  if (car.dead || car.finished) return;
  const d = CARS[car.car];
  car.spin = d.stun;
  car.speed *= d.knock;
  car.vx *= 0.3;
  if (car.inv > 0) {
    ev.push({ k: 'hit', t: s.t, slot: car.slot, dmg: 0, cause });
    return;
  }
  car.inv = 1.1;
  car.hp = Math.max(0, car.hp - dmg);
  if (car.hp > 0) {
    ev.push({ k: 'hit', t: s.t, slot: car.slot, dmg, cause });
    return;
  }
  car.dead = true;
  car.deadAt = s.t;
  car.vx = car.x > 0 ? 0.5 : -0.5;
  ev.push({
    k: 'boom',
    t: s.t,
    z: car.z + 80,
    x: car.x,
    big: true,
    src: 'c' + car.slot,
  });
  ev.push({ k: 'out', t: s.t, slot: car.slot, cause });
}

/** Физика одной машины: газ нажат всегда, тормоз, руль, снос в повороте, отбойник. */
export function driveCar(
  s: RaceState,
  car: CarState,
  dt: number,
  inp: Input,
): void {
  const d = CARS[car.car];
  car.inv = Math.max(0, car.inv - dt);
  if (car.dead) {
    car.speed = Math.max(0, car.speed - 4200 * dt);
    car.z += car.speed * dt;
    car.x = clamp(car.x + car.vx * dt, -1.25, 1.25);
    car.vx *= Math.pow(0.1, dt);
    return;
  }
  let steer = inp.steer ?? (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
  if (car.finished) {
    steer = 0;
    car.speed = Math.max(0, car.speed - 1500 * dt);
  } else {
    const max = d.max * (Math.abs(car.x) > 1.02 ? 0.5 : 1);
    if (car.spin > 0) {
      car.spin -= dt;
      steer = 0;
    }
    if (inp.brake) car.speed -= 5600 * dt;
    else if (car.speed < max)
      car.speed += d.acc * dt * (1 - (0.6 * car.speed) / max);
    if (car.speed > max) car.speed = Math.max(max, car.speed - 5000 * dt);
    if (car.speed < 0) car.speed = 0;
  }
  const slide = car.slide > 0;
  if (slide) car.slide -= dt;
  const want = steer * d.steer * (slide ? 0.25 : 1);
  car.vx += (want - car.vx) * Math.min(1, (slide ? 1.5 : 16) * dt);
  const sp = car.speed / VMAX;
  car.x += car.vx * dt - segAt(s.course, car.z).curve * sp * sp * CENTRI * dt;
  if (car.x > 1.3 || car.x < -1.3) {
    car.x = clamp(car.x, -1.3, 1.3);
    car.vx = 0;
    car.speed *= Math.pow(0.4, dt);
  }
  car.z += car.speed * dt;
}

/**
 * Удары о то, что лежит на дороге: мины, масло, лежащие опоры, обломки. Всё это
 * известно браузеру, поэтому функция общая с его предсказанием.
 */
export function collideCar(s: RaceState, car: CarState, ev: SimEvent[]): void {
  if (car.dead || car.finished) return;
  const c = s.course;
  const bit = 1 << car.slot;
  for (let i = 0; i < c.mines.length; i++) {
    if (s.gone[i]) continue;
    const m = c.mines[i];
    if (Math.abs(car.z - m.z) < 150 && Math.abs(car.x - m.x) < HIT + 0.07) {
      s.gone[i] = true;
      ev.push({ k: 'boom', t: s.t, z: m.z, x: m.x, big: false, src: 'm' + i });
      hurt(s, car, 1, 'mine', ev);
    }
  }
  for (const o of c.oils) {
    if (
      car.slide > 0 ||
      car.z <= o.z ||
      car.z >= o.z + o.len ||
      Math.abs(car.x - o.x) >= o.r + HIT * 0.5
    )
      continue;
    car.slide = 0.85;
    // Несёт прочь от середины лужи: направление — правило, а не жребий, иначе
    // предсказание браузера расходилось бы с сервером на каждой луже.
    car.vx += (car.x >= o.x ? 1 : -1) * 1.8;
    ev.push({ k: 'slide', t: s.t, slot: car.slot });
  }
  for (let i = 0; i < c.pylons.length; i++) {
    if (!s.landed[i] || s.towerHits[i] & bit) continue;
    const p = c.pylons[i];
    if (Math.abs(car.z - p.z) > 130) continue;
    const [a, b] = towerSpan(p);
    if (car.x + HIT > a && car.x - HIT < b) {
      s.towerHits[i] |= bit;
      car.speed *= 0.4;
      hurt(s, car, 1, 'pylon', ev);
    }
  }
  for (const w of s.cars) {
    if (!w.dead || w === car || w.wreckHits & bit) continue;
    if (Math.abs(car.z - w.z) < 260 && Math.abs(car.x - w.x) < HIT * 2) {
      w.wreckHits |= bit;
      car.speed *= 0.55;
      hurt(s, car, 1, 'wreck', ev);
    }
  }
}

function shuffle<T>(a: T[], rnd: Rnd): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Удар с неба — по очереди на каждую живую машину, туда, где она будет к взрыву. */
function spawnStrike(s: RaceState, rnd: Rnd) {
  if (!s.rr.length)
    s.rr = shuffle(
      s.cars.map((c) => c.slot),
      rnd,
    );
  for (let n = 0; n < s.rr.length; n++) {
    const c = s.cars[s.rr[n]];
    if (c.dead || c.finished || c.z > TRACK_LEN - c.speed * 2.4) continue;
    s.rr.splice(n, 1);
    const lead = ANNOUNCE + STRIKE_S;
    s.strikes.push({
      id: ++s.strikeSeq,
      z: c.z + Math.max(c.speed, 2500) * lead * (0.92 + rnd() * 0.16),
      x: clamp(c.x + (rnd() - 0.5) * 0.25, -0.85, 0.85),
      r: 0.3,
      at: s.t + lead,
      target: c.slot,
    });
    return;
  }
}

/** Чем ближе лидер к финишу, тем чаще удары. */
function schedule(s: RaceState, rnd: Rnd) {
  if (s.t < s.nextStrike) return;
  const alive = s.cars.filter((c) => !c.dead);
  const lead = alive.length ? Math.max(...alive.map(progressOf)) : 0;
  if (lead > 0.2) spawnStrike(s, rnd);
  s.nextStrike =
    s.t + lerp(4.4, 2.3, clamp((lead - 0.2) / 0.8, 0, 1)) + rnd() * 1.2;
}

/** Один шаг гонки. Время — первым: всё, что шаг пишет в события, помечено концом шага. */
export function step(
  s: RaceState,
  dt: number,
  ctx: StepCtx,
  ev: SimEvent[],
): void {
  if (s.over) return;
  s.t += dt;
  if (s.t < COUNTDOWN) return;
  const c = s.course;

  for (const car of s.cars) {
    const bot = ctx.bots?.get(car.slot);
    const inp =
      bot && ctx.rnd && !car.dead && !car.finished
        ? botThink(s, car, bot, dt, ctx.rnd)
        : ctx.input(car.slot);
    driveCar(s, car, dt, inp);
  }

  // Машины друг друга не ломают — только расталкивают.
  for (let i = 0; i < s.cars.length; i++)
    for (let j = i + 1; j < s.cars.length; j++) {
      const a = s.cars[i];
      const b = s.cars[j];
      if (a.dead || b.dead || a.finished || b.finished) continue;
      const gap = Math.abs(a.x - b.x);
      if (Math.abs(a.z - b.z) >= 360 || gap >= CAR_HALF * 2) continue;
      const push = (CAR_HALF * 2 - gap) / 2 + 0.002;
      const dir = a.x < b.x ? -1 : 1;
      a.x += dir * push;
      b.x -= dir * push;
      a.vx += dir * 0.4;
      b.vx -= dir * 0.4;
      (a.z < b.z ? a : b).speed *= 0.992;
    }

  // Опоры: красная зона — за `lead` до подъезда первой машины, объявлена на ANNOUNCE вперёд.
  for (let i = 0; i < c.pylons.length; i++) {
    const p = c.pylons[i];
    if (!p.falls || s.landed[i]) continue;
    const at = s.towers[i];
    if (at === null) {
      for (const car of s.cars) {
        if (car.dead || car.finished) continue;
        const dz = p.z - car.z;
        if (dz > 0 && dz / Math.max(car.speed, 1800) < p.lead + ANNOUNCE) {
          s.towers[i] = s.t + ANNOUNCE;
          break;
        }
      }
      continue;
    }
    if (s.t < at + WARN_S + FALL_S) continue;
    s.landed[i] = true;
    ev.push({ k: 'land', t: s.t, pylon: i });
    const [a, b] = towerSpan(p);
    for (const car of s.cars) {
      if (car.dead || car.finished) continue;
      if (Math.abs(car.z - p.z) < 260 && car.x + HIT > a && car.x - HIT < b) {
        s.towerHits[i] |= 1 << car.slot;
        hurt(s, car, 2, 'pylon', ev);
      }
    }
  }

  if (s.strikes.length) {
    const left = [];
    for (const st of s.strikes) {
      if (s.t < st.at) {
        left.push(st);
        continue;
      }
      ev.push({
        k: 'boom',
        t: s.t,
        z: st.z,
        x: st.x,
        big: true,
        src: 's' + st.id,
      });
      for (const car of s.cars)
        if (
          !car.dead &&
          !car.finished &&
          Math.abs(car.z - st.z) < 300 &&
          Math.abs(car.x - st.x) < st.r + HIT
        )
          hurt(s, car, 2, 'strike', ev);
    }
    s.strikes = left;
  }

  for (const car of s.cars) collideCar(s, car, ev);
  if (ctx.rnd) schedule(s, ctx.rnd);

  for (const car of s.cars) {
    if (car.finished || car.dead || car.z < TRACK_LEN) continue;
    car.finished = true;
    car.finishT = s.t - COUNTDOWN;
    const first = s.firstFinT === null;
    if (first) s.firstFinT = s.t;
    ev.push({ k: 'finish', t: s.t, slot: car.slot, first });
  }

  if (s.overAt === null) {
    if (s.cars.every((x) => x.dead || x.finished)) s.overAt = s.t + 2.2;
    else if (s.firstFinT !== null && s.t - s.firstFinT > AFTER_FIRST)
      s.overAt = s.t;
    else if (s.t - COUNTDOWN > MAX_RACE_S) s.overAt = s.t;
  }
  if (s.overAt !== null && s.t >= s.overAt) s.over = true;
}
