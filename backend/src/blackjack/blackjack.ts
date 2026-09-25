import { Card, freshDeck, shuffled } from '../games/cards';

/**
 * Правила блэкджека — чистые функции, без БД и таймеров, как `poker/holdem.ts`.
 * Каждая функция возвращает новое состояние; рантайм стола (`BlackjackService`)
 * только хранит его, пишет деньги и рассылает вид.
 *
 * Правила (спека `2026-09-24-blackjack-design.md`): 6 колод, крупье стоит на
 * всех 17, закрытая карта с проверкой блэкджека, блэкджек 3:2 с округлением
 * вниз, дабл на любые две, сплит до четырёх рук, тузы — по одной карте.
 * Страховки и сдачи нет.
 */

export const DECKS = 6;
export const MAX_HANDS = 4;

export type Outcome = 'blackjack' | 'win' | 'push' | 'lose' | 'bust';
export type BjActionType = 'hit' | 'stand' | 'double' | 'split';

export interface BjHand {
  cards: Card[];
  bet: number;
  doubled: boolean;
  /** Рука из сплита: 21 на ней — не блэкджек. */
  split: boolean;
  done: boolean;
  outcome: Outcome | null;
  /** Возвращено на руку при расчёте: ставка + выигрыш. */
  payout: number;
}

export interface BjPlayer {
  userId: string;
  seatIndex: number;
  /** Фишки за спиной: всё поставленное в этом раунде уже вычтено. */
  stack: number;
  hands: BjHand[];
}

export interface RoundState {
  phase: 'playing' | 'done';
  /** По порядку мест — в нём же сдача и ходы. */
  players: BjPlayer[];
  /** Вторая карта — закрытая, пока раунд идёт. */
  dealer: Card[];
  shoe: Card[];
  turn: { p: number; h: number } | null;
  /** userId → возвращено всего; есть только после расчёта. */
  payouts: Record<string, number> | null;
}

export interface BjLegal {
  hit: boolean;
  stand: boolean;
  double: boolean;
  split: boolean;
}

export class BlackjackError extends Error {
  constructor(public readonly code: 'NOT_YOUR_TURN' | 'ILLEGAL') {
    super(code);
  }
}

/**
 * Башмак на раунд: шесть колод, перетасованных заново каждый раз, как у
 * машины непрерывной тасовки. Между раундами хранить нечего.
 */
export function newShoe(rand?: (n: number) => number): Card[] {
  const cards: Card[] = [];
  for (let i = 0; i < DECKS; i++) cards.push(...freshDeck());
  return shuffled(cards, rand);
}

/** Очки карты: туз — 11 (мягкость считает `handValue`), картинки — 10. */
export function cardPoints(c: Card): number {
  const r = c[0];
  if (r === 'A') return 11;
  if ('TJQK'.includes(r)) return 10;
  return Number(r);
}

/** Сумма руки. Мягкая — если туз в ней ещё считается за 11. */
export function handValue(cards: Card[]): { total: number; soft: boolean } {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    total += cardPoints(c);
    if (c[0] === 'A') aces++;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return { total, soft: aces > 0 };
}

export const isNatural = (h: { cards: Card[]; split: boolean }) =>
  !h.split && h.cards.length === 2 && handValue(h.cards).total === 21;

function draw(s: RoundState): Card {
  const c = s.shoe.shift();
  if (!c) throw new Error('shoe is empty');
  return c;
}

const newHand = (bet: number, cards: Card[] = [], split = false): BjHand => ({
  cards,
  bet,
  doubled: false,
  split,
  done: false,
  outcome: null,
  payout: 0,
});

/**
 * Сдача: по кругу по порядку мест — первая карта каждому, крупье, вторая
 * каждому, закрытая крупье. Блэкджек крупье проверяется сразу и кончает
 * раунд до первого хода: до дабла и сплита дело не доходит, и каждый теряет
 * ровно ставку. Натуральный блэкджек игрока сразу стоит.
 */
export function startRound(
  entries: { userId: string; seatIndex: number; stack: number; bet: number }[],
  shoe: Card[],
): RoundState {
  const s: RoundState = {
    phase: 'playing',
    players: [...entries]
      .sort((a, b) => a.seatIndex - b.seatIndex)
      .map((e) => ({ userId: e.userId, seatIndex: e.seatIndex, stack: e.stack, hands: [newHand(e.bet)] })),
    dealer: [],
    shoe: [...shoe],
    turn: null,
    payouts: null,
  };
  for (let round = 0; round < 2; round++) {
    for (const p of s.players) p.hands[0].cards.push(draw(s));
    s.dealer.push(draw(s));
  }
  for (const p of s.players) if (handValue(p.hands[0].cards).total === 21) p.hands[0].done = true;
  if (isNatural({ cards: s.dealer, split: false })) return finish(s, false);
  return advance(s);
}

