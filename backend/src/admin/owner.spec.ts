import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AdminGuard } from './guards/admin.guard';
import { DemoLockedGuard } from '../auth/guards/demo-locked.guard';
import { findOwner, isOwnerUser, OWNER_EMAIL } from './owner';

type Row = {
  id: string;
  email: string;
  createdAt: number;
  telegramChatId?: string | null;
};

/** Стаб Prisma: `findFirst` — без учёта регистра и самый старый, как в базе. */
function prismaOf(rows: Row[]) {
  return {
    user: {
      findFirst: jest.fn(
        async ({ where }: { where: { email: { equals: string } } }) => {
          const want = where.email.equals.toLowerCase();
          const hit = [...rows]
            .sort((a, b) => a.createdAt - b.createdAt)
            .find((r) => r.email.toLowerCase() === want);
          return hit
            ? { id: hit.id, telegramChatId: hit.telegramChatId ?? null }
            : null;
        },
      ),
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
        const hit = rows.find((r) => r.id === where.id);
        return hit ? { email: hit.email } : null;
      }),
    },
  } as any;
}

const ctxOf = (userId?: string) =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ user: userId ? { userId } : undefined }),
    }),
  }) as unknown as ExecutionContext;

// SEC-001 (2026-11-06): аккаунт `WXTX.NS@…` проходил проверку почты без учёта
// регистра и получал админку, план и бэкап базы в Telegram.
describe('владелец — один аккаунт, а не почта', () => {
  const rows: Row[] = [
    {
      id: 'owner',
      email: OWNER_EMAIL,
      createdAt: 1,
      telegramChatId: 'owner-chat',
    },
    {
      id: 'intruder',
      email: 'WXTX.NS@gmail.com',
      createdAt: 2,
      telegramChatId: 'intruder-chat',
    },
  ];

  it('findOwner — самый старый аккаунт с этой почтой в любом регистре', async () => {
    expect(await findOwner(prismaOf(rows))).toEqual({
      id: 'owner',
      telegramChatId: 'owner-chat',
    });
  });

  it('findOwner ищет почту владельца без учёта регистра и по возрастанию даты', async () => {
    const prisma = prismaOf(rows);
    await findOwner(prisma);
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { email: { equals: OWNER_EMAIL, mode: 'insensitive' } },
      orderBy: [{ createdAt: 'asc' }],
      select: { id: true, telegramChatId: true },
    });
  });

  it('вариант почты в другом регистре владельцем не считается', async () => {
    const prisma = prismaOf(rows);
    expect(await isOwnerUser(prisma, 'owner')).toBe(true);
    expect(await isOwnerUser(prisma, 'intruder')).toBe(false);
    expect(await isOwnerUser(prisma, undefined)).toBe(false);
  });

  it('владелец сохранил почту не в нижнем регистре — он всё равно владелец', async () => {
    const prisma = prismaOf([
      { id: 'owner', email: 'Wxtx.Ns@gmail.com', createdAt: 1 },
    ]);
    expect(await isOwnerUser(prisma, 'owner')).toBe(true);
  });

  it('AdminGuard пускает владельца и отказывает варианту его почты', async () => {
    const guard = new AdminGuard(prismaOf(rows));
    await expect(guard.canActivate(ctxOf('owner'))).resolves.toBe(true);
    await expect(guard.canActivate(ctxOf('intruder'))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(guard.canActivate(ctxOf())).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});

// SEC-005 (2026-11-06): ключ биржи, подключённый к общему демо, торговал бы
// настоящими деньгами посетителя в руках следующего.
describe('DemoLockedGuard', () => {
  const rows: Row[] = [
    { id: 'demo', email: 'demo@example.com', createdAt: 1 },
    { id: 'nika', email: 'nika@gmail.com', createdAt: 2 },
  ];

  it('демо-аккаунту — 403 ACCOUNT_DEMO_LOCKED', async () => {
    const guard = new DemoLockedGuard(prismaOf(rows));
    await expect(guard.canActivate(ctxOf('demo'))).rejects.toMatchObject({
      response: { code: 'ACCOUNT_DEMO_LOCKED' },
    });
  });

  it('остальных пропускает', async () => {
    const guard = new DemoLockedGuard(prismaOf(rows));
    await expect(guard.canActivate(ctxOf('nika'))).resolves.toBe(true);
  });
});
