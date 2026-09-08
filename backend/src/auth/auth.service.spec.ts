import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

// Минимальные ручные стабы вместо полного PrismaService/JwtService — login с
// несуществующим email не доходит ни до bcrypt, ни до jwt.sign, так что оба
// достаточно смоделировать пустышками нужной формы (`as any`, единственное
// оправданное место для него в этом файле).
describe('AuthService.login', () => {
  it('кидает UnauthorizedException с code INVALID_CREDENTIALS, если пользователя нет', async () => {
    const prisma = { user: { findUnique: async () => null } } as any;
    // Третий аргумент — TagsService: login до него не доходит, как и до bcrypt.
    const service = new AuthService(prisma, {} as any, {} as any);

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
  // user.create и refreshToken.create. jwt и tags — заглушки, как в блоке
  // AuthService.login выше.
  function makeService(existingUsers: Array<{ id: string; referralSlug?: string }>) {
    const created: any[] = [];
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
        create: async ({ data }: { data: any }) => {
          created.push(data);
          return { id: 'new-user-id', email: data.email, name: data.name };
        },
      },
      refreshToken: { create: async () => ({}) },
    } as any;
    const jwt = { signAsync: async () => 'access-token' } as any;
    const tags = { createDefaults: async () => undefined } as any;
    return { service: new AuthService(prisma, jwt, tags), created };
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
});
