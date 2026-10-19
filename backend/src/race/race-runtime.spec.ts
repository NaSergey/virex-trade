import { DELAY_MS, STUCK_S } from './race.config';
import { RaceRuntime, type RacerSpec } from './race-runtime';
import { COUNTDOWN, STEP } from './sim';

const racers: RacerSpec[] = [
  { slot: 0, car: 'buggy', bot: false },
  { slot: 1, car: 'tank', bot: true },
  { slot: 2, car: 'arrow', bot: true },
];
const T0 = 1_000_000;
const at = (s: number) => T0 + s * 1000;
const right = { left: false, right: true, brake: false };
const brake = { left: false, right: false, brake: true };
const fresh = () => new RaceRuntime(T0, 9, racers, 3);

describe('RaceRuntime', () => {
  it('считает гонку на DELAY_MS позади настоящего времени', () => {
    const rt = fresh();
    rt.advance(at(1));
    expect(rt.state.t).toBeLessThanOrEqual(1 - DELAY_MS / 1000 + 1e-9);
    expect(rt.state.t).toBeGreaterThan(1 - DELAY_MS / 1000 - STEP * 1.01);
  });

  // Тормоз, а не руль: руль упирается в соседа, и толчок уравнял бы положения.
  it('нажатие, дошедшее быстрее задержки, применяется со своего момента', () => {
    const run = (stamp: number) => {
      const rt = fresh();
      rt.advance(at(COUNTDOWN + 1));
      rt.push(0, stamp, brake, at(COUNTDOWN + 1));
      rt.advance(at(COUNTDOWN + 1.5));
      return rt.state.cars[0].z;
    };
    expect(run(COUNTDOWN + 0.9)).toBeLessThan(run(COUNTDOWN + 0.98));
  });

  it('опоздавшее нажатие не переписывает прошлое, а действует с момента прихода', () => {
    const rt = fresh();
    const ctl = fresh();
    rt.advance(at(COUNTDOWN + 1));
    ctl.advance(at(COUNTDOWN + 1));
    const z0 = rt.state.cars[0].z;
    rt.push(0, COUNTDOWN + 0.2, brake, at(COUNTDOWN + 1));
    rt.advance(at(COUNTDOWN + 1));
    expect(rt.state.cars[0].z).toBe(z0);
    expect(z0).toBe(ctl.state.cars[0].z);
    rt.advance(at(COUNTDOWN + 1.4));
    ctl.advance(at(COUNTDOWN + 1.4));
    expect(rt.state.cars[0].speed).toBeLessThan(ctl.state.cars[0].speed - 500);
  });

  it(`нажатия без пульса дольше ${STUCK_S} с считаются отпущенными`, () => {
    const rt = fresh();
    rt.advance(at(COUNTDOWN + 0.5));
    rt.push(0, COUNTDOWN + 0.45, right, at(COUNTDOWN + 0.5));
    rt.advance(at(COUNTDOWN + 0.8));
    expect(rt.state.cars[0].vx).toBeGreaterThan(1);
    rt.advance(at(COUNTDOWN + 0.5 + STUCK_S + DELAY_MS / 1000 + 0.5));
    expect(Math.abs(rt.state.cars[0].vx)).toBeLessThan(0.05);
  });

  it('за бота нажатия не принимаются', () => {
    const a = fresh();
    const b = fresh();
    a.advance(at(COUNTDOWN + 1));
    b.advance(at(COUNTDOWN + 1));
    b.push(1, COUNTDOWN + 0.9, right, at(COUNTDOWN + 1));
    a.advance(at(COUNTDOWN + 3));
    b.advance(at(COUNTDOWN + 3));
    expect(JSON.stringify(b.state.cars)).toBe(JSON.stringify(a.state.cars));
  });

  it('события отдаются один раз', () => {
    const rt = fresh();
    rt.advance(at(120));
    expect(rt.drain().length).toBeGreaterThan(0);
    expect(rt.drain()).toEqual([]);
  });
});
