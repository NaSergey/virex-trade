import type { GameTable } from '@prisma/client';
import { cardPoints, handValue, legal, RoundState } from './blackjack';
import { BET_MS, TURN_MS } from './blackjack.config';

export type Phase = 'idle' | 'betting' | 'playing' | 'done';

export interface SeatRow {
  userId: string;
  seatIndex: number;
  /** Фишки на месте по БД — поставленное в раунд уже списано. */
  stack: number;
  name: string | null;
}

export interface Snapshot {
  phase: Phase;
  /** Ставки открытого окна — в памяти, со стеков ещё не списаны. */
  bets: Map<string, number>;
  round: RoundState | null;
  roundId: string | null;
  deadline: number | null;
  sitOut: Set<string>;
}

/**
 * Стол блэкджека глазами одного пользователя. Карты игроков открыты всем, как
 * за настоящим столом; скрыта только закрытая карта крупье — пока раунд идёт,
 * её нет в виде вовсе, а не «есть, но спрятана».
 */
export function buildView(table: GameTable, seats: SeatRow[], snap: Snapshot | null, viewerId: string) {
  const phase = snap?.phase ?? 'idle';
  const round = snap?.round ?? null;
  const playing = round?.phase === 'playing';
  const turn = playing ? round!.turn : null;
  const turnUser = turn ? round!.players[turn.p].userId : null;
  const minBet = table.minBet ?? 0;
  const pendingOf = (userId: string) => (phase === 'betting' ? (snap!.bets.get(userId) ?? 0) : 0);

  const outSeats = [...seats]
    .sort((a, b) => a.seatIndex - b.seatIndex)
    .map((s) => {
      const p = round?.players.find((x) => x.userId === s.userId) ?? null;
      return {
        seatIndex: s.seatIndex,
        userId: s.userId,
        name: s.name,
        // В окно ставок стек показан уже без ставки: иначе число прыгало бы в
        // момент сдачи, когда ставка уходит со стека по-настоящему.
        stack: s.stack - pendingOf(s.userId),
        sitOut: snap?.sitOut.has(s.userId) ?? false,
        bet: pendingOf(s.userId),
        hands: (p?.hands ?? []).map((h) => {
          const v = handValue(h.cards);
          return {
            cards: h.cards,
            bet: h.bet,
            total: v.total,
            soft: v.soft && v.total < 21,
            doubled: h.doubled,
            outcome: h.outcome,
            payout: h.payout,
          };
        }),
        activeHand: turnUser === s.userId ? turn!.h : null,
        isTurn: turnUser === s.userId,
      };
    });

  const dealer = !round
    ? null
    : playing
      ? { cards: [round.dealer[0], null] as (string | null)[], total: cardPoints(round.dealer[0]) }
      : { cards: round.dealer as (string | null)[], total: handValue(round.dealer).total };

  const mine = seats.find((s) => s.userId === viewerId) ?? null;
  const timed = phase === 'betting' || playing;

  return {
    table: {
      id: table.id,
      name: table.name,
      visibility: table.visibility,
      status: table.status,
      minBuyIn: table.minBuyIn,
      maxBuyIn: table.maxBuyIn,
      maxSeats: table.maxSeats,
      minBet,
      maxBet: table.maxBet ?? 0,
      isCreator: table.creatorId === viewerId,
    },
    phase,
    roundId: round ? (snap?.roundId ?? null) : null,
    deadline: timed ? (snap?.deadline ?? null) : null,
    /** Длина окна ставок или хода целиком — полоса и дуга таймера рисуются от неё. */
    timerMs: phase === 'betting' ? BET_MS : TURN_MS,
    dealer,
    seats: outSeats,
    me: {
      seatIndex: mine?.seatIndex ?? null,
      sitOut: snap?.sitOut.has(viewerId) ?? false,
      bet: mine && phase === 'betting' ? (snap!.bets.get(viewerId) ?? null) : null,
      canBet: phase === 'betting' && !!mine && mine.stack >= minBet,
      legal: round && playing ? legal(round, viewerId) : null,
    },
  };
}

export type BlackjackView = ReturnType<typeof buildView>;
