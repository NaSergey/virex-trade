import { describe, expect, it } from 'vitest';
import { formatMultiplier, multiplierAt, stepToward } from './multiplier-roll';

describe('множитель под курсором', () => {
  // Без курсора на плашке обязано стоять ровно то, что отрисовал React.
  it.each([
    [1.8, 2.6],
    [3.4, 5.9],
    [12.6, 25.3],
  ])('в покое — своё значение, под курсором — большее (%s → %s)', (from, to) => {
    expect(multiplierAt(from, to, 0)).toBe(formatMultiplier(from));
    expect(multiplierAt(from, to, 1)).toBe(formatMultiplier(to));
  });

  it('за пределы хода не выходит', () => {
    expect(multiplierAt(12.6, 25.3, -1)).toBe('12.6x');
    expect(multiplierAt(12.6, 25.3, 2)).toBe('25.3x');
  });

  it('растёт без откатов назад', () => {
    const values: number[] = [];
    for (let s = 0; s <= 1; s += 0.02) values.push(parseFloat(multiplierAt(12.6, 25.3, s)));
    for (let i = 1; i < values.length; i++) expect(values[i]).toBeGreaterThanOrEqual(values[i - 1]);
  });

  it('растёт ускоряясь, как множитель crash-игры', () => {
    const mid = parseFloat(multiplierAt(12.6, 25.3, 0.5));
    expect(25.3 - mid).toBeGreaterThan(mid - 12.6);
  });
});

describe('ход к цели', () => {
  it('идёт к цели и не перелетает её', () => {
    expect(stepToward(0, 1, 450, 900)).toBe(0.5);
    expect(stepToward(0.9, 1, 450, 900)).toBe(1);
    expect(stepToward(0.5, 0, 225, 450)).toBe(0);
  });

  // Курсор ушёл на середине роста — число разворачивается оттуда, где было.
  it('разворачивается с текущего положения', () => {
    const up = stepToward(0, 1, 300, 900);
    expect(stepToward(up, 0, 50, 450)).toBeCloseTo(up - 50 / 450);
  });
});
