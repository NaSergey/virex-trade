import { describe, expect, it } from 'vitest';
import type { BjHand, BjSeat, BlackjackView } from '@/entities/game-table';
import { DEAL_FLY, DEAL_STEP, FLIP, WIN_FLY, type Cue } from '@/widgets/card-table';
import { advance, cardKey, dealerKey, initTrack, type Track } from './events';
import { COLLECT_MS, COLLECT_STEP, DEAL_BASE, WIN_HOLD } from './motion';

const hand = (cards: string[], over: Partial<BjHand> = {}): BjHand => ({
  cards,
  bet: 10,
  total: 0,
  soft: false,
  doubled: false,
  outcome: null,
  payout: 0,
  ...over,
});

const seat = (i: number, hands: BjHand[] = [], over: Partial<BjSeat> = {}): BjSeat => ({
  seatIndex: i,
  userId: `u${i}`,
  name: `P${i}`,
  stack: 490,
  sitOut: false,
  bet: 0,
  hands,
  activeHand: null,
  isTurn: false,
  ...over,
});

const view = (over: Partial<BlackjackView>): BlackjackView => ({
  table: {
    id: 't', name: 't', visibility: 'private', status: 'open', minBuyIn: 100, maxBuyIn: 1000,
    maxSeats: 7, minBet: 10, maxBet: 100, isCreator: false,
  },
  phase: 'playing',
  roundId: 'r1',
  deadline: null,
  timerMs: 20000,
  dealer: { cards: ['9s', null], total: 9 },
  seats: [],
  me: { seatIndex: 0, sitOut: false, bet: null, canBet: false, legal: null },
  ...over,
});

const betting = view({
  phase: 'betting',
  roundId: null,
  dealer: null,
  seats: [seat(0, [], { bet: 10 }), seat(2, [], { bet: 10 })],
});
const dealt = view({ seats: [seat(0, [hand(['Td', '6c'])]), seat(2, [hand(['8d', '7h'])])] });

