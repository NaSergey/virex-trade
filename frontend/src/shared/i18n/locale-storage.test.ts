import { describe, expect, it } from 'vitest';
import { getClientLocale, localeCookieDomain, parseLocaleCookie } from './locale-storage';

describe('localeCookieDomain', () => {
  it('на площадке и в журнале язык общий: домен один', () => {
    expect(localeCookieDomain('trade-play.com')).toBe('trade-play.com');
    expect(localeCookieDomain('journal.trade-play.com')).toBe('trade-play.com');
  });

  it('у админки, локально и на чужом адресе кука остаётся на своём', () => {
    expect(localeCookieDomain('admin.trade-play.com')).toBeUndefined();
    expect(localeCookieDomain('localhost')).toBeUndefined();
    expect(localeCookieDomain('journal.localhost')).toBeUndefined();
    expect(localeCookieDomain('evil.example')).toBeUndefined();
  });
});

describe('parseLocaleCookie', () => {
  it('возвращает en по умолчанию, если куки нет', () => {
    expect(parseLocaleCookie(undefined)).toBe('en');
    expect(parseLocaleCookie(null)).toBe('en');
  });

  it('возвращает сохранённый язык', () => {
    expect(parseLocaleCookie('en')).toBe('en');
  });

  it('игнорирует неизвестное значение и возвращает дефолт', () => {
    expect(parseLocaleCookie('fr')).toBe('en');
  });
});

describe('getClientLocale', () => {
  it('читает локаль из строки document.cookie', () => {
    expect(getClientLocale('virex-locale=en')).toBe('en');
  });

  it('находит куку среди прочих', () => {
    expect(getClientLocale('foo=bar; virex-locale=en; baz=qux')).toBe('en');
  });

  it('дефолт en, если куки нет вовсе', () => {
    expect(getClientLocale('')).toBe('en');
    expect(getClientLocale('foo=bar')).toBe('en');
  });
});
