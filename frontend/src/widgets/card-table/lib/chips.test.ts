import { describe, expect, it } from 'vitest';
import { chipsFor } from './chips';

describe('chipsFor', () => {
  it('раскладывает сумму по номиналам, крупные внизу', () => {
    expect(chipsFor(130)).toEqual([100, 25, 5]);
    expect(chipsFor(20)).toEqual([5, 5, 5, 5]);
  });

  it('стопка обрезается сверху, старшие номиналы остаются', () => {
    expect(chipsFor(1240)).toEqual([1000, 100, 100, 25, 5]);
  });

  it('ноль и мусор — пустая стопка', () => {
    expect(chipsFor(0)).toEqual([]);
    expect(chipsFor(-5)).toEqual([]);
  });
});
