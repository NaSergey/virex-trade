import { describe, expect, it } from 'vitest';
import { HOME_OF, isJournalRoute, isPlayRoute, journalHost, partOfHost, playHost } from './app-part';

describe('часть продукта', () => {
  it('определяется по Host', () => {
    expect(partOfHost('trade-play.com')).toBe('play');
    expect(partOfHost('journal.trade-play.com')).toBe('journal');
    expect(partOfHost('JOURNAL.localhost:8090')).toBe('journal');
    expect(partOfHost('admin.trade-play.com')).toBe('admin');
    expect(partOfHost('journalist.com')).toBe('play');
    expect(partOfHost(null)).toBe('play');
  });

  it('адреса соседней части: с портом и без www', () => {
    expect(journalHost('trade-play.com')).toBe('journal.trade-play.com');
    expect(journalHost('www.trade-play.com')).toBe('journal.trade-play.com');
    expect(journalHost('localhost:8090')).toBe('journal.localhost:8090');
    expect(playHost('journal.trade-play.com')).toBe('trade-play.com');
    expect(playHost('journal.localhost:8090')).toBe('localhost:8090');
  });

  it('маршруты: граница по слэшу', () => {
    expect(isJournalRoute('/backtest/abc')).toBe(true);
    expect(isJournalRoute('/terminal')).toBe(true);
    expect(isJournalRoute('/tagsx')).toBe(false);
    expect(isJournalRoute('/games')).toBe(false);
    expect(isPlayRoute('/games/poker/1')).toBe(true);
    expect(isPlayRoute('/profile/abc')).toBe(true);
    expect(isPlayRoute('/gamesx')).toBe(false);
    expect(isPlayRoute('/')).toBe(false);
  });

  it('главные частей', () => {
    expect(HOME_OF).toEqual({ play: '/games', journal: '/terminal', admin: '/' });
  });
});
