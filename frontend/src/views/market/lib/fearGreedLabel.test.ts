import { describe, expect, it } from 'vitest';
import { fearGreedLabel } from './fearGreedLabel';

// Фейковый t(): возвращает сам ключ — тест проверяет, какой ключ выбрала
// функция, а не текст перевода из каталога (его сверяет messages.test.ts).
const t = (key: string) => key;

describe('fearGreedLabel', () => {
  it('maps each known alternative.me classification to its i18n key', () => {
    expect(fearGreedLabel('Extreme Fear', t)).toBe('fngExtremeFear');
    expect(fearGreedLabel('Fear', t)).toBe('fngFear');
    expect(fearGreedLabel('Neutral', t)).toBe('fngNeutral');
    expect(fearGreedLabel('Greed', t)).toBe('fngGreed');
    expect(fearGreedLabel('Extreme Greed', t)).toBe('fngExtremeGreed');
  });

  it('falls back to the raw classification when unrecognized', () => {
    expect(fearGreedLabel('Whatever', t)).toBe('Whatever');
  });
});
