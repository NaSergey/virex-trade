import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { REFERRAL_BONUS_COINS, REFERRAL_WELCOME_COINS } from '../coins/coins.config';
import { isRealEmail } from './identity-rules';

// Без похода в DNS: сама проверка почты — в identity-rules.spec.ts.
jest.mock('./identity-rules', () => ({
  ...jest.requireActual('./identity-rules'),
  isRealEmail: jest.fn(async () => true),
}));

// Минимальные ручные стабы вместо полного PrismaService/JwtService — login с
// несуществующим email не доходит ни до bcrypt, ни до jwt.sign, так что оба
// достаточно смоделировать пустышками нужной формы (`as any`, единственное
// оправданное место для него в этом файле).
describe('AuthService.login', () => {
  it('кидает UnauthorizedException с code INVALID_CREDENTIALS, если пользователя нет', async () => {
    const prisma = { user: { findUnique: async () => null, findFirst: async () => null } } as any;
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
        findFirst: async ({ where }: { where: { OR?: Array<{ id?: string; referralSlug?: string }> } }) => {
          if (!where.OR) return null; // проверка занятости почты — свободна
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

  it('мусор вместо имени — 400 NAME_NOT_READABLE, аккаунт не создаётся', async () => {
    const { service, created } = makeService([]);

    await expect(service.register({ ...baseDto, name: 'sdfsdfsdf' } as any)).rejects.toMatchObject({
      response: { code: 'NAME_NOT_READABLE' },
    });
    expect(created).toHaveLength(0);
  });

  it('почта, на которую нельзя написать, — 400 EMAIL_NOT_REAL, аккаунт не создаётся', async () => {
    const { service, created } = makeService([]);
    (isRealEmail as jest.Mock).mockResolvedValueOnce(false);

    await expect(service.register(baseDto as any)).rejects.toMatchObject({
      response: { code: 'EMAIL_NOT_REAL' },
    });
    expect(created).toHaveLength(0);
  });

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

describe('AuthService: аккаунт без пароля (заведён через Google)', () => {
  const googleOnly = { id: 'g1', email: 'ivan@gmail.com', name: 'Иван', avatarAt: null, password: null };

  it('вход паролем — 401 PASSWORD_NOT_SET: подсказка войти через Google', async () => {
    const prisma = { user: { findUnique: async () => googleOnly } } as any;
    const service = new AuthService(prisma, {} as any, {} as any, {} as any);

    const err = await service.login({ email: 'ivan@gmail.com', password: 'whatever' } as any).catch((e) => e);
    expect(err).toBeInstanceOf(UnauthorizedException);
    expect(err.getResponse()).toMatchObject({ code: 'PASSWORD_NOT_SET' });
  });

  it('смена пароля — 400 PASSWORD_NOT_SET, ничего не пишется', async () => {
    const prisma = {
      user: { findUnique: async () => googleOnly },
      $transaction: jest.fn(),
    } as any;
    const service = new AuthService(prisma, {} as any, {} as any, {} as any);

    const err = await service.changePassword('g1', { current: 'x', next: 'new-password' }).catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.getResponse()).toMatchObject({ code: 'PASSWORD_NOT_SET' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('AuthService.signInWithGoogle', () => {
  const claims = { sub: 'google-sub-1', email: 'ivan.petrov@gmail.com', name: 'Иван Петров' };

  function makeService(opts: {
    linked?: { id: string; email: string; name: string | null; avatarAt: null; password: string | null };
    byEmail?: { id: string; email: string; name: string | null; avatarAt: null; password: string | null };
    inviters?: Array<{ id: string }>;
  }) {
    const created: any[] = [];
    const creditCalls: any[] = [];
    const tx = {
      user: {
        create: async ({ data }: { data: any }) => {
          created.push(data);
          return { id: 'new-user-id', email: data.email, name: data.name, avatarAt: null, password: data.password };
        },
      },
    };
    const prisma = {
      googleAccount: {
        findUnique: jest.fn(async () => (opts.linked ? { sub: claims.sub, user: opts.linked } : null)),
        upsert: jest.fn(async () => ({})),
      },
      user: {
        findFirst: jest.fn(async ({ where }: { where: any }) => {
          if (where.OR) return (opts.inviters ?? []).find((u) => where.OR.some((c: any) => c.id === u.id)) ?? null;
          return opts.byEmail ?? null;
        }),
      },
      refreshToken: {
        create: jest.fn(async () => ({})),
        deleteMany: jest.fn((args: unknown) => ({ op: 'deleteMany', args })),
      },
      $transaction: jest.fn(async (arg: any) => (Array.isArray(arg) ? Promise.all(arg) : arg(tx))),
    } as any;
    prisma.user.update = jest.fn(async ({ data }: { data: any }) => ({ ...opts.byEmail, ...data }));
    const jwt = { signAsync: async () => 'access-token' } as any;
    const tags = { createDefaults: jest.fn(async () => undefined) } as any;
    const coins = {
      credit: async (_tx: any, userId: string, amount: number, kind: string, refId: string) => {
        creditCalls.push({ userId, amount, kind, refId });
      },
    } as any;
    return { service: new AuthService(prisma, jwt, tags, coins), prisma, created, creditCalls, tags };
  }

  it('привязанный аккаунт Google — вход в него, ничего не заводится', async () => {
    const linked = { id: 'u1', email: 'old@gmail.com', name: 'Ваня', avatarAt: null, password: null };
    const { service, created, prisma } = makeService({ linked });

    const out = await service.signInWithGoogle(claims);

    expect(prisma.googleAccount.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { sub: 'google-sub-1' } }),
    );
    expect(created).toHaveLength(0);
    expect(out.user).toMatchObject({ id: 'u1', hasPassword: false });
    expect(out.refreshToken).toEqual(expect.any(String));
  });

  it('аккаунт с той же почтой без пароля — привязка к нему и вход; почта без учёта регистра', async () => {
    const byEmail = { id: 'u2', email: 'Ivan.Petrov@gmail.com', name: 'Иван', avatarAt: null, password: null };
    const { service, created, prisma } = makeService({ byEmail });

    const out = await service.signInWithGoogle(claims);

    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { email: { equals: 'ivan.petrov@gmail.com', mode: 'insensitive' } },
      orderBy: { createdAt: 'asc' },
    });
    expect(prisma.googleAccount.upsert).toHaveBeenCalledWith({
      where: { userId: 'u2' },
      create: { sub: 'google-sub-1', userId: 'u2' },
      update: { sub: 'google-sub-1' },
    });
    expect(created).toHaveLength(0);
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.refreshToken.deleteMany).not.toHaveBeenCalled();
    expect(out.user).toMatchObject({ id: 'u2', hasPassword: false });
  });

  it('аккаунт с той же почтой и паролем — пароль и все сессии снимаются вместе с привязкой', async () => {
    // Регистрация почту не подтверждает: пароль мог поставить тот, кто завёл
    // чужой адрес раньше хозяина. Google подтвердил хозяина — вход паролем у
    // заведшего пропадает, его сессии тоже.
    const byEmail = { id: 'u2', email: 'ivan.petrov@gmail.com', name: 'Иван', avatarAt: null, password: 'hash' };
    const { service, prisma } = makeService({ byEmail });

    const out = await service.signInWithGoogle(claims);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.googleAccount.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u2' } }),
    );
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u2' }, data: { password: null } });
    expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u2' } });
    expect(out.user).toMatchObject({ id: 'u2', hasPassword: false });
  });

  it('новый человек — аккаунт без пароля, с именем из Google и привязкой, стартовые теги', async () => {
    const { service, created, tags } = makeService({});

    const out = await service.signInWithGoogle(claims);

    expect(created).toEqual([
      {
        email: 'ivan.petrov@gmail.com',
        password: null,
        name: 'Иван Петров',
        invitedById: null,
        google: { create: { sub: 'google-sub-1' } },
      },
    ]);
    expect(tags.createDefaults).toHaveBeenCalledWith('new-user-id');
    expect(out.user).toMatchObject({ id: 'new-user-id', hasPassword: false });
  });

  it('новый по приглашению — пригласивший закреплён, монеты обоим, как у регистрации', async () => {
    const { service, created, creditCalls } = makeService({ inviters: [{ id: 'inviter-1' }] });

    await service.signInWithGoogle(claims, 'inviter-1');

    expect(created[0].invitedById).toBe('inviter-1');
    expect(creditCalls).toEqual([
      { userId: 'inviter-1', amount: REFERRAL_BONUS_COINS, kind: 'REFERRAL_BONUS', refId: 'new-user-id' },
      { userId: 'new-user-id', amount: REFERRAL_WELCOME_COINS, kind: 'REFERRAL_WELCOME', refId: 'new-user-id' },
    ]);
  });

  it('почта демо-аккаунта — 403, ни входа, ни привязки', async () => {
    const { service, prisma } = makeService({});

    const err = await service.signInWithGoogle({ ...claims, email: 'demo@example.com' }).catch((e) => e);

    expect(err).toBeInstanceOf(ForbiddenException);
    expect(prisma.googleAccount.findUnique).not.toHaveBeenCalled();
  });
});

describe('AuthService: почта без учёта регистра (SEC-001, 2026-11-06)', () => {
  function makeService(users: Array<{ id: string; email: string; createdAt: number; password?: string | null }>) {
    const created: any[] = [];
    const sorted = () => [...users].sort((a, b) => a.createdAt - b.createdAt);
    const prisma = {
      user: {
        findUnique: async ({ where }: { where: { email?: string; id?: string } }) =>
          users.find((u) => (where.email != null ? u.email === where.email : u.id === where.id)) ?? null,
        findFirst: async ({ where }: { where: any }) => {
          if (where.OR) return null;
          const want = String(where.email.equals).toLowerCase();
          return sorted().find((u) => u.email.toLowerCase() === want) ?? null;
        },
      },
      refreshToken: { create: async () => ({}) },
      $transaction: async (cb: (tx: any) => Promise<any>) =>
        cb({
          user: {
            create: async ({ data }: { data: any }) => {
              created.push(data);
              return { id: 'new-user-id', email: data.email, name: data.name, password: data.password };
            },
          },
        }),
    } as any;
    const jwt = { signAsync: async () => 'access-token' } as any;
    const tags = { createDefaults: async () => undefined } as any;
    const coins = { credit: async () => undefined } as any;
    return { service: new AuthService(prisma, jwt, tags, coins), created };
  }

  it('регистрация хранит почту в нижнем регистре', async () => {
    const { service, created } = makeService([]);

    await service.register({ email: '  Nika.Petrova@Gmail.com ', password: 'password123', name: 'Ника' } as any);

    expect(created[0].email).toBe('nika.petrova@gmail.com');
  });

  it('вариант занятой почты в другом регистре — 409 USER_EXISTS, второй аккаунт не заводится', async () => {
    const { service, created } = makeService([{ id: 'owner', email: 'wxtx.ns@gmail.com', createdAt: 1 }]);

    await expect(
      service.register({ email: 'WXTX.NS@gmail.com', password: 'password123', name: 'Мальчик' } as any),
    ).rejects.toMatchObject({ response: { code: 'USER_EXISTS' } });
    expect(created).toHaveLength(0);
  });

  it('вход по почте в другом регистре находит аккаунт', async () => {
    const password = bcrypt.hashSync('password123', 4);
    const { service } = makeService([{ id: 'u1', email: 'nika@gmail.com', createdAt: 1, password }]);

    const out = await service.login({ email: 'Nika@Gmail.com', password: 'password123' } as any);

    expect(out.user.id).toBe('u1');
  });

  it('старые аккаунты, различающиеся регистром, входят каждый своим паролем', async () => {
    const { service } = makeService([
      { id: 'old', email: 'nika@gmail.com', createdAt: 1, password: bcrypt.hashSync('first-pass', 4) },
      { id: 'new', email: 'NIKA@gmail.com', createdAt: 2, password: bcrypt.hashSync('second-pass', 4) },
    ]);

    expect((await service.login({ email: 'NIKA@gmail.com', password: 'second-pass' } as any)).user.id).toBe('new');
    expect((await service.login({ email: 'nika@gmail.com', password: 'first-pass' } as any)).user.id).toBe('old');
  });

  it('isAdmin — только у самого старого аккаунта с почтой владельца', async () => {
    const password = bcrypt.hashSync('password123', 4);
    const { service } = makeService([
      { id: 'owner', email: 'wxtx.ns@gmail.com', createdAt: 1, password },
      { id: 'intruder', email: 'WXTX.NS@gmail.com', createdAt: 2, password },
    ]);

    expect((await service.login({ email: 'wxtx.ns@gmail.com', password: 'password123' } as any)).user).toMatchObject({
      id: 'owner',
      isAdmin: true,
    });
    expect((await service.login({ email: 'WXTX.NS@gmail.com', password: 'password123' } as any)).user).toMatchObject({
      id: 'intruder',
      isAdmin: false,
    });
  });
});
