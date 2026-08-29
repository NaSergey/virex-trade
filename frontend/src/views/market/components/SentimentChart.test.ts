import { describe, expect, it } from 'vitest';
import { fmtUsdCompact } from './SentimentChart';

describe('fmtUsdCompact', () => {
  it('formats trillions with a T suffix', () => {
    expect(fmtUsdCompact(2.3e12)).toBe('$2.3 T');
  });

  it('still formats billions with a B suffix (regression)', () => {
    expect(fmtUsdCompact(6.1e9)).toBe('$6.1 B');
  });
});
