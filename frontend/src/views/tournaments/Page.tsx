'use client';

import { useTranslations } from 'next-intl';
import { PageHead } from '@/shared/ui/PageHead';
import { Wrap } from '@/shared/ui/Wrap';
import { GameCard } from './components/GameCard';
import { GAMES } from './model/games';

/**
 * Турниры — каталог игр между пользователями. Сам по себе ничего не считает:
 * это вход в игры, а у каждой игры своя страница. Общее у них одно — внутренняя
 * валюта, на которую играют; её баланс стоит в шапке, а не здесь.
 */
export function TournamentsPage() {
  const t = useTranslations('tournaments');
  return (
    <Wrap page>
      <PageHead title={t('title')} lede={t('lede')} />
      <div className="games">
        {GAMES.map((game) => (
          <GameCard key={game.id} game={game} />
        ))}
      </div>
    </Wrap>
  );
}
