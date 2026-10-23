import { describe, expect, it } from 'vitest';
import { addDays, dayLabel, daysLabel, duration, endLabel, parseHHMM, weekdayOf } from './time';

describe('plan time', () => {
  it('поле времени', () => {
    expect(parseHHMM('09:30')).toBe(570);
    expect(parseHHMM('9:05')).toBe(545);
    expect(parseHHMM('00:00', true)).toBe(1440);
    expect(parseHHMM('24:00')).toBe(1440);
    expect(parseHHMM('25:00')).toBeNull();
    expect(parseHHMM('')).toBeNull();
    expect(endLabel(1440)).toBe('24:00');
  });

  it('дни', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(weekdayOf('2026-10-19')).toBe(0);
    expect(dayLabel('2026-10-23')).toBe('пт, 23 окт');
    expect(daysLabel(0b0011111)).toBe('будни');
    expect(daysLabel(0b0010101)).toBe('пн, ср, пт');
    expect(duration(150)).toBe('2 ч 30 мин');
  });
});
