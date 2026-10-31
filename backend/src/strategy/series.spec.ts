import { bars, flat, SCENARIO, walk } from './fixtures';
import {
  maRegime,
  alignToClose,
  atr,
  closeMs,
  lowerBound,
  structure,
  swings,
  toSeries,
} from './series';

const prefix = (s: ReturnType<typeof walk>, k: number) =>
  toSeries(
    s.tf,
    Array.from({ length: k }, (_, i) => ({
      time: s.t[i],
      open: s.o[i],
      high: s.h[i],
      low: s.l[i],
      close: s.c[i],
    })),
  );

describe('series', () => {
  it('atr — среднее TR за первые 14, дальше по Уайлдеру', () => {
    const s = bars([...flat(14), [100, 104, 100, 103]]);
    const a = atr(s);
    expect(Number.isNaN(a[12])).toBe(true);
    expect(a[13]).toBeCloseTo(2);
    expect(a[14]).toBeCloseTo((2 * 13 + 4) / 14);
  });

  it('swings — фракталы сценария', () => {
    const sw = swings(bars(SCENARIO));
    expect(sw.highs.map((x) => [x.i, x.price, x.known])).toEqual([
      [16, 106, 18],
      [22, 102, 24],
    ]);
    // Свеча свипа 25 сама становится свинг-лоу 96 (подтверждена на 27).
    expect(sw.lows.map((x) => [x.i, x.price])).toEqual([
      [19, 97],
      [25, 96],
    ]);
  });

  it('swings и structure не перерисовываются', () => {
    const s = walk(600, 3);
    const full = swings(s);
    const fullTrend = structure(s, full);
    for (const k of [50, 177, 333, 599]) {
      const p = prefix(s, k);
      const sw = swings(p);
      expect(sw.highs).toEqual(full.highs.filter((x) => x.known < k));
      expect(sw.lows).toEqual(full.lows.filter((x) => x.known < k));
      expect(Array.from(structure(p, sw))).toEqual(
        Array.from(fullTrend.slice(0, k)),
      );
    }
  });

  it('structure — слом вверх на закрытии выше свинг-хая', () => {
    const trend = structure(bars(SCENARIO));
    expect(trend[27]).toBe(0);
    expect(trend[28]).toBe(1);
  });

  it('alignToClose — берётся последняя старшая свеча, закрытая не позже', () => {
    const m15 = bars(flat(32), 15);
    const h1 = bars(flat(8), 60);
    const vals = Int8Array.from([1, -1, 1, -1, 1, -1, 1, -1]);
    const al = alignToClose(m15, h1, vals);
    expect(al[2]).toBe(0); // 00:45 — часовая ещё не закрыта
    expect(al[3]).toBe(1); // 01:00 — закрылась первая
    expect(al[7]).toBe(-1); // 02:00 — вторая
    expect(closeMs(m15, 3)).toBe(60 * 60_000);
  });

  it('lowerBound', () => {
    const arr = Float64Array.from([1, 3, 3, 5]);
    expect(lowerBound(arr, 3)).toBe(1);
    expect(lowerBound(arr, 4)).toBe(3);
    expect(lowerBound(arr, 9)).toBe(4);
  });

  it('maRegime — нет истории 0, выше средней 1, ниже −1', () => {
    const line = (at: (i: number) => number) =>
      bars(
        Array.from(
          { length: 210 },
          (_, i): [number, number, number, number] => {
            const x = at(i);
            return [x, x, x, x];
          },
        ),
      );
    const up = maRegime(line((i) => 100 + i));
    expect(up[198]).toBe(0);
    expect(up[199]).toBe(1);
    expect(maRegime(line((i) => 1000 - i))[209]).toBe(-1);
  });
});
