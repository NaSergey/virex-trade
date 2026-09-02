import { describe, expect, it } from 'vitest';
import { calendarDaysAgo } from './lastSeen';

const now = new Date(2026, 8, 2, 9, 0); // 2 сентября 2026, 09:00 местного

describe('calendarDaysAgo', () => {
  it('никогда не заходил — null, а не ноль', () => {
    // Ноль означал бы «был сегодня», и такой человек уехал бы в начало списка.
    expect(calendarDaysAgo(null)).toBe(null);
    expect(calendarDaysAgo(undefined)).toBe(null);
  });

  it('вчерашний поздний вечер — это вчера, а не «сегодня»', () => {
    // Разница меньше суток по часам, но по календарю это другой день.
    expect(calendarDaysAgo(new Date(2026, 8, 1, 23, 50).toISOString(), now)).toBe(1);
  });

  it('сегодняшняя ночь — сегодня', () => {
    expect(calendarDaysAgo(new Date(2026, 8, 2, 0, 10).toISOString(), now)).toBe(0);
  });

  it('считает через границу месяца', () => {
    expect(calendarDaysAgo(new Date(2026, 7, 30, 12, 0).toISOString(), now)).toBe(3);
  });

  it('дата из будущего не даёт отрицательных дней', () => {
    expect(calendarDaysAgo(new Date(2026, 8, 3, 12, 0).toISOString(), now)).toBe(0);
  });

  it('мусор вместо даты не роняет страницу', () => {
    expect(calendarDaysAgo('не дата')).toBe(null);
  });
});
