import { exposureOf, styleOf, type SnapshotPosition } from './exposure';

const pos = (
  coin: string,
  szi: number,
  notional: number,
): SnapshotPosition => ({
  coin,
  szi,
  notional,
  entryPx: 1,
  upnl: 0,
});

describe('exposureOf', () => {
  it('нетто и брутто — к балансу, знак по стороне', () => {
    const e = exposureOf(
      [pos('BTC', 1, 600), pos('ETH', -2, 200), pos('SOL', 5, 100)],
      1000,
    );
    expect(e).toEqual({ net: 0.5, gross: 0.9 });
  });

  it('нет баланса — нет и экспозиции: делить не на что', () => {
    expect(exposureOf([pos('BTC', 1, 100)], null)).toBeNull();
    expect(exposureOf([pos('BTC', 1, 100)], 0)).toBeNull();
  });

  it('без позиций — нули', () => {
    expect(exposureOf([], 1000)).toEqual({ net: 0, gross: 0 });
  });
});

describe('styleOf', () => {
  it('почти без позиций — flat', () => {
    expect(styleOf(0.01, 0.02)).toBe('flat');
  });

  it('лонг и шорт гасят друг друга — neutral', () => {
    expect(styleOf(0.1, 2)).toBe('neutral');
    expect(styleOf(-0.2, 2)).toBe('neutral');
  });

  it('перекос в одну сторону — directional, в любую', () => {
    expect(styleOf(1, 1.2)).toBe('directional');
    expect(styleOf(-0.9, 1)).toBe('directional');
    expect(styleOf(0.5, 1.5)).toBe('directional');
  });

  it('нет данных — null, а не flat', () => {
    expect(styleOf(null, 1)).toBeNull();
    expect(styleOf(0.1, undefined)).toBeNull();
  });
});
