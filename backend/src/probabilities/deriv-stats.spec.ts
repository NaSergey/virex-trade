import {
  alignTo,
  derivNow,
  derivOdds,
  seriesOf,
  type DerivPointLike,
} from './deriv-stats';
import type { Bar } from './odds-math';

const H4 = 4 * 3_600_000;
const T0 = Date.UTC(2021, 0, 1);

/** Ровный рост: каждая следующая свеча берёт верхнюю границу ±1 ATR — исход всегда «вверх». */
const rising = (n: number): Bar[] =>
  Array.from({ length: n }, (_, i) => {
    const c = 1000 + i * 10;
    return { t: T0 + i * H4, h: c + 5, l: c - 5, c };
  });

describe('alignTo', () => {
  const bars: Bar[] = [0, 1, 2, 3, 4].map((i) => ({
    t: T0 + i * H4,
    h: 1,
    l: 1,
    c: 1,
  }));
  it('берёт последнюю точку не позже открытия свечи', () => {
    const points = [
      { time: T0, value: 1 },
      { time: T0 + H4 + 1, value: 2 }, // после открытия свечи 1 — ей не достаётся
    ];
    expect(alignTo(bars, points).slice(0, 3)).toEqual([1, 1, 2]);
  });
  it('точка старше 12 часов — значения нет', () => {
    expect(alignTo(bars, [{ time: T0, value: 1 }])).toEqual([
      1,
      1,
      1,
      1,
      null,
    ]);
  });
});

describe('seriesOf', () => {
  it('открытый интерес — изменение за сутки', () => {
    const bars: Bar[] = Array.from({ length: 8 }, (_, i) => ({
      t: T0 + i * H4,
      h: 1,
      l: 1,
      c: 1,
    }));
    const points = bars.map((b, i) => ({
      time: b.t,
      value: i < 6 ? 100 : 110,
    }));
    const s = seriesOf('oi', bars, points);
    expect(s.slice(0, 6)).toEqual([null, null, null, null, null, null]);
    expect(s[6]).toBeCloseTo(0.1, 10);
  });
  it('фандинг — как есть', () => {
    const bars: Bar[] = [{ t: T0, h: 1, l: 1, c: 1 }];
    expect(seriesOf('funding', bars, [{ time: T0, value: 0.0001 }])).toEqual([
      0.0001,
    ]);
  });
});

describe('derivOdds', () => {
  // Четыре года 4ч; фандинг почти всегда 0.01 %, раз в 300 свечей — выброс.
  const bars = rising(8760);
  const points: DerivPointLike[] = bars.map((b, i) => ({
    kind: 'funding',
    time: b.t,
    value: i % 300 === 299 ? 0.001 : 0.0001,
  }));

  it('выбросы — события зоны high, исход «вверх», проверка держится', () => {
    const s = derivOdds(bars, points)['funding:high']!;
    expect(s.side).toBe('up');
    expect(s.train.n).toBeGreaterThan(0);
    expect(s.train.hits).toBe(s.train.n);
    expect(s.test.n).toBeGreaterThan(4);
    expect(s.holds).toBe(true);
  });

  it('ряд без точек — без частот', () => {
    const odds = derivOdds(bars, points);
    expect(odds['ratio:high']).toBeNull();
    expect(odds['oi:low']).toBeNull();
  });
});

describe('derivNow', () => {
  it('значение и зона на свече, открывшейся последней к `now`', () => {
    const bars = rising(1200);
    const last = bars[bars.length - 1].t;
    const points: DerivPointLike[] = [
      ...bars.map((b) => ({
        kind: 'funding' as const,
        time: b.t,
        value: 0.0001,
      })),
      { kind: 'funding', time: last + H4, value: 0.002 },
    ];
    const now = derivNow(bars, points, last + H4 + 60_000);
    expect(now.find((x) => x.kind === 'funding')).toEqual({
      kind: 'funding',
      value: 0.002,
      zone: 'high',
    });
    expect(now.find((x) => x.kind === 'ratio')).toEqual({
      kind: 'ratio',
      value: null,
      zone: null,
    });
  });
});
