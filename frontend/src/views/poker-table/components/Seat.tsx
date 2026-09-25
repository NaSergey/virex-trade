'use client';

import type { CSSProperties } from 'react';
import { useTranslations } from 'next-intl';
import type { PokerSeat } from '@/entities/game-table';
import { cn } from '@/shared/lib/utils/css';
import {
  betPoint,
  ChipStack,
  DEAL_FLY,
  DEAL_STEP,
  DEALER,
  offsetFrom,
  PlayingCard,
  SeatPlate,
  WIN_FLY,
  type CardMotion,
  type SeatPoint,
} from '@/widgets/card-table';

/** Как это место видит текущую раздачу — всё, что нужно для движения. */
export interface SeatMotion {
  handId: string | null;
  /** Сдачу этой раздачи видели вживую: карты летят от колоды. */
  dealt: boolean;
  /** Место этого игрока в порядке сдачи и сколько игроков в раздаче. */
  order: number;
  players: number;
  /** Когда переворачивать чужие карты на вскрытии. */
  revealDelay: number;
  /** Когда к этому месту долетит банк. */
  winDelay: number;
}

/**
 * Место за покерным столом: плашка (`SeatPlate` — инициалы, стек, дуга
 * таймера), карманные карты над ней, ставка — ближе к центру стола.
 *
 * Всё движение места — от крупье и к нему: карты прилетают от колоды по
 * кругу, как их сдаёт живой крупье (своя переворачивается на месте), ставка
 * съезжает от игрока к центру, выигрыш досчитывается в стеке, когда до места
 * долетели фишки банка.
 */
export function Seat({
  seat,
  at,
  me,
  street,
  deadline,
  turnMs,
  win,
  motion,
}: {
  seat: PokerSeat;
  at: SeatPoint;
  me: boolean;
  street: string | null;
  deadline: number | null;
  turnMs: number;
  win: { amount: number; category: string | null } | null;
  motion: SeatMotion;
}) {
  const t = useTranslations('poker');
  const tc = useTranslations('cardTable');
  const label = seat.name ?? tc('player', { n: seat.seatIndex + 1 });
  const bet = betPoint(at);
  const fromDealer = offsetFrom(DEALER, at);
  const fromSeat = offsetFrom(at, bet);
  const winDelay = win ? motion.winDelay + WIN_FLY : 0;

  // Карта за картой по кругу: сначала первая всем, потом вторая всем.
  const dealDelay = (round: number) => (round * motion.players + motion.order) * DEAL_STEP;
  const cardMotion = (round: number): CardMotion | undefined => {
    if (seat.cards === null || !seat.cards.length) {
      return motion.dealt ? { kind: 'fly', ...fromDealer, delay: dealDelay(round) } : undefined;
    }
    if (me) {
      if (!motion.dealt) return undefined;
      // Свои карты переворачиваются, когда долетела последняя карта сдачи.
      return { kind: 'flyFlip', ...fromDealer, delay: dealDelay(round) };
    }
    return { kind: 'flip', delay: motion.revealDelay };
  };

  const status = win
    ? `+${win.amount.toLocaleString()}`
    : seat.folded
      ? t('act.fold')
      : seat.allIn
        ? t('allIn')
        : seat.sitOut && !seat.inHand
          ? tc('sitOut')
          : seat.lastAction
            ? t(`act.${seat.lastAction}`)
            : null;

  const hole =
    seat.cards === null ? [null, null] : seat.cards.length ? seat.cards : [];

  return (
    <>
      <div
        className={cn('ct-seat', me && 'ct-me', seat.folded && 'pk-folded', seat.isTurn && 'ct-turn', win && 'ct-win')}
        style={{ left: `${at.x}%`, top: `${at.y}%`, '--win-delay': `${winDelay}ms` } as CSSProperties}
      >
        {hole.length > 0 && (
          <div className="pk-hole">
            {hole.map((c, i) => (
              <PlayingCard
                key={`${motion.handId}:${c ?? `b${i}`}`}
                card={c ?? undefined}
                size={me ? 'md' : 'sm'}
                dim={seat.folded}
                motion={cardMotion(i)}
              />
            ))}
          </div>
        )}
        <SeatPlate
          label={label}
          name={seat.name}
          stack={seat.stack}
          stackDelay={winDelay}
          turn={seat.isTurn && deadline ? { deadline, turnMs } : null}
        >
          {/* На правом краю своей плашки, а не на сукне: карты лежат над
              плашкой, и сюда кнопка не попадает никогда. На сукне она
              ложилась то на карты, то на ставку соседа — за столом на двоих
              ставки обоих мест сходятся к середине низа. */}
          {seat.isButton && (
            <span key={`btn:${motion.handId}`} className="pk-dealer" style={{ animationDelay: `${DEAL_FLY}ms` }}>
              D
            </span>
          )}
        </SeatPlate>
        {status && (
          <span
            key={`${motion.handId}:${street}:${status}`}
            className={cn('ct-status', win && 'pos')}
            style={win ? { animationDelay: `${winDelay}ms` } : undefined}
          >
            {status}
          </span>
        )}
        {win?.category && (
          <span className="pk-hand" style={{ animationDelay: `${winDelay}ms` }}>
            {t(`hands.${win.category}`)}
          </span>
        )}
      </div>
      {seat.bet > 0 && (
        <span
          key={`${motion.handId}:${street}:${seat.bet}`}
          className="ct-bet n"
          style={{ left: `${bet.x}%`, top: `${bet.y}%`, '--dx': fromSeat.dx, '--dy': fromSeat.dy } as CSSProperties}
        >
          <ChipStack amount={seat.bet} />
          <span>{seat.bet.toLocaleString()}</span>
        </span>
      )}
    </>
  );
}
