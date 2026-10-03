import {
  RECENT_DAYS,
  balanceSeries,
  bestRun,
  countOf,
  gamesOf,
  xpByDay,
} from './series';

// Четверг: неделя сегодняшнего дня начинается в понедельник 2026-09-28.
const NOW = new Date('2026-10-01T15:00:00Z');

describe('gamesOf', () => {
  it('считает действия за всё время, а дни — только за последние 90', () => {
    const games = gamesOf(
      [
        { day: '2026-10-01', kind: 'jetpack', n: 40 },
        { day: '2026-09-30', kind: 'jetpack', n: 2 },
        { day: '2026-01-01', kind: 'jetpack', n: 5 },
        { day: '2026-09-15', kind: 'tournament', n: 1 },
        { day: '2026-09-15', kind: 'tag', n: 7 },
      ],
      NOW,
    );
    const jetpack = games.find((g) => g.id === 'jetpack')!;
    expect(jetpack).toEqual({ id: 'jetpack', played: 47, days90: 2, lastDay: '2026-10-01' });
    expect(games.find((g) => g.id === 'poker')).toEqual({ id: 'poker', played: 0, days90: 0, lastDay: null });
    // Разметка — не игра: в список игр не попадает.
    expect(games.map((g) => g.id)).toEqual(['tournament', 'backtest', 'jetpack', 'poker', 'blackjack']);
  });

  it('день ровно 90 дней назад включительно ещё в окне, 91-й — нет', () => {
    const games = gamesOf(
      [
        { day: '2026-07-04', kind: 'poker', n: 1 }, // 89 дней назад — 90-й день окна
        { day: '2026-07-03', kind: 'poker', n: 1 },
      ],
      NOW,
    );
    expect(games.find((g) => g.id === 'poker')!.days90).toBe(1);
    expect(RECENT_DAYS).toBe(90);
  });
});

describe('countOf', () => {
  it('суммирует только свой вид', () => {
    expect(
      countOf(
        [
          { day: 'a', kind: 'tag', n: 2 },
          { day: 'b', kind: 'tag', n: 3 },
          { day: 'b', kind: 'poker', n: 9 },
        ],
        'tag',
      ),
    ).toBe(5);
  });
});

describe('xpByDay', () => {
  it('90 дней по порядку, пустые — ноль, начисления одного дня складываются', () => {
    const series = xpByDay(
      [
        { day: '2026-10-01', xp: 50 },
        { day: '2026-10-01', xp: 15 },
        { day: '2026-09-30', xp: 100 },
        { day: '2026-01-01', xp: 999 },
      ],
      NOW,
    );
    expect(series).toHaveLength(RECENT_DAYS);
    expect(series[0].day).toBe('2026-07-04');
    expect(series.slice(-3)).toEqual([
      { day: '2026-09-29', xp: 0 },
      { day: '2026-09-30', xp: 100 },
      { day: '2026-10-01', xp: 65 },
    ]);
    expect(series.reduce((a, p) => a + p.xp, 0)).toBe(165);
  });
});

describe('balanceSeries', () => {
  const at = (iso: string) => new Date(iso);

  it('берёт отправную точку из строки до окна', () => {
    const s = balanceSeries(
      [{ at: at('2026-10-01T10:00:00Z'), delta: 50, balanceAfter: 1550 }],
      { at: at('2026-01-01T00:00:00Z'), delta: 500, balanceAfter: 1500 },
      1550,
      NOW,
    );
    expect(s).toHaveLength(RECENT_DAYS);
    expect(s[0].balance).toBe(1500);
    expect(s[s.length - 2].balance).toBe(1500);
    expect(s[s.length - 1]).toEqual({ day: '2026-10-01', balance: 1550 });
  });

  it('без строки до окна стартует с баланса перед первой строкой окна', () => {
    const s = balanceSeries(
      [
        { at: at('2026-09-30T23:00:00Z'), delta: -100, balanceAfter: 900 },
        { at: at('2026-09-30T10:00:00Z'), delta: 0, balanceAfter: 1000 },
      ],
      null,
      900,
      NOW,
    );
    expect(s[0].balance).toBe(1000);
    // Последняя строка дня решает его итог, в каком бы порядке строки ни пришли.
    expect(s.find((p) => p.day === '2026-09-30')!.balance).toBe(900);
  });

  it('без единой строки — ровная линия на текущем балансе', () => {
    const s = balanceSeries([], null, 1000, NOW);
    expect(new Set(s.map((p) => p.balance))).toEqual(new Set([1000]));
  });
});

describe('bestRun', () => {
  it('находит самую длинную серию подряд, повторы и порядок не мешают', () => {
    expect(bestRun([])).toBe(0);
    expect(bestRun(['2026-09-03', '2026-09-01', '2026-09-02', '2026-09-02', '2026-09-10'])).toBe(3);
    // Через границу месяца.
    expect(bestRun(['2026-08-31', '2026-09-01'])).toBe(2);
  });
});
