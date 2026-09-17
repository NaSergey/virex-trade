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

describe('thinEquity — экстремум-сохраняющее прореживание (T-final-review)', () => {
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
    // max — приблизительный порядок величины, не жёсткий потолок: до двух
    // точек на корзину вместо одной (см. комментарий thinEquity), поэтому
    // итог может быть заметно больше 600, но не безгранично.
    expect(out.length).toBeLessThanOrEqual(1200);
    expect(out.length).toBeGreaterThan(600); // на монотонном ряду обе точки корзины разные — реально сработало
    for (let i = 1; i < out.length; i++) {
      expect(out[i].time).toBeGreaterThan(out[i - 1].time);
    }
  });

  it('последняя точка исходного ряда всегда сохранена', () => {
    const points = makeSeries(5000);
    const out = thinEquity(points, 600);
    expect(out[out.length - 1]).toEqual(points[points.length - 1]);
  });

  it('первая точка исходного ряда сохранена (первая корзина начинается с индекса 0)', () => {
    const points = makeSeries(5000);
    const out = thinEquity(points, 600);
    expect(out[0]).toEqual(points[0]);
  });

  // Регрессия ревью: резкий провал ПОСЕРЕДИНЕ ряда, который простое
  // прореживание "каждая N-я точка" пропускало бы (индекс провала не кратен
  // stride), обязан остаться в результате — иначе «Просадка» на обзоре
  // (считается по этому же массиву, см. вызов thinEquity в stats()) занижена.
  it('резкий провал посередине ряда присутствует в результате, даже если его индекс не кратен stride', () => {
    const n = 5000;
    const dipIndex = 2500; // не кратен stride = ceil(5000/600) = 9
    const points: EquityPoint[] = Array.from({ length: n }, (_, i) => ({
      time: i + 1,
      value: i === dipIndex ? -5000 : 1000,
    }));

    const out = thinEquity(points, 600);

    expect(out.some((p) => p.value === -5000)).toBe(true);
    // Порядок по времени остаётся строго возрастающим.
    for (let i = 1; i < out.length; i++) {
      expect(out[i].time).toBeGreaterThan(out[i - 1].time);
    }
  });

  it('в корзине с одинаковым min и max (постоянное значение) точка попадает в результат один раз', () => {
    const points: EquityPoint[] = Array.from({ length: 5000 }, (_, i) => ({ time: i + 1, value: 42 }));
    const out = thinEquity(points, 600);
    // Не должно быть дублей одной и той же точки подряд из-за minIdx === maxIdx.
    for (let i = 1; i < out.length; i++) {
      expect(out[i].time).toBeGreaterThan(out[i - 1].time);
    }
    expect(out.every((p) => p.value === 42)).toBe(true);
  });
});
