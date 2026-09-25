'use client';

import { useTranslations } from 'next-intl';
import type { DailyState } from '../api/types';

/**
 * Семь клеток недели. Переиспользуется карточкой на /profile и модалкой,
 * всплывающей при заходе, — правило «что пройдено / что сегодня» должно
 * остаться одним на оба места, а не разойтись при первой же правке.
 */
export function DailyWeekRow({ daily }: { daily: DailyState }) {
  const t = useTranslations('profile');

  return (
    <ol className="daily-row">
      {daily.week.map((coins, i) => {
        const day = i + 1;
        const done = day < daily.day || (day === daily.day && daily.claimedToday);
        const today = day === daily.day;
        return (
          <li key={day} className={`daily-cell${done ? ' is-done' : ''}${today ? ' is-today' : ''}`}>
            <span className="daily-day">{t('day', { day })}</span>
            <span className="daily-coins">{coins}</span>
          </li>
        );
      })}
    </ol>
  );
}
