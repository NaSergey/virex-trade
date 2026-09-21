'use client';

import { useTranslations } from 'next-intl';
import type { BattlePassState } from '@/entities/battle-pass';

/**
 * Полоса уровня. Заполнение — доля XP, набранного внутри текущего уровня:
 * общая сумма за сезон ничего не сказала бы о том, сколько осталось идти.
 */
export function XpBar({ state }: { state: BattlePassState }) {
  const t = useTranslations('profile');
  const span = state.xpIntoLevel + state.xpToNext;
  const filled = span > 0 ? Math.round((state.xpIntoLevel / span) * 100) : 100;

  return (
    <div className="xpbar">
      <div className="xpbar-head">
        <strong>{t('level', { level: state.level })}</strong>
        <span className="muted">
          {state.xpToNext > 0 ? t('toNext', { xp: state.xpToNext, level: state.level + 1 }) : t('maxed')}
        </span>
      </div>
      <div
        className="xpbar-rail"
        role="progressbar"
        aria-valuenow={filled}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t('level', { level: state.level })}
      >
        <span className="xpbar-fill" style={{ width: `${filled}%` }} />
      </div>
    </div>
  );
}
