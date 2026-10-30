import { aggregate, walk } from './fixtures';
import { closeMs } from './series';
import { buildReport, sequential, STRATEGY_VERSION } from './report';

describe('report', () => {
  it('sequential — одна позиция за раз', () => {
    const t = [
      { fillMs: 0, exitMs: 10 },
      { fillMs: 5, exitMs: 20 },
      { fillMs: 10, exitMs: 30 },
    ];
    expect(sequential(t)).toEqual([t[0], t[2]]);
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
    for (const t of report.main.trades) {
      expect(t.exitMs).toBeGreaterThan(t.fillMs);
    }
    for (let i = 1; i < report.main.trades.length; i++) {
      expect(report.main.trades[i].fillMs).toBeGreaterThanOrEqual(
        report.main.trades[i - 1].exitMs,
      );
    }
    expect(() => JSON.stringify(report)).not.toThrow();
  });
});
