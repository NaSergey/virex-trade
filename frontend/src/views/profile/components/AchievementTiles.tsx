'use client';

import type { CSSProperties } from 'react';
import { useTranslations } from 'next-intl';
import type { Achievement } from '@/entities/profile';
import { cn } from '@/shared/lib/utils/css';
import { Tooltip } from '@/shared/ui/Tooltip';
import { ACHIEVEMENT_ICONS, progressOf } from '../lib/achievements';

/**
 * Вкладка «Достижения» — двенадцать плашек: значок, название, прогресс.
 * Полученная — вывернута светлой плашкой, как выбранный пункт `Seg`: в
 * системе, где цвет означает деньги, отметить «есть» можно только выворотом.
 * У остальных — тонкая полоса прогресса. Условие — в подсказке.
 */
export function AchievementTiles({ list, cols }: { list: Achievement[]; cols: number }) {
  const t = useTranslations('profile');
  return (
    <ul className="pf-tiles" style={{ '--cols': cols } as CSSProperties}>
      {list.map((a) => {
        const Icon = ACHIEVEMENT_ICONS[a.id];
        const share = a.earned ? 1 : Math.min(1, a.value / Math.max(1, a.target));
        return (
          <Tooltip key={a.id} text={t(`ach.${a.id}.desc`)}>
            <li className={cn('pf-tile', a.earned && 'is-got')} tabIndex={0}>
              <Icon aria-hidden size={18} strokeWidth={1.75} />
              <span className="pf-tile-n">{t(`ach.${a.id}.name`)}</span>
              <span className="pf-tile-p">
                {!a.earned && (
                  <span className="pf-bar" role="presentation">
                    <i style={{ width: `${share * 100}%` }} />
                  </span>
                )}
                {a.earned ? t('achEarned') : progressOf(a)}
              </span>
            </li>
          </Tooltip>
        );
      })}
    </ul>
  );
}
