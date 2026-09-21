'use client';

import { useTranslations } from 'next-intl';
import { useClaimDaily, type DailyState } from '@/entities/battle-pass';
import { Button } from '@/shared/ui/Button';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { SectionHead } from '@/shared/ui/SectionHead';

/**
 * Семь клеток недели. Пройденные помечены, сегодняшняя выделена, будущие
 * приглушены: смысл блока в том, что завтра дадут больше, и ряд обязан
 * показывать это раньше, чем человек прочитает подпись.
 *
 * Суммы берутся из `daily.week`, то есть с сервера: свой список тех же чисел
 * в браузере разошёлся бы с серверным при первой же правке щедрости.
 */
export function DailyReward({ daily }: { daily: DailyState }) {
  const t = useTranslations('profile');
  const claim = useClaimDaily();

  return (
    <section className="profile-section">
      <SectionHead title={t('daily')}>
        <span className="muted">{t('dailyStreak', { days: daily.streak })}</span>
      </SectionHead>
      <p className="lede">{t('dailyLede')}</p>
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
      {daily.claimedToday ? (
        <p className="muted">{t('dailyDone')}</p>
      ) : (
        <Button onClick={() => claim.mutate()} disabled={claim.isPending}>
          {t('dailyClaim', { coins: daily.coins })}
        </Button>
      )}
      <ErrorNote error={claim.error} fallback={t('claimFailed')} />
    </section>
  );
}
