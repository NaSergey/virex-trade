import { bars, mirror, Ohlc } from './fixtures';
import type { Setup } from './setups';
import type { Features } from './report.types';
import { Bar, FEES, minuteKey, simulate, simulateAll } from './simulate';

const M = 60_000;
const STEP = 15 * M;
// Верх 100, стоп 96: уровни 100/99/98/97, тейки 104/108/112, 1R = средняя дистанция 2,5.
const setup = (over: Partial<Setup> = {}): Setup => ({
  id: 't',
  dir: 1,
  sweepI: 0,
  fvgI: -1,
  bosI: -1,
  e: 0,
  obI: 0,
  level: 0,
  entries: [100, 99, 98, 97],
  stop: 96,
  target: 112,
  takes: [104, 108, 112],
  trail: true,
  plannedR: 3,
  features: {} as Features,
  ...over,
});
const E: Ohlc = [101, 101.5, 100.5, 101];
const FILL_TOP: Ohlc = [101, 101, 99.5, 100];
const TP1: Ohlc = [100.6, 104.5, 100.5, 104];
const ALL_TAKES: Ohlc[] = [
  E,
  FILL_TOP,
  TP1,
  [104.5, 108.5, 104.5, 108],
  [108, 112.5, 108.2, 112],
];
const none = () => null;

