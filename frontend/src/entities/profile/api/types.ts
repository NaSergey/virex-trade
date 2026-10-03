import type { Trade } from '@/entities/trade';

/** Игры, у которых есть строка в таблице профиля и ось паутинки. */
export type GameId = 'tournament' | 'backtest' | 'jetpack' | 'poker' | 'blackjack';

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

export interface ProfileGame {
  id: GameId;
  /** Действий за всё время: участий, сессий, ставок, раздач. */
  played: number;
  /** В сколько из последних 90 дней человек играл в эту игру. */
  days90: number;
  /** День UTC `YYYY-MM-DD` последней игры. */
  lastDay: string | null;
}

export interface Achievement {
  id: AchievementId;
  earned: boolean;
  /** Набрано, не больше цели. У `jetpack_x10` — множитель в сотых. */
  value: number;
  target: number;
}

export interface FeedRow {
  id: string;
  at: string;
  /** Вид строки журнала монет: `JETPACK_WIN`, `DAILY_REWARD`, … */
  kind: string;
  delta: number;
  balanceAfter: number;
}

/** Строка игрока в рейтинге игры — то же правило очков, что у таблицы рейтинга. */
export interface ProfileRating {
  place: number;
  points: number;
  tournaments: number;
  wins: number;
}

/** Уровень текущего сезона Battle Pass. */
export interface ProfileSeason {
  key: string;
  endsAt: string;
  xp: number;
  level: number;
  xpIntoLevel: number;
  xpToNext: number;
}

/**
 * Дашборд профиля (`GET /api/profile` — свой, `/api/profile/<id>` — любой).
 * Ответ один и тот же: чужой профиль видит всё. Сетка, ряды и лента — дни UTC.
 */
export interface ProfileOverview {
  user: { id: string; name: string | null; avatar: string | null };
  season: ProfileSeason;
  balance: number;
  /** null — ещё не доиграл ни одного турнира. */
  rating: ProfileRating | null;
  /**
   * Есть ли у него сделки с биржи — по этому страница решает, заводить ли
   * вкладку «Биржа». Признак, а не число: `false` значит и «не торговал», и
   * «закрыл показ», и выключатель не сообщает, сколько сделок спрятано.
   */
  hasExchangeTrades: boolean;
  /** Рекорды — без потолка цели значков. */
  records: {
    /** Лучший вывод в джетпаке, множитель в сотых; 0 — выводов не было. */
    bestX100: number;
    /** Самая длинная серия ежедневных наград, дней. */
    bestStreak: number;
    /** Самый большой баланс монет за всё время. */
    peakBalance: number;
  };
  since: string;
  games: ProfileGame[];
  /** XP за каждый из последних 90 дней. */
  xpSeries: { day: string; xp: number }[];
  /** Баланс монет на конец каждого из последних 90 дней. */
  coinSeries: { day: string; balance: number }[];
  achievements: Achievement[];
  feed: FeedRow[];
}

/**
 * Лист чужого журнала биржи (`GET /api/profile/<id>/trades`).
 *
 * Строка — та же `Trade`, что в своём журнале, но без тегов и рыночного
 * контекста: «почему вошёл» — личная заметка, а раскрыть чужую строку нечем
 * (ордера и график сделки — эндпоинты своих сделок). Скрытый показ отвечает
 * 403 `PROFILE_TRADES_HIDDEN`, а не пустым листом.
 */
export interface ProfileTrades {
  total: number;
  page: number;
  pageSize: number;
  trades: Trade[];
}
