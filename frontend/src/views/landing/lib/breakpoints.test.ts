import { describe, expect, it } from 'vitest';
import { BREAKPOINTS, MOBILE_MAX_WIDTH, TABLET_MAX_WIDTH } from './breakpoints';

describe('брейкпоинты лендинга', () => {
  it('совпадают со значениями в globals.css (@media max-width: 720px / 1100px)', () => {
    expect(MOBILE_MAX_WIDTH).toBe(720);
    expect(TABLET_MAX_WIDTH).toBe(1100);
  });

  it('медиа-строки согласованы с границами', () => {
    expect(BREAKPOINTS.mobile).toBe('(max-width: 720px)');
    expect(BREAKPOINTS.tablet).toBe('(min-width: 721px) and (max-width: 1100px)');
    expect(BREAKPOINTS.desktop).toBe('(min-width: 1101px)');
  });
});
