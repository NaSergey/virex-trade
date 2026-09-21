import { seasonBounds, seasonKey } from './season';

describe('seasonKey', () => {
  it('квартал считается по UTC, с единицы', () => {
    expect(seasonKey(new Date('2026-01-01T00:00:00Z'))).toBe('2026-Q1');
    expect(seasonKey(new Date('2026-03-31T23:59:59Z'))).toBe('2026-Q1');
    expect(seasonKey(new Date('2026-04-01T00:00:00Z'))).toBe('2026-Q2');
    expect(seasonKey(new Date('2026-09-21T12:00:00Z'))).toBe('2026-Q3');
    expect(seasonKey(new Date('2026-12-31T23:59:59Z'))).toBe('2026-Q4');
  });

  it('стык года — это смена сезона, а не его продолжение', () => {
    expect(seasonKey(new Date('2027-01-01T00:00:00Z'))).toBe('2027-Q1');
  });
});

describe('seasonBounds', () => {
  it('начало — первый миг квартала, конец — последний', () => {
    const q4 = seasonBounds('2026-Q4');
    expect(q4.startsAt.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(q4.endsAt.toISOString()).toBe('2026-12-31T23:59:59.999Z');
  });

  it('границы сезона принадлежат ему самому', () => {
    const { startsAt, endsAt } = seasonBounds('2026-Q1');
    expect(seasonKey(startsAt)).toBe('2026-Q1');
    expect(seasonKey(endsAt)).toBe('2026-Q1');
  });
});
