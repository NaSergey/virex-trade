import { MAX_LEVEL, REWARD_BASE, REWARD_TIER, XP_BASE, XP_STEP } from './battlepass.config';

/**
 * Уровни сезона и награды за них.
 *
 * Уровень нигде не хранится — он функция от XP. Правило начисления это
 * соглашение, а не факт о человеке, и сохранённый уровень пришлось бы
 * пересчитывать задним числом при любой правке кривой. Тот же довод, что у
 * рейтинга турниров.
 */

export interface LadderRow {
  level: number;
  /** Сколько XP нужно накопить за сезон, чтобы уровень стал этим. */
  xp: number;
  coins: number;
}

/** Сколько XP нужно, чтобы уйти с этого уровня на следующий. */
export const xpToAdvance = (fromLevel: number): number => XP_BASE + XP_STEP * (fromLevel - 1);

/** Порог уровня — сумма всех переходов до него. */
export function xpForLevel(level: number): number {
  let total = 0;
  for (let l = 1; l < level; l++) total += xpToAdvance(l);
  return total;
}

/**
 * Уровень и место внутри него. Перебором по той же формуле, что рисует
 * лестницу: пятьдесят шагов дешевле любой попытки решить это в закрытом виде,
 * а главное — не разойдётся с лестницей при правке кривой.
 */
export function levelFromXp(xp: number): { level: number; xpIntoLevel: number; xpToNext: number } {
  let rest = Math.max(0, Math.floor(xp));
  let level = 1;
  while (level < MAX_LEVEL) {
    const need = xpToAdvance(level);
    if (rest < need) return { level, xpIntoLevel: rest, xpToNext: need - rest };
    rest -= need;
    level += 1;
  }
  // Потолок: XP дальше копится, но идти больше некуда, и полосу прогресса
  // некуда двигать — она полна.
  return { level: MAX_LEVEL, xpIntoLevel: 0, xpToNext: 0 };
}

/** Монет за достижение уровня. За первый награды нет: её не за что давать. */
export const rewardCoins = (level: number): number =>
  level < 2 ? 0 : REWARD_BASE * (1 + Math.floor((level - 1) / REWARD_TIER));

/** Сколько монет ждёт того, кто забрал награды до `fromLevel`, а стоит на `toLevel`. */
export function coinsBetween(fromLevel: number, toLevel: number): number {
  let sum = 0;
  for (let l = Math.max(2, fromLevel + 1); l <= toLevel; l++) sum += rewardCoins(l);
  return sum;
}

/** Весь трек сезона — его рисует фронт, и считает его сервер (см. спеку). */
export function ladder(): LadderRow[] {
  const rows: LadderRow[] = [];
  for (let level = 2; level <= MAX_LEVEL; level++) {
    rows.push({ level, xp: xpForLevel(level), coins: rewardCoins(level) });
  }
  return rows;
}
