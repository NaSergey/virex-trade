import { describe, expect, it } from 'vitest';
import type { DeckCard } from './deck';
import { buildQuiz } from './quiz';
import { mulberry32 } from './random';

const card = (en: string, ru: string, group = 'food'): DeckCard => ({ id: `v:${en}`, en, ru, source: 'vocab', group });
const FOOD = [card('apple', 'яблоко'), card('bread', 'хлеб'), card('milk', 'молоко'), card('egg', 'яйцо'), card('tea', 'чай')];
const POOL = [card('run', 'бежать', 'move'), card('red', 'красный', 'describe'), ...FOOD];

describe('buildQuiz', () => {
  it('n вопросов без повторов, верный вариант на своём месте, варианты различны', () => {
    const quiz = buildQuiz(FOOD, POOL, 3, 'en', mulberry32(1));
    expect(quiz).toHaveLength(3);
    expect(new Set(quiz.map((q) => q.card.id)).size).toBe(3);
    for (const q of quiz) {
      expect(q.prompt).toBe(q.card.en);
      expect(q.options[q.answer]).toBe(q.card.ru);
      expect(q.options).toHaveLength(4);
      expect(new Set(q.options).size).toBe(4);
    }
  });

  it('вопросов не больше, чем слов; RU → EN спрашивает перевод', () => {
    const quiz = buildQuiz(FOOD, POOL, 50, 'ru', mulberry32(2));
    expect(quiz).toHaveLength(5);
    expect(quiz[0].options[quiz[0].answer]).toBe(quiz[0].card.en);
  });

  it('маленькая тема добирает варианты из общего пула', () => {
    const quiz = buildQuiz(FOOD.slice(0, 2), POOL, 2, 'en', mulberry32(3));
    for (const q of quiz) expect(q.options).toHaveLength(4);
  });

  it('одинаковые переводы в варианты не попадают дважды', () => {
    const twins = [card('big', 'большой'), card('large', 'большой'), card('small', 'маленький')];
    const quiz = buildQuiz(twins, POOL, 3, 'en', mulberry32(4));
    for (const q of quiz) expect(q.options.filter((o) => o === 'большой').length).toBeLessThanOrEqual(1);
  });
});
