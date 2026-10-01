'use client';

import { useTranslations } from 'next-intl';
import { useTournament } from '@/entities/tournament';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { Skeleton } from '@/shared/ui/Skeleton';
import { InviteLink } from './InviteLink';
import { Participants } from './Participants';
import { TournamentHead } from './TournamentHead';
import { TournamentTrades } from './TournamentTrades';
import { Winners } from './Winners';

/**
 * Турнир без терминала и без действий: условия, ссылка-приглашение, состав,
 * сводка и сделки. Всё, что с турниром можно сделать, стоит подвалом окна
 * (`TournamentActions`) — здесь только то, что читают.
 *
 * Терминал сюда не входит намеренно: ему нужен весь экран, и в окне на 860
 * пикселей от него не осталось бы графика. Поэтому «Торговать» — не режим, а
 * переход на `/games/trading/<id>`, где терминал и живёт.
 */
export function TournamentView({ id }: { id: string }) {
  const t = useTranslations('tournaments');
  const { data, error } = useTournament(id);

  if (error) return <ErrorNote error={error} fallback={t('loadFailed')} />;
  if (!data) return <Skeleton height={200} />;

  const { status } = data.tournament;

  return (
    <>
      <TournamentHead detail={data} />
      {status === 'lobby' && data.isParticipant && <InviteLink id={id} />}
      {status === 'finished' ? <Winners detail={data} /> : <Participants detail={data} />}
      {/* Сделки есть только у турнира, который шёл: в наборе и у отменённого
          сессий нет. */}
      {(status === 'running' || status === 'finished') && <TournamentTrades detail={data} />}
    </>
  );
}
