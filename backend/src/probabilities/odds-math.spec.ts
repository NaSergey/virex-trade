import {
  atrOf,
  countOf,
  firstBarrier,
  statOf,
  wilson,
  type Bar,
  type Outcome,
} from './odds-math';

const bar = (t: number, c: number, h = c, l = c): Bar => ({ t, h, l, c });

describe('wilson', () => {
  it('без наблюдений — весь отрезок', () => {
    expect(wilson(0, 0)).toEqual({ low: 0, high: 100 });
  });
  it('70 из 100 — около 60.4…78.1', () => {
    const w = wilson(70, 100);
    expect(w.low).toBeCloseTo(60.42, 1);
    expect(w.high).toBeCloseTo(78.12, 1);
  });
  it('5 из 5 — нижняя граница выше 50', () => {
    expect(wilson(5, 5).low).toBeGreaterThan(50);
  });
});

describe('countOf', () => {
  it('доля в процентах и интервал', () => {
    const c = countOf(3, 4);
    expect(c.n).toBe(4);
    expect(c.hits).toBe(3);
    expect(c.share).toBe(75);
    expect(c.low).toBeLessThan(75);
    expect(c.high).toBeGreaterThan(75);
  });
});

describe('atrOf', () => {
  it('разгон — NaN, дальше ровный TR', () => {
    // Каждая свеча: размах 10, закрытие на прошлом уровне — TR = 10.
    const bars = Array.from({ length: 30 }, (_, i) => bar(i, 100, 105, 95));
    const atr = atrOf(bars, 14);
    for (let i = 0; i < 14; i++) expect(Number.isNaN(atr[i])).toBe(true);
    expect(atr[14]).toBeCloseTo(10, 10);
    expect(atr[29]).toBeCloseTo(10, 10);
  });
});

describe('firstBarrier', () => {
  const base = [bar(0, 100)];
  it('вверх первым', () => {
    expect(
      firstBarrier(
        [...base, bar(1, 101, 102, 99.5), bar(2, 109, 111, 108)],
        0,
        10,
      ),
    ).toBe('up');
  });
  it('вниз первым', () => {
    expect(firstBarrier([...base, bar(1, 95, 101, 89)], 0, 10)).toBe('down');
  });
  it('обе границы в одной свече — вне выборки', () => {
    expect(firstBarrier([...base, bar(1, 100, 111, 89)], 0, 10)).toBeNull();
  });
  it('за горизонт не дошла — вне выборки', () => {
    const flat = Array.from({ length: 30 }, (_, i) => bar(i, 100, 101, 99));
    expect(firstBarrier(flat, 0, 10, 20)).toBeNull();
  });
  it('касание после горизонта не считается', () => {
    const bars = [
      ...Array.from({ length: 22 }, (_, i) => bar(i, 100, 101, 99)),
      bar(22, 120, 120, 119),
    ];
    expect(firstBarrier(bars, 0, 10, 20)).toBeNull();
  });
});

describe('statOf', () => {
  const SPLIT = 1000;
  const o = (t: number, side: 'up' | 'down'): Outcome => ({ t, side });

  it('пусто — null', () => {
    expect(statOf([], 'up', SPLIT)).toBeNull();
  });
  it('история и проверка делятся по SPLIT, «держится» при сильной проверке', () => {
    const outs = [
      ...Array.from({ length: 10 }, (_, i) => o(i, i < 8 ? 'up' : 'down')),
      ...Array.from({ length: 10 }, (_, i) => o(SPLIT + i, 'up')),
    ];
    const s = statOf(outs, 'up', SPLIT)!;
    expect(s.side).toBe('up');
    expect(s.train).toMatchObject({ n: 10, hits: 8, share: 80 });
    expect(s.test).toMatchObject({ n: 10, hits: 10, share: 100 });
    expect(s.holds).toBe(true);
  });
  it('медвежья сторона считает «вниз»', () => {
    const s = statOf([o(1, 'down'), o(2, 'down'), o(3, 'up')], 'down', SPLIT)!;
    expect(s.train).toMatchObject({ n: 3, hits: 2 });
  });
  it('без проверки или со слабой — не держится', () => {
    expect(statOf([o(1, 'up'), o(2, 'up')], 'up', SPLIT)!.holds).toBe(false);
    const weak = statOf(
      [o(1, 'up'), o(2, 'up'), o(SPLIT, 'up'), o(SPLIT + 1, 'down')],
      'up',
      SPLIT,
    )!;
    expect(weak.holds).toBe(false);
  });
  it('проверка по другую сторону от 50 % — не держится', () => {
    const outs = [
      o(1, 'down'),
      o(2, 'down'),
      ...Array.from({ length: 10 }, (_, i) => o(SPLIT + i, 'up')),
    ];
    expect(statOf(outs, 'up', SPLIT)!.holds).toBe(false);
  });
  it('заданная сторона ниже 50 % в истории и на проверке — держится', () => {
    // Бычья дивергенция, после которой цена устойчиво шла вниз.
    const outs = [
      ...Array.from({ length: 10 }, (_, i) => o(i, i < 2 ? 'up' : 'down')),
      ...Array.from({ length: 10 }, (_, i) => o(SPLIT + i, 'down')),
    ];
    const s = statOf(outs, 'up', SPLIT)!;
    expect(s.train.share).toBe(20);
    expect(s.test.high).toBeLessThan(50);
    expect(s.holds).toBe(true);
  });
  it('ровно 50 % в истории — стороны нет, не держится', () => {
    const outs = [
      o(1, 'up'),
      o(2, 'down'),
      ...Array.from({ length: 10 }, (_, i) => o(SPLIT + i, 'up')),
    ];
    expect(statOf(outs, 'up', SPLIT)!.holds).toBe(false);
  });
});
