'use client';

import { useTranslations } from 'next-intl';
import { useClaimRewards, type BattlePassState } from '@/entities/battle-pass';
import { useLocaleControl } from '@/shared/i18n';
import { Button } from '@/shared/ui/Button';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { SectionHead } from '@/shared/ui/SectionHead';

/**
 * Лестница сезона. Одна кнопка на всё доступное, а не кнопка на каждой клетке:
 * награда одного вида — монеты, и выбирать, какую монету получить раньше,
 * незачем.
 *
 * Срок сезона стоит здесь же, а не в подсказке: незабранные награды сгорают
 * вместе с сезоном, и человек, потерявший монеты из-за незамеченной даты, прав.
 */
export function RewardTrack({ state }: { state: BattlePassState }) {
  const t = useTranslations('profile');
  const { locale } = useLocaleControl();
  const claim = useClaimRewards();

  // Дата — через toLocaleDateString с локалью продукта, как в
  // shared/lib/utils/period.ts, а не через `useFormatter` next-intl: у того
  // зону пришлось бы выбирать осознанно (см. комментарий в LocaleProvider), а
  // здесь нужен просто день конца квартала.
  const endsAt = new Date(state.season.endsAt).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
  });

  return (
    <section className="profile-section">
      <SectionHead title={t('track')}>
        <span className="muted">{t('seasonEnds', { date: endsAt })}</span>
      </SectionHead>
      <p className="lede">{t('seasonNote')}</p>
      <Button onClick={() => claim.mutate()} disabled={state.pendingCoins === 0 || claim.isPending}>
        {state.pendingCoins > 0 ? t('claim', { coins: state.pendingCoins }) : t('claimNone')}
      </Button>
      <ErrorNote error={claim.error} fallback={t('claimFailed')} />
      <ol className="track">
        {state.levels.map((row) => (
          <li key={row.level} className={`track-cell is-${row.state}`}>
            <span className="track-level">{row.level}</span>
            <span className="track-coins">{row.coins}</span>
            <span className="track-note muted">
              {row.state === 'claimed' ? t('claimed') : row.state === 'ready' ? t('ready') : t('locked', { xp: row.xp })}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
