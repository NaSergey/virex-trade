import { describe, expect, it } from 'vitest';
import { judge, makeChallenge } from './challenge';
import { rand } from './rng';
import type { RunCard } from './types';

const c = (en: string, ru: string, group = 'food', example?: [string, string]): RunCard => ({
  id: `v:${en}`,
  en,
  ru,
  group,
  tag: 'due',
  overdueDays: 0,
  ...(example ? { example } : {}),
});
const POOL = [
  c('apple', 'яблоко'),
  c('bread', 'хлеб'),
  c('milk', 'молоко'),
  c('cheese', 'сыр'),
  c('house', 'дом', 'home'),
  c('mouse', 'мышь', 'nature'),
];

describe('задания ударов', () => {
  it('узнать: слово и четыре разных перевода, верный среди них', () => {
    const ch = makeChallenge(POOL[0], 'recognize', POOL, rand(1), { firstLetter: false });
    expect(ch.prompt).toBe('apple');
    expect(ch.options).toHaveLength(4);
    expect(new Set(ch.options).size).toBe(4);
    expect(ch.options![ch.answer as number]).toBe('яблоко');
  });

  it('услышать: текста нет, звучит слово', () => {
    const ch = makeChallenge(POOL[1], 'listen', POOL, rand(2), { firstLetter: false });
    expect(ch.prompt).toBe('');
    expect(ch.audio).toBe('bread');
    expect(ch.options![ch.answer as number]).toBe('хлеб');
  });

  it('вспомнить: перевод, длина по словам, с карандашом — первая буква', () => {
    const ch = makeChallenge(c('ice cream', 'мороженое'), 'recall', POOL, rand(3), { firstLetter: true });
    expect(ch.prompt).toBe('мороженое');
    expect(ch.length).toEqual([3, 5]);
    expect(ch.first).toBe('i');
    expect(judge(ch, 'Ice cream')).toBe('right');
  });

  it('собрать: фраза примера вперемешку; без примера — вспомнить', () => {
    const word = c('apple', 'яблоко', 'food', ['I eat an apple every day.', 'Я ем яблоко каждый день.']);
    const ch = makeChallenge(word, 'order', POOL, rand(4), { firstLetter: false });
    expect(ch.mode).toBe('order');
    expect(ch.prompt).toBe('Я ем яблоко каждый день.');
    const right = ['I', 'eat', 'an', 'apple', 'every', 'day.'].map((w) => ch.bank!.indexOf(w));
    expect(judge(ch, right)).toBe('right');
    expect(judge(ch, [...right].reverse())).toBe('wrong');
    expect(makeChallenge(POOL[0], 'order', POOL, rand(4), { firstLetter: false }).mode).toBe('recall');
  });

  it('ввод: опечатка — почти, другое слово колоды — ошибка, а не опечатка', () => {
    const ch = makeChallenge(POOL[4], 'recall', POOL, rand(5), { firstLetter: false });
    expect(judge(ch, 'hosue')).toBe('typo');
    expect(judge(ch, 'mouse', new Set(['mouse']))).toBe('wrong');
    expect(judge(ch, 'flat')).toBe('wrong');
  });

  it('сказать: слово среди распознанного — верно; фраза — от 80 % слов', () => {
    const word = makeChallenge(POOL[4], 'speak', POOL, rand(6), { firstLetter: false });
    expect(judge(word, 'a house')).toBe('right');
    expect(judge(word, 'mouse')).toBe('wrong');
    const phrase = makeChallenge(c('Nice to meet you.', 'Приятно познакомиться.'), 'speak', POOL, rand(6), {
      firstLetter: false,
    });
    expect(judge(phrase, 'nice to meet you')).toBe('right');
    expect(judge(phrase, 'nice to you')).toBe('wrong');
  });
});
