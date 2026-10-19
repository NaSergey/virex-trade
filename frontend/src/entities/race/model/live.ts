import type { RaceView } from '../api/types';
import {
  collideCar,
  COUNTDOWN,
  driveCar,
  IDLE,
  lerp,
  STEP,
  TRACK_LEN,
  type CarState,
  type Course,
  type Dyn,
  type Input,
  type RaceState,
  type SimEvent,
} from './sim';

/** Время гонки по часам сервера, с: `Date.now() + offset` — серверное время. */
export function raceClock(v: RaceView, nowMs = Date.now()): number {
  const startAt = v.race?.startAt;
  return startAt == null ? 0 : (nowMs + v.offset - startAt) / 1000;
}

/** Нажатия своей машины по времени гонки — для предсказания. */
export class InputLog {
  private marks: { t: number; input: Input }[] = [];

  push(t: number, input: Input) {
    const last = this.marks[this.marks.length - 1];
    this.marks.push({ t: last && last.t > t ? last.t : t, input });
  }

  at(t: number): Input {
    for (let i = this.marks.length - 1; i >= 0; i--) if (this.marks[i].t <= t + 1e-9) return this.marks[i].input;
    return IDLE;
  }

  /** Старое — прочь, но нажатие, действующее на `before`, остаётся. */
  prune(before: number) {
    let k = 0;
    while (k + 1 < this.marks.length && this.marks[k + 1].t <= before) k++;
    if (k) this.marks.splice(0, k);
  }
}

/**
 * Своя машина вперёд от снимка той же физикой, что у сервера, и в том же
 * порядке: нажатие берётся на начало шага, время — первым. Удары о лежащее на
 * дороге тоже предсказываются (взрыв мины — сразу), а прочность и выбывание —
 * нет: их решает сервер, и машина в предсказании не умирает.
 */
export function predictCar(
  course: Course,
  dyn: Dyn,
  slot: number,
  log: InputLog,
  toT: number,
  ev: SimEvent[],
): { car: CarState; gone: boolean[] } {
  const own = dyn.cars[slot];
  const s: RaceState = {
    ...dyn,
    course,
    cars: dyn.cars.map((c) => ({ ...c })),
    gone: [...dyn.gone],
    towerHits: [...dyn.towerHits],
    strikes: [],
  };
  const car = s.cars[slot];
  if (own.dead) return { car, gone: s.gone };
  car.hp = 99;
  let t = dyn.t;
  // Не дальше 2,5 с вперёд: снимок старше — это обрыв связи, а не задержка.
  for (let n = 0; n < 150 && t + STEP <= toT + 1e-9; n++) {
    const inp = log.at(t);
    t += STEP;
    s.t = t;
    if (t < COUNTDOWN) continue;
    driveCar(s, car, STEP, inp);
    collideCar(s, car, ev);
    // Финиш отмечается и здесь, как в шаге сервера: иначе своя машина летела бы
    // за черту на полном газу, а снимок с финишем вернул бы её назад.
    if (!car.finished && car.z >= TRACK_LEN) {
      car.finished = true;
      car.finishT = t - COUNTDOWN;
    }
  }
  car.hp = own.hp;
  return { car, gone: s.gone };
}

export interface Snap {
  t: number;
  cars: CarState[];
}

/**
 * Чужие машины — между двумя снимками по времени гонки. Позже последнего —
 * короткая экстраполяция по скорости (не дальше 0,25 с): запоздавший снимок не
 * должен останавливать машины на месте.
 */
export function interpCars(snaps: Snap[], t: number): CarState[] | null {
  if (!snaps.length) return null;
  const i = snaps.findIndex((s) => s.t > t);
  if (i === -1) {
    const last = snaps[snaps.length - 1];
    const ahead = Math.min(Math.max(0, t - last.t), 0.25);
    if (!ahead) return last.cars;
    return last.cars.map((c) =>
      c.dead || c.finished ? c : { ...c, z: c.z + c.speed * ahead, x: c.x + c.vx * ahead },
    );
  }
  if (i === 0) return snaps[0].cars;
  const a = snaps[i - 1];
  const b = snaps[i];
  const u = (t - a.t) / (b.t - a.t);
  return b.cars.map((cb, k) => {
    const ca = a.cars[k];
    return {
      ...cb,
      x: lerp(ca.x, cb.x, u),
      z: lerp(ca.z, cb.z, u),
      speed: lerp(ca.speed, cb.speed, u),
      vx: lerp(ca.vx, cb.vx, u),
    };
  });
}

/**
 * Снимки гонки мимо React: сокет приносит их 20 раз в секунду, и класть каждый
 * в кэш значило бы перерисовывать страницу на каждом. Сцена читает отсюда
 * сама; в кэш react-query уходит только то, что меняет разметку.
 */
export class LiveStore {
  view: RaceView | null = null;
  snaps: Snap[] = [];
  private queue: SimEvent[] = [];
  private lastT = -1;
  /** Сдвиг часов: максимум за последние 3 с — снимок с наименьшей задержкой сети. */
  private offs: { at: number; off: number }[] = [];
  private off: number | null = null;
  private offAt = 0;

  /**
   * Время гонки по часам сервера, с. Сдвиг не берётся с каждого снимка: дрожание
   * сети ±20 мс дёргало бы и свою машину, и чужие. Растёт сразу, падает плавно —
   * не быстрее 5 мс в секунду, чтобы время не шло назад.
   */
  clock(nowMs = Date.now()): number {
    const startAt = this.view?.race?.startAt;
    if (startAt == null || this.off === null) return 0;
    const target = Math.max(...this.offs.map((o) => o.off));
    if (target >= this.off) this.off = target;
    else this.off = Math.max(target, this.off - (nowMs - this.offAt) * 0.005);
    this.offAt = nowMs;
    return (nowMs + this.off - startAt) / 1000;
  }

  push(v: RaceView, recvAt = Date.now()) {
    const same = this.view?.race?.id === v.race?.id;
    if (same && this.view && this.view.serverNow > v.serverNow) return;
    if (!same) {
      this.snaps = [];
      this.queue = [];
      this.lastT = -1;
    }
    this.view = v;
    this.offs.push({ at: recvAt, off: v.offset });
    this.offs = this.offs.filter((o) => recvAt - o.at <= 3000);
    if (this.off === null) {
      this.off = v.offset;
      this.offAt = recvAt;
    }
    const d = v.race?.dyn;
    if (!d || d.t <= this.lastT) return;
    this.lastT = d.t;
    this.snaps.push({ t: d.t, cars: d.cars });
    while (this.snaps.length > 2 && this.snaps[1].t < d.t - 1.5) this.snaps.shift();
    this.queue.push(...v.race!.events);
  }

  /**
   * События, чьё время наступило на шкале чужих машин. Старше двух секунд — не
   * показываются: вкладка стояла в фоне, и вспышки пачкой были бы враньём.
   */
  take(until: number): SimEvent[] {
    const out: SimEvent[] = [];
    const rest: SimEvent[] = [];
    for (const e of this.queue) {
      if (e.t > until) rest.push(e);
      else if (e.t >= until - 2) out.push(e);
    }
    this.queue = rest;
    return out;
  }
}
