import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ReferralsService } from './referrals.service';

describe('ReferralsService.getStats', () => {
  it('считает приглашённых и отдаёт слаг — без сведений о их ключах', async () => {
    const calls: Array<{ where: Record<string, unknown> }> = [];
    const prisma = {
      user: {
        count: async (args: { where: Record<string, unknown> }) => {
          calls.push(args);
          return 5;
        },
        findUnique: async () => ({ referralSlug: 'sergey' }),
      },
    } as any;

    const stats = await new ReferralsService(prisma).getStats('inviter-1');

    expect(stats).toEqual({ total: 5, slug: 'sergey' });
    expect(calls).toHaveLength(1);
    expect(calls[0].where).toEqual({ invitedById: 'inviter-1' });
  });

  it('без приглашённых и без слага отдаёт нули и null', async () => {
    const prisma = {
      user: {
        count: async () => 0,
        findUnique: async () => ({ referralSlug: null }),
      },
    } as any;

    const stats = await new ReferralsService(prisma).getStats('lonely');

    expect(stats).toEqual({ total: 0, slug: null });
  });
});

describe('ReferralsService.isSlugAvailable', () => {
  it('свободный слаг — true', async () => {
    const prisma = { user: { count: async () => 0 } } as any;

    expect(await new ReferralsService(prisma).isSlugAvailable('sergey', 'me')).toBe(true);
  });

  it('занятый слаг — false', async () => {
    const prisma = { user: { count: async () => 1 } } as any;

    expect(await new ReferralsService(prisma).isSlugAvailable('sergey', 'me')).toBe(false);
  });

  it('исключает самого пользователя из проверки', async () => {
    const calls: any[] = [];
    const prisma = {
      user: {
        count: async (args: any) => {
          calls.push(args);
          return 0;
        },
      },
    } as any;

    await new ReferralsService(prisma).isSlugAvailable('sergey', 'me');

    expect(calls[0].where).toEqual({ referralSlug: 'sergey', id: { not: 'me' } });
  });
});

describe('ReferralsService.setSlug', () => {
  it('сохраняет слаг', async () => {
    const prisma = {
      user: { update: async ({ data }: any) => ({ referralSlug: data.referralSlug }) },
    } as any;

    const result = await new ReferralsService(prisma).setSlug('me', 'sergey');

    expect(result).toEqual({ slug: 'sergey' });
  });

  it('занятый слаг превращается в ConflictException с кодом SLUG_TAKEN, а не в 500', async () => {
    const conflict = new Prisma.PrismaClientKnownRequestError('duplicate', {
      code: 'P2002',
      clientVersion: 'test',
    });
    const prisma = {
      user: {
        update: async () => {
          throw conflict;
        },
      },
    } as any;

    let caught: unknown;
    try {
      await new ReferralsService(prisma).setSlug('me', 'sergey');
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(ConflictException);
    expect((caught as ConflictException).getResponse()).toMatchObject({ code: 'SLUG_TAKEN' });
  });

  it('прочая ошибка БД не проглатывается', async () => {
    const other = new Error('connection lost');
    const prisma = {
      user: {
        update: async () => {
          throw other;
        },
      },
    } as any;

    await expect(new ReferralsService(prisma).setSlug('me', 'sergey')).rejects.toThrow(
      'connection lost',
    );
  });
});
