import { ReferralsService } from './referrals.service';

describe('ReferralsService.getStats', () => {
  it('считает total и withKey раздельно', async () => {
    const calls: Array<{ where: Record<string, unknown> }> = [];
    const prisma = {
      user: {
        count: async (args: { where: Record<string, unknown> }) => {
          calls.push(args);
          return 'exchangeConnections' in args.where ? 3 : 5;
        },
      },
    } as any;

    const stats = await new ReferralsService(prisma).getStats('inviter-1');

    expect(stats).toEqual({ total: 5, withKey: 3 });
    expect(calls[0].where).toEqual({ invitedById: 'inviter-1' });
    expect(calls[1].where).toEqual({
      invitedById: 'inviter-1',
      exchangeConnections: { some: {} },
    });
  });

  it('без приглашённых отдаёт нули, а не падает', async () => {
    const prisma = { user: { count: async () => 0 } } as any;

    const stats = await new ReferralsService(prisma).getStats('lonely');

    expect(stats).toEqual({ total: 0, withKey: 0 });
  });
});
