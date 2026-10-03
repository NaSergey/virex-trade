/**
 * Реестр достижений — единственный источник правды о том, какие значки есть и
 * за что они. Приём тот же, что у реестров XP и уведомлений: новый значок —
 * запись здесь, а не правка сервиса и фронта.
 *
 * Достижения не хранятся, а выводятся из фактов при каждом чтении: правило —
 * соглашение, а не факт о человеке, и сохранённый значок пришлось бы
 * пересчитывать задним числом при любой правке порога. Тот же довод, что у
 * уровня сезона и рейтинга турниров.
 */

/** Всё, из чего выводятся значки. Собирает сервис, считает реестр. */
export interface Facts {
  tournamentsFinished: number;
  tournamentWins: number;
  /** Лучшая серия ежедневных наград подряд за всё время. */
  bestDailyRun: number;
  /** Высший уровень в любом сезоне. */
  maxSeasonLevel: number;
  jetpackRounds: number;
  /** Лучший вывод джетпака в сотых (×10 = 1000); 0 — выводов не было. */
  jetpackBestX100: number;
  pokerHands: number;
  blackjackHands: number;
  taggedTrades: number;
  backtestSessions: number;
  /** Наибольший баланс монет за всё время. */
  maxBalance: number;
}

export type AchievementId =
  | 'first_tournament'
  | 'first_win'
  | 'champion'
  | 'streak_7'
  | 'level_10'
  | 'jetpack_x10'
  | 'jetpack_100'
  | 'poker_100'
  | 'blackjack_100'
  | 'tagger_100'
  | 'backtest_10'
  | 'rich_10k';

interface AchievementDef {
  id: AchievementId;
  target: number;
  value: (f: Facts) => number;
}

/** Порядок записей — порядок значков на странице. */
export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_tournament', target: 1, value: (f) => f.tournamentsFinished },
  { id: 'first_win', target: 1, value: (f) => f.tournamentWins },
  { id: 'champion', target: 10, value: (f) => f.tournamentWins },
  { id: 'streak_7', target: 7, value: (f) => f.bestDailyRun },
  { id: 'level_10', target: 10, value: (f) => f.maxSeasonLevel },
  // Множитель — в сотых, как у джетпака везде: «успел ли на ×10» сравнивается
  // точно, а наружу уходит тем же числом, что лежит в базе.
  { id: 'jetpack_x10', target: 1000, value: (f) => f.jetpackBestX100 },
  { id: 'jetpack_100', target: 100, value: (f) => f.jetpackRounds },
  { id: 'poker_100', target: 100, value: (f) => f.pokerHands },
  { id: 'blackjack_100', target: 100, value: (f) => f.blackjackHands },
  { id: 'tagger_100', target: 100, value: (f) => f.taggedTrades },
  { id: 'backtest_10', target: 10, value: (f) => f.backtestSessions },
  { id: 'rich_10k', target: 10_000, value: (f) => f.maxBalance },
];

export interface Achievement {
  id: AchievementId;
  earned: boolean;
  /** Сколько набрано, не больше цели: «120 / 100» в подсказке читалось бы ошибкой. */
  value: number;
  target: number;
}

export function achievementsOf(facts: Facts): Achievement[] {
  return ACHIEVEMENTS.map(({ id, target, value }) => {
    const v = Math.max(0, value(facts));
    return { id, earned: v >= target, value: Math.min(v, target), target };
  });
}
