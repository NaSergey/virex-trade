import { describe, expect, it } from 'vitest';
import { defaultShares, sharesValid } from './payout-shares';

describe('defaultShares', () => {
  it('готовые раскладки на одного, двух и трёх победителей', () => {
    expect(defaultShares(1)).toEqual([100]);
    expect(defaultShares(2)).toEqual([70, 30]);
    expect(defaultShares(3)).toEqual([50, 30, 20]);
  });

  it('от четырёх мест — поровну, остаток первому', () => {
    expect(defaultShares(4)).toEqual([25, 25, 25, 25]);
    // 100 / 3 не делится нацело — лишний процент уходит первому месту.
    expect(defaultShares(6)).toEqual([20, 16, 16, 16, 16, 16]);
  });

  it('любая раскладка по умолчанию даёт ровно сто и проходит проверку', () => {
    for (let n = 1; n <= 9; n++) {
      const shares = defaultShares(n);
      expect(shares.reduce((a, b) => a + b, 0)).toBe(100);
      expect(sharesValid(shares, n)).toBe(true);
    }
  });
});

describe('sharesValid', () => {
  it('сумма не сто — отказ', () => {
    expect(sharesValid([70, 20], 2)).toBe(false);
  });

  it('второе место больше первого — отказ', () => {
    expect(sharesValid([30, 70], 2)).toBe(false);
  });

  it('длина не совпадает с числом победителей — отказ', () => {
    expect(sharesValid([100], 2)).toBe(false);
  });

  it('нулевая доля — отказ: призовое место без приза бессмысленно', () => {
    expect(sharesValid([100, 0], 2)).toBe(false);
  });
});
