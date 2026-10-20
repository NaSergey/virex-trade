import {
  analyzePortfolio,
  stitch,
  toSeries,
  valueAt,
  weeklyTStat,
} from './stability';
import type { Point, Portfolio, PortfolioWindow } from './hl-types';

const DAY = 86_400_000;
const WEEK = 7 * DAY;
const NOW = Date.UTC(2026, 9, 19, 12);

/**
 * Портфель, как его отдаёт Hyperliquid: perpAllTime — редкие точки (шаг `stepAll`
 * дней) за всю историю от 0, perpMonth — каждые 8 ч за 30 дней от 0. Общие окна
 * (allTime, month) несут баланс; их pnl — шум спота, который бот обязан не читать.
 */
function makePortfolio(opts: {
  days: number;
  pnl: (t: number) => number;
  av?: (t: number) => number;
  stepAll?: number;
}): Portfolio {
  const av = opts.av ?? (() => 100_000);
  const start = NOW - opts.days * DAY;
  const all: number[] = [];
  for (let t = start; t < NOW; t += (opts.stepAll ?? 2) * DAY) all.push(t);
  all.push(NOW);
  const mStart = Math.max(start, NOW - 30 * DAY);
  const month: number[] = [];
  for (let t = mStart; t < NOW; t += DAY / 3) month.push(t);
  month.push(NOW);
  const base = opts.pnl(start);
  const mBase = opts.pnl(mStart);
  const pts = (ts: number[], f: (t: number) => number): Point[] =>
    ts.map((t) => [t, String(f(t))]);
  const win = (ts: number[], pnl: (t: number) => number): PortfolioWindow => ({
    accountValueHistory: pts(ts, av),
    pnlHistory: pts(ts, pnl),
    vlm: '0',
  });
  const spotNoise = (t: number) => -1e9 * Math.sin(t);
  return [
    ['allTime', win(all, spotNoise)],
    ['month', win(month, spotNoise)],
    ['perpAllTime', win(all, (t) => opts.pnl(t) - base)],
    ['perpMonth', win(month, (t) => opts.pnl(t) - mBase)],
  ];
}

/** Кривая по неделям от начала истории: `weekly(k)` — прибыль недели k, рост внутри недели ровный. */
const byWeeks =
  (days: number, weekly: (k: number) => number) => (t: number) => {
    const start = NOW - days * DAY;
    const k = Math.floor((t - start) / WEEK);
    let v = 0;
    for (let i = 0; i < k; i++) v += weekly(i);
    return v + weekly(k) * (((t - start) % WEEK) / WEEK);
  };

describe('ряды', () => {
  it('valueAt — ступенькой: последняя точка не позже t', () => {
    const s = toSeries([
      [10, '1'],
      [20, '5'],
    ]);
    expect(valueAt(s, 9)).toBeNull();
    expect(valueAt(s, 15)).toBe(1);
    expect(valueAt(s, 20)).toBe(5);
  });

  it('stitch — свежий ряд встаёт на уровень старого в точке стыка', () => {
    const all = toSeries([
      [0, '0'],
      [100, '50'],
      [200, '80'],
    ]);
    const recent = toSeries([
      [150, '0'],
      [200, '30'],
    ]);
    expect(stitch(all, recent, true)).toEqual([
      [0, 0],
      [100, 50],
      [150, 50],
      [200, 80],
    ]);
    expect(stitch(all, recent, false)).toEqual([
      [0, 0],
      [100, 50],
      [150, 0],
      [200, 30],
    ]);
  });
});