describe('blackjack events', () => {
  it('загруженный посреди раунда стол стоит: ничего не летит', () => {
    const t = initTrack(dealt);
    expect(t.cards).toEqual({});
    expect(t.leaving).toBeNull();
  });

  it('сдача идёт по кругу после тасовки: первые карты мест, открытая крупье, вторые, закрытая — последней', () => {
    const t = advance(initTrack(betting), dealt);
    const at = (k: string) => t.cards[k].delay;

    expect(at(cardKey(0, 0, 0, 'Td'))).toBe(DEAL_BASE);
    expect(t.dealtRound).toBe('r1');
    expect(t.lines.map((l) => l.key)).toContain('noMoreBets');
    expect(at(cardKey(0, 0, 0, 'Td'))).toBeLessThan(at(cardKey(2, 0, 0, '8d')));
    expect(at(dealerKey(0, '9s'))).toBeGreaterThan(at(cardKey(2, 0, 0, '8d')));
    expect(at(cardKey(0, 0, 1, '6c'))).toBeGreaterThan(at(dealerKey(0, '9s')));
    expect(t.cards[dealerKey(1, null)]).toEqual({ kind: 'fly', delay: DEAL_BASE + 5 * DEAL_STEP });
    expect(t.cards[cardKey(2, 0, 1, '7h')]).toMatchObject({ kind: 'flyFlip' });
    // Панель хода показывается, когда легла закрытая карта крупье.
    expect(t.enter).toBe(DEAL_BASE + 5 * DEAL_STEP + DEAL_FLY);
  });

  it('обычный ход — панель без задержки', () => {
    const t0 = advance(initTrack(betting), dealt);
    const hit = view({ seats: [seat(0, [hand(['Td', '6c', '5d'])]), seat(2, [hand(['8d', '7h'])])] });
    expect(advance(t0, hit).enter).toBe(0);
  });

  it('конец раунда: крупье убирает руки по местам, свои карты последними, панель ждёт уборку', () => {
    const done = view({
      phase: 'done',
      dealer: { cards: ['9s', '7h'], total: 16 },
      seats: [
        seat(0, [hand(['Td', '8c'], { outcome: 'win', payout: 20 })]),
        seat(2, [hand(['8d', '7h', 'Kd'], { outcome: 'bust' })]),
      ],
    });
    const t = advance(advance(initTrack(dealt), done), betting);

    expect(t.leaving?.id).toBe('r1');
    expect(t.leaving?.seats.map((x) => [x.seat.seatIndex, x.delay])).toEqual([
      [0, 0],
      [2, COLLECT_STEP],
    ]);
    expect(t.leaving?.dealer).toEqual(done.dealer);
    expect(t.leaving?.dealerDelay).toBe(2 * COLLECT_STEP);
    expect(t.enter).toBe(2 * COLLECT_STEP + COLLECT_MS);

    // Окно ставок идёт своим чередом — уборка не повторяется и не пропадает.
    const bet = view({ ...betting, seats: [seat(0, [], { bet: 20 }), seat(2, [], { bet: 10 })] });
    const t2 = advance(t, bet);
    expect(t2.leaving).toBe(t.leaving);
    expect(t2.enter).toBe(0);

    // Новая сдача — убранного больше нет.
    expect(advance(t2, view({ roundId: 'r2', seats: dealt.seats })).leaving).toBeNull();
  });

  it('добор: летит только новая карта, движения сдачи сохраняются', () => {
    const t0 = advance(initTrack(betting), dealt);
    const hit = view({ seats: [seat(0, [hand(['Td', '6c', '5d'])]), seat(2, [hand(['8d', '7h'])])] });
    const t = advance(t0, hit);

    expect(t.cards[cardKey(0, 0, 2, '5d')]).toEqual({ kind: 'flyFlip', delay: 0 });
    expect(t.cards[cardKey(0, 0, 0, 'Td')]).toEqual(t0.cards[cardKey(0, 0, 0, 'Td')]);
  });

  it('сплит: вторая карта пары переезжает без полёта, новые карты летят', () => {
    const pair = view({ seats: [seat(0, [hand(['8d', '8s'])])] });
    const split = view({ seats: [seat(0, [hand(['8d', '3c']), hand(['8s', '2h'])])] });
    const t = advance(initTrack(pair), split);

    expect(Object.keys(t.cards).sort()).toEqual([cardKey(0, 0, 1, '3c'), cardKey(0, 1, 1, '2h')].sort());
  });

  it('расчёт: закрытая переворачивается, крупье добирает, потом едут деньги (`payAt`)', () => {
    const before = view({
      seats: [seat(0, [hand(['Td', '8c'])]), seat(2, [hand(['8d', '7h', 'Kd'])])],
    });
    const done = view({
      phase: 'done',
      dealer: { cards: ['9s', '7h', '8c'], total: 24 },
      seats: [
        seat(0, [hand(['Td', '8c'], { outcome: 'win', payout: 20 })], { stack: 510 }),
        seat(2, [hand(['8d', '7h', 'Kd'], { outcome: 'bust', payout: 0 })]),
      ],
    });
    const t = advance(initTrack(before), done);

    expect(t.cards[dealerKey(1, '7h')]).toEqual({ kind: 'flip', delay: 0 });
    expect(t.cards[dealerKey(2, '8c')]).toEqual({ kind: 'flyFlip', delay: FLIP });
    expect(t.payAt).toBe(FLIP + DEAL_FLY + FLIP);
    expect(t.settledRound).toBe('r1');
    expect(t.lines.map((l) => l.key)).toEqual(['dealerBust']);
  });

  it('новое окно ставок — реплика, и карты прошлого раунда уходят', () => {
    const done = view({ phase: 'done', seats: [seat(0, [hand(['Td', '8c'], { outcome: 'lose' })])] });
    const t = advance(advance(initTrack(dealt), done), betting);

    expect(t.lines.map((l) => l.key)).toContain('placeBets');
    expect(t.cards).toEqual({});
  });

  it('ушедший — крупье говорит об этом по имени', () => {
    const t = advance(initTrack(dealt), view({ seats: [seat(0, [hand(['Td', '6c'])])] }));
    expect(t.lines).toMatchObject([{ key: 'left', name: 'P2' }]);
  });
});

