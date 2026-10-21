import { describe, expect, it } from 'vitest';
import type { VocabWord } from '../content/themes';
import type { Word } from '../content/types';
import { catalog, deckOf, newToday, pickCard, queue, startOfDay, statusOf, type DeckCard } from './deck';
import { DAY, MIN, type CardState } from './srs';

const NOW = new Date(2026, 9, 21, 15, 0).getTime();
const word = (en: string, unit: string): Word => ({ en, ru: 'перевод', unit });
const vocab = (en: string, rank: number, theme: VocabWord['theme'] = 'food'): VocabWord => ({
  en,
  ru: 'перевод',
  theme,
  pos: 'n',
  rank,
});
const card = (id: string): DeckCard => ({ id, en: id, ru: 'перевод', source: 'vocab', group: 'food' });
const state = (patch: Partial<CardState>): CardState => ({
  due: NOW,
  interval: 1,
  ease: 2.5,
  reps: 1,
  lapses: 0,
  firstAt: NOW - 5 * DAY,
  known: false,
  ...patch,
});

describe('catalog и колоды', () => {
  const cards = catalog(
    [word('hello', 'u01'), word('dog', 'u02')],
    [vocab('water', 20, 'food'), vocab('time', 5, 'time')],
    [{ id: 'w1', en: 'apple', ru: 'яблоко' }],
  );

  it('свои → учебник → словарь по частоте', () => {
    expect(cards.map((c) => c.id)).toEqual(['my:w1', 'u01:hello', 'u02:dog', 'v:time', 'v:water']);
  });

  it('учебник — только открытые разделы; тема словаря; своя тема — как есть', () => {
    const open = new Set(['u01']);
    const themes = [{ id: 't1', title: 'Кафе', cards: ['u02:dog', 'v:water'] }];
    expect(deckOf(cards, 'all', open, themes).map((c) => c.id)).toEqual(['my:w1', 'u01:hello', 'v:time', 'v:water']);
    expect(deckOf(cards, 'book', open, themes).map((c) => c.id)).toEqual(['u01:hello']);
    expect(deckOf(cards, 'theme:food', open, themes).map((c) => c.id)).toEqual(['v:water']);
    expect(deckOf(cards, 'mine:t1', open, themes).map((c) => c.id)).toEqual(['u02:dog', 'v:water']);
    expect(deckOf(cards, 'mine:nope', open, themes)).toEqual([]);
  });

  it('статус слова', () => {
    expect(statusOf(undefined)).toBe('new');
    expect(statusOf(state({}))).toBe('learning');
    expect(statusOf(state({ known: true }))).toBe('known');
  });
});

describe('queue', () => {
  const deck = ['a', 'b', 'c', 'd', 'e'].map(card);

  it('срочные по сроку, новые — в пределах лимита за сегодня, выученные — мимо', () => {
    const states = new Map([
      ['a', state({ due: NOW - 1 })],
      ['b', state({ due: NOW - 100 })],
      ['c', state({ known: true, due: NOW - 1000 })],
      ['x', state({ firstAt: startOfDay(NOW) + MIN })], // новое сегодня, уже не в колоде
    ]);
    const q = queue(deck, states, NOW, 2);
    expect(q.due.map((c) => c.id)).toEqual(['b', 'a']);
    expect(q.newToday).toBe(1);
    expect(q.fresh.map((c) => c.id)).toEqual(['d']);
  });

  it('«знаю» с первого показа лимит новых не тратит', () => {
    const states = new Map([
      ['a', state({ firstAt: NOW - MIN, known: true, reps: 1 })],
      ['b', state({ firstAt: NOW - MIN, known: true, reps: 3 })],
    ]);
    expect(newToday(states, NOW)).toBe(1);
  });

  it('изучаемое со сроком в пределах 10 минут — в «скоро», выученное — в «следующий срок»', () => {
    const states = new Map([
      ['a', state({ interval: 0, due: NOW + 5 * MIN })],
      ['b', state({ interval: 0, due: NOW + 20 * MIN })],
      ['c', state({ interval: 3, due: NOW + 5 * MIN })],
    ]);
    const q = queue(deck, states, NOW, 0);
    expect(q.ahead.map((c) => c.id)).toEqual(['a']);
    expect(q.due).toEqual([]);
    expect(q.nextDue).toBe(NOW + 5 * MIN);
  });
});

describe('pickCard', () => {
  it('срочные → новые → изучаемые, только что показанная — последней', () => {
    const q = { due: [card('a')], fresh: [card('b')], ahead: [card('c')], newToday: 0, nextDue: null };
    expect(pickCard(q, null)?.id).toBe('a');
    expect(pickCard(q, 'a')?.id).toBe('b');
    expect(pickCard({ ...q, due: [], fresh: [] }, 'c')?.id).toBe('c');
    expect(pickCard({ ...q, due: [], fresh: [], ahead: [] }, null)).toBeNull();
  });
});
