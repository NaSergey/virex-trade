'use client';

import { useTranslations } from 'next-intl';
import type { BattlePassState } from '@/entities/battle-pass';
import { XpBar } from './XpBar';

/**
 * Герой и уровень. Модели героев ещё рисуются, и место под них занимается
 * сейчас — чтобы страница не переезжала, когда они появятся. Заглушка —
 * силуэт с номером уровня, а не «картинка скоро»: пустой прямоугольник
 * читался бы поломкой.
 */
export function HeroCard({ state, name }: { state: BattlePassState; name: string }) {
  const t = useTranslations('profile');

  return (
    <div className="hero-card">
      <div className="hero-slot" aria-hidden>
        <span className="hero-level">{state.level}</span>
      </div>
      <div className="hero-side">
        <div className="hero-name">{name}</div>
        <p className="muted hero-soon">{t('heroSoon')}</p>
        <XpBar state={state} />
      </div>
    </div>
  );
}
