import { ProbabilitiesService } from './probabilities.service';

describe('ProbabilitiesService.get', () => {
  it('ещё не считали — пустой ответ', async () => {
    const prisma = {
      probabilityStat: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    await expect(
      new ProbabilitiesService(prisma as never).get(),
    ).resolves.toEqual({ divergence: {}, computedAt: null });
  });

  it('отдаёт строку дивергенций и время расчёта', async () => {
    const at = new Date('2026-10-25T00:30:00Z');
    const prisma = {
      probabilityStat: {
        findUnique: jest.fn().mockResolvedValue({
          key: 'divergence',
          data: { '240': { bull: null, bear: null } },
          computedAt: at,
        }),
      },
    };
    const r = await new ProbabilitiesService(prisma as never).get();
    expect(r.divergence['240']).toEqual({ bull: null, bear: null });
    expect(r.computedAt).toBe(at.toISOString());
  });
});
