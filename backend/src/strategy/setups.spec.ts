import { bars, mirror, Ohlc, SCENARIO } from './fixtures';
import { atr, Series, swings } from './series';
import { scanLevels } from './events';
import { CONFIRM_LIFE, findSetups, SetupContext } from './setups';

/** SCENARIO как часовой ряд: свип 25 (ордерблок, стоп 96, верх 98,6), подтверждение 28. */
const hours = () => bars(SCENARIO, 60);
const ctxOf = (s: Series, htf: number): SetupContext => {
  const a = atr(s);
  return {
    atr: a,
    scan: scanLevels(s, a, swings(s)),
    htf: new Int8Array(s.n).fill(htf),
    daily: new Int8Array(s.n),
  };
};
/** Откат после часа 28: свинг-хай 104 на свече 116, известен на 118. */
const PULLBACK: Ohlc[] = [
  [102.8, 104, 102.5, 103.5], // 116
  [103.5, 103.6, 101, 101.5], // 117
  [101.5, 101.8, 99, 99.5], // 118
  [99.5, 99.8, 98.7, 98.9], // 119
];
const TOUCH: Ohlc = [98.9, 99, 98, 98.2]; // 120 — лоу в блоке
const UP: Ohlc = [98.2, 100, 98, 99.8]; // 121
const BREAK: Ohlc = [99.8, 105, 99.5, 104.5]; // 122 — закрытие выше 104
/** Ряд 15m: четыре копии каждого часа и заданный путь после них. */
const quarters = (path: Ohlc[]) =>
  bars([...SCENARIO.flatMap((c) => [c, c, c, c]), ...path], 15);
const FULL = [...PULLBACK, TOUCH, UP, BREAK];
const close = (xs: number[], ys: number[]) => {
  expect(xs).toHaveLength(ys.length);
  xs.forEach((x, i) => expect(x).toBeCloseTo(ys[i]));
};

describe('setups: контекст 4H, сетап 1H, подтверждение 15m', () => {
  it('возврат в часовой блок и слом 15m — вход, стоп часовой, цель 5R', () => {
    const s = hours();
    const [st] = findSetups(quarters(FULL), s, ctxOf(s, 1));
    expect(st).toMatchObject({
      id: '25:1',
      dir: 1,
      sweepI: 100,
      fvgI: 111,
      bosI: 122,
      e: 122,
      obI: 100,
      blockTop: 98.6,
      stop: 96,
      trail: true,
      market: true,
      plannedR: 5,
    });
    const h = 104.5 - 96;
    expect(st.target).toBeCloseTo(104.5 + 5 * h);
    close(st.entries, [
      104.5,
      104.5 - h / 4,
      104.5 - h / 2,
      104.5 - (3 * h) / 4,
    ]);
    close(st.takes, [104.5 + (5 * h) / 3, 104.5 + (10 * h) / 3, 104.5 + 5 * h]);
  });

  it('слома нет, пока цена не вернулась в блок', () => {
    const s = hours();
    const above: Ohlc = [98.9, 100, 98.7, 99.8]; // лоу выше верха блока 98,6
    const noTouch = [...PULLBACK, above, BREAK];
    expect(findSetups(quarters(noTouch), s, ctxOf(s, 1))).toHaveLength(0);
  });

  it('стоп пробит раньше слома — сделки нет', () => {
    const s = hours();
    const pierced: Ohlc = [98.2, 98.5, 95.9, 98];
    const path = [...PULLBACK, TOUCH, pierced, UP, BREAK];
    expect(findSetups(quarters(path), s, ctxOf(s, 1))).toHaveLength(0);
  });

  it('слом позже 48 часов не считается', () => {
    const s = hours();
    const idle = Array.from({ length: CONFIRM_LIFE }, (): Ohlc => TOUCH);
    const path = [...PULLBACK, ...idle, BREAK];
    expect(findSetups(quarters(path), s, ctxOf(s, 1))).toHaveLength(0);
  });

  it('свечи после слома на решение не влияют', () => {
    const s = hours();
    const [a] = findSetups(quarters(FULL), s, ctxOf(s, 1));
    const later: Ohlc[] = [
      [104.5, 200, 104, 150],
      [150, 151, 1, 2],
    ];
    const [b] = findSetups(quarters([...FULL, ...later]), s, ctxOf(s, 1));
    expect(b).toEqual(a);
  });

  it('контекст 4H против — сетапа нет', () => {
    const s = hours();
    expect(findSetups(quarters(FULL), s, ctxOf(s, -1))).toHaveLength(0);
  });

  it('шорт — зеркало лонга', () => {
    const s = mirror(hours());
    const [st] = findSetups(mirror(quarters(FULL)), s, ctxOf(s, -1));
    expect(st).toMatchObject({ dir: -1, stop: -96, e: 122 });
    expect(st.entries[0]).toBeCloseTo(-104.5);
    expect(st.target).toBeCloseTo(-(104.5 + 5 * 8.5));
  });

  it('признаки сетапа', () => {
    const s = hours();
    const [st] = findSetups(quarters(FULL), s, ctxOf(s, 1));
    // Закрытие часа 28 — 05:00 UTC пятницы 2 января 1970.
    expect(st.features).toMatchObject({
      session: 'asia',
      weekend: 'no',
      daily: 'with',
    });
    expect(Object.keys(st.features).sort()).toEqual([
      'daily',
      'pierce',
      'session',
      'stopAtr',
      'vol',
      'weekend',
    ]);
  });
});
