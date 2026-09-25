import type { CSSProperties } from 'react';
import { cn } from '@/shared/lib/utils/css';

const SUIT_GLYPH: Record<string, string> = { s: '♠', h: '♥', d: '♦', c: '♣' };

type Size = 'sm' | 'md' | 'lg';

/**
 * Движение карты:
 * - `fly` — прилетает от колоды рубашкой (чужая карта при сдаче);
 * - `flyFlip` — прилетает рубашкой и переворачивается на месте (своя карта,
 *   карта борда);
 * - `flip` — переворачивается на месте (чужая карта на вскрытии).
 * `dx`/`dy` — откуда летит, относительно своего места, в долях сцены.
 */
export interface CardMotion {
  kind: 'fly' | 'flyFlip' | 'flip';
  dx?: string;
  dy?: string;
  delay: number;
}

const motionStyle = (m: CardMotion) =>
  ({ '--dx': m.dx ?? '0', '--dy': m.dy ?? '0', animationDelay: `${m.delay}ms` }) as CSSProperties;

/**
 * Карта. Колода четырёхцветная, как в покерных клиентах: пики, червы, бубны
 * и трефы различаются заливкой, и борд читается с одного взгляда. Рисунок —
 * SVG на общих определениях стола (`TableDefs`): векторные масти, блик,
 * тонкая рамка. `card` пустой — рубашка (карта есть, но не моя).
 */
export function PlayingCard({
  card,
  size = 'md',
  dim,
  motion,
}: {
  card?: string;
  size?: Size;
  dim?: boolean;
  motion?: CardMotion;
}) {
  // Переворот — две грани в одной обёртке: лицо и рубашка спиной к спине.
  if (card && motion && motion.kind !== 'fly') {
    return (
      <span
        className={cn('ct-flip', `ct-${size}`, motion.kind === 'flyFlip' ? 'ct-flip-fly' : 'ct-flip-only', dim && 'ct-dim')}
        style={motionStyle(motion)}
      >
        <Face card={card} size={size} />
        <CardBack size={size} className="ct-face-back" />
      </span>
    );
  }
  if (!card) {
    return (
      <CardBack
        size={size}
        className={cn(dim && 'ct-dim', motion && 'ct-fly')}
        style={motion ? motionStyle(motion) : undefined}
      />
    );
  }
  return <Face card={card} size={size} dim={dim} />;
}

function Face({ card, size, dim }: { card: string; size: Size; dim?: boolean }) {
  const rank = card[0] === 'T' ? '10' : card[0];
  const suit = card[1];
  const wide = rank.length > 1;
  return (
    <span className={cn('ct-card', `ct-${size}`, dim && 'ct-dim')} aria-label={`${rank}${SUIT_GLYPH[suit]}`}>
      <svg viewBox="0 0 100 140" aria-hidden>
        <rect width="100" height="140" rx="10" fill={`url(#ct-card-${suit})`} />
        <rect width="100" height="72" rx="10" fill="url(#ct-gloss)" />
        <rect x="3.5" y="3.5" width="93" height="133" rx="7" fill="none" stroke="#fff" strokeOpacity="0.22" strokeWidth="1.5" />
        {size === 'sm' ? (
          // Мелкая карта у чужого места: ранг и масть крупно по центру — углы
          // на двадцати пикселях уже не читаются.
          <>
            <text x="50" y="66" textAnchor="middle" className="ct-rank" fontSize={wide ? 50 : 60}>
              {rank}
            </text>
            <use href={`#ct-suit-${suit}`} x="30" y="78" width="40" height="40" fill="#fff" />
          </>
        ) : (
          <>
            <text x={wide ? 8 : 11} y="37" className="ct-rank" fontSize={wide ? 30 : 36} letterSpacing={wide ? -2 : 0}>
              {rank}
            </text>
            <use href={`#ct-suit-${suit}`} x="9" y="44" width="22" height="22" fill="#fff" />
            <use href={`#ct-suit-${suit}`} x="44" y="66" width="50" height="50" fill="#fff" fillOpacity="0.95" />
          </>
        )}
      </svg>
    </span>
  );
}

/** Рубашка: тёмно-красное поле в косой сетке и рамка. */
export function CardBack({ size = 'md', className, style }: { size?: Size; className?: string; style?: CSSProperties }) {
  return (
    <span className={cn('ct-card ct-back', `ct-${size}`, className)} style={style} aria-hidden>
      <svg viewBox="0 0 100 140">
        <rect width="100" height="140" rx="10" fill="url(#ct-back)" />
        <rect x="7" y="7" width="86" height="126" rx="6" fill="url(#ct-back-lattice)" />
        <rect x="7" y="7" width="86" height="126" rx="6" fill="none" stroke="#fff" strokeOpacity="0.45" strokeWidth="1.5" />
        <rect width="100" height="72" rx="10" fill="url(#ct-gloss)" />
      </svg>
    </span>
  );
}

/** Пустое место борда — ещё не открытая карта. */
export function CardSlot() {
  return <span className="ct-card ct-slot ct-lg" aria-hidden />;
}
