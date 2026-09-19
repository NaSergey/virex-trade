'use client';

import { useTranslations } from 'next-intl';
import { usePublicTournaments, type PublicTournament } from '@/entities/tournament';
import { EmptyState } from '@/shared/ui/EmptyState';
import { LedgerTable, type LedgerColumn } from '@/shared/ui/LedgerTable';
import { SectionHead } from '@/shared/ui/SectionHead';

/**
 * Открытые турниры — те, кого создатель сделал публичными и где ещё есть
 * места. Закрытых здесь нет по замыслу: в них зовут ссылкой.
 */
export function PublicTournaments() {
  const t = useTranslations('tournaments');
  const tc = useTranslations('coins');
  const { data, isLoading } = usePublicTournaments();

  const columns: LedgerColumn<PublicTournament>[] = [
    { key: 'name', header: t('colName'), render: (x) => x.name },
    { key: 'creator', header: t('colCreator'), render: (x) => x.creatorName ?? '—' },
    {
      key: 'players',
      header: t('colPlayers'),
      align: 'right',
      cellClassName: 'n',
      render: (x) => `${x.players}/${x.maxPlayers}`,
    },
    {
      key: 'fee',
      header: t('colEntryFee'),
      align: 'right',
      cellClassName: 'n',
      render: (x) => (x.entryFee > 0 ? `${x.entryFee} ${tc('unit')}` : t('free')),
    },
    {
      key: 'pool',
      header: t('colPrizePool'),
      align: 'right',
      cellClassName: 'n',
      render: (x) => `${x.prizePool} ${tc('unit')}`,
    },
    {
      key: 'duration',
      header: t('colDuration'),
      align: 'right',
      render: (x) => t(`duration.${x.durationMin}`),
    },
  ];

  return (
    <section>
      <SectionHead title={t('publicTitle')} />
      <p className="muted">{t('publicLead')}</p>
      <LedgerTable
        columns={columns}
        rows={data ?? []}
        rowKey={(x) => x.id}
        isLoading={isLoading}
        rowHref={(x) => `/tournaments/trading/${x.id}`}
        empty={<EmptyState title={t('publicEmptyTitle')}>{t('publicEmptyBody')}</EmptyState>}
      />
    </section>
  );
}
