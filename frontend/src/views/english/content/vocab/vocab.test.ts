import { describe, expect, it } from 'vitest';
import { THEMES } from '../themes';
import { WORDS } from '../index';
import { ALL_VOCAB, VOCAB } from './index';

const CYRILLIC = /[а-яё]/i;
const THEME_IDS = new Set<string>(THEMES.map((t) => t.id));

describe('общий словарь', () => {
  it('слово одно на весь словарь, английское — латиницей, перевод — по-русски', () => {
    const seen = new Set<string>();
    for (const w of ALL_VOCAB) {
      const key = w.en.toLowerCase();
      expect(seen.has(key), `повтор ${w.en}`).toBe(false);
      seen.add(key);
      expect(w.en.trim(), w.en).toBe(w.en);
      expect(CYRILLIC.test(w.en), w.en).toBe(false);
      expect(CYRILLIC.test(w.ru), w.en).toBe(true);
      expect(THEME_IDS.has(w.theme), `${w.en}: тема ${w.theme}`).toBe(true);
      expect(w.rank, w.en).toBeGreaterThan(0);
      if (w.example) {
        expect(CYRILLIC.test(w.example[0]), w.en).toBe(false);
        expect(CYRILLIC.test(w.example[1]), w.en).toBe(true);
      }
    }
  });

  it('без слов учебника, и вместе с учебником — больше 3000 карточек', () => {
    expect(VOCAB.length).toBeLessThanOrEqual(ALL_VOCAB.length);
    expect(VOCAB.length + WORDS.length).toBeGreaterThan(3000);
  });
});
