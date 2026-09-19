'use client';

import { useTranslations } from 'next-intl';
import { useMyTournaments, type MyTournament } from '@/entities/tournament';
import { EmptyState } from '@/shared/ui/EmptyState';
import { LedgerTable, type LedgerColumn } from '@/shared/ui/LedgerTable';
import { SectionHead } from '@/shared/ui/SectionHead';

/** Турниры, где я участник. Чужие сюда не попадают — только по ссылке или из открытых. */
export function TournamentsList() {
  const t = useTranslations('tournaments');
  const tc = useTranslations('coins');
  const { data, isLoading } = useMyTournaments();

  const columns: LedgerColumn<MyTournament>[] = [
    { key: 'name', header: t('colName'), render: (x) => x.name },
    { key: 'status', header: t('colStatus'), render: (x) => t(`status.${x.status}`) },
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
      key: 'ends',
      header: t('colEnds'),
      align: 'right',
      cellClassName: 'n',
      render: (x) => (x.endsAt ? new Date(x.endsAt).toLocaleString() : '—'),
    },
  ];

  return (
    <section>
      <SectionHead title={t('myTitle')} />
      <LedgerTable
        columns={columns}
        rows={data ?? []}
        rowKey={(x) => x.id}
        isLoading={isLoading}
        rowHref={(x) => `/tournaments/trading/${x.id}`}
        empty={<EmptyState title={t('myEmptyTitle')}>{t('myEmptyBody')}</EmptyState>}
      />
    </section>
  );
}
