import { randomInt } from 'node:crypto';

/** Карта строкой: ранг + масть, `As`, `Td`, `2c`. Так же её получает фронт. */
export type Card = string;

export const RANKS = '23456789TJQKA';
export const SUITS = 'cdhs';

export function freshDeck(): Card[] {
  const deck: Card[] = [];
  for (const r of RANKS) for (const s of SUITS) deck.push(r + s);
  return deck;
}

/**
 * Фишера–Йетса на `crypto.randomInt`: колода — это деньги, и предсказуемый
 * `Math.random` здесь не годится. `rand` подменяется в тестах.
 */
export function shuffled(deck: Card[] = freshDeck(), rand: (n: number) => number = randomInt): Card[] {
  const out = [...deck];
  for (let i = out.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Ранг карты числом: 2..14. */
export const rankOf = (c: Card) => RANKS.indexOf(c[0]) + 2;
export const suitOf = (c: Card) => c[1];
