import { computeSqn, MIN_SQN_POSITIONS } from './trades.service';

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
