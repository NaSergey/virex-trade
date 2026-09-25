import { startRound } from './blackjack';
import { buildView, Snapshot } from './blackjack-view';

const TABLE = {
  id: 't',
  gameType: 'blackjack',
  name: 'T',
  visibility: 'private',
  status: 'open',
  minBuyIn: 100,
  maxBuyIn: 1000,
  maxSeats: 7,
  bigBlind: null,
  minBet: 10,
  maxBet: 100,
  creatorId: 'a',
  createdAt: new Date(),
  closedAt: null,
} as never;

const SEATS = [
  { userId: 'a', seatIndex: 0, stack: 500, name: 'A' },
  { userId: 'b', seatIndex: 2, stack: 5, name: null },
];

const snap = (over: Partial<Snapshot>): Snapshot => ({
  phase: 'idle',
  bets: new Map(),
  round: null,
  roundId: null,
  deadline: null,
  sitOut: new Set(),
  ...over,
});

describe('buildView', () => {
  it('в окно ставок стек показан уже без ставки', () => {
    const v = buildView(TABLE, SEATS, snap({ phase: 'betting', bets: new Map([['a', 50]]), deadline: 1 }), 'a');

    expect(v.seats[0]).toMatchObject({ stack: 450, bet: 50 });
    expect(v.me).toMatchObject({ seatIndex: 0, bet: 50, canBet: true });
    expect(v.deadline).toBe(1);
  });

  it('ставить нельзя тому, у кого стек меньше минимальной ставки', () => {
    const v = buildView(TABLE, SEATS, snap({ phase: 'betting', deadline: 1 }), 'b');

    expect(v.me.canBet).toBe(false);
  });

  it('закрытой карты крупье в виде нет, пока раунд идёт', () => {
    const round = startRound([{ userId: 'a', seatIndex: 0, stack: 450, bet: 50 }], ['Td', '9s', '6c', '7h', '5d']);
    const v = buildView(TABLE, SEATS, snap({ phase: 'playing', round, roundId: 'r1', deadline: 1 }), 'b');

    expect(v.dealer).toEqual({ cards: ['9s', null], total: 9 });
    expect(JSON.stringify(v)).not.toContain('7h');
    expect(v.seats[0].hands[0]).toMatchObject({ cards: ['Td', '6c'], total: 16, bet: 50 });
    expect(v.seats[0]).toMatchObject({ isTurn: true, activeHand: 0 });
    expect(v.me.legal).toBeNull();
  });

  it('ходы видит только тот, чей ход', () => {
    const round = startRound([{ userId: 'a', seatIndex: 0, stack: 450, bet: 50 }], ['Td', '9s', '6c', '7h', '5d']);
    const v = buildView(TABLE, SEATS, snap({ phase: 'playing', round, roundId: 'r1', deadline: 1 }), 'a');

    expect(v.me.legal).toMatchObject({ hit: true, stand: true, double: true, split: false });
  });

  it('после расчёта крупье вскрыт и у рук есть исход', () => {
    const round = startRound([{ userId: 'a', seatIndex: 0, stack: 450, bet: 50 }], ['As', '9s', 'Kd', '7h']);
    const v = buildView(TABLE, SEATS, snap({ phase: 'done', round, roundId: 'r1' }), 'a');

    expect(v.dealer).toEqual({ cards: ['9s', '7h'], total: 16 });
    expect(v.seats[0].hands[0]).toMatchObject({ outcome: 'blackjack', payout: 125 });
    expect(v.deadline).toBeNull();
    expect(v.roundId).toBe('r1');
  });
});
