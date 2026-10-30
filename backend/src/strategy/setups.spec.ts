import { bars, mirror, SCENARIO } from './fixtures';
import { atr, Series, swings } from './series';
import { scanLevels } from './events';
import { findSetups, MAIN, SetupContext, VARIANTS } from './setups';

const ctxOf = (s: Series, htf: number): SetupContext => {
  const a = atr(s);
  return {
    atr: a,
    scan: scanLevels(s, a, swings(s)),
    htf: new Int8Array(s.n).fill(htf),
    daily: new Int8Array(s.n),
  };
};
const variant = (id: string) => VARIANTS.find((v) => v.id === id);

describe('setups', () => {
  it('основной вариант собирает A+ сетап сценария', () => {
    const s = bars(SCENARIO);
    const [st] = findSetups(s, ctxOf(s, 1), MAIN);
    expect(st).toMatchObject({
      // Направление в id: внешняя свеча может дать свипы в обе стороны.
      id: 'main:25:1',
      dir: 1,
      sweepI: 25,
      fvgI: 27,
      bosI: 28,
      e: 28,
      obI: 25,
      level: 97,
      entry: 98.6,
      stop: 96,
      target: 106,
    });
    expect(st.plannedR).toBeCloseTo(7.4 / 2.6);
  });

  it('контекст против — сетапа нет; без контекста — есть', () => {
    const s = bars(SCENARIO);
    expect(findSetups(s, ctxOf(s, -1), MAIN)).toHaveLength(0);
    expect(findSetups(s, ctxOf(s, -1), variant('no-context'))).toHaveLength(1);
  });

  it('вход от 50 % блока и фиксированная цель', () => {
    const s = bars(SCENARIO);
    const [mid] = findSetups(s, ctxOf(s, 1), variant('mid'));
    expect(mid.entry).toBeCloseTo(97.3);
    const [r2] = findSetups(s, ctxOf(s, 1), variant('r2'));
    expect(r2.target).toBeCloseTo(98.6 + 2 * 2.6);
    expect(r2.plannedR).toBeCloseTo(2);
  });

  it('цена уже в блоке на подтверждении — сетап пропускается', () => {
    const s = bars(SCENARIO);
    // «Только свип»: подтверждение — сама свеча свипа, она закрылась ниже входа 98,6.
    expect(findSetups(s, ctxOf(s, 1), variant('sweep'))).toHaveLength(0);
  });

  it('плановый R < 1 — сетап пропускается', () => {
    const s = bars(SCENARIO);
    const ctx = ctxOf(s, 1);
    ctx.scan.nearHigh[28] = 100; // ближайшая ликвидность сверху — в 0,54R от входа
    expect(findSetups(s, ctx, MAIN)).toHaveLength(0);
  });

  it('шорт — зеркало лонга', () => {
    const s = mirror(bars(SCENARIO));
    const [st] = findSetups(s, ctxOf(s, -1), MAIN);
    expect(st).toMatchObject({
      dir: -1,
      entry: -98.6,
      stop: -96,
      target: -106,
    });
  });

  it('признаки сетапа', () => {
    const s = bars(SCENARIO);
    const [st] = findSetups(s, ctxOf(s, 1), MAIN);
    // Закрытие свечи 28 — 07:15 UTC четверга 1 января 1970.
    expect(st.features.session).toBe('asia');
    expect(st.features.weekend).toBe('no');
    expect(st.features.daily).toBe('with');
    expect(st.features.plannedR).toBe('2-3');
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