describe('simulate v2', () => {
  it('исполнен верх, все три тейка', () => {
    const r = simulate(bars(ALL_TAKES), setup(), none);
    expect(r).toMatchObject({
      status: 'filled',
      outcome: 'target',
      filled: 1,
      avgEntry: 100,
      takesHit: 3,
      finalStop: 108,
      fillMs: STEP,
      exitMs: 5 * STEP,
      exit: 112,
    });
    if (r.status !== 'filled') throw new Error(r.status);
    expect(r.rGross).toBeCloseTo(0.8);
    expect(r.rNet).toBeCloseTo(0.8 - (FEES.maker * (25 + 27)) / 2.5);
  });

  it('вся сетка набрана и выбит стоп — −1R', () => {
    const s = bars([E, [101, 101, 96.5, 97], [97, 97.5, 95.5, 96]]);
    const r = simulate(s, setup(), none);
    expect(r).toMatchObject({ outcome: 'stop', filled: 4, avgEntry: 98.5 });
    if (r.status !== 'filled') throw new Error(r.status);
    expect(r.rGross).toBeCloseTo(-1);
    expect(r.rNet).toBeCloseTo(
      -1 - (FEES.maker * 98.5 + FEES.taker * 96) / 2.5,
    );
  });

  it('цель раньше входа — пропущен; лимиты живут 48 свечей', () => {
    const missed = bars([E, [101, 112.5, 100.5, 112]]);
    expect(simulate(missed, setup(), none).status).toBe('missed');
    const idle = bars([E, ...Array<Ohlc>(60).fill(E)]);
    expect(simulate(idle, setup(), none).status).toBe('expired');
  });

  it('после первого тейка стоп — в безубыток, вход снят', () => {
    const s = bars([E, FILL_TOP, TP1, [104, 104.2, 97.5, 98]]);
    const r = simulate(s, setup(), none);
    expect(r).toMatchObject({
      outcome: 'trail',
      filled: 1,
      takesHit: 1,
      finalStop: 100,
      exit: 100,
    });
    if (r.status !== 'filled') throw new Error(r.status);
    expect(r.rGross).toBeCloseTo(((0.25 / 3) * 4) / 2.5);
  });

  it('тейк и стоп в одной свече — минутки; без минуток — худший порядок', () => {
    const s = bars([E, FILL_TOP, [100.2, 104.5, 95.5, 101]]);
    expect(simulate(s, setup(), none)).toEqual({
      status: 'needs',
      from: 2 * STEP,
      to: 3 * STEP,
    });
    const mins: Bar[] = [
      { t0: 2 * STEP, t1: 2 * STEP + M, o: 100.2, h: 104.5, l: 100.1, c: 104 },
      {
        t0: 2 * STEP + M,
        t1: 2 * STEP + 2 * M,
        o: 104,
        h: 104,
        l: 99.8,
        c: 100,
      },
    ];
    expect(simulate(s, setup(), () => mins)).toMatchObject({
      outcome: 'trail',
      takesHit: 1,
    });
    const worst = simulate(s, setup(), () => []);
    expect(worst).toMatchObject({ outcome: 'stop', filled: 4, takesHit: 0 });
    if (worst.status !== 'filled') throw new Error(worst.status);
    expect(worst.rGross).toBeCloseTo(-1);
  });

  it('вход и первый тейк в одной свече — порядок по минуткам', () => {
    const s = bars([E, [101, 104.5, 99.5, 104], [104, 104.2, 99.5, 100]]);
    expect(simulate(s, setup(), none).status).toBe('needs');
    const mins: Bar[] = [
      { t0: STEP, t1: STEP + M, o: 101, h: 101, l: 99.8, c: 100 },
      { t0: STEP + M, t1: STEP + 2 * M, o: 100, h: 104.5, l: 100.2, c: 104 },
    ];
    expect(simulate(s, setup(), () => mins)).toMatchObject({
      outcome: 'trail',
      takesHit: 1,
      fillMs: STEP,
    });
  });

  it('срок — 3 суток от первого исполнения', () => {
    const hold: Ohlc = [100.5, 101, 99.5, 100.5];
    const s = bars([
      E,
      [101, 101, 99.8, 100.5],
      ...Array<Ohlc>(300).fill(hold),
    ]);
    const r = simulate(s, setup(), none);
    expect(r).toMatchObject({ outcome: 'time', exit: 100.5, filled: 1 });
    if (r.status !== 'filled') throw new Error(r.status);
    expect(r.rGross).toBeCloseTo((0.25 * 0.5) / 2.5);
  });

  it('одиночный вход и выход', () => {
    const s = bars([E, FILL_TOP, [100.2, 112.5, 100, 112]]);
    const single = setup({ entries: [100], takes: [112], trail: false });
    const r = simulate(s, single, none);
    expect(r).toMatchObject({ outcome: 'target', filled: 1 });
    if (r.status !== 'filled') throw new Error(r.status);
    expect(r.rGross).toBeCloseTo(3);
  });

  it('шорт — зеркало лонга', () => {
    const s = mirror(bars(ALL_TAKES));
    const neg = (xs: number[]) => xs.map((x) => -x);
    const short = setup({
      dir: -1,
      entries: neg([100, 99, 98, 97]),
      stop: -96,
      target: -112,
      takes: neg([104, 108, 112]),
    });
    const r = simulate(s, short, none);
    expect(r).toMatchObject({ outcome: 'target', avgEntry: -100, exit: -112 });
    if (r.status !== 'filled') throw new Error(r.status);
    expect(r.rGross).toBeCloseTo(0.8);
  });

  it('simulateAll доразбирает спорную свечу минутками', async () => {
    const s = bars([E, FILL_TOP, [100.2, 104.5, 95.5, 101]]);
    const mins: Bar[] = [
      { t0: 2 * STEP, t1: 2 * STEP + M, o: 100.2, h: 104.5, l: 100.1, c: 104 },
      {
        t0: 2 * STEP + M,
        t1: 2 * STEP + 2 * M,
        o: 104,
        h: 104,
        l: 99.8,
        c: 100,
      },
    ];
    const fetch = jest.fn(
      async (ranges: [number, number][]) =>
        new Map(ranges.map(([f, t]) => [minuteKey(f, t), mins])),
    );
    const [res] = await simulateAll(s, [setup()], fetch, new Map());
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(res.result).toMatchObject({ outcome: 'trail' });
    const [worst] = await simulateAll(
      s,
      [setup()],
      async () => new Map(),
      new Map(),
    );
    expect(worst.result).toMatchObject({ outcome: 'stop' });
  });
});
