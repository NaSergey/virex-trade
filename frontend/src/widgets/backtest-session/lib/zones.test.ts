import { describe, expect, it } from 'vitest';
import type { Candle } from './candles';
import { findFvgs, findOrderBlocks, type Zone } from './zones';

const bar = (i: number, o: number, h: number, l: number, c: number): Candle => ({ t: i * 60_000, o, h, l, c });
const flat = (n: number, p = 100): Candle[] => Array.from({ length: n }, (_, i) => bar(i, p, p + 1, p - 1, p));

describe('findFvgs', () => {
  it('бычий разрыв появляется на третьей свече и закрывается, когда цена прошла его целиком', () => {
    const bars = flat(20);
    bars.push(bar(20, 100, 101, 99, 101));
    bars.push(bar(21, 101, 110, 101, 109));
    bars.push(bar(22, 109, 112, 105, 111)); // лоу 105 > хай 101 двумя свечами раньше
    bars.push(bar(23, 111, 112, 103, 104)); // зашла внутрь, не прошла
    let z = findFvgs(bars).filter((x) => x.dir === 1);
    expect(z).toHaveLength(1);
    expect(z[0]).toMatchObject({ kind: 'fvg', lo: 101, hi: 105, from: 21 * 60_000, seen: 22 * 60_000, end: null });
    bars.push(bar(24, 104, 105, 100, 100));
    z = findFvgs(bars).filter((x) => x.dir === 1);
    expect(z[0].end).toBe(24 * 60_000);
  });

  it('медвежий разрыв — зеркально', () => {
    const bars = flat(20);
    bars.push(bar(20, 100, 101, 99, 99));
    bars.push(bar(21, 99, 99, 90, 91));
    bars.push(bar(22, 91, 95, 88, 89));
    const z = findFvgs(bars);
    expect(z).toEqual([expect.objectContaining({ dir: -1, hi: 99, lo: 95 })]);
  });
});

describe('findOrderBlocks', () => {
  it('слом свинг-хая даёт бычий блок на последней падающей свече перед движением', () => {
    const bars = flat(10);
    bars.push(bar(10, 100, 106, 100, 105)); // свинг-хай 106
    bars.push(bar(11, 105, 105, 101, 102));
    bars.push(bar(12, 102, 103, 97, 98)); // падающая — ордерблок
    bars.push(bar(13, 98, 102, 98, 101));
    bars.push(bar(14, 101, 104, 100, 103));
    bars.push(bar(15, 103, 105, 102, 104));
    bars.push(bar(16, 104, 108, 103, 107)); // закрытие выше 106
    const z = findOrderBlocks(bars).filter((x) => x.dir === 1);
    expect(z).toHaveLength(1);
    expect(z[0]).toMatchObject({ kind: 'ob', from: 12 * 60_000, seen: 16 * 60_000, hi: 103, lo: 97, end: null });
    bars.push(bar(17, 107, 107, 95, 96)); // закрытие под блоком
    expect(findOrderBlocks(bars).find((x) => x.dir === 1)?.end).toBe(17 * 60_000);
  });
});

/** Детерминированное блуждание. */
function walk(n: number): Candle[] {
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const out: Candle[] = [];
  let p = 100;
  for (let i = 0; i < n; i++) {
    const o = p;
    const c = o + (rnd() - 0.5) * 6;
    out.push(bar(i, o, Math.max(o, c) + rnd() * 2, Math.min(o, c) - rnd() * 2, c));
    p = c;
  }
  return out;
}

describe('не перерисовываются', () => {
  it('зоны по началу ряда совпадают с зонами по всему ряду, какими они были на тот момент', () => {
    const bars = walk(600);
    for (const find of [findFvgs, findOrderBlocks]) {
      const full = find(bars);
      for (const cut of [100, 250, 400]) {
        const tEnd = bars[cut - 1].t;
        const asThen = full
          .filter((z) => z.seen <= tEnd)
          .map((z): Zone => ({ ...z, end: z.end != null && z.end <= tEnd ? z.end : null }));
        expect(find(bars.slice(0, cut))).toEqual(asThen);
      }
      expect(full.length).toBeGreaterThan(0);
    }
  });
});
