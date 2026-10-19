import { behaviorOf, isBot } from './behavior';
import type { RawFill } from './hl-types';

const MIN = 60_000;

/** `n` круговых сделок по монете: вход и выход через `holdMs`, с паузой `gapMs`. */
function roundTrips(n: number, holdMs: number, gapMs: number): RawFill[] {
  const out: RawFill[] = [];
  let t = 1_700_000_000_000;
  for (let i = 0; i < n; i++) {
    const base = {
      coin: 'ETH',
      px: '100',
      sz: '1',
      dir: '',
      closedPnl: '0',
      fee: '0.01',
      crossed: true,
    };
    out.push({ ...base, side: 'B', time: t, startPosition: '0' });
    out.push({ ...base, side: 'A', time: t + holdMs, startPosition: '1' });
    t += holdMs + gapMs;
  }
  return out;
}

describe('behaviorOf / isBot', () => {
  it('сделки по минуте — бот', () => {
    const b = behaviorOf(roundTrips(40, MIN, 5 * MIN));
    expect(b.medianHoldMs).toBe(MIN);
    expect(isBot(b)).toBe(true);
  });

  it('сделки на часы и дни — не бот', () => {
    const b = behaviorOf(roundTrips(30, 6 * 60 * MIN, 12 * 60 * MIN));
    expect(b.medianHoldMs).toBe(6 * 60 * MIN);
    expect(isBot(b)).toBe(false);
  });

  it('меньше 20 закрытых сделок — медианы нет, одна она не судит', () => {
    const b = behaviorOf(roundTrips(10, MIN, 5 * MIN));
    expect(b.medianHoldMs).toBeNull();
    expect(isBot(b)).toBe(false);
  });

  it('мейкер без сделок (позиция не пересекает ноль), но с потоком исполнений — бот', () => {
    const raw: RawFill[] = [];
    for (let i = 0; i < 1000; i++)
      raw.push({
        coin: 'BTC',
        px: '100',
        sz: '1',
        side: i % 2 ? 'A' : 'B',
        time: 1_700_000_000_000 + i * 60_000,
        dir: '',
        // позиция колеблется между 5 и 6 и ноля не касается
        startPosition: i % 2 ? '6' : '5',
        closedPnl: '0',
        fee: '0',
        crossed: false,
      });
    const b = behaviorOf(raw);
    expect(b.medianHoldMs).toBeNull();
    expect(b.fillsPerDay).toBeGreaterThan(250);
    expect(isBot(b)).toBe(true);
  });

  it('редкие исполнения — не бот; окно меньше суток считается сутками', () => {
    const b = behaviorOf(roundTrips(2, 3 * 60 * MIN, 60 * MIN));
    expect(b.fillsPerDay).toBeLessThanOrEqual(4);
    expect(isBot(b)).toBe(false);
  });

  it('нет данных — не бот', () => {
    expect(isBot(behaviorOf([]))).toBe(false);
  });
});
