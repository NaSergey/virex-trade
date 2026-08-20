import { describe, expect, it } from 'vitest';
import { getStoredLocale, setStoredLocale } from './locale-storage';

function fakeStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    getItem: (key: string) => data[key] ?? null,
    setItem: (key: string, value: string) => {
      data[key] = value;
    },
  };
}

describe('getStoredLocale', () => {
  it('возвращает ru по умолчанию, если ничего не сохранено', () => {
    expect(getStoredLocale(fakeStorage())).toBe('ru');
  });

  it('возвращает сохранённый язык', () => {
    expect(getStoredLocale(fakeStorage({ 'virex-locale': 'en' }))).toBe('en');
  });

  it('игнорирует неизвестное значение в хранилище и возвращает дефолт', () => {
    expect(getStoredLocale(fakeStorage({ 'virex-locale': 'fr' }))).toBe('ru');
  });

  it('без storage (SSR) — дефолт ru, без исключения', () => {
    expect(getStoredLocale(undefined)).toBe('ru');
  });
});

describe('setStoredLocale', () => {
  it('сохраняет язык под тем же ключом, что читает getStoredLocale', () => {
    const storage = fakeStorage();
    setStoredLocale('en', storage);
    expect(getStoredLocale(storage)).toBe('en');
  });
});
