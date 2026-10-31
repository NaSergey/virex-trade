import { bars, mirror, Ohlc, SCENARIO } from './fixtures';
import { atr, Series, swings } from './series';
import { scanLevels } from './events';
import { findSetups, SetupContext } from './setups';

/** SCENARIO как часовой ряд: свип 25 (ордерблок, 96…98,6), подтверждение 28. */
const hours = () => bars(SCENARIO, 60);
const ctxOf = (s: Series, htf: number, liq?: number): SetupContext => {
  const a = atr(s);
  const scan = scanLevels(s, a, swings(s));
  if (liq !== undefined) {
    scan.nearHigh[28] = liq;
    scan.nearLow[28] = -liq;
  }
  return {
    atr: a,
    scan,
    htf: new Int8Array(s.n).fill(htf),
    daily: new Int8Array(s.n),
  };
};
/** Ряд 15m: четыре копии каждого часа, кроме заданных свечей. */
const quarters = (over: Record<number, Ohlc> = {}) =>
  bars(
    SCENARIO.flatMap((c, i) => [0, 1, 2, 3].map((j) => over[i * 4 + j] ?? c)),
    15,
  );
/** Имбаланс 15m на свече 103 внутри блока: 96,8…97,4. */
const GAP: Record<number, Ohlc> = {
  101: [96.4, 96.8, 96.2, 96.7],
  102: [96.7, 98.1, 96.6, 97.9],
  103: [97.9, 98.4, 97.4, 98.2],
};
const close = (xs: number[], ys: number[]) => {
  expect(xs).toHaveLength(ys.length);
  xs.forEach((x, i) => expect(x).toBeCloseTo(ys[i]));
};

describe('setups: контекст 4H, сетап 1H, вход 15m', () => {
  it('сетка входа от имбаланса 15m, стоп под блоком, план 3–5R', () => {
    const s = hours();
    const [st] = findSetups(quarters(GAP), s, ctxOf(s, 1, 103));
    expect(st).toMatchObject({
      id: '25:1',
      dir: 1,
      sweepI: 100,
      fvgI: 103,
      bosI: 115,
      e: 115,
      obI: 100,
      stop: 96,
      target: 103,
      trail: true,
    });
    close(st.entries, [97.4, 97.05, 96.7, 96.35]);
    close(st.takes, [97.4 + 5.6 / 3, 97.4 + (2 * 5.6) / 3, 103]);
    expect(st.plannedR).toBeCloseTo(4);
  });

  it('нет имбаланса 15m в блоке — сделки нет', () => {
    const s = hours();
    expect(findSetups(quarters(), s, ctxOf(s, 1, 110))).toHaveLength(0);
  });

  it('имбаланс выше блока подтверждением не считается', () => {
    const s = hours();
    const above: Record<number, Ohlc> = {
      106: [98.2, 98.9, 98.1, 98.8],
      107: [98.8, 99.6, 98.7, 99.5],
      108: [99.5, 100, 99.2, 99.8],
    };
    expect(findSetups(quarters(above), s, ctxOf(s, 1, 110))).toHaveLength(0);
  });

  it('из двух имбалансов — тот, что цена встретит первым', () => {
    const s = hours();
    const two = { ...GAP, 102: [96.7, 97.6, 96.6, 97.5] as Ohlc };
    const [st] = findSetups(quarters(two), s, ctxOf(s, 1, 110));
    expect(st.entries[0]).toBeCloseTo(98); // лоу свечи 104 выше хая 102
    expect(st.fvgI).toBe(104);
  });

  it('имбаланс после часа подтверждения не виден', () => {
    const s = hours();
    const late: Record<number, Ohlc> = {
      116: [96.4, 96.8, 96.2, 96.7],
      117: [96.7, 98.1, 96.6, 97.9],
      118: [97.9, 98.4, 97.4, 98.2],
    };
    const rows = SCENARIO.flatMap((c) => [c, c, c, c]);
    rows.push(late[116], late[117], late[118]);
    const m15 = bars(rows, 15);
    expect(findSetups(m15, s, ctxOf(s, 1, 110))).toHaveLength(0);
  });

  it('ликвидность дальше 5R — цель на 5R', () => {
    const s = hours();
    const [st] = findSetups(quarters(GAP), s, ctxOf(s, 1, 120));
    expect(st.target).toBeCloseTo(97.4 + 5 * 1.4);
    expect(st.plannedR).toBe(5);
  });

  it('ликвидность ближе 3R — сетап пропускается', () => {
    const s = hours();
    expect(findSetups(quarters(GAP), s, ctxOf(s, 1, 101))).toHaveLength(0);
  });

  it('контекст 4H против — сетапа нет', () => {
    const s = hours();
    expect(findSetups(quarters(GAP), s, ctxOf(s, -1, 110))).toHaveLength(0);
  });

  it('шорт — зеркало лонга', () => {
    const s = mirror(hours());
    const [st] = findSetups(mirror(quarters(GAP)), s, ctxOf(s, -1, 103));
    expect(st).toMatchObject({ dir: -1, stop: -96, target: -103 });
    close(st.entries, [-97.4, -97.05, -96.7, -96.35]);
  });

  it('признаки сетапа', () => {
    const s = hours();
    const [st] = findSetups(quarters(GAP), s, ctxOf(s, 1, 110));
    // Закрытие часа 28 — 05:00 UTC пятницы 2 января 1970.
    expect(st.features).toMatchObject({
      session: 'asia',
      weekend: 'no',
      daily: 'with',
      plannedR: '4-5',
    });
    expect(Object.keys(st.features).sort()).toEqual([
      'daily',
      'pierce',
      'plannedR',
      'session',
      'stopAtr',
      'vol',
      'weekend',
    ]);
  });
});
