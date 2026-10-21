import { describe, expect, it } from 'vitest';
import type { Word } from '../content/types';
import { buildDeck, pickCard, queue, startOfDay, type DeckCard } from './deck';
import { DAY, MIN, type CardState } from './srs';

const NOW = new Date(2026, 9, 21, 15, 0).getTime();
const word = (en: string, unit: string): Word => ({ en, ru: 'перевод', unit });
const card = (id: string): DeckCard => ({ id, en: id, ru: 'перевод', unit: 'u01' });
const state = (patch: Partial<CardState>): CardState => ({
  due: NOW,
  interval: 1,
  ease: 2.5,
  reps: 1,
  lapses: 0,
  firstAt: NOW - 5 * DAY,
  ...patch,
});

describe('buildDeck', () => {
  it('свои слова первыми, книга — только открытые разделы', () => {
    const deck = buildDeck(
      [word('hello', 'u01'), word('dog', 'u02')],
      new Set(['u01']),
      [{ id: 'w1', en: 'apple', ru: 'яблоко' }],
    );
    expect(deck.map((c) => c.id)).toEqual(['my:w1', 'u01:hello']);
  });
});

describe('queue', () => {
  const deck = ['a', 'b', 'c', 'd', 'e'].map(card);

  it('срочные по сроку, новые — в пределах лимита за сегодня', () => {
    const states = new Map([
      ['a', state({ due: NOW - 1 })],
      ['b', state({ due: NOW - 100 })],
      ['x', state({ firstAt: startOfDay(NOW) + MIN })], // новое сегодня, уже не в колоде
    ]);
    const q = queue(deck, states, NOW, 2);
    expect(q.due.map((c) => c.id)).toEqual(['b', 'a']);
    expect(q.newToday).toBe(1);
    expect(q.fresh.map((c) => c.id)).toEqual(['c']);
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
