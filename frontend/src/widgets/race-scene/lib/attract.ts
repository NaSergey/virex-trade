import {
  buildCourse,
  CAR_IDS,
  COUNTDOWN,
  createBot,
  createRace,
  IDLE,
  rng,
  step,
  STEP,
  type Bot,
  type RaceState,
  type Rnd,
  type SimEvent,
} from '@/entities/race';
import type { Frame, FrameSource } from './scene';

/**
 * Гонка трёх ботов прямо в браузере — за гаражом и на карточке витрины. Та же
 * симуляция, что на сервере, только без сервера: показ, а не игра. Без огней
 * старта; кончилась — через 1,2 с новая трасса.
 */
export function createAttract(): FrameSource {
  let s: RaceState;
  let bots: Map<number, Bot>;
  let rnd: Rnd;
  let cam = 0;
  let acc = 0;
  let overFor = 0;
  const reset = () => {
    const seed = Math.floor(Math.random() * 2 ** 31);
    const cars = [...CAR_IDS].sort(() => Math.random() - 0.5);
    s = createRace(
      buildCourse(seed),
      cars.map((car, slot) => ({ slot, car })),
    );
    s.t = COUNTDOWN;
    rnd = rng(seed ^ 0x5bd1e995);
    bots = new Map(s.cars.map((c) => [c.slot, createBot(rnd, c.x)]));
    cam = 0;
    acc = 0;
    overFor = 0;
  };
  reset();
  return {
    next(dt: number): Frame {
      const ev: SimEvent[] = [];
      acc += Math.min(dt, 0.1);
      while (acc >= STEP) {
        step(s, STEP, { input: () => IDLE, rnd, bots }, ev);
        acc -= STEP;
      }
      if (s.over && (overFor += dt) > 1.2) reset();
      const c = s.cars[cam];
      if (c.dead && s.t - c.deadAt > 1.8) {
        const alive = s.cars.filter((x) => !x.dead).sort((a, b) => b.z - a.z)[0];
        if (alive) cam = alive.slot;
      }
      return {
        course: s.course,
        t: s.t,
        cars: s.cars.map((x) => ({ ...x, tag: null, brake: false })),
        cam,
        gone: s.gone,
        towers: s.towers,
        strikes: s.strikes,
        events: ev,
      };
    },
  };
}
