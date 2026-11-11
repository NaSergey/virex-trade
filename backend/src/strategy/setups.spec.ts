import { bars, mirror, Ohlc, SCENARIO } from './fixtures';
import { atr, Series, swings } from './series';
import { scanLevels } from './events';
import { findSetups, SetupContext } from './setups';

/** SCENARIO как часовой ряд: свип 25 (ордерблок, стоп 96, верх 98,6), сетап готов на 28. */
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
  atr4 = 3,
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
/** Ряд 15m: четыре копии каждого часа. Сетапу он даёт только индексы исполнения. */
const quarters = (rows: Ohlc[] = SCENARIO) =>
  bars(
    rows.flatMap((c) => [c, c, c, c]),
    15,
  );
const close = (xs: number[], ys: number[]) => {
  expect(xs).toHaveLength(ys.length);
  xs.forEach((x, i) => expect(x).toBeCloseTo(ys[i]));
};

describe('setups: контекст 4H, сетап и вход 1H', () => {
  it('лимит на границе блока, стоп часовой, тейки на 1R и 3R', () => {
    const s = hours();
    const [st] = findSetups(quarters(), s, ctxOf(s, 1));
    expect(st).toMatchObject({
      id: '25:1',
      dir: 1,
      sweepI: 100,
      fvgI: 111,
      bosI: 115,
      e: 115,
      obI: 100,
      blockTop: 98.6,
      stop: 96,
      trail: true,
      plannedR: 3,
      atr4: 3,
      rangeLo: 50,
      rangeHi: 60,
    });
    expect(st.market).toBeUndefined();
    close(st.entries, [98.6]);
    close(st.takes, [98.6 + 2.6, 98.6 + 3 * 2.6]);
    expect(st.target).toBeCloseTo(106.4);
  });

  it('свинг ближе 2R от входа — сделки нет', () => {
    const s = hours();
    const count = (near: number) => {
      const ctx = ctxOf(s, 1);
      ctx.scan.nearHigh[28] = near;
      return findSetups(quarters(), s, ctx).length;
    };
    // Вход 98,6, риск 2,6: свободный ход нужен до 103,8.
    expect(count(103.7)).toBe(0);
    expect(count(103.9)).toBe(1);
    expect(count(NaN)).toBe(1); // свингов выше нет
  });

  it('вход в средней трети диапазона 4H — сделки нет, у краёв — есть', () => {
    const s = hours();
    const count = (lo: number, hi: number) =>
      findSetups(quarters(), s, ctxOf(s, 1, [lo, hi])).length;
    expect(count(80, 120)).toBe(0); // положение 0,47
    expect(count(95, 170)).toBe(1); // у низа
    expect(count(30, 100)).toBe(1); // у верха
  });

  it('истории 4H на диапазон нет — сделки нет', () => {
    const s = hours();
    const ctx = ctxOf(s, 1);
    ctx.h4 = bars(
      Array.from({ length: 5 }, (): Ohlc => [50, 60, 50, 60]),
      240,
      -5 * H4,
    );
    ctx.atr4 = new Float64Array(5).fill(3);
    expect(findSetups(quarters(), s, ctx)).toHaveLength(0);
  });

  it('незакрытая 4H-свеча на решение не влияет', () => {
    const s = hours();
    const ctx = ctxOf(s, 1, [50, 60], 3);
    // Решение — на 29-м часу; свеча с 28:00 ещё идёт, свеча с 24:00 закрыта.
    const rows: Ohlc[] = [
      ...Array.from({ length: 46 }, (): Ohlc => [50, 60, 50, 60]),
      [50, 60, 50, 60],
      [50, 900, 1, 60],
    ];
    ctx.h4 = bars(rows, 240, -40 * H4);
    const atr4 = new Float64Array(rows.length).fill(3);
    atr4[47] = 500;
    ctx.atr4 = atr4;
    const [st] = findSetups(quarters(), s, ctx);
    expect(st.atr4).toBe(3);
    expect(st.rangeHi).toBe(60);
  });

  it('свечи после решения на сетап не влияют', () => {
    const s = hours();
    const [a] = findSetups(quarters(), s, ctxOf(s, 1));
    const later: Ohlc[] = [
      ...SCENARIO,
      [102.8, 200, 102, 150],
      [150, 151, 1, 2],
    ];
    const s2 = bars(later, 60);
    const [b] = findSetups(quarters(later), s2, ctxOf(s2, 1));
    expect(b).toEqual(a);
  });

  it('контекст 4H против — сетапа нет', () => {
    const s = hours();
    expect(findSetups(quarters(), s, ctxOf(s, -1))).toHaveLength(0);
  });

  it('шорт — зеркало лонга', () => {
    const s = mirror(hours());
    const [st] = findSetups(mirror(quarters()), s, ctxOf(s, -1, [-60, -50]));
    expect(st).toMatchObject({ dir: -1, stop: -96, e: 115 });
    expect(st.entries[0]).toBeCloseTo(-98.6);
    close(st.takes, [-101.2, -106.4]);
  });

  it('признаки сетапа', () => {
    const s = hours();
    const [st] = findSetups(quarters(), s, ctxOf(s, 1));
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
