import { theoryOf, TheoryTrade } from './theory';

const video = (): TheoryTrade[] => [
  ...Array.from({ length: 15 }, () => ({
    rGross: 8.05,
    rNet: 8,
    stopPct: 0.02,
  })),
  ...Array.from({ length: 85 }, () => ({
    rGross: -0.97,
    rNet: -1,
    stopPct: 0.02,
  })),
];

describe('theory', () => {
  it('мат ожидание — пример видео: +0,35R', () => {
    const t = theoryOf(video());
    expect(t.expectancy.net).toBeCloseTo(0.35);
    expect(t.expectancy.winrate).toBeCloseTo(0.15);
    expect(t.expectancy.gross).toBeGreaterThan(t.expectancy.net);
  });

  it('безубыточный винрейт: 50 / 33 / 25 / 20 %', () => {
    const t = theoryOf(video());
    expect(t.breakeven.table.map((x) => Math.round(x.winrate * 100))).toEqual([
      50, 33, 25, 20,
    ]);
    expect(t.breakeven.needed).toBeCloseTo(1 / 9);
  });

  it('объём позиции и 20 минусов подряд', () => {
    const t = theoryOf(video());
    expect(t.sizing.position).toBeCloseTo(250);
    expect(t.sizing.streak20[0].loss).toBeCloseTo(0.182, 3);
    expect(t.sizing.streak20[1].loss).toBeCloseTo(0.642, 3);
  });

  it('асимметрия: 10 → 11 %, 30 → 43 %, 50 → 100 %', () => {
    const t = theoryOf(video());
    expect(t.asymmetry.table.map((x) => Math.round(x.need * 100))).toEqual([
      11, 43, 100,
    ]);
  });

  it('риск разорения растёт с риском на сделку', () => {
    const p = theoryOf(video()).ruin.rows.map((r) => r.p);
    for (let i = 1; i < p.length; i++) {
      expect(p[i]).toBeGreaterThanOrEqual(p[i - 1]);
    }
    expect(p[3]).toBeGreaterThan(p[0]);
  });

  it('перестановки воспроизводимы', () => {
    expect(theoryOf(video(), 5)).toEqual(theoryOf(video(), 5));
  });

  it('накопленное среднее хранит первые 120 сделок поштучно', () => {
    const t = theoryOf(video());
    expect(t.running[19]).toEqual({ n: 20, mean: expect.any(Number) });
  });

  it('пустой список не ломается', () => {
    const t = theoryOf([]);
    expect(t.variance.paths).toEqual([]);
    expect(t.ruin.rows.every((r) => r.p === 0)).toBe(true);
  });
});
