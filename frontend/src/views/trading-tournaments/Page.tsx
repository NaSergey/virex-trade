'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/features/auth';
import { PageHead } from '@/shared/ui/PageHead';
import { Wrap } from '@/shared/ui/Wrap';
import { CreateTournament } from './components/CreateTournament';
import { PublicTournaments } from './components/PublicTournaments';
import { Rating } from './components/Rating';
import { TournamentsList } from './components/TournamentsList';

/**
 * Торговый турнир — страница игры, а не всего раздела: каталог игр живёт на
 * `/tournaments`, и рядом с этой игрой со временем встанут другие.
 *
 * Слева — то, что уже идёт (мои турниры и открытые чужие), справа — создание
 * нового. Рейтинг игры внизу: он про всю игру, а не про конкретный турнир.
 */
export function TradingTournamentsPage() {
  const t = useTranslations('tournaments');
  const router = useRouter();
  const { user } = useAuth();

  return (
    <Wrap page style={{ paddingTop: 'var(--s4)' }}>
      <PageHead title={t('tradingTitle')} lede={t('tradingLede')} />
      <div className="asym">
        <div>
          <TournamentsList />
          <PublicTournaments />
        </div>
        <div className="marg">
          <CreateTournament onCreated={(id) => router.push(`/tournaments/trading/${id}`)} />
        </div>
      </div>
      <Rating viewerId={user?.id} />
    </Wrap>
  );
}
