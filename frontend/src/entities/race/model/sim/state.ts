import {
  CARS,
  COUNTDOWN,
  FALL_S,
  START_Z,
  TRACK_LEN,
  WARN_S,
  type CarId,
} from './config';
import type { Course } from './course';
import { clamp } from './math';

export interface Racer {
  slot: number;
  car: CarId;
}

/** Нажатия. `steer` (−1…1) — плавный руль бота; у человека его нет, есть кнопки. */
export interface Input {
  left: boolean;
  right: boolean;
  brake: boolean;
  steer?: number;
}

export const IDLE: Input = { left: false, right: false, brake: false };

export interface CarState {
  slot: number;
  car: CarId;
  z: number;
  x: number;
  speed: number;
  /** Боковая скорость, полудорог в секунду. */
  vx: number;
  hp: number;
  /** Сколько ещё крутит без руля после удара, с. */
  spin: number;
  /** Сколько ещё несёт по маслу, с. */
  slide: number;
  /** Сколько ещё неуязвима, с. */
  inv: number;
  dead: boolean;
  deadAt: number;
  finished: boolean;
  /** Время на финише от зелёного огня, с. */
  finishT: number;
  /** Маска мест, уже врезавшихся в обломки этой машины. */
  wreckHits: number;
}

export interface Strike {
  id: number;
  z: number;
  x: number;
  r: number;
  /** Время взрыва; прицел виден с `at − STRIKE_S`. */
  at: number;
  target: number;
}

/** Состояние гонки без трассы — то, что едет в снимке. */
export interface Dyn {
  /** Время гонки, с; 0 — первый красный огонь, `COUNTDOWN` — старт. */
  t: number;
  /** По месту: `cars[slot]`. */
  cars: CarState[];
  /** Начало красной зоны опоры (время гонки); null — стоит. */
  towers: (number | null)[];
  /** Удар падения разобран — опора лежит. */
  landed: boolean[];
  /** Маска мест, уже врезавшихся в лежащую опору. */
  towerHits: number[];
  /** Сработавшие мины. */
  gone: boolean[];
  strikes: Strike[];
  firstFinT: number | null;
  overAt: number | null;
  over: boolean;
  nextStrike: number;
  /** Очередь целей ударов с неба: по разу на каждого, потом новый круг. */
  rr: number[];
  strikeSeq: number;
}

export interface RaceState extends Dyn {
  course: Course;
}

/** Старт: своё место — своя полоса. */
export const START_X = [0, -2 / 3, 2 / 3];

export function createRace(course: Course, racers: Racer[]): RaceState {
  const sorted = [...racers].sort((a, b) => a.slot - b.slot);
  return {
    course,
    t: 0,
    cars: sorted.map(({ slot, car }) => ({
      slot,
      car,
      z: START_Z,
      x: START_X[slot],
      speed: 0,
      vx: 0,
      hp: CARS[car].hp,
      spin: 0,
      slide: 0,
      inv: 0,
      dead: false,
      deadAt: 0,
      finished: false,
      finishT: 0,
      wreckHits: 0,
    })),
    towers: course.pylons.map(() => null),
    landed: course.pylons.map(() => false),
    towerHits: course.pylons.map(() => 0),
    gone: course.mines.map(() => false),
    strikes: [],
    firstFinT: null,
    overAt: null,
    over: false,
    nextStrike: COUNTDOWN,
    rr: [],
    strikeSeq: 0,
  };
}

export type TowerPhase = 'stand' | 'warn' | 'fall' | 'down';

/** Фаза опоры — функция времени от начала красной зоны: её считает и браузер. */
export function towerPhase(at: number | null, t: number): TowerPhase {
  if (at === null || t < at) return 'stand';
  if (t < at + WARN_S) return 'warn';
  if (t < at + WARN_S + FALL_S) return 'fall';
  return 'down';
}

export const progressOf = (c: CarState): number =>
  clamp((c.z - START_Z) / (TRACK_LEN - START_Z), 0, 1);

/** Места: финишировавшие по времени, остальные — кто дальше проехал. */
export function ranking(cars: CarState[]): CarState[] {
  return [...cars].sort((a, b) => {
    if (a.finished && b.finished) return a.finishT - b.finishT;
    if (a.finished !== b.finished) return a.finished ? -1 : 1;
    return b.z - a.z;
  });
}

export function dynOf(s: RaceState): Dyn {
  const { course, ...dyn } = s;
  void course;
  return dyn;
}
