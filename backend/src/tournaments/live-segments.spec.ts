import { barForTrade, buildSegments } from './live-segments';

/**
 * Движок эфира проверяет уровни не по минуткам, а по отрезкам движения с
 * прошлого тика: минутка, которую прошлый тик застал недоформированной, уже
 * частично проверена, и брать её целиком значило бы исполнять стоп по цене,
 * которая была до того, как стоп выставили.
 */
const MIN = 60_000;
const T = Date.UTC(2026, 8, 18, 12, 0, 0);
const bar = (t: number, o: number, h: number, l: number, c: number) => ({ t, o, h, l, c });

describe('buildSegments', () => {
  it('первый тик берёт минутки целиком', () => {
    const minutes = [bar(T, 100, 110, 90, 105), bar(T + MIN, 105, 115, 104, 112)];

    const { segments } = buildSegments(null, minutes, T + 2 * MIN);

    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatchObject({ from: T, to: T + MIN, bar: minutes[0], extHigh: 110, extLow: 90 });
    expect(segments[1]).toMatchObject({ from: T + MIN, to: T + 2 * MIN });
  });

  it('продолжение недоформированной минутки идёт от прошлой цены', () => {
    // Прошлый тик видел минутку с ценой 105 и диапазоном 90–110.
    const snap = { at: T + 30_000, minuteT: T, high: 110, low: 90, last: 105 };
    // К этому тику она закрылась на 108, не выйдя за прежние границы.
    const { segments } = buildSegments(snap, [bar(T, 100, 110, 90, 108)], T + MIN);

    expect(segments).toHaveLength(1);
    // Открытие отрезка — прошлая цена, а не открытие минутки: движение от 100
    // до 105 прошлый тик уже проверил.
    expect(segments[0].bar).toMatchObject({ o: 105, c: 108, h: 108, l: 105 });
    // Старые экстремумы отрезку не принадлежат.
    expect(segments[0]).toMatchObject({ extHigh: null, extLow: null, from: T + 30_000, to: T + MIN });
  });

  it('новые экстремумы недоформированной минутки в отрезок входят', () => {
    const snap = { at: T + 30_000, minuteT: T, high: 110, low: 90, last: 105 };
    // Минутка успела сходить и выше прежнего максимума, и ниже минимума.
    const { segments } = buildSegments(snap, [bar(T, 100, 120, 80, 108)], T + MIN);

    expect(segments[0].bar).toMatchObject({ o: 105, c: 108, h: 120, l: 80 });
    expect(segments[0]).toMatchObject({ extHigh: 120, extLow: 80 });
  });

  it('уже проверенные минутки пропускаются', () => {
    const snap = { at: T + MIN, minuteT: T + MIN, high: 106, low: 104, last: 105 };
    const minutes = [bar(T, 100, 110, 90, 105), bar(T + MIN, 105, 106, 104, 107)];

    const { segments } = buildSegments(snap, minutes, T + 2 * MIN);

    expect(segments).toHaveLength(1);
    expect(segments[0].bar.t).toBe(T + MIN);
  });

  it('минутки правее границы не берутся', () => {
    const minutes = [bar(T, 100, 110, 90, 105), bar(T + MIN, 105, 115, 104, 112)];

    const { segments } = buildSegments(null, minutes, T + MIN);

    expect(segments).toHaveLength(1);
    expect(segments[0].bar.t).toBe(T);
  });

  it('незакрытая минутка кончается временем тика и становится снимком', () => {
    const until = T + 20_000;
    const { segments, next } = buildSegments(null, [bar(T, 100, 106, 99, 104)], until);

    expect(segments[0]).toMatchObject({ from: T, to: until });
    expect(next).toEqual({ at: until, minuteT: T, high: 106, low: 99, last: 104 });
  });

  it('когда все минутки закрыты, снимка не остаётся', () => {
    const { next } = buildSegments(null, [bar(T, 100, 110, 90, 105)], T + MIN);
    expect(next).toBeNull();
  });
});

describe('barForTrade', () => {
  const seg = {
    from: T,
    to: T + MIN,
    bar: bar(T, 100, 120, 80, 110),
    extHigh: 120 as number | null,
    extLow: 80 as number | null,
  };

  it('позиция, открытая до отрезка, проверяется на всём отрезке', () => {
    expect(barForTrade(seg, { entryTime: T - MIN, entryPrice: 95 })).toEqual(seg.bar);
  });

  it('позиция, открытая внутри отрезка, идёт от цены входа — экстремумы до входа ей не принадлежат', () => {
    const b = barForTrade(seg, { entryTime: T + 30_000, entryPrice: 105 });

    // Открытие — цена входа, закрытие — цена конца отрезка.
    expect(b).toMatchObject({ o: 105, c: 110 });
    // Новые экстремумы отрезка остаются: окно — секунды, разделить их точнее нечем.
    expect(b).toMatchObject({ h: 120, l: 80 });
  });

  it('без новых экстремумов позиция внутри отрезка видит только вход и закрытие', () => {
    const quiet = { ...seg, bar: bar(T, 100, 110, 100, 108), extHigh: null, extLow: null };

    expect(barForTrade(quiet, { entryTime: T + 30_000, entryPrice: 104 })).toMatchObject({
      o: 104,
      c: 108,
      h: 108,
      l: 104,
    });
  });

  it('позиция, открытая после отрезка, не проверяется вовсе', () => {
    expect(barForTrade(seg, { entryTime: T + MIN, entryPrice: 105 })).toBeNull();
    expect(barForTrade(seg, { entryTime: T + 2 * MIN, entryPrice: 105 })).toBeNull();
  });
});
