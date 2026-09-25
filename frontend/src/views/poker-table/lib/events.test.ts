import { describe, expect, it } from 'vitest';
import type { PokerSeat, PokerView } from '@/entities/game-table';
import type { Anchor, Ghost } from '@/widgets/card-table';
import { advance, dealOrder, initTrack } from './events';
import { BOARD_BASE, BOARD_STEP } from './motion';

const seatOf = (a: Anchor) => (typeof a === 'string' || 'at' in a ? -1 : 'seat' in a ? a.seat : a.bet);
/** Призрак словами: сброс в колоду, сбор ставки в банк, банк к месту. */
const label = (g: Ghost) =>
  g.what === 'cards' ? `muck:${seatOf(g.from)}` : g.to === 'center' ? `collect:${seatOf(g.from)}` : `win:${seatOf(g.to)}`;

const seat = (i: number, over: Partial<PokerSeat> = {}): PokerSeat => ({
  seatIndex: i,
  userId: `u${i}`,
  name: `P${i}`,
  stack: 500,
  inHand: true,
  bet: 0,
  folded: false,
  allIn: false,
  cards: i === 0 ? ['As', 'Kd'] : null,
  sitOut: false,
  isButton: false,
  isTurn: false,
  lastAction: null,
  ...over,
});

const view = (over: Partial<PokerView['hand']> & { seats: PokerSeat[] }): PokerView => {
  const { seats, ...hand } = over;
  return {
    table: {
      id: 't', name: 't', visibility: 'private', status: 'open', minBuyIn: 100, maxBuyIn: 1000,
      maxSeats: 6, bigBlind: 10, smallBlind: 5, isCreator: false,
    },
    seats,
    hand: { id: 'h1', street: 'preflop', board: [], pot: 0, currentBet: 10, deadline: null, turnMs: 20000, winners: [], ...hand },
    me: { seatIndex: 0, legal: null, sitOut: false, foldAny: false },
  };
};

describe('advance — крупье читает разницу снимков', () => {
  const pre = view({
    seats: [seat(0, { isButton: true, bet: 5, isTurn: true, stack: 495 }), seat(1, { bet: 10, stack: 490 })],
  });

  it('первый снимок страницы — без сдачи и без фраз', () => {
    const t = initTrack(pre);
    expect(t.dealtHand).toBeNull();
    expect(t.lines).toEqual([]);
  });

  it('новая раздача — сдача от колоды, без реплики', () => {
    const t = advance(initTrack({ ...pre, hand: null }), pre);
    expect(t.dealtHand).toBe('h1');
    expect(t.lines).toEqual([]);
  });

  it('колл, закрывающий улицу: ставки в банк, флоп после них, крупье объявляет улицу', () => {
    const t0 = initTrack(pre);
    const flop = view({
      street: 'flop', board: ['2c', '7d', 'Jh'], pot: 20, currentBet: 0,
      seats: [seat(0, { isButton: true, stack: 490 }), seat(1, { stack: 490, isTurn: true })],
    });
    const t = advance(t0, flop);
    expect(t.lines.map((l) => l.key)).toEqual(['flop']);
    expect(t.ghosts.filter((g) => g.to === 'center').map((g) => [seatOf(g.from), g.amount])).toEqual([
      [0, 5],
      [1, 10],
    ]);
    expect(t.board).toEqual({ '2c': BOARD_BASE, '7d': BOARD_BASE + BOARD_STEP, Jh: BOARD_BASE + 2 * BOARD_STEP });
  });

  it('обычный ход — без реплики: он подписан над местом игрока', () => {
    const next = view({
      currentBet: 30,
      seats: [seat(0, { isButton: true, bet: 30, stack: 470, lastAction: 'raise' }), seat(1, { bet: 10, stack: 490, isTurn: true })],
    });
    const t = advance(initTrack(pre), next);
    expect(t.lines).toEqual([]);
    expect(t.ghosts).toEqual([]);
  });

  it('олл-ин — крупье объявляет', () => {
    const next = view({
      currentBet: 500,
      seats: [seat(0, { isButton: true, bet: 500, stack: 0, allIn: true, lastAction: 'raise' }), seat(1, { bet: 10, stack: 490, isTurn: true })],
    });
    expect(advance(initTrack(pre), next).lines).toMatchObject([{ key: 'allIn', seat: 0 }]);
  });

  it('фолд соперника — карты в колоду, банк победителю после сбора ставок', () => {
    const start = view({
      seats: [seat(0, { isButton: true, bet: 5, stack: 495 }), seat(1, { bet: 10, stack: 490, isTurn: true })],
    });
    const done = view({
      street: 'done', pot: 15, currentBet: 0,
      winners: [{ userId: 'u0', seatIndex: 0, amount: 15, category: null }],
      seats: [seat(0, { isButton: true, stack: 510 }), seat(1, { stack: 490, folded: true, cards: [], lastAction: 'fold' })],
    });
    const t = advance(initTrack(start), done);
    expect(t.lines.map((l) => l.key)).toEqual(['wins']);
    expect(t.ghosts.map(label)).toEqual(['muck:1', 'collect:0', 'collect:1', 'win:0']);
    const win = t.ghosts.find((g) => g.from === 'center')!;
    expect(win.delay).toBe(t.winDelay);
    expect(win.delay).toBeGreaterThan(0);
  });

  it('свои карты при своём фолде в колоду не летят — они гаснут на месте', () => {
    const mine = view({ seats: [seat(0, { isTurn: true }), seat(1)] });
    const after = view({ seats: [seat(0, { folded: true, lastAction: 'fold' }), seat(1, { isTurn: true })] });
    expect(advance(initTrack(mine), after).ghosts).toEqual([]);
  });

  it('очередь фраз не длиннее трёх', () => {
    const many = [0, 1, 2, 3, 4].map((i) => seat(i, { stack: 400 }));
    const start = view({ seats: many.map((x) => ({ ...x, isTurn: x.seatIndex === 0 })) });
    const done = view({
      street: 'done',
      winners: many.map((x) => ({ userId: x.userId, seatIndex: x.seatIndex, amount: 10, category: 'pair' as const })),
      seats: many,
    });
    expect(advance(initTrack(start), done).lines).toHaveLength(3);
  });
});

describe('dealOrder', () => {
  it('три игрока — с малого блайнда, то есть с места после кнопки', () => {
    const v = view({ seats: [seat(0, { isButton: true }), seat(2), seat(4)] });
    expect([...dealOrder(v).entries()]).toEqual([
      [0, 2],
      [2, 0],
      [4, 1],
    ]);
  });

  it('хедз-ап — с кнопки: она и есть малый блайнд', () => {
    const v = view({ seats: [seat(1), seat(3, { isButton: true })] });
    expect(dealOrder(v).get(3)).toBe(0);
  });
});
