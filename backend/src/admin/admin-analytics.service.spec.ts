import { resolvePeriod } from './admin-analytics.service';
import { OWNER_EMAIL, isOwnerEmail } from './owner';

describe('resolvePeriod', () => {
  it('по умолчанию — последние 30 суток, считая с начала первых суток', () => {
    // Иначе «за 30 дней» это 29 суток с хвостом, и первый столбик графика
    // всегда занижен на случайную величину.
    const p = resolvePeriod({ to: '2026-09-02T15:20:00Z' });
    expect(p.days).toBe(30);
    expect(p.from.toISOString()).toBe('2026-08-04T00:00:00.000Z');
    expect(p.to.toISOString()).toBe('2026-09-02T15:20:00.000Z');
  });

  it('учитывает часовой пояс при выравнивании начала окна', () => {
    const p = resolvePeriod({
      days: 1,
      to: '2026-09-02T15:20:00Z',
      tzOffsetMinutes: 180,
    });
    expect(p.from.toISOString()).toBe('2026-09-01T21:00:00.000Z');
  });

  it('явные границы сильнее days', () => {
    const p = resolvePeriod({
      days: 30,
      from: '2026-08-30T00:00:00Z',
      to: '2026-09-02T00:00:00Z',
    });
    expect(p.from.toISOString()).toBe('2026-08-30T00:00:00.000Z');
    expect(p.days).toBe(3);
  });
});

describe('isOwnerEmail', () => {
  it('терпит регистр и краевые пробелы', () => {
    expect(isOwnerEmail(` ${OWNER_EMAIL.toUpperCase()} `)).toBe(true);
  });

  it('никого другого не пускает', () => {
    // Раздел показывает почты и поведение всех пользователей: право сюда
    // не выводится ни из чего, кроме точного совпадения с одной почтой.
    expect(isOwnerEmail('someone@example.com')).toBe(false);
    expect(isOwnerEmail(null)).toBe(false);
    expect(isOwnerEmail('')).toBe(false);
  });
});
