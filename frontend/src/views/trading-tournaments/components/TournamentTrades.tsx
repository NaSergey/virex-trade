'use client';

import { useTranslations } from 'next-intl';
import { useTournamentTrades, type TournamentDetail } from '@/entities/tournament';
import { EmptyState } from '@/shared/ui/EmptyState';
import { SectionHead } from '@/shared/ui/SectionHead';
import { TradesTable } from './TradesTable';

/**
 * Сделки одного турнира в его окне — то, ради чего жмут «Смотреть» (решение
 * владельца 2026-09-26). У идущего опрашиваются, у завершённого стоят: там
 * они уже не меняются, и это просто разбор итогов.
 */
export function TournamentTrades({ detail }: { detail: TournamentDetail }) {
  const t = useTranslations('tournaments');
  const { id, status } = detail.tournament;
  const { data, isLoading } = useTournamentTrades(id, status === 'running');

  return (
    <section className="tsect">
      <SectionHead title={t('tradesTitle')} />
      <TradesTable
        rows={data ?? []}
        isLoading={isLoading}
        showTournament={false}
        empty={<EmptyState title={t('tradesEmptyTitle')}>{t('tradesEmptyBody')}</EmptyState>}
      />
    </section>
  );
}
