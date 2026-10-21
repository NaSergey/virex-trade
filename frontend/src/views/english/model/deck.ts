import type { Word } from '../content/types';
import type { VocabWord } from '../content/themes';
import { MIN, type CardState } from './srs';

/** Откуда слово: свои, учебник, общий словарь. */
export type Source = 'my' | 'book' | 'vocab';

/** Карточка: слово с переводом и откуда оно. */
export interface DeckCard {
  id: string;
  en: string;
  ru: string;
  example?: [string, string];
  source: Source;
  /** Раздел учебника или тема общего словаря; у своего слова — null. */
  group: string | null;
}

export interface CustomWord {
  id: string;
  en: string;
  ru: string;
}

/** Своя тема: подборка слов под разговор. */
export interface UserTheme {
  id: string;
  title: string;
  cards: string[];
}

export const cardIdOf = (w: Word) => `${w.unit}:${w.en}`;
export const vocabCardId = (w: VocabWord) => `v:${w.en}`;
/** Тот же id строит сервер (`backend/src/english`, `myCardId`) — удаляя слово, он снимает карточку. */
export const myCardId = (wordId: string) => `my:${wordId}`;

/**
 * Все карточки в порядке, в котором новые идут в работу: свои слова первыми —
 * их добавляют, чтобы учить сейчас, — затем учебник по порядку, затем общий
 * словарь по частоте.
 */
export function catalog(
  words: readonly Word[],
  vocab: readonly VocabWord[],
  custom: readonly CustomWord[],
): DeckCard[] {
  return [
    ...custom.map((w): DeckCard => ({ id: myCardId(w.id), en: w.en, ru: w.ru, source: 'my', group: null })),
    ...words.map(
      (w): DeckCard => ({ id: cardIdOf(w), en: w.en, ru: w.ru, example: w.example, source: 'book', group: w.unit }),
    ),
    ...[...vocab]
      .sort((a, b) => a.rank - b.rank)
      .map(
        (w): DeckCard => ({ id: vocabCardId(w), en: w.en, ru: w.ru, example: w.example, source: 'vocab', group: w.theme }),
      ),
  ];
}

/**
 * Колода — что учим сейчас: `all` (свои, открытые разделы учебника, словарь),
 * `my`, `book`, `vocab`, `theme:<тема словаря>`, `mine:<своя тема>`. Учебник —
 * только открытые разделы: слова урока, до которого не дошли, рано учить; в свою
 * тему владелец кладёт что хочет, и она берёт слова как есть.
 */
export function deckOf(
  cards: readonly DeckCard[],
  spec: string,
  open: ReadonlySet<string>,
  themes: readonly UserTheme[],
): DeckCard[] {
  const openBook = (c: DeckCard) => c.source !== 'book' || open.has(c.group ?? '');
  if (spec.startsWith('mine:')) {
    const ids = new Set(themes.find((t) => t.id === spec.slice(5))?.cards ?? []);
    return cards.filter((c) => ids.has(c.id));
  }
  if (spec.startsWith('theme:')) return cards.filter((c) => c.source === 'vocab' && c.group === spec.slice(6));
  if (spec === 'my' || spec === 'book' || spec === 'vocab') return cards.filter((c) => c.source === spec && openBook(c));
  return cards.filter(openBook);
}

export type Status = 'new' | 'learning' | 'known';

export const statusOf = (s: CardState | undefined): Status => (!s ? 'new' : s.known ? 'known' : 'learning');

/** Изучаемое слово, которому до срока меньше этого, можно показать в этой же сессии. */
export const LEARN_AHEAD = 10 * MIN;

export function startOfDay(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Новое за сегодня — с первым ответом сегодня. Слово, которое сразу отметили
 * «знаю», лимит не тратит: его не учили, а отсеяли.
 */
export function newToday(states: ReadonlyMap<string, CardState>, now: number): number {
  const dayStart = startOfDay(now);
  let n = 0;
  for (const s of states.values()) if (s.firstAt >= dayStart && !(s.known && s.reps === 1)) n += 1;
  return n;
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
  const today = newToday(states, now);
  const due: [DeckCard, number][] = [];
  const ahead: [DeckCard, number][] = [];
  const fresh: DeckCard[] = [];
  const room = Math.max(0, newLimit - today);
  let nextDue: number | null = null;
  for (const card of deck) {
    const s = states.get(card.id);
    if (!s) {
      if (fresh.length < room) fresh.push(card);
    } else if (s.known) continue;
    else if (s.due <= now) due.push([card, s.due]);
    else if (s.interval === 0 && s.due <= now + LEARN_AHEAD) ahead.push([card, s.due]);
    else nextDue = nextDue === null ? s.due : Math.min(nextDue, s.due);
  }
  const byDue = (a: [DeckCard, number], b: [DeckCard, number]) => a[1] - b[1];
  return {
    due: due.sort(byDue).map(([c]) => c),
    fresh,
    ahead: ahead.sort(byDue).map(([c]) => c),
    newToday: today,
    nextDue,
  };
}

/** Следующая карточка: срочные, потом новые, потом изучаемые; только что показанную — в последнюю очередь. */
export function pickCard(q: Queue, lastId: string | null): DeckCard | null {
  const order = [...q.due, ...q.fresh, ...q.ahead];
  return order.find((c) => c.id !== lastId) ?? order[0] ?? null;
}
