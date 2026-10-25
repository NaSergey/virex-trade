import { isStale, ProbabilityStatsService } from './probability-stats.service';

const DAY = 86_400_000;

describe('isStale', () => {
  it('ни разу не считали — пора', () => {
    expect(isStale(null, Date.now())).toBe(true);
  });
  it('сутки — граница', () => {
    const now = Date.UTC(2026, 9, 25, 12);
    expect(isStale(new Date(now - DAY + 1), now)).toBe(false);
    expect(isStale(new Date(now - DAY), now)).toBe(true);
  });
});

describe('ProbabilityStatsService.tick', () => {
  const make = (computedAt: Date | null) => {
    const prisma = {
      probabilityStat: {
        findUnique: jest
          .fn()
          .mockResolvedValue(computedAt ? { computedAt } : null),
      },
    };
    const svc = new ProbabilityStatsService(prisma as never);
    const recompute = jest.spyOn(svc, 'recompute').mockResolvedValue(undefined);
    return { svc, prisma, recompute };
  };

  it('просроченное пересчитывает', async () => {
    const { svc, recompute } = make(null);
    await svc.tick(Date.UTC(2026, 9, 25));
    expect(recompute).toHaveBeenCalled();
  });

  it('свежие частоты не пересчитывает', async () => {
    const now = Date.UTC(2026, 9, 25, 12);
    const { svc, recompute } = make(new Date(now - 3_600_000));
    await svc.tick(now);
    expect(recompute).not.toHaveBeenCalled();
  });

  it('второй тик поверх идущего — пропуск', async () => {
    const { svc, recompute } = make(null);
    let release!: () => void;
    recompute.mockImplementation(
      () => new Promise<void>((r) => (release = () => r())),
    );
    const first = svc.tick(1);
    await svc.tick(2);
    expect(recompute).toHaveBeenCalledTimes(1);
    release();
    await first;
  });
});
