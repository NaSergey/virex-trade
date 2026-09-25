import { buildView, RuntimeBet, Snapshot } from './jetpack-view';
import { BETS_SHOWN } from './jetpack.config';

const bet = (userId: string, amount: number, over: Partial<RuntimeBet> = {}): RuntimeBet => ({
  id: `b-${userId}`,
  userId,
  name: userId.toUpperCase(),
  amount,
  autoX100: null,
  cashoutX100: null,
  payout: null,
  ...over,
});

const snap = (over: Partial<Snapshot>): Snapshot => ({
  phase: 'idle',
  roundId: 'r',
  launchAt: null,
  launchedAt: null,
  crashX100: null,
  history: [],
  bets: [],
  ...over,
});

describe('buildView', () => {
  it('точки краша нет в виде, пока ракета летит', () => {
    const v = buildView(snap({ phase: 'flying', launchedAt: 10, crashX100: 250 }), 'a', 20);
    expect(v.crashX100).toBeNull();
    expect(v.launchedAt).toBe(10);
  });

  it('после краша точка видна', () => {
    const v = buildView(snap({ phase: 'crashed', launchedAt: 10, crashX100: 250 }), 'a', 20);
    expect(v.crashX100).toBe(250);
  });

  it('отсчёт до взлёта — только в окне ставок', () => {
    expect(buildView(snap({ phase: 'betting', launchAt: 99 }), 'a', 1).launchAt).toBe(99);
    expect(buildView(snap({ phase: 'flying', launchAt: 99, launchedAt: 5 }), 'a', 6).launchAt).toBeNull();
  });

  it('чужой автовывод не виден, свой — виден', () => {
    const v = buildView(
      snap({ phase: 'flying', bets: [bet('a', 5, { autoX100: 300 }), bet('b', 9, { autoX100: 200 })] }),
      'a',
      1,
    );
    expect(v.me).toEqual({ amount: 5, autoX100: 300, cashoutX100: null, payout: null });
    for (const row of v.bets) expect(row).not.toHaveProperty('autoX100');
  });

  it('своя строка первой, дальше по сумме', () => {
    const v = buildView(snap({ bets: [bet('a', 5), bet('b', 9), bet('c', 20)] }), 'a', 1);
    expect(v.bets.map((r) => [r.name, r.mine])).toEqual([
      ['A', true],
      ['C', false],
      ['B', false],
    ]);
  });

  it('список обрезан, счётчики — по всем', () => {
    const bets = Array.from({ length: BETS_SHOWN + 5 }, (_, i) => bet(`u${i}`, 1));
    const v = buildView(snap({ bets }), 'x', 1);
    expect(v.bets).toHaveLength(BETS_SHOWN);
    expect(v.players).toBe(BETS_SHOWN + 5);
    expect(v.totalBet).toBe(BETS_SHOWN + 5);
    expect(v.me).toBeNull();
  });

  it('несёт серверное время и темп', () => {
    const v = buildView(snap({}), 'a', 1234);
    expect(v.serverNow).toBe(1234);
    expect(v.rate).toBeGreaterThan(0);
  });
});
