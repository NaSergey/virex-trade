import { aggregate, bars, walk } from './fixtures';
import { closeMs } from './series';
import { buildReport, excursions, stopPctOf, STRATEGY_VERSION } from './report';

describe('report', () => {
  it('stopPctOf — средняя дистанция уровней до стопа к средней цене', () => {
    expect(stopPctOf({ entries: [100, 98], stop: 96 })).toBeCloseTo(3 / 99);
  });

  it('excursions — макс. ход от входа за сделку, шорт зеркально', () => {
    const s = bars([
      [100, 100, 100, 100],
      [100, 104, 99, 103],
      [103, 110, 95, 100],
      [100, 200, 1, 100],
    ]);
    const step = 15 * 60_000;
    const long = excursions(s, 1, 100, step, 3 * step);
    expect(long.maxUp).toBeCloseTo(0.1);
    expect(long.maxDown).toBeCloseTo(0.05);
    const short = excursions(s, -1, 100, step, 3 * step);
    expect(short.maxUp).toBeCloseTo(0.05);
    expect(short.maxDown).toBeCloseTo(0.1);
  });

  it('buildReport собирает отчёт за последние 2 года на случайном блуждании', async () => {
    const coinOf = (symbol: string, seed: number) => {
      const m15 = walk(800 * 96, seed, Date.UTC(2021, 0, 1));
      return {
        symbol,
        m15,
        h1: aggregate(m15, 60),
        h4: aggregate(m15, 240),
        d1: aggregate(m15, 1440),
      };
    };
    const coins = [coinOf('BTCUSDT', 11), coinOf('ETHUSDT', 12)];
    const { m15 } = coins[0];
    const nowMs = closeMs(m15, m15.n - 1);
    const report = await buildReport(
      { coins, nowMs },
      async () => new Map(),
      async () => undefined,
    );
    expect(report.version).toBe(STRATEGY_VERSION);
    expect(report.author).toHaveLength(8);
    expect(report.learning.quarters.length).toBeGreaterThanOrEqual(2);
    expect(report.theory.ruin.rows).toHaveLength(4);
    const { trades, sides, stats, money, byCoin, before } = report.main;
    // Сделки на блуждании есть — иначе проверки ниже прошли бы вхолостую.
    expect(trades.length).toBeGreaterThan(0);
    expect(report.dataFrom).toBeGreaterThan(m15.t[0]);
    expect(report.dataFrom).toBeGreaterThanOrEqual(
      nowMs - 2 * 366 * 86_400_000,
    );
    expect(sides.long.summary.n + sides.short.summary.n).toBe(trades.length);
    expect(sides.all.summary.n).toBe(trades.length);
    expect(stats.summary.n).toBe(trades.length);
    expect(sides.short.summary.n / trades.length).toBeLessThanOrEqual(0.3);
    expect(report.odds.long.taken + report.odds.short.taken).toBe(
      trades.length,
    );
    expect(money.theory.start).toBe(1000);
    expect(money.plain.equity.length).toBeGreaterThanOrEqual(1);
    for (const t of trades) {
      expect(t.confirmMs).toBeGreaterThanOrEqual(report.dataFrom);
      expect(t.exitMs).toBeGreaterThan(t.fillMs);
      expect(t.maxUp).toBeGreaterThanOrEqual(0);
      expect(t.maxDown).toBeGreaterThanOrEqual(0);
      expect(t.tf).toBe(15);
      expect(t.takes.length).toBe(1);
      expect(t.entries.length).toBe(1);
      expect(t.id.startsWith(`${t.symbol}:`)).toBe(true);
    }
    // Одна позиция — у каждой монеты своя; в общем списке сделки идут по времени входа.
    expect(byCoin.map((c) => c.symbol)).toEqual(['BTCUSDT', 'ETHUSDT']);
    for (const c of byCoin) {
      const own = trades.filter((t) => t.symbol === c.symbol);
      expect(c.after.summary.n).toBe(own.length);
      for (let i = 1; i < own.length; i++) {
        expect(own[i].fillMs).toBeGreaterThanOrEqual(own[i - 1].exitMs);
      }
    }
    for (let i = 1; i < trades.length; i++) {
      expect(trades[i].fillMs).toBeGreaterThanOrEqual(trades[i - 1].fillMs);
    }
    expect(before.summary.n).toBe(
      byCoin.reduce((a, c) => a + c.before.summary.n, 0),
    );
    expect(before.summary.n).toBeGreaterThan(0);
    expect(new Set(trades.map((t) => t.id)).size).toBe(trades.length);
    expect(() => JSON.stringify(report)).not.toThrow();
  });
});
