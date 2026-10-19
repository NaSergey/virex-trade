import { DELAY_MS, STUCK_S } from './race.config';
import {
  buildCourse,
  createBot,
  createRace,
  IDLE,
  rng,
  step,
  STEP,
  type Bot,
  type CarId,
  type Input,
  type RaceState,
  type Rnd,
  type SimEvent,
  type StepCtx,
} from './sim';

export interface RacerSpec {
  slot: number;
  car: CarId;
  bot: boolean;
}

/**
 * Одна идущая гонка: симуляция, нажатия по времени и события для снимка.
 * Без Nest, базы и таймеров — часы передаются вызовом, поэтому её можно
 * гонять в тестах точно.
 *
 * Симуляция идёт на `DELAY_MS` позади часов: нажатие, дошедшее быстрее,
 * ложится на свой момент; опоздавшее действует с момента прихода — прошлое
 * не переписывается.
 */
export class RaceRuntime {
  readonly state: RaceState;
  private readonly rnd: Rnd;
  private readonly bots = new Map<number, Bot>();
  private readonly pending = new Map<number, { t: number; input: Input }[]>();
  private readonly current = new Map<number, Input>();
  private readonly heard = new Map<number, number>();
  private events: SimEvent[] = [];
  private readonly ctx: StepCtx;

  constructor(
    readonly startAt: number,
    seed: number,
    racers: RacerSpec[],
    runSeed: number,
  ) {
    this.state = createRace(
      buildCourse(seed),
      racers.map(({ slot, car }) => ({ slot, car })),
    );
    this.rnd = rng(runSeed);
    for (const r of racers)
      if (r.bot)
        this.bots.set(r.slot, createBot(this.rnd, this.state.cars[r.slot].x));
    this.ctx = {
      input: (slot) => this.inputOf(slot),
      rnd: this.rnd,
      bots: this.bots,
    };
  }

  /** Время гонки по часам сервера, с. */
  clock(nowMs: number): number {
    return (nowMs - this.startAt) / 1000;
  }

  push(slot: number, t: number, input: Input, nowMs: number): void {
    if (this.bots.has(slot) || !Number.isFinite(t)) return;
    const now = this.clock(nowMs);
    this.heard.set(slot, now);
    const when = Math.min(Math.max(t, this.state.t), now);
    const q = this.pending.get(slot) ?? [];
    q.push({ t: when, input });
    q.sort((a, b) => a.t - b.t);
    this.pending.set(slot, q);
  }

  advance(nowMs: number): void {
    const target = this.clock(nowMs) - DELAY_MS / 1000;
    while (!this.state.over && this.state.t + STEP <= target + 1e-9) {
      for (const [slot, q] of this.pending) {
        while (q.length && q[0].t <= this.state.t + 1e-9)
          this.current.set(slot, q.shift()!.input);
      }
      step(this.state, STEP, this.ctx, this.events);
    }
  }

  drain(): SimEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  private inputOf(slot: number): Input {
    const heard = this.heard.get(slot);
    if (heard === undefined || this.state.t - heard > STUCK_S) return IDLE;
    return this.current.get(slot) ?? IDLE;
  }
}
