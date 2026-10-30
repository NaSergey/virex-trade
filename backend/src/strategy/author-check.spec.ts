import { bars, flat, Ohlc, walk } from './fixtures';
import { atr, swings } from './series';
import { scanLevels } from './events';
import { authorCheck, barrier, shareOf } from './author-check';

describe('author-check', () => {
  const base = flat(14); // ATR = 2

  it('barrier — какая граница ±1 ATR первая', () => {
    const up = bars([...base, [100, 102.5, 99.5, 102]]);
    expect(barrier(up, atr(up), 13)).toBe(1);
    const dn = bars([...base, [100, 100.5, 97.5, 98]]);
    expect(barrier(dn, atr(dn), 13)).toBe(-1);
    const both = bars([...base, [100, 102.5, 97.5, 100]]);
    expect(barrier(both, atr(both), 13)).toBe(0);
    const none = bars([...base, ...Array<Ohlc>(30).fill([100, 101, 99, 100])]);
    expect(barrier(none, atr(none), 13)).toBe(0);
  });

  it('shareOf — доля, интервал, база и нерешённые', () => {
    const s = bars([...base, [100, 102.5, 99.5, 102]]);
    const sh = shareOf(
      [
        { i: 13, dir: 1 },
        { i: 13, dir: -1 },
        { i: 14, dir: 1 },
      ],
      s,
      atr(s),
      0.6,
    );
    expect(sh.n).toBe(2);
    expect(sh.share).toBeCloseTo(0.5);
    expect(sh.base).toBeCloseTo((0.6 + 0.4) / 2);
    expect(sh.unresolved).toBe(1);
  });

  it('authorCheck — восемь строк, у условий два столбца', () => {
    const s = walk(3000, 9);
    const a = atr(s);
    const rows = authorCheck(s, a, scanLevels(s, a, swings(s)));
    expect(rows.map((r) => r.key)).toEqual([
      'sweep',
      'sweep-fvg',
      'sweep-bos',
      'sweep-all',
      'break',
      'break-lt02',
      'break-02-05',
      'break-gt05',
    ]);
    expect(rows[0].fromConfirm).toBeNull();
    expect(rows[1].fromConfirm).not.toBeNull();
    expect(rows[0].fromEvent.n).toBeGreaterThan(0);
    const parts = rows
      .slice(5)
      .reduce((x, r) => x + r.fromEvent.n + r.fromEvent.unresolved, 0);
    expect(parts).toBe(rows[4].fromEvent.n + rows[4].fromEvent.unresolved);
  });
});
