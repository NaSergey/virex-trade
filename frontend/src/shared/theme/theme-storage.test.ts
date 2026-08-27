import { describe, expect, it } from 'vitest';
import { getClientTheme, parseThemeCookie } from './theme-storage';

describe('parseThemeCookie', () => {
  it('возвращает тёмную по умолчанию, если куки нет', () => {
    expect(parseThemeCookie(undefined)).toBe('dark');
    expect(parseThemeCookie(null)).toBe('dark');
  });

  it('возвращает сохранённую тему', () => {
    expect(parseThemeCookie('light')).toBe('light');
  });

  it('игнорирует неизвестное значение и возвращает дефолт', () => {
    expect(parseThemeCookie('sepia')).toBe('dark');
  });
});

describe('getClientTheme', () => {
  it('читает тему из строки document.cookie', () => {
    expect(getClientTheme('virex-theme=light')).toBe('light');
  });

  it('находит куку среди прочих — в том числе рядом с локалью', () => {
    expect(getClientTheme('virex-locale=en; virex-theme=light; foo=bar')).toBe('light');
  });

  it('дефолт dark, если куки нет вовсе', () => {
    expect(getClientTheme('')).toBe('dark');
    expect(getClientTheme('virex-locale=en')).toBe('dark');
  });
});