describe('analyzePortfolio', () => {
  it('ровный рост проходит; спотовый шум общих окон не читается', () => {
    const { stats, reason } = analyzePortfolio(
      makePortfolio({ days: 210, pnl: byWeeks(210, () => 1000) }),
      NOW,
    );
    expect(reason).toBeNull();
    expect(stats.weeks).toBe(26);
    expect(stats.weeksUp).toBe(26);
    expect(stats.weeksMoving).toBe(26);
    // Старые точки — через 2 дня, границы недель между ними: неделя вбирает
    // 6 или 8 дней роста, поэтому доля лучшей — около 1/26, а не ровно.
    expect(stats.bestWeekShare).toBeLessThan(0.06);
    expect(stats.maxDrawdown).toBe(0);
    expect(stats.pnlMonth).toBeCloseTo((1000 * 30) / 7, 0);
    expect(stats.pnlAllTime).toBeCloseTo(30_000, 0);
    expect(stats.roiMonth).toBeCloseTo((1000 * 30) / 7 / 100_000, 3);
    expect(stats.accountValue).toBe(100_000);
  });

  it('короткая история — «мало истории»', () => {
    expect(
      analyzePortfolio(
        makePortfolio({ days: 40, pnl: byWeeks(40, () => 1000) }),
        NOW,
      ).reason,
    ).toBe('history');
  });

  it('кривая почти стоит — «мало торговли»', () => {
    const pnl = byWeeks(210, (k) => (k % 5 === 0 ? 1000 : 0));
    expect(
      analyzePortfolio(makePortfolio({ days: 210, pnl }), NOW).reason,
    ).toBe('trading');
  });

  it('половина недель в минус — отказ по доле прибыльных', () => {
    const pnl = byWeeks(210, (k) => (k % 2 ? 300 : -100));
    expect(
      analyzePortfolio(makePortfolio({ days: 210, pnl }), NOW).reason,
    ).toBe('weeksUp');
  });

  it('прибыль из одного рывка — «oneSpike»', () => {
    const pnl = byWeeks(210, (k) =>
      k === 15 ? 20_000 : k % 4 === 0 ? -50 : 100,
    );
    expect(
      analyzePortfolio(makePortfolio({ days: 210, pnl }), NOW).reason,
    ).toBe('oneSpike');
  });

  it('глубокая просадка от пика — «drawdown»', () => {
    const pnl = byWeeks(210, (k) => (k === 8 ? -45_000 : 5000));
    const { stats, reason } = analyzePortfolio(
      makePortfolio({ days: 210, pnl }),
      NOW,
    );
    expect(reason).toBe('drawdown');
    // Дно меряется по точкам через 2 дня: −45 000 + рост следующего дня.
    expect(stats.maxDrawdown).toBeGreaterThan(0.43);
    expect(stats.maxDrawdown).toBeLessThan(0.46);
  });

  it('минус за последний месяц — «pnlMonth»', () => {
    const pnl = byWeeks(210, (k) => (k >= 26 ? -2000 : 3000));
    expect(
      analyzePortfolio(makePortfolio({ days: 210, pnl }), NOW).reason,
    ).toBe('pnlMonth');
  });

  it('пустой портфель — «noData»', () => {
    expect(analyzePortfolio([], NOW).reason).toBe('noData');
  });
});

describe('weeklyTStat', () => {
  it('ровный плюс с небольшим шумом — большая t', () => {
    expect(
      weeklyTStat([0.01, 0.012, 0.009, 0.011, 0.01, 0.013])!,
    ).toBeGreaterThan(8);
  });

  it('плюс на шуме — мала: среднее тонет в разбросе', () => {
    expect(weeklyTStat([0.05, -0.04, 0.06, -0.05, 0.04, -0.03])!).toBeLessThan(
      1,
    );
  });

  it('мало недель или нулевой разброс — судить не по чему', () => {
    expect(weeklyTStat([0.01, 0.02])).toBeNull();
    expect(weeklyTStat([0.01, 0.01, 0.01, 0.01])).toBeNull();
  });
});

describe('analyzePortfolio — везение', () => {
  it('прошёл всё, кроме t: 16 недель в плюсе из 26, но среднее тонет в разбросе', () => {
    // +2000 в 16 неделях и −2500 в 10: общий плюс есть, а t около нуля.
    const pnl = byWeeks(210, (k) =>
      k % 5 === 0 || k % 5 === 1 ? -2500 : 2000,
    );
    const { stats, reason } = analyzePortfolio(
      makePortfolio({ days: 210, pnl }),
      NOW,
    );
    expect(stats.weeklyT).toBeLessThan(2);
    expect(reason).toBe('luck');
  });

  it('ровный рост t не режет', () => {
    const { stats, reason } = analyzePortfolio(
      makePortfolio({ days: 210, pnl: byWeeks(210, () => 1000) }),
      NOW,
    );
    expect(reason).toBeNull();
    expect(stats.weeklyT == null || stats.weeklyT >= 2).toBe(true);
  });
});
