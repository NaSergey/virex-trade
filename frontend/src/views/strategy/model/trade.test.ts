import { describe, expect, it } from 'vitest';
import type { TradeRow } from '../api/types';
import { fmtDuration, fmtMove, levelLines, moveOf, planMoveOf } from './trade';

const trade = (over: Partial<TradeRow> = {}) =>
  ({
    dir: 1,
    avgEntry: 100,
    entries: [102, 100, 98, 96],
    stop: 94,
    finalStop: 100,
    takes: [110, 120, 130],
    filled: 2,
    takesHit: 1,
    outcome: 'trail',
    ...over,
  }) as TradeRow;

describe('ход цены', () => {
  it('в сторону сделки — плюс, у шорта зеркально', () => {
    expect(moveOf(trade(), 110)).toBeCloseTo(0.1);
    expect(moveOf(trade({ dir: -1 }), 110)).toBeCloseTo(-0.1);
    expect(planMoveOf(trade(), 94)).toBeCloseTo(-8 / 102);
  });

  it('подпись со знаком', () => {
    expect(fmtMove(0.1234)).toContain('+12,34');
    expect(fmtMove(-0.05)).toContain('−5,00');
  });
});

describe('fmtDuration', () => {
  it('дни, часы, минуты', () => {
    expect(fmtDuration(38 * 3_600_000)).toBe('1 д 14 ч');
    expect(fmtDuration(6.25 * 3_600_000)).toBe('6 ч 15 м');
    expect(fmtDuration(45 * 60_000)).toBe('45 м');
  });
});

describe('levelLines', () => {
  it('тейки, подтянутый стоп, входы, стоп; что исполнилось', () => {
    const lines = levelLines(trade());
    expect(lines.map((l) => l.key)).toEqual(['t2', 't1', 't0', 'trail', 'e0', 'e1', 'e2', 'e3', 'stop']);
    expect(lines.filter((l) => l.done).map((l) => l.key)).toEqual(['t0', 'trail', 'e0', 'e1']);
  });

  it('стоп не двигался — строки подтянутого нет', () => {
    const lines = levelLines(trade({ finalStop: 94, outcome: 'stop', takesHit: 0 }));
    expect(lines.some((l) => l.kind === 'trail')).toBe(false);
    expect(lines.find((l) => l.key === 'stop')?.state).toBe('сработал');
  });
});
