import { describe, expect, it } from 'vitest';
import { BREAKPOINTS, MOBILE_MAX_WIDTH, TABLET_MAX_WIDTH, isMobileViewport } from './breakpoints';

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

  it('isMobileViewport спрашивает браузер той же строкой, что и BREAKPOINTS.mobile', () => {
    const asked: string[] = [];
    const original = globalThis.window;
    // @ts-expect-error — подменяем window целиком, окружение тестов не браузерное
    globalThis.window = { matchMedia: (q: string) => { asked.push(q); return { matches: q === BREAKPOINTS.mobile }; } };
    try {
      expect(isMobileViewport()).toBe(true);
      expect(asked).toEqual([BREAKPOINTS.mobile]);
    } finally {
      globalThis.window = original;
    }
  });

  it('вне браузера отвечает «не мобильный», а не падает', () => {
    const original = globalThis.window;
    // @ts-expect-error — эмулируем SSR
    delete globalThis.window;
    try {
      expect(isMobileViewport()).toBe(false);
    } finally {
      globalThis.window = original;
    }
  });
});
