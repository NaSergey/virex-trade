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
 * Карточка игры — ровно кадр картинки (или сцены, см. `SCENES`), без
 * зоны текста под ним: раньше здесь всегда стояли название, описание, чипы и
 * кнопка, и витрина читалась плиткой каталога, а не рядом кадров.
 *
 * Название заняло место прежнего номера ряда, слева вверху — карточка сама
 * называет себя, и открывать для этого целый корпус текста не нужно. Бейдж
 * «Скоро» стоит справа на той же строке у ненаписанных игр; у готовой он не
 * нужен — сцена и рабочий переход доказывают доступность сами.
 *
 * Описание, чипы и вход — в `.gcard-reveal`, тёмной подложке поверх нижней
 * части кадра, и видны по наведению или фокусу: они не пропадают из DOM
 * (только `opacity`), поэтому скринридер получает их без наведения. На
 * тачскрине наводить нечем, поэтому у доступной игры кликабелен весь кадр —
 * переход не заперт за состоянием, которого там не бывает.
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
        {/* Готовая игра сама доказывает себя сценой/переходом — метка «Доступно»
            рядом с единственной работающей игрой раздела лишняя. «Скоро» у
            остальных остаётся: без неё их кнопка выглядела бы сломанной. */}
        {!game.available && <span className="gbadge">{t('soon')}</span>}
      </div>
      <div className="gcard-reveal">
        <p className="gcard-lede">{t(`items.${game.id}.description`)}</p>
        <ul className="gchips">
          {game.tags.map((tag) => (
            <li key={tag} className="gchip">
              {t(`tags.${tag}`)}
            </li>
          ))}
        </ul>
        {game.available ? (
          <span className="gbtn gbtn-solid">
            {t('play')} <span aria-hidden>→</span>
          </span>
        ) : (
          <span className="gbtn gbtn-off">{t('soon')}</span>
        )}
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
