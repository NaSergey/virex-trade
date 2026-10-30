import type { Features, TradeRow } from './report.types';
import { filterByOdds, judge } from './odds';

const FEAT = {
  session: 'asia',
  weekend: 'no',
  daily: 'with',
  vol: 'mid',
  stopAtr: '0.5-1.5',
  plannedR: '3-4',
  pierce: '<0.25',
} as Features;
let seq = 0;
const row = (
  dir: 1 | -1,
  rNet: number,
  confirmMs: number,
  exitMs: number,
  daily = 'with',
): TradeRow => ({
  id: String(seq++),
  dir,
  tf: 15,
  sweepMs: 0,
  obMs: 0,
  fvgMs: null,
  bosMs: null,
  confirmMs,
  level: 0,
  entries: [1],
  filled: 1,
  avgEntry: 1,
  stop: 0,
  finalStop: 0,
  target: 2,
  takes: [2],
  takesHit: 0,
  plannedR: 3,
  fillMs: confirmMs,
  exitMs,
  exit: 1,
  outcome: 'stop',
  rGross: rNet,
  rNet,
  features: { ...FEAT, daily },
  odds: null,
});
const T = 1_000_000;
const past = (dir: 1 | -1, rs: (i: number) => number, daily = 'with') =>
  Array.from({ length: 40 }, (_, i) => row(dir, rs(i), i, i + 1, daily));
const mixed = (i: number) => (i % 2 ? 3 : -1);

describe('odds', () => {
  it('истории мало — сделка берётся без оценки', () => {
    const now = row(-1, 0, T, T + 1);
    expect(judge(now, [...past(-1, () => -1).slice(0, 10), now])).toBeNull();
  });

  it('слабый шорт пропускается, сильный лонг берётся', () => {
    const short = row(-1, 0, T, T + 1);
    const long = row(1, 0, T, T + 1);
    const all = [...past(-1, () => -1), ...past(1, mixed), short, long];
    expect(judge(short, all)).toMatchObject({ p: 0, n: 40 });
    expect(judge(long, all)).toMatchObject({ p: 0.5, needed: 0.25, n: 40 });
    const res = filterByOdds(all);
    expect(res.skipped.map((t) => t.id)).toContain(short.id);
    expect(res.kept.map((t) => t.id)).toContain(long.id);
    expect(res.kept.find((t) => t.id === long.id).odds).toMatchObject({
      p: 0.5,
    });
  });

  it('сделки, закрытые после подтверждения, в выборку не входят', () => {
    const now = row(-1, 0, T, T + 1);
    const late = Array.from({ length: 40 }, (_, i) =>
      row(-1, -1, i, T + 10 + i),
    );
    expect(judge(now, [...late, now])).toBeNull();
  });

  it('своя дневная структура, если её хватает', () => {
    const all = [
      ...past(-1, () => 3, 'with'),
      ...past(-1, () => -1, 'against'),
    ];
    expect(judge(row(-1, 0, T, T + 1, 'with'), all)).toMatchObject({ p: 1 });
    expect(judge(row(-1, 0, T, T + 1, 'against'), all)).toMatchObject({
      p: 0,
    });
  });

  it('сводка блока: стороны, доля лонгов, вердикт', () => {
    const all = [
      ...past(-1, () => -1),
      ...past(1, mixed),
      row(-1, -1, T, T + 1),
      row(1, 3, T, T + 1),
    ];
    const { block } = filterByOdds(all);
    expect(block.short.considered).toBe(41);
    expect(block.long.considered).toBe(41);
    expect(block.short.skipped).toBeGreaterThanOrEqual(1);
    expect(block.longShare).toBeGreaterThan(0.5);
    expect(['helped', 'hurt', 'unproven']).toContain(block.effect.verdict);
  });
});
