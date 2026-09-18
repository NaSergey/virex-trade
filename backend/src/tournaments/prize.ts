/**
 * Призовой фонд турнира и его раздача.
 *
 * Фонд — чужие монеты: взносы участников плюс то, что положил от себя создатель.
 * Раздать его нужно ровно целиком — недоданная монета осталась бы у проекта, а
 * лишняя взялась бы из ниоткуда, — поэтому остаток от округления долей
 * прибавляется к первому месту, а не теряется.
 */

export function prizePool(t: { entryFee: number; prizeBonus: number }, participants: number): number {
  return t.entryFee * participants + t.prizeBonus;
}

/**
 * Доли создателя годятся, если их ровно столько, сколько победителей, каждая —
 * целый процент не меньше единицы, вместе они дают сто и по местам не
 * возрастают. Последнее — не вкусовщина: приз, растущий к последнему месту,
 * превращает турнир в соревнование за то, чтобы не выиграть.
 */
export function validateShares(shares: number[], winnersCount: number): boolean {
  if (shares.length !== winnersCount) return false;
  if (shares.some((s) => !Number.isInteger(s) || s < 1)) return false;
  if (shares.reduce((a, b) => a + b, 0) !== 100) return false;
  return shares.every((s, i) => i === 0 || s <= shares[i - 1]);
}

/** Выплаты по местам. Сумма результата всегда равна фонду. */
export function payouts(pool: number, shares: number[]): number[] {
  if (pool <= 0 || shares.length === 0) return shares.map(() => 0);
  const raw = shares.map((s) => Math.floor((pool * s) / 100));
  const rest = pool - raw.reduce((a, b) => a + b, 0);
  raw[0] += rest;
  return raw;
}
