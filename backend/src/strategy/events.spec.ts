import { bars, mirror, SCENARIO, walk } from './fixtures';
import { atr, Series, swings, toSeries } from './series';
import { confirmAfter, fvgAt, scanLevels } from './events';

const scan = (s: Series) => scanLevels(s, atr(s), swings(s));

describe('events', () => {
  it('свип лоу 97 на свече 25 со ссылкой на внутренний хай 102', () => {
    const s = bars(SCENARIO);
    const r = scan(s);
    expect(r.sweeps).toHaveLength(1);
    const sw = r.sweeps[0];
    expect(sw).toMatchObject({
      i: 25,
      dir: 1,
      level: 97,
      extreme: 96,
      ref: 102,
    });
    expect(sw.pierceAtr).toBeCloseTo(1 / atr(s)[25]);
  });

  it('пробой хая 102 закрытием на свече 28 с глубиной в ATR', () => {
    const s = bars(SCENARIO);
    const br = scan(s).breaks.find((b) => b.i === 28);
    expect(br).toMatchObject({ dir: 1, level: 102 });
    expect(br.depthAtr).toBeCloseTo(0.8 / atr(s)[28]);
  });

  it('закрытие за уровнем — пробой, а не свип', () => {
    const rows = SCENARIO.slice(0, 25);
    rows.push([98.6, 98.8, 96, 96.5]);
    const r = scan(bars(rows));
    expect(r.sweeps).toHaveLength(0);
    expect(r.breaks[0]).toMatchObject({ i: 25, dir: -1, level: 97 });
  });

  it('ближайшие нетронутые уровни после свечи', () => {
    const r = scan(bars(SCENARIO));
    expect(r.nearHigh[27]).toBe(102);
    expect(r.nearHigh[28]).toBe(106);
    expect(r.nearLow[24]).toBe(97);
    expect(Number.isNaN(r.nearLow[25])).toBe(true); // 97 снят, 96 ещё не подтверждён
    expect(r.nearLow[28]).toBe(96);
  });

  it('зеркальный ряд даёт зеркальный свип', () => {
    const r = scan(mirror(bars(SCENARIO)));
    expect(r.sweeps[0]).toMatchObject({
      i: 25,
      dir: -1,
      level: -97,
      extreme: -96,
      ref: -102,
    });
  });

  it('события не перерисовываются', () => {
    const s = walk(800, 5);
    const full = scan(s);
    const k = 500;
    const p = toSeries(
      15,
      Array.from({ length: k }, (_, i) => ({
        time: s.t[i],
        open: s.o[i],
        high: s.h[i],
        low: s.l[i],
        close: s.c[i],
      })),
    );
    const part = scan(p);
    expect(part.sweeps).toEqual(full.sweeps.filter((x) => x.i < k));
    expect(part.breaks).toEqual(full.breaks.filter((x) => x.i < k));
    expect(Array.from(part.nearHigh)).toEqual(
      Array.from(full.nearHigh.slice(0, k)),
    );
  });

  it('fvgAt и confirmAfter', () => {
    const s = bars(SCENARIO);
    expect(fvgAt(s, 27, 1)).toBe(true);
    expect(fvgAt(s, 26, 1)).toBe(false);
    const sw = scan(s).sweeps[0];
    expect(confirmAfter(s, sw)).toEqual({ fvg: 27, bos: 28 });
  });

  it('новый экстремум за свипом обрывает поиск подтверждения', () => {
    const rows = SCENARIO.slice(0, 27);
    rows.push([98, 98.5, 95.5, 98]); // 27: лоу ниже 96
    rows.push([98, 103, 98, 102.8]); // 28: слом уже не считается
    const s = bars(rows);
    expect(confirmAfter(s, scan(s).sweeps[0])).toEqual({ fvg: -1, bos: -1 });
  });
});
