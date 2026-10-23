import {
  outcomeOf,
  report,
  streak,
  summarize,
  type StatItem,
} from './plan-stats';

const item = (o: Partial<StatItem>): StatItem => ({
  day: '2026-10-23',
  startMin: 600,
  endMin: 720,
  category: 'backtest',
  track: true,
  status: 'planned',
  ...o,
});

describe('plan-stats', () => {
  it('исход блока выводится из статуса и времени', () => {
    expect(outcomeOf(item({}), '2026-10-23', 500)).toBe('upcoming');
    expect(outcomeOf(item({}), '2026-10-23', 610)).toBe('now');
    expect(outcomeOf(item({}), '2026-10-23', 720)).toBe('missed');
    expect(outcomeOf(item({}), '2026-10-24', 0)).toBe('missed');
    expect(outcomeOf(item({ status: 'started' }), '2026-10-23', 700)).toBe(
      'started',
    );
    expect(outcomeOf(item({ status: 'started' }), '2026-10-23', 730)).toBe(
      'open',
    );
    expect(outcomeOf(item({ status: 'walk' }), '2026-10-23', 610)).toBe('walk');
    expect(outcomeOf(item({ day: '2026-10-25' }), '2026-10-23', 900)).toBe(
      'upcoming',
    );
  });

  it('соблюдение: сделал 1, частично ½, остальное 0; будущее и неотслеживаемое не считаются', () => {
    const s = summarize(
      [
        item({ status: 'done', lateMin: 10 }),
        item({ status: 'partial', lateMin: -5 }),
        item({ status: 'skipped' }),
        item({ status: 'walk' }),
        item({}), // пропущено
        item({ startMin: 1000, endMin: 1100 }), // ещё впереди
        item({ status: 'done', track: false }),
      ],
      '2026-10-23',
      800,
    );
    expect(s.counted).toBe(5);
    expect(s.score).toBeCloseTo(1.5 / 5);
    expect([s.done, s.partial, s.skipped, s.walk, s.missed]).toEqual([
      1, 1, 1, 1, 1,
    ]);
    expect(s.plannedMin).toBe(600);
    expect(s.workedMin).toBe(180);
    // Пришёл раньше — не «минус опоздание»: среднее не врёт в лучшую сторону.
    expect(s.lateAvg).toBe(5);
  });

  it('оценивать нечего — соблюдения нет, а не ноль', () => {
    expect(
      summarize([item({ startMin: 900, endMin: 960 })], '2026-10-23', 800)
        .score,
    ).toBeNull();
  });

  it('серия: пустые дни не рвут, недобор сегодня не рвёт', () => {
    const days = [
      { day: '2026-10-20', score: 0.9 },
      { day: '2026-10-21', score: null },
      { day: '2026-10-22', score: 0.7 },
      { day: '2026-10-23', score: 0.2 },
    ];
    expect(streak(days, '2026-10-23')).toBe(2);
    expect(
      streak([...days, { day: '2026-10-19', score: 0.1 }], '2026-10-23'),
    ).toBe(2);
    expect(
      streak(
        [{ day: '2026-10-22', score: 0.5 }, ...days.slice(0, 2)],
        '2026-10-23',
      ),
    ).toBe(0);
  });

  it('отчёт по дням и видам', () => {
    const r = report(
      [
        item({ status: 'done' }),
        item({ category: 'english', status: 'skipped', day: '2026-10-22' }),
      ],
      ['2026-10-22', '2026-10-23'],
      '2026-10-23',
      800,
    );
    expect(r.byDay.map((d) => d.score)).toEqual([0, 1]);
    expect(r.byCategory.map((c) => [c.category, c.score])).toEqual([
      ['backtest', 1],
      ['english', 0],
    ]);
    expect(r.streak).toBe(1);
  });
});
