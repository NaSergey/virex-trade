import type { Features, TradeRow } from './report.types';
import { judge, selectSystem } from './odds';

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
/** n сделок подряд, не пересекаются. */
const series = (dir: 1 | -1, n: number, from: number, r = 1) =>
  Array.from({ length: n }, (_, i) =>
    row(dir, r, from + i * 10, from + i * 10 + 1),
  );

describe('odds', () => {
  it('judge — истории мало: оценки нет', () => {
    const now = row(-1, 0, T, T + 1);
    expect(judge(now, [...past(-1, () => -1).slice(0, 10), now])).toBeNull();
  });

  it('judge — своя дневная структура и доля всей стороны', () => {
    const all = [
      ...past(-1, () => 3, 'with'),
      ...past(-1, () => -1, 'against'),
    ];
    expect(judge(row(-1, 0, T, T + 1, 'with'), all)).toMatchObject({
      p: 1,
      sideP: 0.5,
      n: 40,
    });
    expect(judge(row(-1, 0, T, T + 1, 'against'), all)).toMatchObject({
      p: 0,
      sideP: 0.5,
    });
  });

  it('judge — сделки, закрытые после подтверждения, в выборку не входят', () => {
    const now = row(-1, 0, T, T + 1);
    const late = Array.from({ length: 40 }, (_, i) =>
      row(-1, -1, i, T + 10 + i),
    );
    expect(judge(now, [...late, now])).toBeNull();
  });

  it('шортов не больше 30 % взятых, лонги берутся все', () => {
    const longs = series(1, 7, 0);
    const shorts = series(-1, 5, 1000);
    const { system, block } = selectSystem([...longs, ...shorts], []);
    expect(system.filter((t) => t.dir === 1)).toHaveLength(7);
    expect(system.filter((t) => t.dir === -1)).toHaveLength(3);
    expect(block.longShare).toBeCloseTo(0.7);
    expect(block.short).toMatchObject({ considered: 5, taken: 3, skipped: 2 });
  });

  it('первая сделка — не шорт: без лонгов квота закрыта', () => {
    const { system } = selectSystem([row(-1, 1, 0, 1)], []);
    expect(system).toHaveLength(0);
  });

  it('шорт слабее своей стороны пропускается, даже если квота есть', () => {
    const history = [
      ...past(-1, () => -1, 'with'),
      ...past(-1, (i) => (i % 2 ? 3 : -1), 'against'),
    ];
    const longs = series(1, 7, T);
    const weak = row(-1, 1, T + 1000, T + 1001, 'with');
    const strong = row(-1, 1, T + 2000, T + 2001, 'against');
    const { system, skipped } = selectSystem([...longs, weak, strong], history);
    expect(skipped.map((t) => t.id)).toEqual([weak.id]);
    expect(system.map((t) => t.id)).toContain(strong.id);
    expect(system.find((t) => t.id === strong.id).odds).toMatchObject({
      p: 0.5,
    });
  });

  it('вход на открытой позиции не считается и не занимает квоту', () => {
    const long = row(1, 1, 0, 100);
    const inside = row(1, 1, 50, 60);
    const { system, block } = selectSystem([long, inside], []);
    expect(system).toHaveLength(1);
    expect(block.long.considered).toBe(1);
  });

  it('сводка сторон: сделки и винрейт, вердикт по пропущенным', () => {
    const longs = [...series(1, 6, 0), ...series(1, 1, 500, -1)];
    const { block } = selectSystem(longs, []);
    expect(block.long.summary.n).toBe(7);
    expect(block.long.summary.winrate).toBeCloseTo(6 / 7);
    expect(block.short.summary.n).toBe(0);
    expect(block.effect.verdict).toBe('unproven');
  });
});
