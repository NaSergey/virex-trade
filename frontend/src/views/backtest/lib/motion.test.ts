import { describe, expect, it } from 'vitest';
import { glidePrice, indexAtOrAfter, resolveWindow } from './motion';

describe('glidePrice', () => {
  it('концы точно совпадают с open и close', () => {
    expect(glidePrice(100, 105, 98, 102, 0)).toBe(100);
    expect(glidePrice(100, 105, 98, 102, 1)).toBe(102);
  });

  it('дальний от open экстремум проходится первым — здесь high', () => {
    // |105-100|=5 > |100-98|=2
    expect(glidePrice(100, 105, 98, 102, 1 / 3)).toBe(105);
    expect(glidePrice(100, 105, 98, 102, 2 / 3)).toBe(98);
  });

  it('если дальше low — сначала он', () => {
    // |103-100|=3 < |100-90|=10
    expect(glidePrice(100, 103, 90, 95, 1 / 3)).toBe(90);
    expect(glidePrice(100, 103, 90, 95, 2 / 3)).toBe(103);
  });

  it('фаза вне [0,1] обрезается', () => {
    expect(glidePrice(100, 105, 98, 102, -1)).toBe(100);
    expect(glidePrice(100, 105, 98, 102, 2)).toBe(102);
  });

  it('плоская минутка (o=h=l=c) не роняет счёт', () => {
    expect(glidePrice(100, 100, 100, 100, 0.5)).toBe(100);
  });
});

describe('indexAtOrAfter', () => {
  const cs = [{ t: 10 }, { t: 20 }, { t: 30 }];
  it('находит первую подходящую', () => {
    expect(indexAtOrAfter(cs, 15)).toBe(1);
    expect(indexAtOrAfter(cs, 20)).toBe(1);
  });
  it('время раньше всех — индекс 0', () => {
    expect(indexAtOrAfter(cs, 0)).toBe(0);
  });
  it('время позже всех — длина массива', () => {
    expect(indexAtOrAfter(cs, 100)).toBe(3);
  });
});

describe('resolveWindow', () => {
  const cs = Array.from({ length: 50 }, (_, i) => ({ t: i * 60_000 }));
  const bounds = { minCount: 5, maxCount: 100 };

  it('живой режим (anchorTime=null) — окно у правого края', () => {
    expect(resolveWindow(cs, { count: 10, anchorTime: null }, bounds)).toEqual({ startIdx: 40, endIdx: 50, live: true });
  });

  it('якорь внутри диапазона — окно от него, не живое', () => {
    expect(resolveWindow(cs, { count: 10, anchorTime: 5 * 60_000 }, bounds)).toEqual({ startIdx: 5, endIdx: 15, live: false });
  });

  it('якорь у самого края — не уезжает за пределы массива', () => {
    const r = resolveWindow(cs, { count: 10, anchorTime: 49 * 60_000 }, bounds);
    expect(r.startIdx).toBe(40);
    expect(r.endIdx).toBe(50);
  });

  it('count зажимается границами', () => {
    const r = resolveWindow(cs, { count: 1000, anchorTime: null }, { minCount: 5, maxCount: 20 });
    expect(r.endIdx - r.startIdx).toBe(20);
  });
});
