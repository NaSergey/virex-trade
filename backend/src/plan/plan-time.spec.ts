import {
  addDays,
  hasDay,
  hhmm,
  isValidTz,
  localNow,
  minuteOfDay,
  weekdayOf,
} from './plan-time';

describe('plan-time', () => {
  it('местное время по поясу, а не UTC', () => {
    const at = new Date('2026-10-23T21:30:00Z');
    expect(localNow('Europe/Moscow', at)).toEqual({
      day: '2026-10-24',
      min: 30,
    });
    expect(localNow('UTC', at)).toEqual({
      day: '2026-10-23',
      min: 21 * 60 + 30,
    });
  });

  it('незнакомый пояс — отказ', () => {
    expect(isValidTz('Europe/Moscow')).toBe(true);
    expect(isValidTz('Mars/Olympus')).toBe(false);
  });

  it('даты и дни недели', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(weekdayOf('2026-10-19')).toBe(0); // понедельник
    expect(weekdayOf('2026-10-25')).toBe(6); // воскресенье
    expect(hasDay(0b0011111, '2026-10-23')).toBe(true); // пт — будни
    expect(hasDay(0b0011111, '2026-10-24')).toBe(false); // сб
  });

  it('минута суток момента относительно дня блока', () => {
    expect(hhmm(605)).toBe('10:05');
    expect(
      minuteOfDay(
        'Europe/Moscow',
        '2026-10-23',
        new Date('2026-10-23T07:03:00Z'),
      ),
    ).toBe(10 * 60 + 3);
    expect(
      minuteOfDay(
        'Europe/Moscow',
        '2026-10-23',
        new Date('2026-10-23T21:10:00Z'),
      ),
    ).toBe(1440 + 10);
  });
});
