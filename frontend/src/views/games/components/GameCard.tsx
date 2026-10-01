import type { ComponentType } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { cn } from '@/shared/lib/utils/css';
import { BlackjackScene } from './BlackjackScene';
import { JetpackScene } from './JetpackScene';
import { PokerScene } from './PokerScene';
import { TradingScene } from './TradingScene';
import type { Game, GameScene } from '../model/games';

/** Пропорция картинок раздела: все они сняты в одном кадре 384×514. */
const ART_W = 384;
const ART_H = 514;

/** Сцены, нарисованные кодом вместо снимка (см. `Game.scene`). */
const SCENES: Record<GameScene, ComponentType> = {
  trading: TradingScene,
  poker: PokerScene,
  blackjack: BlackjackScene,
  jetpack: JetpackScene,
};

/**
 * Карточка игры — ровно кадр картинки (или сцены, см. `SCENES`) и название
 * слева вверху, больше ничего: ни описания, ни чипов, ни кнопки, ни бейджа
 * (решение владельца 2026-09-25). У доступной игры кликабелен весь кадр.
 */
export function GameCard({ game }: { game: Game }) {
  const t = useTranslations('games');

  const Scene = game.scene && SCENES[game.scene];

  const face = (
    <>
      {Scene ? (
        <Scene />
      ) : (
        <Image src={game.image!} alt="" width={ART_W} height={ART_H} sizes="(max-width: 767px) 92vw, 320px" />
      )}
      <div className="gcard-scrim" aria-hidden />
      <div className="gcard-head">
        <h2 className="gcard-title">{t(`items.${game.id}.title`)}</h2>
      </div>
    </>
  );

  const className = cn('gcard', `gcard-${game.accent}`, !game.available && 'gcard-soon');

  return game.available ? (
    <Link href={game.href} className={className}>
      {face}
    </Link>
  ) : (
    <article className={className}>{face}</article>
  );
}
