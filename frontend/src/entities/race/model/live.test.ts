import { describe, expect, it } from 'vitest';
import type { RaceView } from '../api/types';
import { InputLog, interpCars, LiveStore, predictCar, raceClock } from './live';
import { buildCourse, COUNTDOWN, createRace, dynOf, IDLE, step, STEP, TRACK_LEN, type CarState, type Input } from './sim';

const right: Input = { left: false, right: true, brake: false };
const leftBrake: Input = { left: true, right: false, brake: true };

function quietRace(seed = 3) {
  const course = buildCourse(seed);
  course.mines = [];
  course.oils = [];
  for (const p of course.pylons) p.falls = false;
  const s = createRace(course, [
    { slot: 0, car: 'buggy' },
    { slot: 1, car: 'tank' },
    { slot: 2, car: 'arrow' },
  ]);
  s.gone = [];
  return s;
}

describe('InputLog', () => {
  it('нажатие действует со своего времени до следующего', () => {
    const log = new InputLog();
    log.push(1, right);
    log.push(2, IDLE);
    expect(log.at(0.5)).toEqual(IDLE);
    expect(log.at(1)).toEqual(right);
    expect(log.at(1.9)).toEqual(right);
    expect(log.at(2.5)).toEqual(IDLE);
    log.prune(1.5);
    expect(log.at(1.6)).toEqual(right);
  });
});

describe('predictCar', () => {
  it('при тех же нажатиях совпадает с сервером', () => {
    const s = quietRace();
    const log = new InputLog();
    log.push(COUNTDOWN + 0.5, right);
    log.push(COUNTDOWN + 0.58, IDLE);
    log.push(COUNTDOWN + 1.2, leftBrake);
    log.push(COUNTDOWN + 1.3, IDLE);
    // Как рантайм сервера: нажатие берётся на начало шага.
    let cur = IDLE;
    const ctx = { input: (slot: number) => (slot === 0 ? cur : IDLE), rnd: null, bots: null };
    const until = (t: number) => {
      while (s.t + STEP <= t + 1e-9) {
        cur = log.at(s.t);
        step(s, STEP, ctx, []);
      }
    };
    until(COUNTDOWN + 0.8);
    const snap = structuredClone(dynOf(s));
    until(COUNTDOWN + 2);
    const { car } = predictCar(s.course, snap, 0, log, s.t, []);
    expect(car.x).toBeCloseTo(s.cars[0].x, 9);
    expect(car.z).toBeCloseTo(s.cars[0].z, 9);
    expect(car.speed).toBeCloseTo(s.cars[0].speed, 9);
  });

  it('прочность и выбывание не предсказываются — их решает сервер', () => {
    const s = quietRace();
    s.course.mines = [{ z: s.cars[0].z + 1500, x: 0, ph: 0 }];
    s.gone = [false];
    s.cars[0].hp = 1;
    s.t = COUNTDOWN;
    const { car, gone } = predictCar(s.course, dynOf(s), 0, new InputLog(), COUNTDOWN + 2, []);
    expect(gone).toEqual([true]);
    expect(car.hp).toBe(1);
    expect(car.dead).toBe(false);
  });

  it('финиш отмечается в предсказании, и машина за чертой тормозит, а не летит', () => {
    const s = quietRace();
    s.t = COUNTDOWN + 50;
    Object.assign(s.cars[0], { z: TRACK_LEN - 100, speed: 5000 });
    const { car } = predictCar(s.course, dynOf(s), 0, new InputLog(), COUNTDOWN + 51, []);
    expect(car.finished).toBe(true);
    expect(car.speed).toBeLessThan(5000);
  });
});

describe('interpCars', () => {
  const car = (z: number, speed = 0): CarState => ({ ...quietRace().cars[0], z, speed });
  it('между снимками — по времени, после последнего — короткая экстраполяция', () => {
    const snaps = [
      { t: 1, cars: [car(100, 400)] },
      { t: 2, cars: [car(300, 400)] },
    ];
    expect(interpCars(snaps, 1.5)![0].z).toBeCloseTo(200);
    expect(interpCars(snaps, 2.1)![0].z).toBeCloseTo(340);
    expect(interpCars(snaps, 5)![0].z).toBeCloseTo(400);
    expect(interpCars([], 1)).toBeNull();
  });
});

describe('LiveStore', () => {
  const view = (serverNow: number, t: number, events: { t: number }[] = []): RaceView =>
    ({
      phase: 'racing',
      serverNow,
      offset: 0,
      config: { stakes: [10], waitMs: 15000, delayMs: 150 },
      race: {
        id: 'r',
        seed: 1,
        stake: 10,
        pot: 30,
        lobbyEndsAt: 0,
        startAt: 0,
        racers: [],
        me: 0,
        result: null,
        events,
        dyn: { ...dynOf(quietRace()), t },
      },
    }) as unknown as RaceView;

  it('старый снимок не перекрывает новый, события выдаются по времени', () => {
    const st = new LiveStore();
    st.push(view(2000, 2, [{ t: 1.9 }, { t: 1.95 }]));
    st.push(view(1000, 1));
    expect(st.view!.serverNow).toBe(2000);
    expect(st.snaps.map((s) => s.t)).toEqual([2]);
    expect(st.take(1.92)).toHaveLength(1);
    expect(st.take(2.5)).toHaveLength(1);
    expect(st.take(5)).toHaveLength(0);
  });

  it('время гонки — по часам сервера', () => {
    const v = { ...view(0, 0), offset: 500 } as RaceView;
    expect(raceClock(v, 2500)).toBe(3);
  });

  it('часы берут наименьшую задержку за 3 с и не идут назад рывком', () => {
    const st = new LiveStore();
    st.push({ ...view(1000, 1), offset: 100 } as RaceView, 1000);
    st.push({ ...view(1050, 1.05), offset: 60 } as RaceView, 1050);
    expect(st.clock(2000)).toBeCloseTo(2.1);
    st.push({ ...view(5000, 5), offset: 60 } as RaceView, 5000);
    // Окно ушло вперёд, максимум стал 60, но время не прыгает на 40 мс назад разом.
    expect(st.clock(5100)).toBeGreaterThan((5100 + 60) / 1000);
  });

  it('старые события из фоновой вкладки не выдаются пачкой', () => {
    const st = new LiveStore();
    st.push(view(1000, 10, [{ t: 2 }, { t: 9.5 }]));
    expect(st.take(10)).toHaveLength(1);
  });
});
