'use client';

import type { CSSProperties } from 'react';
import type { BlackjackView } from '@/entities/game-table';
import { cn } from '@/shared/lib/utils/css';
import { DEAL_FLY, DEALER, FLIP, offsetFrom, PlayingCard } from '@/widgets/card-table';
import { dealerKey, type CardMove, type Leaving } from '../lib/events';
import { DEALER_HAND } from '../lib/motion';

/** Когда карта легла и видна лицом — с этой задержкой появляется счёт. */
const settledAt = (m: CardMove | undefined) => (m ? m.delay + (m.kind === 'flip' ? FLIP : DEAL_FLY + FLIP) : 0);

/**
 * Рука крупье в центре сукна — главное, на что смотрит стол, поэтому карты
 * крупные. Закрытая карта (`null`) лежит рубашкой; вскрывшись, она меняет
 * ключ и переворачивается на месте. Счёт появляется, когда легла последняя
 * карта, а не когда пришёл снимок. Раунд убран — свои карты крупье уносит в
 * колоду последними, после рук мест (`leaving`). Высота постоянная и без
 * раунда: иначе центр сукна прыгал бы на каждой сдаче.
 */
export function DealerHand({
  dealer,
  roundId,
  moves,
  leaving,
}: {
  dealer: BlackjackView['dealer'];
  roundId: string | null;
  moves: Record<string, CardMove>;
  leaving: Leaving | null;
}) {
  const from = offsetFrom(DEALER, DEALER_HAND);
  const out = !dealer && leaving?.dealer ? leaving : null;
  const shown = out ? out.dealer : dealer;
  const roundKey = out ? out.id : roundId;
  const cards = shown?.cards ?? [];
  const keys = cards.map((c, i) => dealerKey(i, c));
  const shownAt = Math.max(0, ...keys.map((k) => settledAt(moves[k])));

  return (
    <div
      className={cn('bj-dealer', out && 'bj-leaving')}
      style={{ '--dx': from.dx, '--dy': from.dy, '--collect-delay': `${out?.dealerDelay ?? 0}ms` } as CSSProperties}
    >
      <div className="bj-cards">
        {cards.map((c, i) => {
          const m = out ? undefined : moves[keys[i]];
          return (
            <PlayingCard
              key={`${roundKey}:${keys[i]}`}
              card={c ?? undefined}
              size="lg"
              motion={m ? { kind: m.kind, ...from, delay: m.delay } : undefined}
            />
          );
        })}
      </div>
      {shown && (
        <span key={`${roundKey}:${shown.total}`} className="bj-total n" style={{ animationDelay: `${shownAt}ms` }}>
          {shown.total}
        </span>
      )}
    </div>
  );
}