/** Звуки снимка словами, по времени: `deal@620`. */
const heard = (t: Track) =>
  [...t.cues].sort((a: Cue, b: Cue) => a.delay - b.delay || a.sound.localeCompare(b.sound)).map((c) => `${c.sound}@${c.delay}`);
const count = (t: Track, sound: Cue['sound']) => t.cues.filter((c) => c.sound === sound).length;

describe('blackjack cues — звук идёт за движением стола', () => {
  it('сдача: тасовка, потом каждая карта — мест и обе крупье', () => {
    const t = advance(initTrack(betting), dealt);
    expect(heard(t)[0]).toBe('shuffle@0');
    expect(count(t, 'deal')).toBe(6);
    expect(Math.min(...t.cues.filter((c) => c.sound === 'deal').map((c) => c.delay))).toBe(DEAL_BASE);
    expect(count(t, 'turn')).toBe(0);
  });

  it('мой ход после сдачи — сигнал вместе с панелью хода', () => {
    const mine = view({ seats: [seat(0, [hand(['Td', '6c'])], { isTurn: true }), seat(2, [hand(['8d', '7h'])])] });
    const t = advance(initTrack(betting), mine);
    expect(t.cues).toContainEqual({ sound: 'turn', delay: t.enter });
  });

  it('один за столом — стол ждёт его сам, сигнала хода нет', () => {
    const solo = view({ seats: [seat(0, [], { bet: 10 })], phase: 'betting', roundId: null, dealer: null });
    const mine = view({ seats: [seat(0, [hand(['Td', '6c'])], { isTurn: true })] });
    expect(count(advance(initTrack(solo), mine), 'turn')).toBe(0);
  });

  it('ставка соседа в окне звучит, своя — нет: она звучит, когда долетели фишки из панели', () => {
    const empty = view({ ...betting, seats: [seat(0), seat(2)] });
    const both = view({ ...betting, seats: [seat(0, [], { bet: 10 }), seat(2, [], { bet: 10 })] });
    expect(heard(advance(initTrack(empty), both))).toEqual(['chip@0']);
  });

  it('дабл — к ставке добавились фишки', () => {
    const doubled = view({
      seats: [seat(0, [hand(['Td', '6c', '5d'], { bet: 20, doubled: true })]), seat(2, [hand(['8d', '7h'])])],
    });
    const t = advance(initTrack(dealt), doubled);
    expect(heard(t)).toEqual(['chip@0', 'deal@0']);
  });

  it('расчёт: закрытая щёлкает, добор шуршит, проигранное уезжает, выигрыш прилетает и уходит в плашку', () => {
    const before = view({ seats: [seat(0, [hand(['Td', '8c'])]), seat(2, [hand(['8d', '7h', 'Kd'])])] });
    const done = view({
      phase: 'done',
      dealer: { cards: ['9s', '7h', '8c'], total: 24 },
      seats: [
        seat(0, [hand(['Td', '8c'], { outcome: 'win', payout: 20 })], { stack: 510 }),
        seat(2, [hand(['8d', '7h', 'Kd'], { outcome: 'bust', payout: 0 })]),
      ],
    });
    const t = advance(initTrack(before), done);
    const pay = t.payAt;
    expect(heard(t)).toEqual([
      'flip@0',
      `deal@${FLIP}`,
      `sweep@${pay}`,
      `win@${pay + WIN_FLY}`,
      `sweep@${pay + WIN_FLY + WIN_HOLD}`,
    ]);
  });

  it('уборка стола: руки уезжают к колоде место за местом, карты крупье последними', () => {
    const done = view({
      phase: 'done',
      dealer: { cards: ['9s', '7h'], total: 16 },
      seats: [seat(0, [hand(['Td', '8c'], { outcome: 'win', payout: 20 })]), seat(2, [hand(['8d', '7h', 'Kd'], { outcome: 'bust' })])],
    });
    const open = view({ ...betting, seats: [seat(0), seat(2)] });
    const t = advance(advance(initTrack(dealt), done), open);
    expect(heard(t)).toEqual(['fold@0', `fold@${COLLECT_STEP}`, `fold@${2 * COLLECT_STEP}`]);
  });
});
