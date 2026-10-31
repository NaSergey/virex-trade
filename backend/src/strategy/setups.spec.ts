import { bars, mirror, Ohlc, SCENARIO } from './fixtures';
import { atr, Series, swings } from './series';
import { scanLevels } from './events';
import { CONFIRM_LIFE, findSetups, SAVED_RULES, SetupContext } from './setups';

/** SCENARIO как часовой ряд: свип 25 (ордерблок, стоп 96, верх 98,6), подтверждение 28. */
const hours = () => bars(SCENARIO, 60);
const H4 = 240 * 60_000;
/** 40 закрытых 4H-свечей до начала ряда: диапазон lo…hi, ATR задан. */
const h4Of = (lo: number, hi: number) =>
  bars(
    Array.from({ length: 40 }, (): Ohlc => [lo, hi, lo, hi]),
    240,
    -40 * H4,
  );
const ctxOf = (
  s: Series,
  htf: number,
  range: [number, number] = [50, 60],
  atr4 = 2,
): SetupContext => {
  const a = atr(s);
  const h4 = h4Of(range[0], range[1]);
  return {
    atr: a,
    scan: scanLevels(s, a, swings(s)),
    htf: new Int8Array(s.n).fill(htf),
    daily: new Int8Array(s.n),
    h4,
    atr4: new Float64Array(h4.n).fill(atr4),
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
  it('сохранённый вариант: возврат в блок и слом 15m — вход, стоп часовой, цель 5R', () => {
    const s = hours();
    const [st] = findSetups(quarters(FULL), s, ctxOf(s, 1), SAVED_RULES);
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

  it('цель — 4 ATR закрытой 4H-свечи от входа, план в R считается из неё', () => {
    const s = hours();
    const [st] = findSetups(quarters(FULL), s, ctxOf(s, 1, [50, 60], 3));
    expect(st.target).toBeCloseTo(104.5 + 4 * 3);
    expect(st.plannedR).toBeCloseTo(12 / 8.5);
    close(st.takes, [108.5, 112.5, 116.5]);
    expect(st).toMatchObject({ atr4: 3, rangeLo: 50, rangeHi: 60 });
  });

  it('цель ближе стопа — сделки нет', () => {
    const s = hours(); // стоп 8,5 — цель 4 × 2 = 8
    expect(
      findSetups(quarters(FULL), s, ctxOf(s, 1, [50, 60], 2)),
    ).toHaveLength(0);
  });

  it('вход в средней трети диапазона 4H — сделки нет, у краёв — есть', () => {
    const s = hours();
    const atr4 = 3; // вход 104,5
    const count = (lo: number, hi: number) =>
      findSetups(quarters(FULL), s, ctxOf(s, 1, [lo, hi], atr4)).length;
    expect(count(90, 120)).toBe(0); // положение 0,48
    expect(count(100, 170)).toBe(1); // у низа
    expect(count(30, 106)).toBe(1); // у верха
  });

  it('истории 4H на диапазон нет — сделки нет; сохранённому варианту не мешает', () => {
    const s = hours();
    const ctx = ctxOf(s, 1, [50, 60], 3);
    ctx.h4 = bars(
      Array.from({ length: 5 }, (): Ohlc => [50, 60, 50, 60]),
      240,
      -5 * H4,
    );
    ctx.atr4 = new Float64Array(5).fill(3);
    expect(findSetups(quarters(FULL), s, ctx)).toHaveLength(0);
    expect(findSetups(quarters(FULL), s, ctx, SAVED_RULES)).toHaveLength(1);
  });

  it('незакрытая 4H-свеча на цель не влияет', () => {
    const s = hours();
    const ctx = ctxOf(s, 1, [50, 60], 3);
    // Вход закрывается на 30,75 часа; свеча с 28:00 ещё идёт, свеча с 24:00 закрыта.
    const rows: Ohlc[] = [
      ...Array.from({ length: 46 }, (): Ohlc => [50, 60, 50, 60]),
      [50, 60, 50, 60],
      [50, 900, 1, 60],
    ];
    ctx.h4 = bars(rows, 240, -40 * H4);
    const atr4 = new Float64Array(rows.length).fill(3);
    atr4[47] = 500;
    ctx.atr4 = atr4;
    const [st] = findSetups(quarters(FULL), s, ctx);
    expect(st.atr4).toBe(3);
    expect(st.rangeHi).toBe(60);
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
    const [a] = findSetups(quarters(FULL), s, ctxOf(s, 1), SAVED_RULES);
    const later: Ohlc[] = [
      [104.5, 200, 104, 150],
      [150, 151, 1, 2],
    ];
    const [b] = findSetups(
      quarters([...FULL, ...later]),
      s,
      ctxOf(s, 1),
      SAVED_RULES,
    );
    expect(b).toEqual(a);
  });

  it('контекст 4H против — сетапа нет', () => {
    const s = hours();
    expect(findSetups(quarters(FULL), s, ctxOf(s, -1))).toHaveLength(0);
  });

  it('шорт — зеркало лонга', () => {
    const s = mirror(hours());
    const [st] = findSetups(
      mirror(quarters(FULL)),
      s,
      ctxOf(s, -1),
      SAVED_RULES,
    );
    expect(st).toMatchObject({ dir: -1, stop: -96, e: 122 });
    expect(st.entries[0]).toBeCloseTo(-104.5);
    expect(st.target).toBeCloseTo(-(104.5 + 5 * 8.5));
  });

  it('признаки сетапа', () => {
    const s = hours();
    const [st] = findSetups(quarters(FULL), s, ctxOf(s, 1), SAVED_RULES);
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
