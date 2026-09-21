/** Состояние клетки лестницы наград. */
export type LevelState = 'claimed' | 'ready' | 'locked';

export interface LevelRow {
  level: number;
  /** Порог уровня в XP за сезон. */
  xp: number;
  coins: number;
  state: LevelState;
}

export interface DailyState {
  /** День цикла, который забирается сегодня: 1–7. */
  day: number;
  streak: number;
  claimedToday: boolean;
  coins: number;
  nextCoins: number;
  /** Суммы всего цикла — ряд из семи клеток рисует их, а не свою копию. */
  week: number[];
}

export interface BattlePassState {
  season: { key: string; endsAt: string };
  xp: number;
  level: number;
  xpIntoLevel: number;
  xpToNext: number;
  claimedLevel: number;
  /** Сколько монет ждёт кнопки «Забрать». */
  pendingCoins: number;
  levels: LevelRow[];
  daily: DailyState;
}