/** Что может игрок, чей сейчас ход. Не его ход или раунд кончен — `null`. */
export function legal(s: RoundState, userId: string): BjLegal | null {
  if (s.phase !== 'playing' || !s.turn) return null;
  const p = s.players[s.turn.p];
  if (p.userId !== userId) return null;
  const h = p.hands[s.turn.h];
  const two = h.cards.length === 2;
  const splitAces = h.split && h.cards[0][0] === 'A';
  return {
    hit: true,
    stand: true,
    double: two && !splitAces && p.stack >= h.bet,
    split:
      two &&
      !splitAces &&
      cardPoints(h.cards[0]) === cardPoints(h.cards[1]) &&
      p.hands.length < MAX_HANDS &&
      p.stack >= h.bet,
  };
}

export function act(state: RoundState, userId: string, type: BjActionType): RoundState {
  const ok = legal(state, userId);
  if (!ok) throw new BlackjackError('NOT_YOUR_TURN');
  if (!ok[type]) throw new BlackjackError('ILLEGAL');
  const s = structuredClone(state);
  const { p: pi, h: hi } = s.turn!;
  const p = s.players[pi];
  const h = p.hands[hi];
  switch (type) {
    case 'hit':
      h.cards.push(draw(s));
      if (handValue(h.cards).total >= 21) h.done = true;
      break;
    case 'stand':
      h.done = true;
      break;
    case 'double':
      p.stack -= h.bet;
      h.bet *= 2;
      h.doubled = true;
      h.cards.push(draw(s));
      h.done = true;
      break;
    case 'split': {
      // Вторые карты обеим рукам — сразу: исходы от этого не меняются, а
      // стол не ждёт, пока доиграна первая рука. Тузы получают по одной
      // карте и больше не ходят.
      p.stack -= h.bet;
      const aces = h.cards[0][0] === 'A';
      const first = newHand(h.bet, [h.cards[0], draw(s)], true);
      const second = newHand(h.bet, [h.cards[1], draw(s)], true);
      for (const x of [first, second]) if (aces || handValue(x.cards).total === 21) x.done = true;
      p.hands.splice(hi, 1, first, second);
      break;
    }
  }
  return advance(s);
}

/** Все оставшиеся руки игрока стоят: истёк ход или игрок встал из-за стола. */
export function standAll(state: RoundState, userId: string): RoundState {
  if (state.phase !== 'playing') return state;
  const s = structuredClone(state);
  const p = s.players.find((x) => x.userId === userId);
  if (!p) return state;
  for (const h of p.hands) h.done = true;
  return advance(s);
}

/** Сколько каждый поставил на свои руки — это и есть вклад раунда в `GameHand`. */
export function wagered(s: RoundState): Record<string, number> {
  return Object.fromEntries(s.players.map((p) => [p.userId, p.hands.reduce((a, h) => a + h.bet, 0)]));
}

/** Следующая несыгранная рука по порядку мест; таких нет — ходит крупье. */
function advance(s: RoundState): RoundState {
  for (let p = 0; p < s.players.length; p++) {
    const h = s.players[p].hands.findIndex((x) => !x.done);
    if (h !== -1) {
      s.turn = { p, h };
      return s;
    }
  }
  return finish(s, true);
}

/**
 * Крупье вскрывается и добирает до 17 — только если есть кому проигрывать:
 * при одних переборах и натуральных блэкджеках добор ничего не решает.
 */
function finish(s: RoundState, dealerPlays: boolean): RoundState {
  s.turn = null;
  const live = s.players.some((p) => p.hands.some((h) => handValue(h.cards).total <= 21 && !isNatural(h)));
  if (dealerPlays && live) {
    while (handValue(s.dealer).total < 17) s.dealer.push(draw(s));
  }
  const dealerBj = isNatural({ cards: s.dealer, split: false });
  const dealerTotal = handValue(s.dealer).total;
  const payouts: Record<string, number> = {};
  for (const p of s.players) {
    let back = 0;
    for (const h of p.hands) {
      const r = settleHand(h, dealerTotal, dealerBj);
      h.done = true;
      h.outcome = r.outcome;
      h.payout = r.payout;
      back += r.payout;
    }
    payouts[p.userId] = back;
  }
  s.payouts = payouts;
  s.phase = 'done';
  return s;
}

function settleHand(h: BjHand, dealerTotal: number, dealerBj: boolean): { outcome: Outcome; payout: number } {
  const total = handValue(h.cards).total;
  if (isNatural(h)) {
    // Монеты целые: у нечётной ставки половина монеты выигрыша теряется.
    return dealerBj
      ? { outcome: 'push', payout: h.bet }
      : { outcome: 'blackjack', payout: h.bet + Math.floor((h.bet * 3) / 2) };
  }
  if (total > 21) return { outcome: 'bust', payout: 0 };
  if (dealerBj) return { outcome: 'lose', payout: 0 };
  if (dealerTotal > 21 || total > dealerTotal) return { outcome: 'win', payout: h.bet * 2 };
  if (total === dealerTotal) return { outcome: 'push', payout: h.bet };
  return { outcome: 'lose', payout: 0 };
}
