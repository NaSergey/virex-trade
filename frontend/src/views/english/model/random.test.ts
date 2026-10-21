import { describe, expect, it } from 'vitest';
import { mulberry32, sample, scramble, shuffle } from './random';

describe('random', () => {
  it('перемешивание не теряет и не дублирует', () => {
    const list = [1, 2, 3, 4, 5, 6];
    expect(shuffle(list, mulberry32(1)).sort()).toEqual(list);
    expect(sample(list, 3, mulberry32(2))).toHaveLength(3);
    expect(new Set(sample(list, 6, mulberry32(3))).size).toBe(6);
  });

  it('слова для сборки никогда не стоят в правильном порядке', () => {
    const words = ['this', 'is', 'my', 'pen'];
    for (let seed = 0; seed < 200; seed++) expect(scramble(words, mulberry32(seed))).not.toEqual(words);
    // Генератор, который ничего не переставляет, всё равно даёт другой порядок.
    expect(scramble(words, () => 0.999)).not.toEqual(words);
  });

  it('одно слово остаётся как есть', () => {
    expect(scramble(['hello'])).toEqual(['hello']);
  });
});
