import { queue, type DeckCard } from '../../model/deck';
import { normalize } from '../../model/check';
import { DAY, type CardState, type Grade } from '../../model/srs';
import { int, shuffle, type Rand } from './rng';
import type { RunCard, Verdict } from './types';

/**
 * Колода забега — очередь карточек учебника (спека, «Учёба внутри игры»):
 * сначала срок наступил, потом изучаемые, новые в пределах дневного лимита,
 * добор впрок. Игра — второй путь через повторение, и оценка у неё честная:
 * интервал продлевает только вспоминание.
 */
export const DECK_SIZE = 60;
export const NEW_PER_RUN = 6;
/** Новое слово — не чаще раза в столько ходов. */
export const NEW_EVERY = 4;
/** Возвратов ошибочного слова за забег. */
const MISTAKE_BACKS = 2;

const toRun = (c: DeckCard, tag: RunCard['tag'], overdueDays = 0): RunCard => ({
  id: c.id,
  en: c.en,
  ru: c.ru,
  ...(c.example ? { example: c.example } : {}),
  group: c.group,
  tag,
  overdueDays,
});

export function buildRunDeck(
  input: { deck: readonly DeckCard[]; states: ReadonlyMap<string, CardState>; now: number; newLimit: number },
  r: Rand,
): RunCard[] {
  const { deck, states, now, newLimit } = input;
  const q = queue(deck, states, now, newLimit);
  const fresh = q.fresh.slice(0, NEW_PER_RUN).map((c) => toRun(c, 'new'));
  const out: RunCard[] = [];
  const taken = new Set<string>();
  const push = (c: RunCard) => {
    if (out.length + fresh.length >= DECK_SIZE || taken.has(c.id)) return;
    taken.add(c.id);
    out.push(c);
  };
  for (const c of q.due) {
    const s = states.get(c.id)!;
    push(s.interval === 0 ? toRun(c, 'learning') : toRun(c, 'due', Math.floor((now - s.due) / DAY)));
  }
  for (const c of q.ahead) push(toRun(c, 'learning'));
  const later = deck
    .filter((c) => {
      const s = states.get(c.id);
      return s && !s.known && s.due > now;
    })
    .sort((a, b) => states.get(a.id)!.due - states.get(b.id)!.due);
  for (const c of later) push(toRun(c, 'ahead'));
  for (const c of shuffle(
    r,
    deck.filter((c) => states.get(c.id)?.known),
  )) {
    push(toRun(c, 'filler'));
  }
  return [...out, ...fresh];
}

/**
 * Оценка карточки по ответу в игре — таблица спеки. Состояние — на момент
 * ответа: карточку могли оценить на другом устройстве, и тогда срок у неё
 * уже не наступил. null — карточку не трогать.
 */
export function gradeFor(verdict: Exclude<Verdict, 'none'>, s: CardState | undefined, now: number): Grade | null {
  if (s?.known) return null;
  const learning = !s || s.interval === 0;
  if (!learning && s.due > now) return null;
  switch (verdict) {
    case 'recall':
      return 2;
    case 'typo':
      return 1;
    case 'recognize':
      return learning ? 1 : null;
    case 'wrong':
      return 0;
  }
}

/** Туман на карте — карточки колоды, у которых наступил срок. */
export function fogCount(deck: readonly DeckCard[], states: ReadonlyMap<string, CardState>, now: number): number {
  let n = 0;
  for (const c of deck) {
    const s = states.get(c.id);
    if (s && !s.known && s.due <= now) n += 1;
  }
  return n;
}

/** Отложенное слово: знакомство (новое придёт заданием) или ошибка (вернётся). */
export interface Pending {
  card: RunCard;
  turn: number;
  kind: 'intro' | 'mistake';
}

/** Ход колоды внутри забега; сериализуем, лежит в состоянии забега. */
export interface DeckState {
  deck: RunCard[];
  /** Отвеченные верно — второй круг, когда колода кончится. */
  seen: RunCard[];
  pending: Pending[];
  /** Сколько раз слово уже возвращалось после ошибки. */
  backs: Record<string, number>;
  turn: number;
  sinceNew: number;
}

