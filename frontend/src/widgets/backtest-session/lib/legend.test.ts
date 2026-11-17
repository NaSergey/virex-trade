import { describe, expect, it } from 'vitest';
import { formatPriceGrouped } from '@/shared/lib/utils/format';
import type { Candle } from './candles';
import { legendOf } from './legend';

const c = (o: number, h: number, l: number, cl: number): Candle => ({ t: 0, o, h, l, c: cl });

describe('legendOf', () => {
  it('OHLC — тем же форматом, что шкала, изменение — от закрытия предыдущей свечи', () => {
    const got = legendOf(c(64549, 64894, 64117, 64873), c(64000, 64600, 63900, 64557), 0);
    expect(got).toEqual({
      o: formatPriceGrouped(64549, 0),
      h: formatPriceGrouped(64894, 0),
      l: formatPriceGrouped(64117, 0),
      c: formatPriceGrouped(64873, 0),
      change: '+316 (+0.49%)',
      up: true,
    });
  });

  it('без предыдущей свечи — изменение от открытия; падение — со знаком минус', () => {
    const got = legendOf(c(100, 101, 98, 99), undefined, 2);
    expect(got.change).toBe('−1.00 (−1.00%)');
    expect(got.up).toBe(false);
  });

  it('цвет — по направлению самой свечи, а не по изменению', () => {
    // Свеча растёт (c > o), но закрылась ниже предыдущей: цвет зелёный, изменение с минусом.
    const got = legendOf(c(90, 96, 89, 95), c(100, 101, 99, 100), 0);
    expect(got.up).toBe(true);
    expect(got.change).toBe('−5 (−5.00%)');
  });

  it('без изменения — без знака', () => {
    expect(legendOf(c(10, 11, 9, 10), c(10, 10, 10, 10), 0).change).toBe('0 (0.00%)');
  });
});
