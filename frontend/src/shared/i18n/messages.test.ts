import { describe, expect, it } from 'vitest';
import ru from './messages/ru.json';
import en from './messages/en.json';

function deepKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return deepKeys(value as Record<string, unknown>, path);
    }
    return [path];
  });
}

describe('каталоги сообщений', () => {
  it('ru и en содержат один и тот же набор ключей — иначе useTranslations молча упадёт на дефолт next-intl для отсутствующего ключа', () => {
    expect(deepKeys(en).sort()).toEqual(deepKeys(ru).sort());
  });
});
