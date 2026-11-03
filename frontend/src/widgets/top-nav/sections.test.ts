import { describe, expect, it } from 'vitest';
import { isActive, navOf, tabsOf } from './sections';

const ids = (list: { id: string }[]) => list.map((item) => item.id);

describe('разделы частей', () => {
  it('журнал: четыре раздела, ссылки на площадку нет', () => {
    expect(ids(navOf('journal'))).toEqual(['terminal', 'journal', 'market', 'backtest']);
    expect(ids(tabsOf('journal'))).toEqual(ids(navOf('journal')));
  });

  it('площадка: игры, турниры и профиль; ни отдельных игр, ни журнала', () => {
    expect(ids(navOf('play'))).toEqual(['games', 'tournaments', 'profile']);
    expect(ids(tabsOf('play'))).toEqual(ids(navOf('play')));
  });

  it('«Игры» горят на витрине и в любой игре, кроме турниров; профиль — на любом профиле', () => {
    const of = (id: string) => navOf('play').find((item) => item.id === id)!;
    expect(isActive('/games', of('games'))).toBe(true);
    expect(isActive('/games/poker/1', of('games'))).toBe(true);
    expect(isActive('/games/jetpack', of('games'))).toBe(true);
    expect(isActive('/games/trading', of('games'))).toBe(false);
    expect(isActive('/games/trading/abc', of('games'))).toBe(false);
    expect(isActive('/games/trading/abc', of('tournaments'))).toBe(true);
    expect(isActive('/games/tradingx', of('tournaments'))).toBe(false);
    expect(isActive('/profile/abc', of('profile'))).toBe(true);
    expect(isActive('/profiles', of('profile'))).toBe(false);
  });

  it('«Дневник» горит на любой своей странице', () => {
    const of = (id: string) => navOf('journal').find((item) => item.id === id)!;
    expect(isActive('/tags', of('journal'))).toBe(true);
    expect(isActive('/overview', of('journal'))).toBe(true);
    expect(isActive('/backtest/abc', of('backtest'))).toBe(true);
  });
});
