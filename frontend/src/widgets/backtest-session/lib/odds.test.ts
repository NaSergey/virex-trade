import { describe, expect, it } from 'vitest';
import { takeOdds } from './odds';

describe('takeOdds', () => {
  it('лонг: стоп 1 %, тейк 3 % — 25 %', () => {
    expect(takeOdds(100, 99, 103)).toBeCloseTo(25, 10);
  });
  it('шорт — зеркально', () => {
    expect(takeOdds(100, 101, 97)).toBeCloseTo(25, 10);
  });
  it('тейк и стоп по одну сторону — нет числа', () => {
    expect(takeOdds(100, 99, 98)).toBeNull();
  });
  it('без стопа или цена на уровне — нет числа', () => {
    expect(takeOdds(100, 0, 103)).toBeNull();
    expect(takeOdds(100, 100, 103)).toBeNull();
    expect(takeOdds(100, 99, 100)).toBeNull();
  });
});
