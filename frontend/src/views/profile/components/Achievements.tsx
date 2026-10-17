'use client';

import type { CSSProperties } from 'react';
import { useTranslations } from 'next-intl';
import type { Achievement, AchievementId } from '@/entities/profile';
import { cn } from '@/shared/lib/utils/css';
import { Tooltip } from '@/shared/ui/Tooltip';
import { ACHIEVEMENT_ICONS, progressOf } from '../lib/achievements';
import { Panel } from './Panel';

/**
 * Заливка полученного значка — по смыслу достижения, из короткой шкалы, а не
 * по игре: игр будет двадцать и больше. Значки — единственное место
 * профиля, где цветов несколько: на образце владельца так же — это
 * награды, и они должны различаться.
 */
const TONES: Record<AchievementId, string> = {
  first_tournament: 'cyan',
  first_win: 'gold',
  champion: 'gold',
  streak_7: 'orange',
  level_10: 'violet',
  jetpack_x10: 'pink',
  jetpack_100: 'violet',
  poker_100: 'pink',
  blackjack_100: 'green',
  tagger_100: 'cyan',
  backtest_10: 'green',
  rich_10k: 'gold',
};

/**
 * Значки. Список и пороги — с сервера (`achievements.ts`), здесь только
 * значок и подписи. Полученный — плоский цветной круг, неполученный — серый,
 * а прогресс до него виден в подсказке: значок, о котором неизвестно, как
 * его взять, ничего не просит.
 */
export function Achievements({ list }: { list: Achievement[] }) {
  const t = useTranslations('profile');
  const earned = list.filter((a) => a.earned).length;

  return (
    <Panel title={t('achievements')} count={`${earned}/${list.length}`} tone="gold" scroll>
      <ul className="pf-ach">
        {list.map((a) => {
          const Icon = ACHIEVEMENT_ICONS[a.id];
          const name = t(`ach.${a.id}.name`);
          const text = `${name}. ${t(`ach.${a.id}.desc`)}. ${a.earned ? t('achEarned') : progressOf(a)}`;
          return (
            <li key={a.id}>
              <Tooltip text={text}>
                <span
                  className={cn('pf-ach-i', `pf-t-${TONES[a.id]}`, a.earned && 'is-earned')}
                  style={{ '--p': a.earned ? 1 : Math.min(1, a.value / Math.max(1, a.target)) } as CSSProperties}
                  tabIndex={0}
                  aria-label={text}
                >
                  <Icon aria-hidden size={22} strokeWidth={2} />
                </span>
              </Tooltip>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
