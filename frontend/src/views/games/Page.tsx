'use client';

import { Wrap } from '@/shared/ui/Wrap';
import { GameCard } from './components/GameCard';
import { GamesHero } from './components/GamesHero';
import { PlatformBanner } from './components/PlatformBanner';
import { StatsBar } from './components/StatsBar';
import { GAMES } from './model/games';

/**
 * Игры — витрина раздела, а не игра. Сама по себе ничего не считает: это вход
 * в игры, а у каждой игры своя страница со своими правилами и своим списком
 * турниров. Общее у них одно — внутренняя валюта, на которую играют; её баланс
 * стоит в шапке продукта, а не здесь: тратят монеты внутри игр, а видеть
 * остаток надо с любой страницы.
 *
 * Страница идёт сверху вниз одним рассказом: что здесь происходит (герой) → во
 * что можно играть (карточки) → зачем это собрано вместе (платформа) → чем
 * раздел является в цифрах. Порядок держит человека, пришедшего из журнала
 * сделок: он не искал игру, ему её показывают.
 *
 * Цветная заливка (`.games-bg`) — отдельный слой под всей страницей, а не фон
 * блоков: в разделе меняется обстановка, а не оформление одного блока, и
 * наливается она при заходе сюда. Слой фиксированный, поэтому не уезжает при
 * прокрутке и не участвует в раскладке.
 */
export function GamesPage() {
  const playable = GAMES.find((g) => g.available);
  return (
    <>
      <div className="games-bg" aria-hidden />
      <Wrap page className="games-page">
        {/* Баннер и карточки — ровно окно под шапкой (.gfirst). */}
        <div className="gfirst">
          <GamesHero playHref={playable?.href} />
          <div className="gcards">
            {GAMES.map((game) => (
              <GameCard key={game.id} game={game} />
            ))}
          </div>
        </div>
        <PlatformBanner />
        <StatsBar />
      </Wrap>
    </>
  );
}
