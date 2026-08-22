import { describe, expect, it } from 'vitest';
import { getClientLocale, parseLocaleCookie } from './locale-storage';

describe('parseLocaleCookie', () => {
  it('возвращает ru по умолчанию, если куки нет', () => {
    expect(parseLocaleCookie(undefined)).toBe('ru');
    expect(parseLocaleCookie(null)).toBe('ru');
  });

  it('возвращает сохранённый язык', () => {
    expect(parseLocaleCookie('en')).toBe('en');
  });

  it('игнорирует неизвестное значение и возвращает дефолт', () => {
    expect(parseLocaleCookie('fr')).toBe('ru');
  });
});

describe('getClientLocale', () => {
  it('читает локаль из строки document.cookie', () => {
    expect(getClientLocale('virex-locale=en')).toBe('en');
  });

  it('находит куку среди прочих', () => {
    expect(getClientLocale('foo=bar; virex-locale=en; baz=qux')).toBe('en');
  });

  it('дефолт ru, если куки нет вовсе', () => {
    expect(getClientLocale('')).toBe('ru');
    expect(getClientLocale('foo=bar')).toBe('ru');
  });
});
