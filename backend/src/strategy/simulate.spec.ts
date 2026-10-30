import { bars, mirror, Ohlc } from './fixtures';
import type { Setup } from './setups';
import type { Features } from './report.types';
import { Bar, FEES, minuteKey, simulate, simulateAll } from './simulate';

const M = 60_000;
const STEP = 15 * M;
const setup = (over: Partial<Setup> = {}): Setup => ({
  id: 't',
  dir: 1,
  sweepI: 0,
  fvgI: -1,
  bosI: -1,
  e: 0,
  obI: 0,
  level: 0,
  entry: 100,
  stop: 98,
  target: 104,
  plannedR: 2,
  features: {} as Features,
  ...over,
});
const E: Ohlc = [101, 101.5, 100.5, 101];
const none = () => null;

describe('simulate', () => {
  it('исполнился и дошёл до цели', () => {
    const s = bars([E, [101, 101.2, 99.8, 100.2], [100.2, 104.5, 100, 104]]);
    const r = simulate(s, setup(), none);
    expect(r).toMatchObject({
      status: 'filled',
      outcome: 'target',
      fill: 100,
      exit: 104,
      fillMs: STEP,
      exitMs: 3 * STEP,
    });
    if (r.status !== 'filled') throw new Error(r.status);
    expect(r.rGross).toBeCloseTo(2);
    expect(r.rNet).toBeCloseTo(2 - (FEES.maker * 100 + FEES.maker * 104) / 2);
  });

  it('цель раньше входа — пропущен', () => {
    const s = bars([E, [101, 104.2, 100.5, 104]]);
    expect(simulate(s, setup(), none).status).toBe('missed');
  });

  it('лимит живёт 48 свечей', () => {
    const s = bars([E, ...Array<Ohlc>(60).fill(E)]);
    expect(simulate(s, setup(), none).status).toBe('expired');
  });

  it('стоп: −1R и тейкерская комиссия на выходе', () => {
    const s = bars([E, [101, 101, 99.5, 100], [100, 100.5, 97.5, 98]]);
    const r = simulate(s, setup(), none);
    if (r.status !== 'filled') throw new Error(r.status);
    expect(r.outcome).toBe('stop');
    expect(r.rGross).toBeCloseTo(-1);
    expect(r.rNet).toBeCloseTo(-1 - (FEES.maker * 100 + FEES.taker * 98) / 2);
  });

  it('стоп и цель в одной свече — просит минутки, разбирает по ним', () => {
    const s = bars([E, [101, 101, 99.5, 100], [100, 104.5, 97.5, 101]]);
    expect(simulate(s, setup(), none)).toEqual({
      status: 'needs',
      from: 2 * STEP,
      to: 3 * STEP,
    });
    const mins: Bar[] = [
      { t0: 2 * STEP, t1: 2 * STEP + M, o: 100, h: 104.2, l: 99.9, c: 104 },
      {
        t0: 2 * STEP + M,
        t1: 2 * STEP + 2 * M,
        o: 104,
        h: 104,
        l: 97.5,
        c: 98,
      },
    ];
    expect(simulate(s, setup(), () => mins)).toMatchObject({
      outcome: 'target',
      exit: 104,
    });
    expect(simulate(s, setup(), () => [])).toMatchObject({ outcome: 'stop' });
  });

  it('вход и цель в одной свече — минутки решают порядок', () => {
    const s = bars([E, [101, 104.5, 99.5, 104]]);
    const mins: Bar[] = [
      { t0: STEP, t1: STEP + M, o: 101, h: 101, l: 99.8, c: 100 },
      { t0: STEP + M, t1: STEP + 2 * M, o: 100, h: 104.5, l: 100, c: 104 },
    ];
    expect(simulate(s, setup(), () => mins)).toMatchObject({
      outcome: 'target',
      fillMs: STEP,
    });
  });

  it('выход по сроку через 3 суток — по закрытию свечи', () => {
    const hold: Ohlc = [100.5, 101, 99.5, 100.5];
    const s = bars([
      E,
      [101, 101, 99.8, 100.5],
      ...Array<Ohlc>(300).fill(hold),
    ]);
    const r = simulate(s, setup(), none);
    expect(r).toMatchObject({ outcome: 'time', exit: 100.5 });
    if (r.status !== 'filled') throw new Error(r.status);
    expect(r.exitMs - r.fillMs).toBeGreaterThanOrEqual(3 * 86_400_000);
    expect(r.rGross).toBeCloseTo(0.25);
  });

  it('шорт — зеркало лонга', () => {
    const s = mirror(
      bars([E, [101, 101.2, 99.8, 100.2], [100.2, 104.5, 100, 104]]),
    );
    const r = simulate(
      s,
      setup({ dir: -1, entry: -100, stop: -98, target: -104 }),
      none,
    );
    expect(r).toMatchObject({ outcome: 'target', fill: -100, exit: -104 });
    if (r.status !== 'filled') throw new Error(r.status);
    expect(r.rGross).toBeCloseTo(2);
  });

  it('simulateAll подгружает минутки пачкой и доразбирает', async () => {
    const s = bars([E, [101, 101, 99.5, 100], [100, 104.5, 97.5, 101]]);
    const mins: Bar[] = [
      { t0: 2 * STEP, t1: 2 * STEP + M, o: 100, h: 104.2, l: 99.9, c: 104 },
    ];
    const fetch = jest.fn(
      async (ranges: [number, number][]) =>
        new Map(ranges.map(([f, t]) => [minuteKey(f, t), mins])),
    );
    const [res] = await simulateAll(s, [setup()], fetch, new Map());
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(res.result).toMatchObject({ status: 'filled', outcome: 'target' });
  });

  it('simulateAll без минуток — консервативно стоп', async () => {
    const s = bars([E, [101, 101, 99.5, 100], [100, 104.5, 97.5, 101]]);
    const [res] = await simulateAll(
      s,
      [setup()],
      async () => new Map(),
      new Map(),
    );
    expect(res.result).toMatchObject({ outcome: 'stop' });
  });
});
