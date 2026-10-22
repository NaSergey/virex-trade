import type { DeckCard } from './deck';
import { shuffle, type Rng } from './random';

/** Тест по теме: слово — и четыре перевода на выбор (или наоборот). */
export type QuizDir = 'en' | 'ru';

export interface QuizQuestion {
  card: DeckCard;
  /** Что спрашиваем: слово (EN → RU) или перевод (RU → EN). */
  prompt: string;
  options: string[];
  /** Индекс верного варианта в `options`. */
  answer: number;
}

const OPTIONS = 4;
const answerOf = (c: DeckCard, dir: QuizDir) => (dir === 'en' ? c.ru : c.en);

/**
 * Тест из `n` случайных слов колоды. Неверные варианты — сначала из той же темы
 * (их труднее отличить, чем «яблоко» среди глаголов), не хватит — из `pool`.
 * Вариантов с одинаковым текстом нет: два «дом» среди четырёх делали бы вопрос
 * нерешаемым.
 */
export function buildQuiz(
  deck: readonly DeckCard[],
  pool: readonly DeckCard[],
  n: number,
  dir: QuizDir,
  rng: Rng = Math.random,
): QuizQuestion[] {
  return shuffle(deck, rng)
    .slice(0, n)
    .map((card) => {
      const right = answerOf(card, dir);
      const wrong: string[] = [];
      const seen = new Set([right.toLowerCase()]);
      for (const c of [...shuffle(deck, rng), ...shuffle(pool, rng)]) {
        if (wrong.length === OPTIONS - 1) break;
        const text = answerOf(c, dir);
        if (seen.has(text.toLowerCase())) continue;
        seen.add(text.toLowerCase());
        wrong.push(text);
      }
      const options = shuffle([right, ...wrong], rng);
      return { card, prompt: dir === 'en' ? card.en : card.ru, options, answer: options.indexOf(right) };
    });
}
