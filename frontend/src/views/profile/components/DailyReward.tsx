'use client';

import { useTranslations } from 'next-intl';
import { DailyWeekRow, useClaimDaily, type DailyState } from '@/entities/battle-pass';
import { Button } from '@/shared/ui/Button';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { SectionHead } from '@/shared/ui/SectionHead';

export function DailyReward({ daily }: { daily: DailyState }) {
  const t = useTranslations('profile');
  const claim = useClaimDaily();

  return (
    <section className="profile-section">
      <SectionHead title={t('daily')}>
        <span className="muted">{t('dailyStreak', { days: daily.streak })}</span>
      </SectionHead>
      <p className="lede">{t('dailyLede')}</p>
      <DailyWeekRow daily={daily} />
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
