import { ProbabilitiesService } from './probabilities.service';

describe('ProbabilitiesService.get', () => {
  it('пустая таблица — пустой ответ', async () => {
    const prisma = {
      probabilityStat: { findMany: jest.fn().mockResolvedValue([]) },
    };
    await expect(
      new ProbabilitiesService(prisma as never).get(),
    ).resolves.toEqual({
      divergence: {},
      derivs: {},
      now: [],
      computedAt: null,
      nowAt: null,
    });
  });

  it('раскладывает строки по полям ответа', async () => {
    const at = new Date('2026-10-25T00:30:00Z');
    const nowAt = new Date('2026-10-25T05:00:00Z');
    const prisma = {
      probabilityStat: {
        findMany: jest.fn().mockResolvedValue([
          {
            key: 'divergence',
            data: { '240': { bull: null, bear: null } },
            computedAt: at,
          },
          { key: 'derivs', data: { 'funding:high': null }, computedAt: at },
          {
            key: 'now',
            data: [{ kind: 'funding', value: 0.0001, zone: 'normal' }],
            computedAt: nowAt,
          },
        ]),
      },
    };
    const r = await new ProbabilitiesService(prisma as never).get();
    expect(r.divergence['240']).toEqual({ bull: null, bear: null });
    expect(r.derivs).toEqual({ 'funding:high': null });
    expect(r.now).toHaveLength(1);
    expect(r.computedAt).toBe(at.toISOString());
    expect(r.nowAt).toBe(nowAt.toISOString());
  });
});