export const startDeck = (cards: RunCard[]): DeckState => ({
  deck: cards,
  seen: [],
  pending: [],
  backs: {},
  turn: 0,
  sinceNew: NEW_EVERY - 2,
});

/**
 * Следующее слово. Возврат, чей ход настал, — раньше колоды; новое — не чаще
 * раза в `NEW_EVERY` ходов; колода кончилась — второй круг по отвеченным.
 */
export function serve(
  ds: DeckState,
  r: Rand,
): { ds: DeckState; card: RunCard; via: 'deck' | 'intro' | 'mistake' } | null {
  const turn = ds.turn + 1;
  const due = ds.pending.filter((p) => p.turn <= turn).sort((a, b) => a.turn - b.turn)[0];
  if (due) {
    return {
      ds: { ...ds, turn, sinceNew: ds.sinceNew + 1, pending: ds.pending.filter((p) => p !== due) },
      card: due.card,
      via: due.kind,
    };
  }
  let deck = ds.deck;
  let seen = ds.seen;
  if (deck.length === 0) {
    // Второй круг: знакомство уже было, новое слово теперь — изучаемое.
    deck = shuffle(r, seen).map((c) => (c.tag === 'new' ? { ...c, tag: 'learning' } : c));
    seen = [];
  }
  if (deck.length === 0) {
    const early = [...ds.pending].sort((a, b) => a.turn - b.turn)[0];
    if (!early) return null;
    return {
      ds: { ...ds, turn, pending: ds.pending.filter((p) => p !== early) },
      card: early.card,
      via: early.kind,
    };
  }
  const canNew = ds.sinceNew >= NEW_EVERY;
  const at = canNew ? 0 : Math.max(0, deck.findIndex((c) => c.tag !== 'new'));
  const index = canNew ? Math.max(0, deck.findIndex((c) => c.tag === 'new')) : at;
  const card = deck[index];
  return {
    ds: {
      ...ds,
      deck: deck.filter((_, i) => i !== index),
      seen,
      turn,
      sinceNew: card.tag === 'new' ? 0 : ds.sinceNew + 1,
    },
    card,
    via: 'deck',
  };
}

/** Слово отвечено верно — во второй круг. */
export const settle = (ds: DeckState, card: RunCard): DeckState => ({ ...ds, seen: [...ds.seen, card] });

/** Знакомство с новым словом: заданием оно придёт через 2–4 хода. */
export function scheduleIntro(ds: DeckState, card: RunCard, r: Rand): DeckState {
  return { ...ds, pending: [...ds.pending, { card, turn: ds.turn + int(r, 2, 4), kind: 'intro' }] };
}

/** Ошибка: слово вернётся через 3–5 ходов, не больше двух раз за забег; дальше — во второй круг. */
export function scheduleMistake(ds: DeckState, card: RunCard, r: Rand): DeckState {
  const backs = ds.backs[card.id] ?? 0;
  if (backs >= MISTAKE_BACKS) return settle(ds, card);
  return {
    ...ds,
    backs: { ...ds.backs, [card.id]: backs + 1 },
    pending: [...ds.pending, { card, turn: ds.turn + int(r, 3, 5), kind: 'mistake' }],
  };
}

/** Расстояние Дамерау–Левенштейна (оптимальное выравнивание строк). */
function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/** Почти верно: одна правка у слов от 5 букв, две — от 9; точный ответ опечаткой не считается. */
export function isTypo(given: string, target: string): boolean {
  const a = normalize(given);
  const b = normalize(target);
  if (!a || a === b) return false;
  const letters = b.replace(/[^a-z]/g, '').length;
  const allowed = letters >= 9 ? 2 : letters >= 5 ? 1 : 0;
  return allowed > 0 && distance(a, b) <= allowed;
}
