import { describe, expect, it } from 'vitest';
import { dateFormat } from './intl';

const DATES = [Date.UTC(2026, 0, 3, 0, 5), Date.UTC(2026, 9, 13, 14, 37), Date.UTC(2025, 11, 31, 23, 59)];
const LOCALES = ['ru-RU', 'en-US'];

describe('dateFormat', () => {
  it('один и тот же форматтер на одну локаль и набор опций', () => {
    expect(dateFormat('ru-RU', { hour: '2-digit', minute: '2-digit' })).toBe(
      dateFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }),
    );
    expect(dateFormat('ru-RU', { hour: '2-digit' })).not.toBe(dateFormat('en-US', { hour: '2-digit' }));
  });

  it('пишет ровно то же, что toLocale*String с теми же опциями', () => {
    for (const locale of LOCALES) {
      for (const ms of DATES) {
        const d = new Date(ms);
        const time = { hour: '2-digit', minute: '2-digit' } as const;
        expect(dateFormat(locale, time).format(d)).toBe(d.toLocaleTimeString(locale, time));
        const weekday = { weekday: 'short' } as const;
        expect(dateFormat(locale, weekday).format(d)).toBe(d.toLocaleDateString(locale, weekday));
        const day = { day: 'numeric', month: 'short', year: '2-digit' } as const;
        expect(dateFormat(locale, day).format(d)).toBe(d.toLocaleDateString(locale, day));
        const trade = { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' } as const;
        expect(dateFormat(locale, trade).format(d)).toBe(d.toLocaleString(locale, trade));
      }
    }
  });
});
