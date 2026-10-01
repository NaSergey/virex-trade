import { teamOutcome, teamPrizes } from './teams';

const r = (userId: string, equity: number, place: number) => ({ userId, equity, place });

describe('teamOutcome', () => {
  it('побеждает команда с большим средним результатом, а не с большей суммой', () => {
    // A: двое по +300 (среднее +300, сумма +600). B: трое по +250 (среднее +250, сумма +750).
    const ranked = [r('a1', 10_300, 1), r('a2', 10_300, 2), r('b1', 10_250, 3), r('b2', 10_250, 4), r('b3', 10_250, 5)];
    const teamOf = new Map([['a1', 0], ['a2', 0], ['b1', 1], ['b2', 1], ['b3', 1]]);

    expect(teamOutcome(ranked, teamOf, 10_000)).toEqual({ winner: 0, averages: [300, 250] });
  });

  it('равные средние разводит лучший игрок: чья команда выше в общем ранжировании', () => {
    const ranked = [r('b1', 10_200, 1), r('a1', 10_100, 2), r('a2', 10_100, 3), r('b2', 10_000, 4)];
    const teamOf = new Map([['a1', 0], ['a2', 0], ['b1', 1], ['b2', 1]]);

    expect(teamOutcome(ranked, teamOf, 10_000).winner).toBe(1);
  });
});

describe('teamPrizes', () => {
  it('фонд поровну, остаток округления — лучшему в команде', () => {
    expect(teamPrizes(1_000, ['x', 'y', 'z'])).toEqual(
      new Map([
        ['x', 334],
        ['y', 333],
        ['z', 333],
      ]),
    );
  });

  it('сумма выплат всегда равна фонду', () => {
    const prizes = teamPrizes(997, ['a', 'b', 'c', 'd', 'e', 'f', 'g']);
    expect([...prizes.values()].reduce((s, x) => s + x, 0)).toBe(997);
  });

  it('пустой фонд — нули', () => {
    expect(teamPrizes(0, ['a', 'b'])).toEqual(new Map([['a', 0], ['b', 0]]));
  });
});

describe('teamOutcome — пустые команды', () => {
  it('без игроков с командой не падает', () => {
    expect(teamOutcome([], new Map(), 10_000)).toEqual({ winner: 0, averages: [-Infinity, -Infinity] });
  });
});
