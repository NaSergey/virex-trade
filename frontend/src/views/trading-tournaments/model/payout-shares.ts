/**
 * Как делится призовой фонд по умолчанию при выборе числа победителей.
 *
 * Создатель правит эти числа руками, но начинать с пустых полей значило бы
 * заставлять его решать арифметическую задачу («чтобы вышло сто») до того, как
 * он подумал о самом турнире. Готовые раскладки — обычные для соревнований:
 * весь фонд одному, дальше убывающие доли, от четырёх мест — поровну, потому
 * что выдуманная лесенка на шесть мест ничем не лучше ровной.
 */
const PRESETS: Record<number, number[]> = {
  1: [100],
  2: [70, 30],
  3: [50, 30, 20],
};

export function defaultShares(winnersCount: number): number[] {
  const preset = PRESETS[winnersCount];
  if (preset) return preset;
  // Поровну, а остаток от деления — первому месту: сумма обязана быть ровно сто.
  const base = Math.floor(100 / winnersCount);
  const shares = Array.from({ length: winnersCount }, () => base);
  shares[0] += 100 - base * winnersCount;
  return shares;
}

/** Те же правила, что проверяет сервер, — чтобы отказ не приходил из сети. */
export function sharesValid(shares: number[], winnersCount: number): boolean {
  if (shares.length !== winnersCount) return false;
  if (shares.some((s) => !Number.isInteger(s) || s < 1)) return false;
  if (shares.reduce((a, b) => a + b, 0) !== 100) return false;
  return shares.every((s, i) => i === 0 || s <= shares[i - 1]);
}
