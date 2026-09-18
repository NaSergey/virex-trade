import { rankParticipants } from './leaderboard';

/**
 * Место в турнире определяет эквити — депозит сессии плюс нереализованный
 * результат открытых позиций. Ничьих нет: фонд делится по местам, и два первых
 * места делить его не на что.
 */
const participant = (userId: string, over: Record<string, unknown> = {}) => ({
  userId,
  joinedAt: new Date('2026-09-18T10:00:00Z'),
  session: { balance: 10_000 },
  openTrades: [],
  mark: 70_000,
  ...over,
});

describe('rankParticipants', () => {
  it('без открытых позиций эквити равно депозиту', () => {
    const [row] = rankParticipants([participant('a')]);
    expect(row).toMatchObject({ userId: 'a', equity: 10_000, place: 1 });
  });

  it('лонг в плюсе поднимает эквити на нереализованный результат', () => {
    const [row] = rankParticipants([
      participant('a', { openTrades: [{ direction: 'long', entryPrice: 69_000, qty: 2, closedQty: 0 }] }),
    ]);
    expect(row.equity).toBeCloseTo(10_000 + (70_000 - 69_000) * 2);
  });

  it('шорт считается со своим знаком', () => {
    const [row] = rankParticipants([
      participant('a', { openTrades: [{ direction: 'short', entryPrice: 69_000, qty: 1, closedQty: 0 }] }),
    ]);
    expect(row.equity).toBeCloseTo(10_000 - (70_000 - 69_000));
  });

  it('считается только остаток: закрытая часть уже в депозите', () => {
    const [row] = rankParticipants([
      participant('a', { openTrades: [{ direction: 'long', entryPrice: 69_000, qty: 3, closedQty: 2 }] }),
    ]);
    expect(row.equity).toBeCloseTo(10_000 + (70_000 - 69_000) * 1);
  });

  it('без марк-цены открытые позиции считаются по нулю, а не выбрасывают строку', () => {
    const [row] = rankParticipants([
      participant('a', { mark: null, openTrades: [{ direction: 'long', entryPrice: 69_000, qty: 2, closedQty: 0 }] }),
    ]);
    expect(row.equity).toBe(10_000);
  });

  it('участник без сессии получает нулевое эквити и последнее место', () => {
    const rows = rankParticipants([participant('a', { session: null }), participant('b')]);
    expect(rows.map((r) => r.userId)).toEqual(['b', 'a']);
    expect(rows[1].equity).toBe(0);
  });

  it('места по эквити сверху вниз', () => {
    const rows = rankParticipants([
      participant('a', { session: { balance: 9_000 } }),
      participant('b', { session: { balance: 12_000 } }),
      participant('c', { session: { balance: 10_000 } }),
    ]);
    expect(rows.map((r) => [r.userId, r.place])).toEqual([
      ['b', 1],
      ['c', 2],
      ['a', 3],
    ]);
  });

  it('при равном эквити выше тот, кто вошёл раньше — ничьей быть не может', () => {
    const rows = rankParticipants([
      participant('late', { joinedAt: new Date('2026-09-18T11:00:00Z') }),
      participant('early', { joinedAt: new Date('2026-09-18T09:00:00Z') }),
    ]);
    expect(rows.map((r) => r.userId)).toEqual(['early', 'late']);
    expect(rows.map((r) => r.place)).toEqual([1, 2]);
  });
});
