import { Card, rankOf, suitOf } from '../games/cards';

/** Категория комбинации — по возрастанию силы; фронт переводит по ключу. */
export const CATEGORIES = [
  'high',
  'pair',
  'twoPair',
  'trips',
  'straight',
  'flush',
  'fullHouse',
  'quads',
  'straightFlush',
] as const;
export type Category = (typeof CATEGORIES)[number];

export interface HandValue {
  /** Больше — сильнее; равные — делёж. */
  score: number;
  category: Category;
  best: Card[];
}

const BASE = 15;

function pack(category: number, kickers: number[]): number {
  let score = category;
  for (let i = 0; i < 5; i++) score = score * BASE + (kickers[i] ?? 0);
  return score;
}

/** Ровно пять карт. */
export function evaluate5(cards: Card[]): number {
  const ranks = cards.map(rankOf).sort((a, b) => b - a);
  const flush = cards.every((c) => suitOf(c) === suitOf(cards[0]));

  const unique = [...new Set(ranks)];
  let straightHigh = 0;
  if (unique.length === 5) {
    if (unique[0] - unique[4] === 4) straightHigh = unique[0];
    // Колесо A-2-3-4-5: туз играет единицей.
    else if (unique[0] === 14 && unique[1] === 5) straightHigh = 5;
  }

  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  // Группы по размеру, внутри — по рангу: это и есть порядок кикеров.
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const order = groups.map((g) => g[0]);
  const shape = groups.map((g) => g[1]).join('');

  if (straightHigh && flush) return pack(8, [straightHigh]);
  if (shape === '41') return pack(7, order);
  if (shape === '32') return pack(6, order);
  if (flush) return pack(5, ranks);
  if (straightHigh) return pack(4, [straightHigh]);
  if (shape === '311') return pack(3, order);
  if (shape === '221') return pack(2, order);
  if (shape === '2111') return pack(1, order);
  return pack(0, ranks);
}

export const categoryOf = (score: number): Category => CATEGORIES[Math.floor(score / BASE ** 5)];

/** Лучшие пять из пяти–семи карт перебором: 21 сочетание на семи — дёшево. */
export function bestHand(cards: Card[]): HandValue {
  let best: HandValue | null = null;
  const n = cards.length;
  const pick = (start: number, chosen: Card[]) => {
    if (chosen.length === 5) {
      const score = evaluate5(chosen);
      if (!best || score > best.score) best = { score, category: categoryOf(score), best: [...chosen] };
      return;
    }
    for (let i = start; i <= n - (5 - chosen.length); i++) pick(i + 1, [...chosen, cards[i]]);
  };
  pick(0, []);
  if (!best) throw new Error('bestHand: нужно не меньше пяти карт');
  return best;
}
