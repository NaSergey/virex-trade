import { describe, expect, it } from 'vitest';
import { isActive, navOf, tabsOf } from './sections';

const ids = (list: { id: string }[]) => list.map((item) => item.id);

describe('разделы частей', () => {
  it('журнал: четыре раздела и выход на площадку', () => {
    expect(ids(navOf('journal'))).toEqual(['terminal', 'journal', 'market', 'backtest', 'games']);
    expect(navOf('journal').find((item) => item.id === 'games')?.other).toBe(true);
    expect(ids(tabsOf('journal'))).toEqual(ids(navOf('journal')));
  });

  it('площадка: игры и выход в журнал; на телефоне три пункта', () => {
    expect(ids(navOf('play'))).toEqual(['games', 'tournaments', 'poker', 'blackjack', 'jetpack', 'race', 'journalApp']);
    expect(navOf('play').find((item) => item.id === 'journalApp')?.other).toBe(true);
    expect(ids(tabsOf('play'))).toEqual(['games', 'tournaments', 'journalApp']);
  });

  it('«Игры» горят только на витрине, игра — на своих адресах, чужая часть — никогда', () => {
    const of = (id: string) => navOf('play').find((item) => item.id === id)!;
    expect(isActive('/games', of('games'))).toBe(true);
    expect(isActive('/games/poker/1', of('games'))).toBe(false);
    expect(isActive('/games/poker/1', of('poker'))).toBe(true);
    expect(isActive('/games/pokerx', of('poker'))).toBe(false);
    expect(isActive('/games/trading', of('tournaments'))).toBe(true);
    expect(isActive('/terminal', of('journalApp'))).toBe(false);
  });

  it('«Дневник» горит на любой своей странице, «Игры» журнала — никогда', () => {
    const of = (id: string) => navOf('journal').find((item) => item.id === id)!;
    expect(isActive('/tags', of('journal'))).toBe(true);
    expect(isActive('/overview', of('journal'))).toBe(true);
    expect(isActive('/backtest/abc', of('backtest'))).toBe(true);
    expect(isActive('/games', of('games'))).toBe(false);
  });
});
