import { describe, expect, it } from 'vitest';
import { newer, stamp } from './hooks';
import type { JetpackWire } from './types';

const wire = (serverNow: number): JetpackWire => ({
  phase: 'betting',
  roundId: 'r',
  serverNow,
  launchAt: null,
  launchedAt: null,
  crashX100: null,
  rate: 0.00008,
  betMs: 7000,
  history: [],
  players: 0,
  totalBet: 0,
  bets: [],
  me: null,
  limits: { minBet: 1, maxBet: 10000, minAutoX100: 101, maxAutoX100: 100000 },
});

describe('stamp', () => {
  it('сдвиг — серверное время минус локальное в момент получения', () => {
    expect(stamp(wire(5000), 3000).offset).toBe(2000);
  });
});

describe('newer', () => {
  it('старый снимок не перетирает новый', () => {
    const a = stamp(wire(10), 0);
    const b = stamp(wire(20), 0);
    expect(newer(b, a)).toBe(b);
    expect(newer(a, b)).toBe(b);
    expect(newer(undefined, a)).toBe(a);
  });
});
