import {
  atrOf,
  countOf,
  firstBarrier,
  statOf,
  wilson,
  zoneEvents,
  zonesOf,
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
  it('auto берёт сторону, чаще шедшую первой в истории', () => {
    const s = statOf(
      [o(1, 'down'), o(2, 'down'), o(3, 'up'), o(SPLIT, 'down')],
      'auto',
      SPLIT,
    )!;
    expect(s.side).toBe('down');
    expect(s.test).toMatchObject({ n: 1, hits: 1 });
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
  it('в истории сторона не перевешивает — не держится, как бы ни шла проверка', () => {
    const outs = [
      o(1, 'down'),
      o(2, 'down'),
      ...Array.from({ length: 10 }, (_, i) => o(SPLIT + i, 'up')),
    ];
    expect(statOf(outs, 'up', SPLIT)!.holds).toBe(false);
  });
});

describe('zonesOf', () => {
  it('до заполнения окна — null; выброс вверх — high, вниз — low', () => {
    const values: (number | null)[] = [
      ...Array.from({ length: 10 }, (_, i) => i),
      100,
      -5,
      5,
    ];
    const z = zonesOf(values, 10, 0.1, 10);
    for (let i = 0; i < 10; i++) expect(z[i]).toBeNull();
    expect(z[10]).toBe('high');
    expect(z[11]).toBe('low');
    expect(z[12]).toBe('normal');
  });
  it('повторы обычного значения крайними не делают', () => {
    // Фандинг месяцами на одной ставке: точка, равная почти всем, — обычная.
    const values = [...Array.from({ length: 20 }, () => 1), 1];
    expect(zonesOf(values, 20, 0.1, 20)[20]).toBe('normal');
  });
  it('пропуск значения — null', () => {
    const values: (number | null)[] = [
      ...Array.from({ length: 10 }, (_, i) => i),
      null,
    ];
    expect(zonesOf(values, 10, 0.1, 10)[10]).toBeNull();
  });
});

describe('zoneEvents', () => {
  it('вход в зону — событие, стояние в ней — нет', () => {
    expect(zoneEvents(['normal', 'high', 'high', 'normal'], 20)).toEqual([
      { i: 1, zone: 'high' },
    ]);
  });
  it('повторный вход раньше паузы не считается, после — считается', () => {
    const z: ('high' | 'normal')[] = [
      'normal',
      'high',
      'normal',
      'high',
      ...Array.from({ length: 20 }, () => 'normal' as const),
      'high',
    ];
    expect(zoneEvents(z, 20).map((e) => e.i)).toEqual([1, 24]);
  });
  it('у разных зон паузы свои', () => {
    expect(zoneEvents(['normal', 'high', 'low'], 20)).toEqual([
      { i: 1, zone: 'high' },
      { i: 2, zone: 'low' },
    ]);
  });
});
