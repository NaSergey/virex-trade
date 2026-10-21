import { statusOf, type DeckCard, type Status } from './deck';
import type { CardState } from './srs';

export type StatusFilter = Status | 'all';

/** Поиск по английскому и русскому, без регистра; пустой запрос — всё. */
export function matchQuery(cards: readonly DeckCard[], query: string): DeckCard[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...cards];
  return cards.filter((c) => c.en.toLowerCase().includes(q) || c.ru.toLowerCase().includes(q));
}

/** Сколько слов в каждом статусе. */
export function countStatuses(
  cards: readonly DeckCard[],
  states: ReadonlyMap<string, CardState>,
): Record<StatusFilter, number> {
  const out: Record<StatusFilter, number> = { all: cards.length, new: 0, learning: 0, known: 0 };
  for (const c of cards) out[statusOf(states.get(c.id))] += 1;
  return out;
}

export function byStatus(
  cards: readonly DeckCard[],
  states: ReadonlyMap<string, CardState>,
  status: StatusFilter,
): DeckCard[] {
  return status === 'all' ? [...cards] : cards.filter((c) => statusOf(states.get(c.id)) === status);
}
