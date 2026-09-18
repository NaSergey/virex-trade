'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { Game } from '../model/games';

/**
 * Одна игра каталога: название, строка о том, во что тут играют, и справа —
 * вход. Доступная игра целиком ссылка (её открывают в новой вкладке, как и
 * разделы в шапке); недоступная — просто строка с пометкой «Скоро»: ссылка на
 * несуществующий адрес хуже честного ожидания.
 */
export function GameCard({ game }: { game: Game }) {
  const t = useTranslations('tournaments');
  const body = (
    <>
      <div>
        <h2>{t(`games.${game.id}.title`)}</h2>
        <p>{t(`games.${game.id}.description`)}</p>
      </div>
      <span className={game.available ? 'game-go' : 'game-go subtle'}>
        {game.available ? `${t('open')} →` : t('soon')}
      </span>
    </>
  );

  return game.available ? (
    <Link href={game.href} className="game game-link">
      {body}
    </Link>
  ) : (
    <div className="game game-off">{body}</div>
  );
}
