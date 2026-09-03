import { buildWeeklyReport, lastWeekRange, ReportTrade } from './weekly-report';

const trade = (pnl: number, over: Partial<ReportTrade> = {}): ReportTrade => ({
  closedPnl: pnl,
  stopLoss: null,
  tagNames: [],
  ...over,
});

describe('lastWeekRange', () => {
  // Отчёт уходит в понедельник 09:00 UTC и покрывает прошедшие пн–вс.
  it('в понедельник берёт прошлую неделю целиком', () => {
    const r = lastWeekRange(new Date('2026-09-07T09:00:00Z')); // понедельник
    expect(r.from.toISOString()).toBe('2026-08-31T00:00:00.000Z');
    expect(r.to.toISOString()).toBe('2026-09-07T00:00:00.000Z');
  });
});

describe('buildWeeklyReport', () => {
  it('считает PnL, число сделок и винрейт', () => {
    const text = buildWeeklyReport([trade(100), trade(-40), trade(20)], []);
    expect(text).toContain('+$80.00');
    expect(text).toContain('Сделок: 3');
    expect(text).toContain('67%');
  });

  it('показывает лучший и худший тег', () => {
    const text = buildWeeklyReport(
      [trade(100, { tagNames: ['пробой'] }), trade(-60, { tagNames: ['контртренд'] })],
      [],
    );
    expect(text).toContain('пробой');
    expect(text).toContain('контртренд');
  });

  // Сделка входит в каждый свой тег целиком — то же правило, что в statsByTag.
  it('сделка с двумя тегами засчитывается обоим целиком', () => {
    const text = buildWeeklyReport([trade(100, { tagNames: ['a', 'b'] })], []);
    expect(text).toContain('a (+$100.00)');
    expect(text).toContain('b (+$100.00)');
  });

  it('считает долю сделок с объявленным стопом', () => {
    const text = buildWeeklyReport([trade(10, { stopLoss: 100 }), trade(-10)], []);
    expect(text).toContain('Со стопом на входе: 50%');
  });

  it('сравнивает с прошлой неделей', () => {
    const text = buildWeeklyReport([trade(100)], [trade(40)]);
    expect(text).toContain('Неделей раньше: +$40.00');
  });

  it('без сделок отдаёт короткое сообщение, а не таблицу нулей', () => {
    const text = buildWeeklyReport([], []);
    expect(text).toContain('Сделок за неделю не было');
    expect(text).not.toContain('Винрейт');
  });
});
