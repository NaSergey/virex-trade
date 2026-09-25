import type { GameTable } from '@prisma/client';
import { Card } from '../games/cards';
import { HandState, legal, potTotal } from './holdem';
import { TURN_MS } from './poker.config';

export type TableRow = GameTable;

export interface SeatRow {
  userId: string;
  seatIndex: number;
  /** Фишки за спиной по БД — вложенное в банк уже списано. */
  stack: number;
  name: string | null;
}

export interface Snapshot {
  hand: HandState | null;
  /** Id раздачи: по нему клиент отличает новую раздачу от следующего хода. */
  handId: string | null;
  deadline: number | null;
  sitOut: Set<string>;
  foldAny: Set<string>;
  lastAction: Map<string, string>;
}

/**
 * Стол глазами одного пользователя. Единственное место, решающее, какие карты
 * кому видны: свои — всегда, чужие — только на вскрытии.
 */
export function buildView(table: TableRow, seats: SeatRow[], snap: Snapshot | null, viewerId: string) {
  const hand = snap?.hand ?? null;
  const done = hand?.street === 'done';
  const shown = done ? (hand?.result?.shown ?? {}) : {};
  const toActId = hand && !done && hand.toAct !== null ? hand.players[hand.toAct].userId : null;
  const buttonId = hand ? hand.players[hand.button].userId : null;

  const outSeats = [...seats]
    .sort((a, b) => a.seatIndex - b.seatIndex)
    .map((s) => {
      const p = hand?.players.find((x) => x.userId === s.userId) ?? null;
      let cards: Card[] | null = [];
      if (p) {
        if (s.userId === viewerId || shown[s.userId]) cards = p.cards;
        else if (!p.folded) cards = null; // карты есть, но скрыты
      }
      return {
        seatIndex: s.seatIndex,
        userId: s.userId,
        name: s.name,
        stack: s.stack,
        inHand: !!p,
        bet: p && !done ? p.bet : 0,
        folded: p?.folded ?? false,
        allIn: p?.allIn ?? false,
        cards,
        sitOut: snap?.sitOut.has(s.userId) ?? false,
        isButton: s.userId === buttonId,
        isTurn: s.userId === toActId,
        lastAction: snap?.lastAction.get(s.userId) ?? null,
      };
    });

  const mine = seats.find((s) => s.userId === viewerId) ?? null;
  const bets = hand && !done ? hand.players.reduce((a, p) => a + p.bet, 0) : 0;

  return {
    table: {
      id: table.id,
      name: table.name,
      visibility: table.visibility,
      status: table.status,
      minBuyIn: table.minBuyIn,
      maxBuyIn: table.maxBuyIn,
      maxSeats: table.maxSeats,
      bigBlind: table.bigBlind ?? 0,
      smallBlind: Math.floor((table.bigBlind ?? 0) / 2),
      isCreator: table.creatorId === viewerId,
    },
    seats: outSeats,
    hand: hand
      ? {
          id: snap?.handId ?? '',
          street: hand.street,
          board: hand.board,
          /** Собранное с прошлых улиц; ставки текущей стоят у мест. */
          pot: potTotal(hand) - bets,
          currentBet: done ? 0 : hand.currentBet,
          deadline: done ? null : (snap?.deadline ?? null),
          /** Длина хода целиком — дуга таймера рисуется от неё. */
          turnMs: TURN_MS,
          winners: done
            ? (hand.result?.winners ?? []).map((w) => ({
                ...w,
                seatIndex: hand.players.find((p) => p.userId === w.userId)!.seatIndex,
              }))
            : [],
        }
      : null,
    me: {
      seatIndex: mine?.seatIndex ?? null,
      legal: hand && !done ? legal(hand, viewerId) : null,
      sitOut: snap?.sitOut.has(viewerId) ?? false,
      foldAny: snap?.foldAny.has(viewerId) ?? false,
    },
  };
}

export type PokerView = ReturnType<typeof buildView>;
