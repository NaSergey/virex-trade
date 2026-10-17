import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { REFERRAL_BONUS_COINS, REFERRAL_WELCOME_COINS } from '../coins/coins.config';

// Минимальные ручные стабы вместо полного PrismaService/JwtService — login с
// несуществующим email не доходит ни до bcrypt, ни до jwt.sign, так что оба
// достаточно смоделировать пустышками нужной формы (`as any`, единственное
// оправданное место для него в этом файле).
describe('AuthService.login', () => {
  it('кидает UnauthorizedException с code INVALID_CREDENTIALS, если пользователя нет', async () => {
    const prisma = { user: { findUnique: async () => null } } as any;
    // Третий и четвёртый аргументы — TagsService и CoinsService: login до них
    // не доходит, как и до bcrypt.
    const service = new AuthService(prisma, {} as any, {} as any, {} as any);

    let caught: unknown;
    try {
      await service.login({ email: 'ghost@example.com', password: 'whatever' } as any);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(UnauthorizedException);
    expect((caught as UnauthorizedException).getResponse()).toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
  });
});

describe('AuthService.register', () => {
  const baseDto = { email: 'new@example.com', password: 'password123', name: 'New User' };

  // Ручной стаб PrismaService: register() трогает user.findUnique (по email),
  // user.findFirst (резолвит ref по id ИЛИ по слагу — см. resolveInviter),
  // $transaction (внутри которого — user.create), и вне транзакции —
  // refreshToken.create. jwt и tags — заглушки, как в блоке AuthService.login
  // выше. coins.credit пишет вызовы в creditCalls вместо jest.fn — тот же
  // ручной стиль, что и у created.
  function makeService(existingUsers: Array<{ id: string; referralSlug?: string }>) {
    const created: any[] = [];
    const creditCalls: any[] = [];
    const txClient = {
      user: {
        create: async ({ data }: { data: any }) => {
          created.push(data);
          return { id: 'new-user-id', email: data.email, name: data.name };
        },
      },
    };
    const prisma = {
      user: {
        findUnique: async () => null, // почта всегда свободна в этих тестах
        findFirst: async ({ where }: { where: { OR: Array<{ id?: string; referralSlug?: string }> } }) => {
          for (const cond of where.OR) {
            const found = existingUsers.find(
              (u) => (cond.id && u.id === cond.id) || (cond.referralSlug && u.referralSlug === cond.referralSlug),
            );
            if (found) return found;
          }
          return null;
        },
      },
      refreshToken: { create: async () => ({}) },
      $transaction: async (cb: (tx: any) => Promise<any>) => cb(txClient),
    } as any;
    const jwt = { signAsync: async () => 'access-token' } as any;
    const tags = { createDefaults: async () => undefined } as any;
    const coins = {
      credit: async (tx: any, userId: string, amount: number, kind: string, refId: string) => {
        creditCalls.push({ tx, userId, amount, kind, refId });
      },
    } as any;
    return { service: new AuthService(prisma, jwt, tags, coins), created, creditCalls };
  }

  it('валидный ref по id закрепляет пригласившего', async () => {
    const { service, created } = makeService([{ id: 'inviter-1' }]);

    await service.register({ ...baseDto, ref: 'inviter-1' } as any);

    expect(created[0].invitedById).toBe('inviter-1');
  });

  it('валидный ref по кастомному слагу закрепляет пригласившего (без учёта регистра)', async () => {
    const { service, created } = makeService([{ id: 'inviter-1', referralSlug: 'sergey' }]);

    await service.register({ ...baseDto, ref: 'Sergey' } as any);

    expect(created[0].invitedById).toBe('inviter-1');
  });

  it('несуществующий ref не падает и не закрепляет пригласившего', async () => {
    const { service, created } = makeService([]);

    await service.register({ ...baseDto, ref: 'ghost' } as any);

    expect(created[0].invitedById).toBeNull();
  });

  it('без ref не закрепляет пригласившего', async () => {
    const { service, created } = makeService([]);

    await service.register(baseDto as any);

    expect(created[0].invitedById).toBeNull();
  });

  it('валидный ref начисляет пригласившему реферальный бонус', async () => {
    const { service, creditCalls } = makeService([{ id: 'inviter-1' }]);

    await service.register({ ...baseDto, ref: 'inviter-1' } as any);

    expect(creditCalls).toEqual([
      {
        tx: expect.anything(),
        userId: 'inviter-1',
        amount: REFERRAL_BONUS_COINS,
        kind: 'REFERRAL_BONUS',
        refId: 'new-user-id',
      },
      {
        tx: expect.anything(),
        userId: 'new-user-id',
        amount: REFERRAL_WELCOME_COINS,
        kind: 'REFERRAL_WELCOME',
        refId: 'new-user-id',
      },
    ]);
  });

  it('без ref не начисляет реферальный бонус', async () => {
    const { service, creditCalls } = makeService([]);

    await service.register(baseDto as any);

    expect(creditCalls).toEqual([]);
  });

  it('несуществующий ref не начисляет реферальный бонус', async () => {
    const { service, creditCalls } = makeService([]);

    await service.register({ ...baseDto, ref: 'ghost' } as any);

    expect(creditCalls).toEqual([]);
  });
});

describe('AuthService.changePassword', () => {
  const OLD = 'old-password';

  function makeService(email = 'nika@example.com') {
    const user = { id: 'u1', email, name: 'Ника', avatarAt: null, password: bcrypt.hashSync(OLD, 4) };
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(user),
        update: jest.fn((args: unknown) => ({ op: 'update', args })),
      },
      refreshToken: {
        deleteMany: jest.fn((args: unknown) => ({ op: 'deleteMany', args })),
        create: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn().mockResolvedValue([]),
    } as any;
    const jwt = { signAsync: async () => 'access-token' } as any;
    return { service: new AuthService(prisma, jwt, {} as any, {} as any), prisma };
  }

  it('неверный текущий — 400 PASSWORD_WRONG, а не 401: на 401 клиент решил бы, что кончилась сессия', async () => {
    const { service, prisma } = makeService();
    const err = await service.changePassword('u1', { current: 'nope', next: 'new-password' }).catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.getResponse()).toMatchObject({ code: 'PASSWORD_WRONG' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('новый равен текущему — 400 PASSWORD_SAME', async () => {
    const { service } = makeService();
    const err = await service.changePassword('u1', { current: OLD, next: OLD }).catch((e) => e);
    expect(err.getResponse()).toMatchObject({ code: 'PASSWORD_SAME' });
  });

  it('демо-аккаунт — 403: его пароль общий для всех посетителей витрины', async () => {
    const { service, prisma } = makeService('demo@example.com');
    const err = await service.changePassword('u1', { current: OLD, next: 'new-password' }).catch((e) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect(err.getResponse()).toMatchObject({ code: 'ACCOUNT_DEMO_LOCKED' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('новый хэш и снятие всех refresh-токенов — одной транзакцией, потом новая пара этому устройству', async () => {
    const { service, prisma } = makeService();

    const out = await service.changePassword('u1', { current: OLD, next: 'new-password' });

    const [ops] = prisma.$transaction.mock.calls[0];
    expect(ops).toHaveLength(2);
    const update = prisma.user.update.mock.calls[0][0];
    expect(update.where).toEqual({ id: 'u1' });
    expect(await bcrypt.compare('new-password', update.data.password)).toBe(true);
    expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
    // Новая пара выдаётся после снятия старых — иначе транзакция сняла бы и её.
    expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
    expect(out).toMatchObject({ accessToken: 'access-token', user: { id: 'u1', name: 'Ника' } });
    expect(out.refreshToken).toEqual(expect.any(String));
  });
});
