/**
 * Границы столов покера/блэкджека. Числа держатся здесь, а не в DTO и не в
 * сервисе по месту: их одновременно проверяет сервер и будущая форма
 * создания стола.
 */

export type GameType = 'blackjack' | 'poker';

/** Один живой игрок за столом — уже блэкджек; дуэль покера — от двух. */
export const SEATS_RANGE: Record<GameType, [min: number, max: number]> = {
  blackjack: [1, 7],
  poker: [2, 9],
};

export const GAME_TYPES = Object.keys(SEATS_RANGE) as GameType[];

/** Сколько строк отдаёт общий список открытых столов. */
export const PUBLIC_LIST_LIMIT = 50;
