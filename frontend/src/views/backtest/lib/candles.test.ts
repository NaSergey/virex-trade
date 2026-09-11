import { describe, expect, it } from 'vitest';
import {
  MINUTE,
  aggregate,
  currentBucket,
  dayNumber,
  lastPrice,
  loadedUntil,
  nextStop,
  scaleCandle,
  visibleCandles,
  type Candle,
} from './candles';

const H = 60 * MINUTE;
const at = (h: number, m = 0) => Date.UTC(2024, 2, 5, h, m);

/** n минуток подряд от from; цены растут на единицу, чтобы порядок был виден. */
const mins = (from: number, n: number, base = 100): Candle[] =>
  Array.from({ length: n }, (_, i) => ({
    t: from + i * MINUTE,
    o: base + i,
    h: base + i + 0.5,
    l: base + i - 0.5,
    c: base + i + 0.25,
  }));

describe('корзины и шаг', () => {
  // Ровно на границе часа последняя показанная минутка — 11:59, и текущая
  // часовая свеча — 11:00, уже целиком закрытая.
  it('на границе текущая корзина — предыдущая', () => {
    expect(currentBucket(at(12), 60)).toBe(at(11));
    expect(currentBucket(at(12, 30), 60)).toBe(at(12));
  });

  it('шаг доводит недоформированную свечу до закрытия', () => {
    expect(nextStop(at(12, 30), 60)).toBe(at(13));
    expect(nextStop(at(13, 10), 240)).toBe(at(16));
  });

  it('шаг от закрытой свечи — до закрытия следующей', () => {
    expect(nextStop(at(12), 60)).toBe(at(13));
  });
});

describe('aggregate', () => {
  it('сворачивает минутки в часовку: open первой, close последней, крайние high и low', () => {
    const [c] = aggregate(mins(at(12), 60), 60, at(12), at(13));
    expect(c).toEqual({ t: at(12), o: 100, h: 159.5, l: 99.5, c: 159.25 });
  });

  it('берёт только минутки из [from, to)', () => {
    const out = aggregate(mins(at(11), 180), 60, at(12), at(13));
    expect(out.map((x) => x.t)).toEqual([at(12)]);
  });
});

describe('visibleCandles', () => {
  const closed: Candle[] = [
    { t: at(10), o: 1, h: 2, l: 0.5, c: 1.5 },
    { t: at(11), o: 1.5, h: 2.5, l: 1, c: 2 },
    // Лишняя: история из API обязана кончаться до anchor, и такая свеча отбрасывается.
    { t: at(12), o: 9, h: 9, l: 9, c: 9 },
  ];

  it('история до anchor, дальше — из минуток, последняя недоформирована', () => {
    const out = visibleCandles({ closed, anchor: at(12), minutes: mins(at(12), 120), tf: 60, cursor: at(13, 30) });
    expect(out.map((x) => x.t)).toEqual([at(10), at(11), at(12), at(13)]);
    expect(out[2].o).toBe(100); // собрана из минуток, а не взята из API
    expect(out[3].c).toBe(100 + 89 + 0.25); // последняя показанная минутка — 13:29
  });

  it('минутки после момента сессии не видны', () => {
    const out = visibleCandles({ closed: [], anchor: at(12), minutes: mins(at(12), 120), tf: 1, cursor: at(12, 5) });
    expect(out).toHaveLength(5);
  });
});

describe('lastPrice и loadedUntil', () => {
  it('цена — закрытие последней минутки до момента', () => {
    expect(lastPrice(mins(at(12), 10), at(12, 3))).toBe(102.25);
  });

  it('нет минуток до момента — null', () => {
    expect(lastPrice(mins(at(12), 10), at(12))).toBeNull();
  });

  it('загружено до закрытия последней минутки', () => {
    expect(loadedUntil(mins(at(12), 10))).toBe(at(12, 10));
    expect(loadedUntil([])).toBeNull();
  });
});

describe('scaleCandle', () => {
  it('масштабирует O/H/L/C, время не трогает', () => {
    expect(scaleCandle({ t: 1000, o: 10, h: 12, l: 9, c: 11 }, 2)).toEqual({ t: 1000, o: 20, h: 24, l: 18, c: 22 });
  });

  it('scale=1 — тот же объект, без копии', () => {
    const c = { t: 1000, o: 10, h: 12, l: 9, c: 11 };
    expect(scaleCandle(c, 1)).toBe(c);
  });
});

describe('dayNumber', () => {
  // Местное время, чтобы тест не зависел от часового пояса машины.
  it('день старта — первый, следующая полночь — второй', () => {
    const start = new Date(2024, 2, 5, 10, 0).getTime();
    expect(dayNumber(new Date(2024, 2, 5, 23, 0).getTime(), start)).toBe(1);
    expect(dayNumber(new Date(2024, 2, 6, 0, 30).getTime(), start)).toBe(2);
    expect(dayNumber(new Date(2024, 2, 12, 9, 0).getTime(), start)).toBe(8);
  });
});
