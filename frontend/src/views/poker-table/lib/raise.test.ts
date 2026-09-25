import { describe, expect, it } from 'vitest';
import { presetRaiseTo } from './raise';

describe('poker raise presets', () => {
  it('рейз от банка зажат в допустимую вилку', () => {
    const base = { pot: 100, bets: 20, toCall: 10, currentBet: 20, min: 40, max: 500 };
    expect(presetRaiseTo(1, base)).toBe(150);
    expect(presetRaiseTo(0.01, base)).toBe(40);
    expect(presetRaiseTo(10, base)).toBe(500);
  });
});
