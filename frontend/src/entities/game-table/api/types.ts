export type GameType = 'blackjack' | 'poker';
export type TableVisibility = 'private' | 'public';

/** Строка списка столов — общая для «моих» и «свободных». */
export interface GameTableRow {
  id: string;
  gameType: GameType;
  name: string;
  visibility: TableVisibility;
  status: 'open' | 'closed';
  minBuyIn: number;
  maxBuyIn: number;
  maxSeats: number;
  bigBlind: number | null;
  /** Лимиты ставки на руку — только у блэкджека. */
  minBet: number | null;
  maxBet: number | null;
  creatorId: string | null;
  creatorName?: string | null;
  players: number;
  createdAt: string;
}

export interface CreateTableInput {
  gameType: GameType;
  name: string;
  visibility: TableVisibility;
  minBuyIn: number;
  maxBuyIn: number;
  maxSeats: number;
  bigBlind?: number;
  minBet?: number;
  maxBet?: number;
}

export type Card = string;
export type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'done';
export type HandCategory =
  | 'high'
  | 'pair'
  | 'twoPair'
  | 'trips'
  | 'straight'
  | 'flush'
  | 'fullHouse'
  | 'quads'
  | 'straightFlush';

export interface PokerSeat {
  seatIndex: number;
  userId: string;
  name: string | null;
  stack: number;
  inHand: boolean;
  bet: number;
  folded: boolean;
  allIn: boolean;
  /** `null` — карты есть, но скрыты; пусто — карт нет. */
  cards: Card[] | null;
  sitOut: boolean;
  isButton: boolean;
  isTurn: boolean;
  lastAction: 'fold' | 'check' | 'call' | 'raise' | null;
}

export interface PokerLegal {
  toCall: number;
  canCheck: boolean;
  minRaiseTo: number | null;
  maxRaiseTo: number;
}

/** Стол глазами текущего пользователя — ответ REST и событие `poker_state`. */
export interface PokerView {
  table: {
    id: string;
    name: string;
    visibility: TableVisibility;
    status: 'open' | 'closed';
    minBuyIn: number;
    maxBuyIn: number;
    maxSeats: number;
    bigBlind: number;
    smallBlind: number;
    isCreator: boolean;
  };
  seats: PokerSeat[];
  hand: null | {
    /** Id раздачи — по нему видно, что началась новая, а не пришёл следующий ход. */
    id: string;
    street: Street;
    board: Card[];
    pot: number;
    currentBet: number;
    deadline: number | null;
    /** Длина хода целиком — от неё рисуется дуга таймера. */
    turnMs: number;
    winners: { userId: string; seatIndex: number; amount: number; category: HandCategory | null }[];
  };
  me: {
    seatIndex: number | null;
    legal: PokerLegal | null;
    sitOut: boolean;
    foldAny: boolean;
  };
}

export type PokerAction =
  | { type: 'fold' }
  | { type: 'check' }
  | { type: 'call' }
  | { type: 'raise'; amount: number };

export type BjPhase = 'idle' | 'betting' | 'playing' | 'done';
export type BjOutcome = 'blackjack' | 'win' | 'push' | 'lose' | 'bust';
export type BjActionType = 'hit' | 'stand' | 'double' | 'split';

export interface BjHand {
  cards: Card[];
  bet: number;
  total: number;
  /** Туз ещё считается за 11 — счёт пишется «7/17». */
  soft: boolean;
  doubled: boolean;
  outcome: BjOutcome | null;
  /** Возвращено на руку при расчёте: ставка + выигрыш. */
  payout: number;
}

export interface BjSeat {
  seatIndex: number;
  userId: string;
  name: string | null;
  /** В окно ставок — уже без поставленного. */
  stack: number;
  sitOut: boolean;
  /** Ставка открытого окна; в раунде ставки лежат на руках. */
  bet: number;
  hands: BjHand[];
  activeHand: number | null;
  isTurn: boolean;
}

export interface BjLegal {
  hit: boolean;
  stand: boolean;
  double: boolean;
  split: boolean;
}

/** Стол блэкджека глазами текущего пользователя — ответ REST и событие `blackjack_state`. */
export interface BlackjackView {
  table: {
    id: string;
    name: string;
    visibility: TableVisibility;
    status: 'open' | 'closed';
    minBuyIn: number;
    maxBuyIn: number;
    maxSeats: number;
    minBet: number;
    maxBet: number;
    isCreator: boolean;
  };
  phase: BjPhase;
  /** Id раунда — по нему видно, что сдан новый, а не пришёл следующий ход. */
  roundId: string | null;
  deadline: number | null;
  /** Длина окна ставок или хода целиком. */
  timerMs: number;
  /** `null` среди карт — закрытая карта крупье. */
  dealer: { cards: (Card | null)[]; total: number } | null;
  seats: BjSeat[];
  me: {
    seatIndex: number | null;
    sitOut: boolean;
    bet: number | null;
    canBet: boolean;
    legal: BjLegal | null;
  };
}
