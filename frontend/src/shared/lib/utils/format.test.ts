import { describe, expect, it } from 'vitest';
import { formatPnl, formatTradeDate, sumPnl } from './format';

describe('formatPnl', () => {
  it('formats a positive value with a leading plus sign', () => {
    expect(formatPnl(5)).toBe('+5.00');
  });

  it('formats a negative value rounded to 2 decimals', () => {
    expect(formatPnl(-3.456)).toBe('-3.46');
  });

  it('formats zero with a leading plus sign', () => {
    expect(formatPnl(0)).toBe('+0.00');
  });
});

describe('formatTradeDate', () => {
  it('formats an ISO date as ru-RU day/month, hour:minute', () => {
    const iso = '2026-07-09T14:23:00Z';
    const expected = new Date(iso).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    expect(formatTradeDate(iso)).toBe(expected);
  });
});

describe('sumPnl', () => {
  it('defensively sums a numeric field across items, treating undefined as 0', () => {
    const items = [{ pnl: '1.5' }, { pnl: '2' }, { pnl: undefined }];
    expect(sumPnl(items, 'pnl')).toBe(3.5);
  });

  it('returns 0 for an empty array', () => {
    expect(sumPnl([], 'pnl')).toBe(0);
  });
});
