import { createBot, type Bot } from './bot';
import {
  CARS,
  COUNTDOWN,
  MAX_RACE_S,
  SEG,
  START_Z,
  STEP,
  type CarId,
} from './config';
import { buildCourse } from './course';
import type { SimEvent } from './events';
import { rng } from './math';
import { createRace, IDLE, ranking, type RaceState } from './state';
import { step, type StepCtx } from './step';

const race = (seed = 7, cars: CarId[] = ['arrow', 'buggy', 'tank']) =>
  createRace(
    buildCourse(seed),
    cars.map((car, slot) => ({ slot, car })),
  );

/** Трасса без опасностей: мины, масло и падения убраны, чтобы тест ставил свои. */
function quiet(s: RaceState): RaceState {
  s.course.mines = [];
  s.course.oils = [];
  s.gone = [];
  for (const p of s.course.pylons) p.falls = false;
  return s;
}

function run(s: RaceState, ctx: StepCtx, seconds: number, ev: SimEvent[] = []) {
  const n = Math.round(seconds / STEP);
  for (let i = 0; i < n && !s.over; i++) step(s, STEP, ctx, ev);
  return ev;
}

const idle: StepCtx = { input: () => IDLE, rnd: null, bots: null };

describe('трасса', () => {
  it('из одного зерна — одна и та же трасса', () => {
    expect(JSON.stringify(buildCourse(42))).toBe(
      JSON.stringify(buildCourse(42)),
    );
    expect(JSON.stringify(buildCourse(43))).not.toBe(
      JSON.stringify(buildCourse(42)),
    );
  });

  it('мин и масла нет за 34 отрезка до падающей опоры и 22 после', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const c = buildCourse(seed);
      const falls = c.pylons.filter((p) => p.falls);
      for (const h of [...c.mines, ...c.oils]) {
        const seg = Math.round((h.z - 100) / SEG);
        for (const p of falls)
          expect(p.seg - seg >= 34 || seg - p.seg >= 22).toBe(true);
      }
    }
  });
});

describe('шаг гонки', () => {
  it(`гонка без финиша кончается через ${MAX_RACE_S} с — банк у проехавшего дальше`, () => {
    const s = quiet(race());
    const brake = { left: false, right: false, brake: true };
    run(
      s,
      { input: () => brake, rnd: null, bots: null },
      COUNTDOWN + MAX_RACE_S + 1,
    );
    expect(s.over).toBe(true);
    expect(s.cars.some((c) => c.finished)).toBe(false);
  });

  it('до зелёного огня машины стоят', () => {
    const s = race();
    run(s, idle, COUNTDOWN - 0.05);
    for (const c of s.cars) expect(c).toMatchObject({ speed: 0, z: START_Z });
  });

  it('одна и та же гонка из того же зерна и нажатий даёт тот же итог', () => {
    const play = () => {
      const s = race(11);
      const R = rng(5);
      const bots = new Map<number, Bot>([
        [1, createBot(R, s.cars[1].x)],
        [2, createBot(R, s.cars[2].x)],
      ]);
      const ctx: StepCtx = {
        input: (slot) =>
          slot === 0
            ? {
                left: Math.floor(s.t) % 4 === 0,
                right: Math.floor(s.t) % 4 === 2,
                brake: false,
              }
            : IDLE,
        rnd: R,
        bots,
      };
      run(s, ctx, 30);
      return JSON.stringify({
        cars: s.cars,
        gone: s.gone,
        towers: s.towers,
        strikes: s.strikes,
      });
    };
    expect(play()).toBe(play());
  });

  it('мина бьёт только хитбоксом: мимо в 0,2 — цел, в 0,15 — удар', () => {
    const miss = quiet(race());
    miss.course.mines = [{ z: START_Z + 3000, x: 0.2, ph: 0 }];
    miss.gone = [false];
    run(miss, idle, COUNTDOWN + 2.5);
    expect(miss.cars[0].hp).toBe(CARS.arrow.hp);
    expect(miss.gone[0]).toBe(false);

    const hit = quiet(race());
    hit.course.mines = [{ z: START_Z + 3000, x: 0.15, ph: 0 }];
    hit.gone = [false];
    const ev = run(hit, idle, COUNTDOWN + 2.5);
    expect(hit.cars[0].hp).toBe(CARS.arrow.hp - 1);
    expect(hit.gone[0]).toBe(true);
    expect(ev).toContainEqual(
      expect.objectContaining({ k: 'boom', src: 'm0' }),
    );
    expect(ev).toContainEqual(
      expect.objectContaining({ k: 'hit', slot: 0, dmg: 1, cause: 'mine' }),
    );
  });

  it('удар в неуязвимости крутит машину, но не снимает прочность', () => {
    const s = quiet(race(7, ['tank', 'buggy', 'arrow']));
    s.course.mines = [
      { z: START_Z + 3000, x: 0, ph: 0 },
      { z: START_Z + 3250, x: 0, ph: 0 },
    ];
    s.gone = [false, false];
    const ev = run(s, idle, COUNTDOWN + 4);
    expect(s.gone).toEqual([true, true]);
    expect(s.cars[0].hp).toBe(CARS.tank.hp - 1);
    expect(
      ev
        .filter((e) => e.k === 'hit' && e.slot === 0)
        .map((e) => (e as { dmg: number }).dmg),
    ).toEqual([1, 0]);
  });

  it('в лежащую опору врезаются один раз, свободная полоса проезжает', () => {
    const s = quiet(race());
    const i = s.course.pylons.findIndex(
      (p) => p.side > 0 && p.z > START_Z + 1500,
    );
    s.course.pylons[i].falls = true;
    s.towers[i] = 0;
    s.landed[i] = true;
    run(s, idle, COUNTDOWN + 3);
    expect(s.cars[0].hp).toBe(CARS.arrow.hp - 1); // по центру — в опору
    expect(s.cars[1].hp).toBe(CARS.buggy.hp); // слева — свободная полоса
    expect(s.cars[2].hp).toBe(CARS.tank.hp - 1);
    expect(s.towerHits[i]).toBe(0b101);
  });

  it('боты: баланс машин в коридоре, до финиша доезжают не все', () => {
    const N = 150;
    const wins: Record<CarId, number> = { arrow: 0, buggy: 0, tank: 0 };
    let allThree = 0;
    let none = 0;
    const order: CarId[] = ['arrow', 'buggy', 'tank'];
    for (let i = 0; i < N; i++) {
      const cars = [order[i % 3], order[(i + 1) % 3], order[(i + 2) % 3]];
      const s = race(1000 + i, cars);
      const R = rng(77 + i);
      const bots = new Map(
        s.cars.map((c) => [c.slot, createBot(R, c.x)] as const),
      );
      run(s, { input: () => IDLE, rnd: R, bots }, 200);
      const fin = s.cars.filter((c) => c.finished).length;
      if (fin === 3) allThree++;
      if (fin === 0) none++;
      wins[ranking(s.cars)[0].car]++;
    }
    for (const car of order) {
      expect(wins[car] / N).toBeGreaterThan(0.15);
      expect(wins[car] / N).toBeLessThan(0.5);
    }
    expect(allThree / N).toBeLessThan(0.5);
    expect(none / N).toBeLessThan(0.12);
  }, 180_000);
});
