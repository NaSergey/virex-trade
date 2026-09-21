import { DAILY_CYCLE, DAILY_REWARD_COINS } from './battlepass.config';

/**
 * Ежедневная награда за заход.
 *
 * Своего состояния у неё нет: награда — это строка журнала монет с
 * `refId = 'YYYY-MM-DD'`, и всё остальное выводится из набора таких дат.
 * Отдельная таблица со счётчиком стрика была бы вторым источником того же
 * знания — и первым, что разойдётся с журналом после отката или ручной правки.
 */

export interface DailyState {
  /** День цикла, который забирается сегодня: с первого по седьмой. */
  day: number;
  /** Сколько дней подряд человек заходил, включая сегодня, если уже забрал. */
  streak: number;
  claimedToday: boolean;
  /** Монет за сегодняшний день. */
  coins: number;
  /** Монет за завтрашний, если он не будет пропущен. */
  nextCoins: number;
  /**
   * Суммы всего цикла — их рисует ряд из семи клеток. Едут с сервера, а не
   * повторяются в браузере: второй список тех же чисел разошёлся бы с первым
   * при первой же правке щедрости.
   */
  week: number[];
}

const DAY_MS = 86_400_000;

/** Дата UTC как ключ награды. */
export const dayKey = (date: Date): string => date.toISOString().slice(0, 10);

export const startOfUtcDay = (date: Date): Date =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

/**
 * Ключи, по которым спрашивается журнал: сегодня и семь предыдущих дней.
 * Выборка по известным ключам ограничена по построению — в отличие от
 * «последних семи строк», которые в истории с пропусками отвечают на другой
 * вопрос. Дальше восьми смотреть незачем: цикл замыкается на седьмом дне.
 */
export function recentDayKeys(today: Date): string[] {
  const start = startOfUtcDay(today).getTime();
  return Array.from({ length: DAILY_CYCLE + 1 }, (_, i) => dayKey(new Date(start - i * DAY_MS)));
}

export function dailyState(days: Set<string>, today: Date): DailyState {
  const start = startOfUtcDay(today).getTime();

  // Считаем назад от ВЧЕРА, а не от сегодня: день цикла не должен меняться
  // оттого, забрал человек награду или ещё только смотрит на кнопку.
  let previous = 0;
  while (previous < DAILY_CYCLE && days.has(dayKey(new Date(start - (previous + 1) * DAY_MS)))) {
    previous += 1;
  }

  // Полная неделя позади — сегодня первый день нового цикла.
  const day = (previous % DAILY_CYCLE) + 1;
  const claimedToday = days.has(dayKey(today));

  return {
    day,
    streak: claimedToday ? previous + 1 : previous,
    claimedToday,
    coins: DAILY_REWARD_COINS[day - 1],
    nextCoins: DAILY_REWARD_COINS[day % DAILY_CYCLE],
    week: [...DAILY_REWARD_COINS],
  };
}
