import { bars, mirror, SCENARIO } from './fixtures';
import { atr, Series, swings } from './series';
import { scanLevels } from './events';
import { findSetups, MAIN, SetupContext, VARIANTS } from './setups';

/** Ликвидность сверху (снизу у зеркала) на свече подтверждения 28 подменяется. */
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
const variant = (id: string) => VARIANTS.find((v) => v.id === id);
const close = (xs: number[], ys: number[]) => {
  expect(xs).toHaveLength(ys.length);
  xs.forEach((x, i) => expect(x).toBeCloseTo(ys[i]));
};

describe('setups v2', () => {
  it('сетка входа, тейки и план 3–5R', () => {
    const s = bars(SCENARIO);
    const [st] = findSetups(s, ctxOf(s, 1, 110), MAIN);
    expect(st).toMatchObject({
      id: 'main:25:1',
      dir: 1,
      sweepI: 25,
      e: 28,
      obI: 25,
      stop: 96,
      target: 110,
      trail: true,
    });
    close(st.entries, [98.6, 97.95, 97.3, 96.65]);
    close(st.takes, [102.4, 106.2, 110]);
    expect(st.plannedR).toBeCloseTo(11.4 / 2.6);
  });

  it('ликвидность дальше 5R — цель на 5R', () => {
    const s = bars(SCENARIO);
    const [st] = findSetups(s, ctxOf(s, 1, 120), MAIN);
    expect(st.target).toBeCloseTo(98.6 + 5 * 2.6);
    expect(st.plannedR).toBe(5);
  });

  it('ликвидность ближе 3R — сетап пропускается', () => {
    const s = bars(SCENARIO); // ближайший хай 106 — 2,85R
    expect(findSetups(s, ctxOf(s, 1), MAIN)).toHaveLength(0);
  });

  it('контекст против — сетапа нет; без контекста — есть', () => {
    const s = bars(SCENARIO);
    expect(findSetups(s, ctxOf(s, -1, 110), MAIN)).toHaveLength(0);
    expect(
      findSetups(s, ctxOf(s, -1, 110), variant('no-context')),
    ).toHaveLength(1);
  });

  it('одиночный вход и выход', () => {
    const s = bars(SCENARIO);
    const [st] = findSetups(s, ctxOf(s, 1, 110), variant('single'));
    expect(st).toMatchObject({ entries: [98.6], takes: [110], trail: false });
  });

  it('цена уже в блоке на подтверждении — сетап пропускается', () => {
    const s = bars(SCENARIO);
    expect(findSetups(s, ctxOf(s, 1, 110), variant('sweep'))).toHaveLength(0);
  });

  it('шорт — зеркало лонга', () => {
    const s = mirror(bars(SCENARIO));
    const [st] = findSetups(s, ctxOf(s, -1, 110), MAIN);
    expect(st).toMatchObject({ dir: -1, stop: -96, target: -110 });
    close(st.entries, [-98.6, -97.95, -97.3, -96.65]);
  });

  it('признаки сетапа', () => {
    const s = bars(SCENARIO);
    const [st] = findSetups(s, ctxOf(s, 1, 110), MAIN);
    // Закрытие свечи 28 — 07:15 UTC четверга 1 января 1970.
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
