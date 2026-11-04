import { describe, expect, it } from 'vitest';
import { GAME_VOCAB, glossOf, levelOf, tokens } from './gloss';
import { allTexts } from './texts.fixture';

describe('перевод по нажатию', () => {
  it('у каждого слова в текстах игры есть перевод', () => {
    const missing = new Set<string>();
    for (const t of allTexts()) for (const k of tokens(t)) if (k.word && !glossOf(k.text)) missing.add(k.text.toLowerCase());
    expect([...missing].sort()).toEqual([]);
  });

  it('тексты в уровне начала курса: книга, 1500 частых слов или словарь игры', () => {
    const over = new Set<string>();
    for (const t of allTexts())
      for (const k of tokens(t)) {
        if (!k.word) continue;
        const l = levelOf(k.text);
        const base = glossOf(k.text)?.en.toLowerCase() ?? '';
        if (l?.from === 'vocab' && l.rank > 1500 && !GAME_VOCAB.has(base) && !GAME_VOCAB.has(k.text.toLowerCase()))
          over.add(`${k.text.toLowerCase()} (${l.rank})`);
      }
    expect([...over].sort()).toEqual([]);
  });

  it('формы сводятся к словарной', () => {
    expect(glossOf('wolves')?.en).toBe('wolf');
    expect(glossOf('Killed')?.en).toBe('kill');
    expect(glossOf('Ash’s')?.en).toBe('Ash');
    expect(glossOf('xqzv')).toBeNull();
  });

  it('текст режется на слова и промежутки без потерь', () => {
    const t = '“I will bite the healer!”';
    expect(
      tokens(t)
        .map((k) => k.text)
        .join(''),
    ).toBe(t);
    expect(
      tokens(t)
        .filter((k) => k.word)
        .map((k) => k.text),
    ).toEqual(['I', 'will', 'bite', 'the', 'healer']);
  });
});
