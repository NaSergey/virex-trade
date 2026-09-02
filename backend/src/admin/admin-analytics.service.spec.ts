import { resolvePeriod } from './admin-analytics.service';
import { parseAdminEmails } from './guards/admin.guard';

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

describe('parseAdminEmails', () => {
  it('терпит пробелы и регистр', () => {
    const admins = parseAdminEmails(' Owner@Example.com , second@example.com ');
    expect(admins.has('owner@example.com')).toBe(true);
    expect(admins.has('second@example.com')).toBe(true);
  });

  it('пустое значение не даёт доступа никому', () => {
    // Обратное поведение — «списка нет, значит пускаем всех» — ошибается один
    // раз и навсегда.
    expect(parseAdminEmails(undefined).size).toBe(0);
    expect(parseAdminEmails(' , ').size).toBe(0);
  });
});
