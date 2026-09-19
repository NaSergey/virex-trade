'use client';

import { useTranslations } from 'next-intl';
import { useTournamentRating, type RatingRow } from '@/entities/tournament';
import { EmptyState } from '@/shared/ui/EmptyState';
import { LedgerTable, type LedgerColumn } from '@/shared/ui/LedgerTable';
import { SectionHead } from '@/shared/ui/SectionHead';

/**
 * Рейтинг игры — про всех, кто доиграл хотя бы один турнир, а не про один
 * турнир. Очки за турнир: участников минус место, поэтому победа над девятью
 * весит больше победы над одним.
 */
export function Rating({ viewerId }: { viewerId: string | undefined }) {
  const t = useTranslations('tournaments');
  const { data, isLoading } = useTournamentRating();

  const columns: LedgerColumn<RatingRow>[] = [
    { key: 'place', header: t('colPlace'), align: 'right', cellClassName: 'n', width: 56, render: (x) => x.place },
    {
      key: 'name',
      header: t('colPlayer'),
      render: (x) => (x.userId === viewerId ? <strong>{x.name}</strong> : x.name),
    },
    { key: 'points', header: t('colPoints'), align: 'right', cellClassName: 'n', render: (x) => x.points },
    { key: 'tournaments', header: t('colTournaments'), align: 'right', cellClassName: 'n', render: (x) => x.tournaments },
    { key: 'wins', header: t('colWins'), align: 'right', cellClassName: 'n', render: (x) => x.wins },
  ];

  return (
    <section>
      <SectionHead title={t('ratingTitle')} />
      <p className="muted">{t('ratingLead')}</p>
      <LedgerTable
        columns={columns}
        rows={data?.rows ?? []}
        rowKey={(x) => x.userId}
        isLoading={isLoading}
        empty={<EmptyState title={t('ratingEmptyTitle')}>{t('ratingEmptyBody')}</EmptyState>}
      />
      {/* Своя строка ниже таблицы: человек за пятидесятым местом иначе не
          увидел бы себя вовсе и не понял, что рейтинг вообще про него. */}
      {data?.me && (
        <p className="muted">
          {t('ratingMe', { place: data.me.place, points: data.me.points, wins: data.me.wins })}
        </p>
      )}
    </section>
  );
}
