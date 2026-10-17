import {
  Club,
  Crown,
  Flag,
  Flame,
  Gauge,
  Gem,
  History,
  Medal,
  Rocket,
  Spade,
  Tag,
  Trophy,
  type LucideIcon,
} from 'lucide-react';
import type { Achievement, AchievementId } from '@/entities/profile';

/**
 * Значок каждого достижения — один на ряд под именем, плашки вкладки
 * «Достижения» и прежнюю панель (`Achievements`). Список и пороги — с сервера
 * (`achievements.ts` бэкенда), здесь только рисунок.
 */
export const ACHIEVEMENT_ICONS: Record<AchievementId, LucideIcon> = {
  first_tournament: Flag,
  first_win: Trophy,
  champion: Crown,
  streak_7: Flame,
  level_10: Medal,
  jetpack_x10: Rocket,
  jetpack_100: Gauge,
  poker_100: Spade,
  blackjack_100: Club,
  tagger_100: Tag,
  backtest_10: History,
  rich_10k: Gem,
};

/** Прогресс значка. Множитель джетпака приходит в сотых — показываем иксами. */
export const progressOf = (a: Achievement): string =>
  a.id === 'jetpack_x10' ? `×${(a.value / 100).toFixed(2)} / ×${a.target / 100}` : `${a.value} / ${a.target}`;
