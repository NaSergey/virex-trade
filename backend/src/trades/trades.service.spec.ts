import { computeSqn, MIN_SQN_POSITIONS, thinEquity, EquityPoint } from './trades.service';

describe('computeSqn', () => {
  it('меньше MIN_SQN_POSITIONS сделок — null, независимо от значений', () => {
    const pnls = Array(MIN_SQN_POSITIONS - 1).fill(100);
    expect(computeSqn(pnls)).toBeNull();
  });

  it('вырожденный случай — все P&L периода одинаковы (нулевая дисперсия) — null', () => {
    const pnls = Array(MIN_SQN_POSITIONS).fill(42);
    expect(computeSqn(pnls)).toBeNull();
  });

  it('нулевое среднее — SQN 0, даже при ненулевой дисперсии', () => {
    const pnls = [...Array(15).fill(10), ...Array(15).fill(-10)];
    expect(computeSqn(pnls)).toBe(0);
  });

  it('считает по формуле Ван Тарпа на конкретном наборе', () => {
    // mean=2, stdev(N-1)≈1.017, sqn = sqrt(30)*2/1.017 ≈ 10.77 — посчитано отдельно,
    // не в уме: 15 сделок по +3, 15 сделок по +1.
    const pnls = [...Array(15).fill(3), ...Array(15).fill(1)];
    expect(computeSqn(pnls)).toBe(10.77);
  });

  it('ровно MIN_SQN_POSITIONS сделок — граница включительно, не null', () => {
    const pnls = [...Array(15).fill(3), ...Array(15).fill(1)];
    expect(pnls.length).toBe(MIN_SQN_POSITIONS);
    expect(computeSqn(pnls)).not.toBeNull();
  });
});

describe('thinEquity', () => {
  function makeSeries(n: number): EquityPoint[] {
    return Array.from({ length: n }, (_, i) => ({ time: i + 1, value: i }));
  }

  it('короче лимита — возвращает как есть, без копирования', () => {
    const points = makeSeries(600);
    expect(thinEquity(points, 600)).toBe(points);
  });

  it('длиннее лимита — прореживает, но сохраняет строгую монотонность времени', () => {
    const points = makeSeries(5000);
    const out = thinEquity(points, 600);
    expect(out.length).toBeLessThanOrEqual(600);
    for (let i = 1; i < out.length; i++) {
      expect(out[i].time).toBeGreaterThan(out[i - 1].time);
    }
  });

  it('последняя точка исходного ряда всегда сохранена', () => {
    const points = makeSeries(5000);
    const out = thinEquity(points, 600);
    expect(out[out.length - 1]).toEqual(points[points.length - 1]);
  });

  it('первая точка исходного ряда сохранена (stride делит с индекса 0)', () => {
    const points = makeSeries(5000);
    const out = thinEquity(points, 600);
    expect(out[0]).toEqual(points[0]);
  });
});
