import { averageQuality } from './trades.service';

describe('averageQuality', () => {
  it('пустой список — null', () => {
    expect(averageQuality([])).toBeNull();
  });

  it('все значения null/undefined — null', () => {
    expect(averageQuality([null, undefined, null])).toBeNull();
  });

  it('считает среднее только по непустым значениям', () => {
    expect(averageQuality([80, null, 60, undefined, 40])).toBe(60);
  });

  it('округляет до двух знаков', () => {
    expect(averageQuality([66.666, 33.333])).toBe(50);
    expect(averageQuality([100, 33.333, 0])).toBe(44.44);
  });
});
