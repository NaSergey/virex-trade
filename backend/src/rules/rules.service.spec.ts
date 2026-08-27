import { RulesService } from './rules.service';

const DAY = 24 * 60 * 60 * 1000;

function serviceWith(opts: {
  rules?: { metric: string; operator: string; threshold: number; active: boolean }[];
  trades?: {
    id: string;
    closedAt: Date;
    closedPnl: number;
    leverage: number | null;
    risk: { exposurePct: number | null; plannedRiskPct: number | null; ok: boolean; balanceAtEntry: number | null } | null;
  }[];
}) {
  const allRules = opts.rules ?? [];
  const prisma = {
    rule: {
      findMany: jest.fn((query) => {
        // Фильтруем по where условиям, которые передал сервис
        if (query?.where?.active === true) {
          return Promise.resolve(allRules.filter((r) => r.active));
        }
        return Promise.resolve(allRules);
      }),
    },
    trade: { findMany: jest.fn().mockResolvedValue(opts.trades ?? []) },
  } as never;
  return new RulesService(prisma);
}

const trade = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  closedAt: new Date('2026-08-01T12:00:00Z'),
  closedPnl: 0,
  leverage: null,
  risk: { exposurePct: 50, plannedRiskPct: 1, ok: true, balanceAtEntry: 1000 },
  ...over,
});

describe('RulesService.compliance', () => {
  it('проверяет только активные правила', async () => {
    const service = serviceWith({
      rules: [
        { metric: 'exposure_pct', operator: 'lte', threshold: 100, active: true },
        { metric: 'leverage', operator: 'lte', threshold: 3, active: false },
      ],
      trades: [trade('t1')],
    });

    const res = await service.compliance('u1', 30, 0);
    expect(res.rules).toHaveLength(1);
    expect(res.rules[0]).toMatchObject({ metric: 'exposure_pct', followed: 1 });
  });

  // Правило может пережить исчезновение метрики при откате версии кода.
  // Экран соблюдения от этого падать не должен.
  it('правило с неизвестной метрикой пропускается, а не роняет ответ', async () => {
    const service = serviceWith({
      rules: [{ metric: 'нет такой', operator: 'lte', threshold: 1, active: true }],
      trades: [trade('t1')],
    });

    await expect(service.compliance('u1', 30, 0)).resolves.toMatchObject({ rules: [] });
  });

  it('дневная метрика группирует сделки по локальным суткам', async () => {
    const service = serviceWith({
      rules: [{ metric: 'trades_per_day', operator: 'lte', threshold: 1, active: true }],
      trades: [
        trade('t1', { closedAt: new Date('2026-08-01T10:00:00Z') }),
        trade('t2', { closedAt: new Date('2026-08-01T11:00:00Z') }),
        trade('t3', { closedAt: new Date('2026-08-02T10:00:00Z') }),
      ],
    });

    const res = await service.compliance('u1', 30, 0);
    // Первые сутки нарушают (2 > 1), вторые соблюдают.
    expect(res.rules[0]).toMatchObject({ followed: 1, violated: 1, violatingIds: ['2026-08-01'] });
  });

  it('без правил отдаёт пустой список, а не ошибку', async () => {
    const service = serviceWith({ rules: [], trades: [trade('t1')] });
    await expect(service.compliance('u1', 30, 0)).resolves.toEqual({ rules: [] });
  });
});
