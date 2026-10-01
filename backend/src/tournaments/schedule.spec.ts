import { startTimeFrom } from './schedule';

const NOW = Date.UTC(2026, 8, 26, 12, 0, 30);
const iso = (ms: number) => new Date(ms).toISOString();

describe('startTimeFrom', () => {
  it('отбрасывает секунды: старт — граница минутки', () => {
    expect(startTimeFrom(iso(NOW + 3_600_000), NOW)).toEqual(new Date(Date.UTC(2026, 8, 26, 13, 0, 0)));
  });

  it('раньше чем через минуту — не годится', () => {
    expect(startTimeFrom(iso(NOW + 30_000), NOW)).toBeNull();
  });

  it('прошлое — не годится', () => {
    expect(startTimeFrom(iso(NOW - 3_600_000), NOW)).toBeNull();
  });

  it('дальше тридцати дней — не годится', () => {
    expect(startTimeFrom(iso(NOW + 31 * 86_400_000), NOW)).toBeNull();
  });

  it('не дата — не годится', () => {
    expect(startTimeFrom('завтра', NOW)).toBeNull();
  });
});
