import { describe, expect, it } from 'vitest';
import { calendar, localDay, shiftDay, streak, type DayRow } from './activity';

const row = (day: string, cards = 1): [string, DayRow] => [day, { day, cards, answers: 0, correct: 0, phrases: 0 }];

describe('дни занятий', () => {
  it('местная дата и сдвиг по календарю через границу месяца и года', () => {
    expect(localDay(new Date(2026, 9, 21, 23, 59).getTime())).toBe('2026-10-21');
    expect(shiftDay('2026-03-01', 1)).toBe('2026-02-28');
    expect(shiftDay('2026-01-01', 1)).toBe('2025-12-31');
    expect(shiftDay('2026-10-21', -1)).toBe('2026-10-22');
  });

  it('серия: сегодня ещё не занимался — считается до вчера; пропуск рвёт', () => {
    const days = new Map([row('2026-10-20'), row('2026-10-19'), row('2026-10-17')]);
    expect(streak(days, '2026-10-21')).toBe(2);
    expect(streak(new Map([...days, row('2026-10-21')]), '2026-10-21')).toBe(3);
    expect(streak(new Map([row('2026-10-19')]), '2026-10-21')).toBe(0);
    expect(streak(new Map([row('2026-10-20', 0)]), '2026-10-21')).toBe(0);
  });

  it('календарь: столбцы-недели с понедельника, будущее — null', () => {
    const cols = calendar('2026-10-21', 2); // среда
    expect(cols).toHaveLength(2);
    expect(cols[1][0]).toBe('2026-10-19');
    expect(cols[1][2]).toBe('2026-10-21');
    expect(cols[1][3]).toBeNull();
    expect(cols[0][0]).toBe('2026-10-12');
  });
});
