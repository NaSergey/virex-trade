import { describe, expect, it } from 'vitest';
import { chipLabel, chipsFor, stepBet } from './stake';

describe('stepBet', () => {
  it('шагает по круглым суммам 1-2-5', () => {
    expect(stepBet(10, 1, 1, 10_000)).toBe(20);
    expect(stepBet(20, 1, 1, 10_000)).toBe(50);
    expect(stepBet(50, -1, 1, 10_000)).toBe(20);
    expect(stepBet(1000, 1, 1, 10_000)).toBe(2000);
  });

  it('с некруглой суммы — к ближайшей круглой в сторону шага', () => {
    expect(stepBet(37, 1, 1, 10_000)).toBe(50);
    expect(stepBet(37, -1, 1, 10_000)).toBe(20);
  });

  it('не выходит за лимиты стола', () => {
    expect(stepBet(1, -1, 1, 10_000)).toBe(1);
    expect(stepBet(10_000, 1, 1, 10_000)).toBe(10_000);
    expect(stepBet(5, 1, 1, 8)).toBe(8);
    expect(stepBet(7, -1, 5, 100)).toBe(5);
  });

  it('пустое или нечисловое поле — к минимуму', () => {
    expect(stepBet(Number.NaN, 1, 1, 10_000)).toBe(1);
    expect(stepBet(Number.NaN, -1, 3, 10_000)).toBe(3);
  });
});

describe('chipsFor', () => {
  it('быстрые суммы — только внутри лимитов', () => {
    expect(chipsFor(1, 10_000)).toEqual([10, 50, 100, 500]);
    expect(chipsFor(20, 200)).toEqual([50, 100]);
  });
});

describe('chipLabel', () => {
  it('тысячи — буквой K', () => {
    expect(chipLabel(500)).toBe('500');
    expect(chipLabel(1000)).toBe('1K');
    expect(chipLabel(2500)).toBe('2.5K');
    expect(chipLabel(10_000)).toBe('10K');
  });
});
