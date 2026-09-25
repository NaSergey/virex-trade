import { act, handValue, legal, newShoe, standAll, startRound, wagered } from './blackjack';

describe('newShoe', () => {
  it('шесть колод, каждая карта ровно шесть раз', () => {
    const shoe = newShoe();
    const counts = new Map<string, number>();
    for (const c of shoe) counts.set(c, (counts.get(c) ?? 0) + 1);

    expect(shoe).toHaveLength(312);
    expect(counts.size).toBe(52);
    expect([...counts.values()].every((n) => n === 6)).toBe(true);
  });
});

/**
 * Колода в тестах идёт в порядке сдачи: одному игроку — карта игрока,
 * открытая крупье, вторая карта игрока, закрытая крупье, дальше добор.
 */
const one = (bet: number, cards: string[], stack = 1000) =>
  startRound([{ userId: 'a', seatIndex: 0, stack, bet }], cards);

describe('handValue', () => {
  it.each([
    [['As', '6d'], 17, true],
    [['As', '6d', 'Kc'], 17, false],
    [['As', 'Ad'], 12, true],
    [['Kd', 'Qs', '2c'], 22, false],
    [['As', 'Kd'], 21, true],
  ])('%j → %i', (cards, total, soft) => {
    expect(handValue(cards)).toEqual({ total, soft });
  });
});

describe('startRound', () => {
  it('натуральный блэкджек платит 3:2 с округлением вниз, крупье не добирает', () => {
    const s = one(5, ['As', '9c', 'Kd', '7h', '5s']);

    expect(s.phase).toBe('done');
    expect(s.dealer).toEqual(['9c', '7h']);
    expect(s.players[0].hands[0]).toMatchObject({ outcome: 'blackjack', payout: 12 });
    expect(s.payouts).toEqual({ a: 12 });
  });

  it('блэкджек крупье кончает раунд до первого хода', () => {
    const s = one(10, ['Td', 'As', '9s', 'Kh']);

    expect(s.phase).toBe('done');
    expect(s.players[0].hands[0]).toMatchObject({ outcome: 'lose', payout: 0 });
  });

  it('блэкджек против блэкджека крупье — ничья', () => {
    const s = one(10, ['Ad', 'As', 'Kd', 'Kh']);

    expect(s.players[0].hands[0]).toMatchObject({ outcome: 'push', payout: 10 });
  });

  it('сдача и ходы — по порядку мест', () => {
    const s = startRound(
      [
        { userId: 'b', seatIndex: 3, stack: 100, bet: 10 },
        { userId: 'a', seatIndex: 1, stack: 100, bet: 10 },
      ],
      ['Td', '9d', '6c', '7d', '8d', 'Kc'],
    );

    expect(s.players.map((p) => p.userId)).toEqual(['a', 'b']);
    expect(s.players[0].hands[0].cards).toEqual(['Td', '7d']);
    expect(s.players[1].hands[0].cards).toEqual(['9d', '8d']);
    expect(s.dealer).toEqual(['6c', 'Kc']);
    expect(s.turn).toEqual({ p: 0, h: 0 });
    expect(legal(s, 'b')).toBeNull();
    expect(legal(s, 'a')).toMatchObject({ hit: true, stand: true });
  });
});

