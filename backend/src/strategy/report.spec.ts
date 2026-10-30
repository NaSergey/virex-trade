import { aggregate, walk } from './fixtures';
import { closeMs } from './series';
import { buildReport, sequential, stopPctOf, STRATEGY_VERSION } from './report';

describe('report', () => {
  it('sequential — одна позиция за раз', () => {
    const t = [
      { fillMs: 0, exitMs: 10 },
      { fillMs: 5, exitMs: 20 },
      { fillMs: 10, exitMs: 30 },
    ];
    expect(sequential(t)).toEqual([t[0], t[2]]);
  });

  it('stopPctOf — средняя дистанция уровней до стопа к средней цене', () => {
    expect(stopPctOf({ entries: [100, 98], stop: 96 })).toBeCloseTo(3 / 99);
  });

  it('buildReport собирает отчёт на случайном блуждании', async () => {
    const m15 = walk(200 * 96, 11);
    const report = await buildReport(
      {
        m15,
        h1: aggregate(m15, 60),
        h4: aggregate(m15, 240),
        d1: aggregate(m15, 1440),
        nowMs: closeMs(m15, m15.n - 1),
      },
      async () => new Map(),
      async () => undefined,
    );
    expect(report.version).toBe(STRATEGY_VERSION);
    expect(report.variants).toHaveLength(9);
    expect(report.variants[0].id).toBe('main');
    expect(report.author).toHaveLength(8);
    expect(report.learning.quarters.length).toBeGreaterThanOrEqual(2);
    expect(report.theory.ruin.rows).toHaveLength(4);
    // Сделки на блуждании есть — иначе проверки ниже прошли бы вхолостую.
    const noOdds = report.variants.find((v) => v.id === 'no-odds');
    expect(noOdds.filled).toBeGreaterThan(0);
    expect(report.odds.long.taken + report.odds.short.taken).toBe(
      report.main.trades.length,
    );
    expect(
      report.odds.short.taken / report.main.trades.length,
    ).toBeLessThanOrEqual(0.3);
    expect(report.main.trades.length).toBeGreaterThan(0);
    expect(report.main.money.theory.start).toBe(1000);
    expect(report.main.money.plain.equity.length).toBeGreaterThanOrEqual(1);
    for (const t of report.main.trades) {
      expect(t.exitMs).toBeGreaterThan(t.fillMs);
      expect(t.takes.length).toBe(3);
      expect(t.entries.length).toBe(4);
    }
    for (let i = 1; i < report.main.trades.length; i++) {
      expect(report.main.trades[i].fillMs).toBeGreaterThanOrEqual(
        report.main.trades[i - 1].exitMs,
      );
    }
    expect(() => JSON.stringify(report)).not.toThrow();
  });
});
