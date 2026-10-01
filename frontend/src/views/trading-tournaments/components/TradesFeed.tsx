'use client';

import { useTranslations } from 'next-intl';
import { useTournamentFeed } from '@/entities/tournament';
import { EmptyState } from '@/shared/ui/EmptyState';
import { TradesTable } from './TradesTable';

/**
 * Сделки идущих турниров «в прямом эфире» — вторая вкладка панели игроков.
 * Закрытых турниров здесь нет, если вы в них не играете: их видно только по
 * ссылке, и сервер их не отдаёт.
 *
 * Строка ведёт в окно своего турнира — оттуда в него можно и войти, если
 * места есть. Опрос идёт, только пока вкладка открыта: компонент монтируется
 * лишь на ней.
 */
export function TradesFeed({ onOpen }: { onOpen: (tournamentId: string) => void }) {
  const t = useTranslations('tournaments');
  const { data, isLoading } = useTournamentFeed(true);

  return (
    <TradesTable
      rows={data ?? []}
      isLoading={isLoading}
      showTournament
      onRowClick={(x) => onOpen(x.tournamentId)}
      empty={<EmptyState title={t('feedEmptyTitle')}>{t('feedEmptyBody')}</EmptyState>}
    />
  );
}
