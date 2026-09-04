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
