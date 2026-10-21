import { describe, expect, it } from 'vitest';
import type { Exercise, Lesson } from '../content/types';
import { phrasesFor } from './phrases';

const LESSONS = new Map<string, Lesson>([
  [
    'u01',
    {
      unit: 'u01',
      blocks: [
        { type: 'rule', rows: [['I am', 'I am Tom.', 'Я Том.']] },
        { type: 'examples', items: [['Hello!', 'Привет!'], ["I'm Tom.", 'Я Том.']] },
        { type: 'book', items: [] },
      ],
    },
  ],
  ['u02', { unit: 'u02', blocks: [{ type: 'examples', items: [['She is my friend.', 'Она моя подруга.']] }] }],
]);
const EXERCISES: Exercise[] = [
  { id: 'u01-01', unit: 'u01', type: 'translate', ru: 'Это моя ручка.', answers: ['This is my pen.'] },
  { id: 'u01-02', unit: 'u01', type: 'order', words: ['you', 'are', 'Sam'], answers: ['You are Sam.'] },
  { id: 'u02-01', unit: 'u02', type: 'translate', ru: 'Он мой друг.', answers: ['He is my friend.'] },
];

describe('phrasesFor', () => {
  it('только открытые разделы, без одиночных слов и повторов', () => {
    const phrases = phrasesFor(new Set(['u01']), LESSONS, EXERCISES);
    expect(phrases.map((p) => p.en)).toEqual(['I am Tom.', 'This is my pen.', 'You are Sam.']);
    expect(phrases[2].ru).toBe('');
  });
});
