import type { Word } from '../content/types';
import { MIN, type CardState } from './srs';

/** Карточка колоды: слово книги или своё. */
export interface DeckCard {
  id: string;
  en: string;
  ru: string;
  example?: [string, string];
  /** Раздел книги; у своего слова — null. */
  unit: string | null;
}

export interface CustomWord {
  id: string;
  en: string;
  ru: string;
}

export const cardIdOf = (w: Word) => `${w.unit}:${w.en}`;
/** Тот же id строит сервер (`backend/src/english`, `myCardId`) — удаляя слово, он снимает карточку. */
export const myCardId = (wordId: string) => `my:${wordId}`;

/**
 * Колода: свои слова первыми — их добавляют, чтобы учить сейчас, — затем слова
 * открытых разделов в порядке книги.
 */
export function buildDeck(
  words: readonly Word[],
  open: ReadonlySet<string>,
  custom: readonly CustomWord[],
): DeckCard[] {
  return [
    ...custom.map((w) => ({ id: myCardId(w.id), en: w.en, ru: w.ru, unit: null })),
    ...words
      .filter((w) => open.has(w.unit))
      .map((w) => ({ id: cardIdOf(w), en: w.en, ru: w.ru, example: w.example, unit: w.unit })),
  ];
}

/** Изучаемое слово, которому до срока меньше этого, можно показать в этой же сессии. */
export const LEARN_AHEAD = 10 * MIN;

export function startOfDay(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export interface Queue {
  /** Срок наступил. */
  due: DeckCard[];
  /** Новые на сегодня — в пределах лимита. */
  fresh: DeckCard[];
  /** Изучаемые, чей срок вот-вот: показываются, когда другого нет. */
  ahead: DeckCard[];
  newToday: number;
  /** Ближайший срок среди не попавших в очередь; null — таких нет. */
  nextDue: number | null;
}

export function queue(
  deck: readonly DeckCard[],
  states: ReadonlyMap<string, CardState>,
  now: number,
  newLimit: number,
): Queue {
  const dayStart = startOfDay(now);
  let newToday = 0;
  for (const s of states.values()) if (s.firstAt >= dayStart) newToday += 1;

  const due: [DeckCard, number][] = [];
  const ahead: [DeckCard, number][] = [];
  const unseen: DeckCard[] = [];
  let nextDue: number | null = null;
  for (const card of deck) {
    const s = states.get(card.id);
    if (!s) unseen.push(card);
    else if (s.due <= now) due.push([card, s.due]);
    else if (s.interval === 0 && s.due <= now + LEARN_AHEAD) ahead.push([card, s.due]);
    else nextDue = nextDue === null ? s.due : Math.min(nextDue, s.due);
  }
  const byDue = (a: [DeckCard, number], b: [DeckCard, number]) => a[1] - b[1];
  return {
    due: due.sort(byDue).map(([c]) => c),
    fresh: unseen.slice(0, Math.max(0, newLimit - newToday)),
    ahead: ahead.sort(byDue).map(([c]) => c),
    newToday,
    nextDue,
  };
}

/** Следующая карточка: срочные, потом новые, потом изучаемые; только что показанную — в последнюю очередь. */
export function pickCard(q: Queue, lastId: string | null): DeckCard | null {
  const order = [...q.due, ...q.fresh, ...q.ahead];
  return order.find((c) => c.id !== lastId) ?? order[0] ?? null;
}
