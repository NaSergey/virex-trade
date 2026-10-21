import { describe, expect, it } from 'vitest';
import type { DeckCard } from './deck';
import type { CardState } from './srs';
import { byStatus, countStatuses, matchQuery } from './words';

const card = (id: string, en: string, ru: string): DeckCard => ({ id, en, ru, source: 'vocab', group: null });
const state = (known: boolean): CardState => ({ due: 0, interval: 0, ease: 2.5, reps: 1, lapses: 0, firstAt: 0, known });

const cards = [card('1', 'Apple', 'яблоко'), card('2', 'pear', 'груша'), card('3', 'plum', 'слива')];
const states = new Map([
  ['1', state(true)],
  ['2', state(false)],
]);

describe('словарь', () => {
  it('поиск по обеим сторонам без регистра', () => {
    expect(matchQuery(cards, ' APPLE ').map((c) => c.id)).toEqual(['1']);
    expect(matchQuery(cards, 'РУШ').map((c) => c.id)).toEqual(['2']);
    expect(matchQuery(cards, '')).toHaveLength(3);
  });

  it('статусы: счёт и фильтр', () => {
    expect(countStatuses(cards, states)).toEqual({ all: 3, new: 1, learning: 1, known: 1 });
    expect(byStatus(cards, states, 'learning').map((c) => c.id)).toEqual(['2']);
    expect(byStatus(cards, states, 'all')).toHaveLength(3);
  });
});
