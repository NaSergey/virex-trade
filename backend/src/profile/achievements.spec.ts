import { ACHIEVEMENTS, achievementsOf, type Facts } from './achievements';

const ZERO: Facts = {
  tournamentsFinished: 0,
  tournamentWins: 0,
  bestDailyRun: 0,
  maxSeasonLevel: 1,
  jetpackRounds: 0,
  jetpackBestX100: 0,
  pokerHands: 0,
  blackjackHands: 0,
  taggedTrades: 0,
  backtestSessions: 0,
  maxBalance: 1000,
};

describe('achievementsOf', () => {
  it('отдаёт все значки реестра в его порядке', () => {
    expect(achievementsOf(ZERO).map((a) => a.id)).toEqual(ACHIEVEMENTS.map((a) => a.id));
  });

  it('у нового аккаунта ни одного значка, прогресс виден', () => {
    const list = achievementsOf(ZERO);
    expect(list.every((a) => !a.earned)).toBe(true);
    expect(list.find((a) => a.id === 'rich_10k')).toEqual({ id: 'rich_10k', earned: false, value: 1000, target: 10_000 });
  });

  it('порог включительно; прогресс не выходит за цель', () => {
    const list = achievementsOf({ ...ZERO, jetpackBestX100: 1000, pokerHands: 340, tournamentWins: 1 });
    expect(list.find((a) => a.id === 'jetpack_x10')!.earned).toBe(true);
    expect(list.find((a) => a.id === 'poker_100')).toEqual({ id: 'poker_100', earned: true, value: 100, target: 100 });
    expect(list.find((a) => a.id === 'first_win')!.earned).toBe(true);
    expect(list.find((a) => a.id === 'champion')).toEqual({ id: 'champion', earned: false, value: 1, target: 10 });
  });

  it('×9.99 — ещё не ×10', () => {
    expect(achievementsOf({ ...ZERO, jetpackBestX100: 999 }).find((a) => a.id === 'jetpack_x10')!.earned).toBe(false);
  });
});
