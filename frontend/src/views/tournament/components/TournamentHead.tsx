'use client';

import { useTranslations } from 'next-intl';
import type { TournamentDetail } from '@/entities/tournament';
import { KeyValue } from '@/shared/ui/Lookup';
import { PageHead } from '@/shared/ui/PageHead';

/**
 * Условия турнира одним взглядом. Призовой фонд показан с разбивкой по местам:
 * человек решает, стоит ли взнос участия, и обещание «фонд 900» без того, кому
 * и сколько из него достанется, этого вопроса не закрывает.
 */
export function TournamentHead({ detail }: { detail: TournamentDetail }) {
  const t = useTranslations('tournaments');
  const tc = useTranslations('coins');
  const { tournament: x } = detail;

  return (
    <>
      <PageHead title={x.name} lede={t(`status.${x.status}`)} />
      <div className="lookup">
        <KeyValue label={t('colPlayers')}>
          {x.players}/{x.maxPlayers}
        </KeyValue>
        <KeyValue label={t('depositLabel')}>{x.startBalance.toLocaleString('ru-RU')} USDT</KeyValue>
        <KeyValue label={t('durationLabel')}>{t(`duration.${x.durationMin}`)}</KeyValue>
        <KeyValue label={t('colEntryFee')}>
          {x.entryFee > 0 ? `${x.entryFee} ${tc('unit')}` : t('free')}
        </KeyValue>
        <KeyValue label={t('colPrizePool')}>
          {x.prizePool} {tc('unit')}
        </KeyValue>
        {x.endsAt && (
          <KeyValue label={t('endsAtLabel')}>{new Date(x.endsAt).toLocaleString()}</KeyValue>
        )}
      </div>
      <p className="subtle" style={{ fontSize: 'var(--t-xs)' }}>
        {t('sharesSummary', { shares: x.payoutShares.map((s, i) => `${i + 1}: ${s}%`).join(' · ') })}
      </p>
    </>
  );
}
