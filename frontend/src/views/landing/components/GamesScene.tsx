'use client';

import { useTranslations } from 'next-intl';
import { Wrap } from '@/shared/ui/Wrap';
import { GAMES, GameCard } from '@/widgets/game-cards';
import { SceneHead } from './SceneHead';

/**
 * «Игры» на главной площадки — настоящие карточки витрины, а не снимки. Фраза в шапке
 * обязательна: игры стоят в одном продукте с настоящими деньгами, и первый экран должен
 * сказать словами, что играют на монеты.
 *
 * Клик ведёт к форме регистрации с `next` в эту игру: якорь крутит Lenis, адрес меняется
 * без перехода, и форма читает его как обычно. Запросов к API у секции нет: гостю они
 * вернули бы 401.
 */
export function GamesScene({ onRegister }: { onRegister: () => void }) {
  const t = useTranslations('landing');

  const pick = (href: string) => {
    onRegister();
    const query = new URLSearchParams(window.location.search);
    query.set('auth', 'register');
    query.set('next', href);
    window.history.replaceState(null, '', `${window.location.pathname}?${query}`);
  };

  return (
    <section className="ls-games" id="games" aria-labelledby="games-title">
      <div className="ls-games-in">
        <Wrap>
          <SceneHead kicker={t('navGames')} kickerId="games-title" lede={t('gamesLede')} />
          <div className="games-page gcards">
            {GAMES.map((game) => (
              <GameCard key={game.id} game={game} link={{ href: '#register', onClick: () => pick(game.href) }} />
            ))}
          </div>
        </Wrap>
      </div>
    </section>
  );
}
