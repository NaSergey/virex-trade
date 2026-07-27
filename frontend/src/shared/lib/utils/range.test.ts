import { describe, expect, it } from 'vitest';
import { formatRangePos, rangeBucket, rangePosColor, RANGE_HIGH_MIN, RANGE_LOW_MAX } from './range';

describe('rangeBucket', () => {
  it('splits the scale at the documented thresholds', () => {
    expect(rangeBucket(RANGE_LOW_MAX - 0.01)).toBe('low');
    expect(rangeBucket(RANGE_LOW_MAX)).toBe('mid');
    expect(rangeBucket(RANGE_HIGH_MIN - 0.01)).toBe('mid');
    expect(rangeBucket(RANGE_HIGH_MIN)).toBe('high');
  });

  it('puts breakouts in the extreme buckets rather than dropping them', () => {
    // Значение не обрезается: вход выше диапазона даёт > 100, ниже — < 0.
    expect(rangeBucket(180)).toBe('high');
    expect(rangeBucket(-40)).toBe('low');
  });

  it('returns null when the range was not computed', () => {
    expect(rangeBucket(null)).toBeNull();
    expect(rangeBucket(undefined)).toBeNull();
    expect(rangeBucket(NaN)).toBeNull();
  });
});

describe('formatRangePos', () => {
  it('labels the value with its bucket', () => {
    expect(formatRangePos(82)).toBe('82% · верх');
    expect(formatRangePos(50)).toBe('50% · середина');
    expect(formatRangePos(4.4)).toBe('4% · низ');
  });

  it('renders a dash when there is nothing to show', () => {
    expect(formatRangePos(null)).toBe('—');
  });
});

describe('rangePosColor', () => {
  it('reads the top of the range as risk for a long and as opportunity for a short', () => {
    expect(rangePosColor(90, 'long')).toBe('text-down');
    expect(rangePosColor(90, 'short')).toBe('text-up');
    expect(rangePosColor(10, 'long')).toBe('text-up');
    expect(rangePosColor(10, 'short')).toBe('text-down');
  });

  it('stays neutral in the middle and when unknown', () => {
    expect(rangePosColor(50, 'long')).toBe('text-fg');
    expect(rangePosColor(null, 'long')).toBe('text-fg');
  });
});
