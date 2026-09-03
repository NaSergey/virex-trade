import { isQuietNow } from './quiet-hours';

// МСК = UTC+3, тихо с 23:00 до 08:00 МСК = с 20:00 до 05:00 UTC.
describe('isQuietNow', () => {
  it('день по МСК — не тихо', () => {
    expect(isQuietNow(new Date('2026-09-03T09:00:00Z'))).toBe(false); // 12:00 МСК
  });

  it('поздний вечер по МСК — тихо', () => {
    expect(isQuietNow(new Date('2026-09-03T20:30:00Z'))).toBe(true); // 23:30 МСК
  });

  it('ночь через полночь UTC — тихо', () => {
    expect(isQuietNow(new Date('2026-09-04T01:00:00Z'))).toBe(true); // 04:00 МСК
  });

  it('ровно 08:00 МСК — уже не тихо', () => {
    expect(isQuietNow(new Date('2026-09-04T05:00:00Z'))).toBe(false);
  });

  it('ровно 23:00 МСК — уже тихо', () => {
    expect(isQuietNow(new Date('2026-09-03T20:00:00Z'))).toBe(true);
  });
});