describe('act', () => {
  it('крупье стоит на мягких 17', () => {
    const s = act(one(10, ['Td', 'As', '9s', '6d', '5c']), 'a', 'stand');

    expect(s.dealer).toEqual(['As', '6d']);
    expect(s.players[0].hands[0]).toMatchObject({ outcome: 'win', payout: 20 });
  });

  it('крупье добирает до 17', () => {
    const s = act(one(10, ['Td', 'Kc', '9s', '6d', '5h']), 'a', 'stand');

    expect(s.dealer).toEqual(['Kc', '6d', '5h']);
    expect(s.players[0].hands[0]).toMatchObject({ outcome: 'lose', payout: 0 });
  });

  it('равный счёт — ничья', () => {
    const s = act(one(10, ['Td', 'Kc', '8s', '8d']), 'a', 'stand');

    expect(s.players[0].hands[0]).toMatchObject({ outcome: 'push', payout: 10 });
  });

  it('перебор крупье — выигрыш', () => {
    const s = act(one(10, ['Td', 'Kc', '8s', '6d', '9h']), 'a', 'stand');

    expect(s.dealer).toEqual(['Kc', '6d', '9h']);
    expect(s.players[0].hands[0]).toMatchObject({ outcome: 'win', payout: 20 });
  });

  it('дабл: ставка вдвое, ровно одна карта, стек уменьшается', () => {
    const s = act(one(10, ['5d', '9s', '6c', '7h', 'Kd', '2c'], 100), 'a', 'double');
    const h = s.players[0].hands[0];

    expect(h).toMatchObject({ cards: ['5d', '6c', 'Kd'], bet: 20, doubled: true, outcome: 'win', payout: 40 });
    expect(s.players[0].stack).toBe(90);
    expect(wagered(s)).toEqual({ a: 20 });
  });

  it('дабл без стека недоступен', () => {
    const s = one(10, ['5d', '9s', '6c', '7h'], 5);

    expect(legal(s, 'a')!.double).toBe(false);
    expect(() => act(s, 'a', 'double')).toThrow('ILLEGAL');
  });

  it('дабл только на двух картах', () => {
    const s = act(one(10, ['2d', '9s', '3c', '7h', '4d']), 'a', 'hit');

    expect(legal(s, 'a')!.double).toBe(false);
  });

  it('перебор кончает руку, и при одних переборах крупье не добирает', () => {
    const s = act(one(10, ['Td', '9s', '6c', '6d', 'Kh', '2c']), 'a', 'hit');

    expect(s.phase).toBe('done');
    expect(s.dealer).toEqual(['9s', '6d']);
    expect(s.players[0].hands[0]).toMatchObject({ outcome: 'bust', payout: 0 });
  });

  it('21 заканчивает руку сама', () => {
    const s = act(one(10, ['5d', '9s', '6c', '7h', 'Td', '2c']), 'a', 'hit');

    expect(s.players[0].hands[0].done).toBe(true);
    expect(s.phase).toBe('done');
  });

  it('сплит: две руки со своей ставкой, вторые карты сразу, ход на первой', () => {
    const s = act(one(10, ['8d', '9s', '8s', '7h', '3c', '2h'], 100), 'a', 'split');
    const [h1, h2] = s.players[0].hands;

    expect(h1).toMatchObject({ cards: ['8d', '3c'], bet: 10, split: true, done: false });
    expect(h2).toMatchObject({ cards: ['8s', '2h'], bet: 10, split: true, done: false });
    expect(s.players[0].stack).toBe(90);
    expect(s.turn).toEqual({ p: 0, h: 0 });
    expect(wagered(s)).toEqual({ a: 20 });
  });

  it('после сплита руки доигрываются по очереди', () => {
    let s = act(one(10, ['8d', '9s', '8s', '7h', '3c', '2h'], 100), 'a', 'split');
    s = act(s, 'a', 'stand');

    expect(s.turn).toEqual({ p: 0, h: 1 });
    expect(legal(s, 'a')!.double).toBe(true);
  });

  it('любые две десятки делятся', () => {
    expect(legal(one(10, ['Kd', '9s', 'Js', '7h']), 'a')!.split).toBe(true);
  });

  it('разные карты не делятся', () => {
    const s = one(10, ['Kd', '9s', '9c', '7h']);

    expect(legal(s, 'a')!.split).toBe(false);
    expect(() => act(s, 'a', 'split')).toThrow('ILLEGAL');
  });

  it('тузы делятся один раз, по одной карте, и 21 на них платит 1:1', () => {
    const s = act(one(10, ['Ad', '9s', 'As', '8h', 'Kc', '5h'], 100), 'a', 'split');
    const [h1, h2] = s.players[0].hands;

    expect(s.phase).toBe('done');
    expect(h1).toMatchObject({ cards: ['Ad', 'Kc'], outcome: 'win', payout: 20 });
    expect(h2).toMatchObject({ cards: ['As', '5h'], outcome: 'lose', payout: 0 });
  });

  it('не больше четырёх рук', () => {
    let s = one(10, ['8d', '9s', '8s', '7h', '8c', '8h', '8d', '2c', '3c', '4c', '5c'], 100);
    s = act(s, 'a', 'split');
    s = act(s, 'a', 'split');
    s = act(s, 'a', 'split');

    expect(s.players[0].hands).toHaveLength(4);
    expect(legal(s, 'a')!.split).toBe(false);
    expect(wagered(s)).toEqual({ a: 40 });
    expect(s.players[0].stack).toBe(70);
  });

  it('дабл в перебор: ставка всё равно удвоена и сгорает', () => {
    const s = act(one(10, ['Td', '9s', '2c', '7h', 'Kd', '2d'], 100), 'a', 'double');

    expect(s.players[0].hands[0]).toMatchObject({ bet: 20, outcome: 'bust', payout: 0 });
    expect(s.players[0].stack).toBe(90);
    expect(s.dealer).toEqual(['9s', '7h']);
  });

  it('разные исходы у нескольких игроков в одном расчёте; крупье доигрывает ради живой руки', () => {
    let s = startRound(
      [
        { userId: 'a', seatIndex: 0, stack: 100, bet: 10 },
        { userId: 'b', seatIndex: 1, stack: 100, bet: 10 },
        { userId: 'c', seatIndex: 2, stack: 100, bet: 10 },
      ],
      // a: T+6, b: A+K (блэкджек), c: T+7; крупье 9 + 7, добор 2 → 18
      ['Td', 'As', 'Tc', '9s', '6d', 'Kd', '7c', '7h', 'Qh', '2c'],
    );
    s = act(s, 'a', 'hit'); // a: 26 — перебор
    s = act(s, 'c', 'stand');

    expect(s.dealer).toEqual(['9s', '7h', '2c']);
    expect(s.payouts).toEqual({ a: 0, b: 25, c: 0 });
    expect(s.players.map((p) => p.hands[0].outcome)).toEqual(['bust', 'blackjack', 'lose']);
  });

  it('чужой ход — NOT_YOUR_TURN', () => {
    expect(() => act(one(10, ['Td', '9s', '6c', '7h']), 'b', 'hit')).toThrow('NOT_YOUR_TURN');
  });

  it('после раунда ходов нет', () => {
    const s = act(one(10, ['Td', 'Kc', '8s', '8d']), 'a', 'stand');

    expect(legal(s, 'a')).toBeNull();
    expect(() => act(s, 'a', 'hit')).toThrow('NOT_YOUR_TURN');
  });

  it('исходное состояние не меняется', () => {
    const s = one(10, ['Td', '9s', '6c', '7h', '2d']);
    const copy = structuredClone(s);

    act(s, 'a', 'hit');

    expect(s).toEqual(copy);
  });
});

describe('standAll', () => {
  const two = () =>
    startRound(
      [
        { userId: 'a', seatIndex: 0, stack: 100, bet: 10 },
        { userId: 'b', seatIndex: 1, stack: 100, bet: 10 },
      ],
      ['Td', '9d', '6c', '7d', '8d', 'Kc', '2h'],
    );

  it('все руки игрока стоят, ход уходит дальше', () => {
    const next = standAll(two(), 'a');

    expect(next.players[0].hands[0].done).toBe(true);
    expect(next.turn).toEqual({ p: 1, h: 0 });
  });

  it('руки ещё не ходившего игрока тоже стоят', () => {
    const next = standAll(two(), 'b');

    expect(next.players[1].hands[0].done).toBe(true);
    expect(next.turn).toEqual({ p: 0, h: 0 });
  });

  it('последний ход — крупье играет и платит', () => {
    const next = standAll(standAll(two(), 'a'), 'b');

    expect(next.phase).toBe('done');
    expect(next.payouts).toEqual({ a: 0, b: 0 });
  });
});
