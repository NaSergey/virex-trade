import { describe, expect, it } from 'vitest';
import { tagOddsOf } from './odds';

describe('tagOddsOf', () => {
  it('нет сделок — нет строки', () => {
    expect(tagOddsOf({ trades: 0, wins: 0, avgWin: 0, avgLoss: 0 })).toBeNull();
  });
  it('«нужно» — средний убыток к сумме средних; журнал отдаёт убыток со знаком', () => {
    const o = tagOddsOf({ trades: 22, wins: 9, avgWin: 100, avgLoss: -62.5 })!;
    expect(o.need).toBeCloseTo(38.46, 2);
    expect(o.winRate).toBeCloseTo(40.91, 2);
    expect(o.verdict).toBe('unclear');
  });
  it('интервал целиком выше — в плюсе, ниже — в минусе', () => {
    expect(tagOddsOf({ trades: 100, wins: 70, avgWin: 1, avgLoss: 1 })!.verdict).toBe('plus');
    expect(tagOddsOf({ trades: 100, wins: 20, avgWin: 1, avgLoss: 1 })!.verdict).toBe('minus');
  });
});
