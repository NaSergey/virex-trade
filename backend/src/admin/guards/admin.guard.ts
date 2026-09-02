import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthUser } from '../../auth/strategies/jwt.strategy';
import { PrismaService } from '../../prisma/prisma.service';
import { isOwnerEmail } from '../owner';

/**
 * Пускает к аналитике по пользователям только владельца сервиса (см. owner.ts).
 *
 * Почта сверяется с БД по userId, а не берётся из токена: адрес в JWT — снимок
 * на момент выдачи, и переживать смену почты на пятнадцать минут он не должен.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthUser }>();
    const userId = req.user?.userId;
    if (!userId) throw new ForbiddenException('Admin access required');

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (!isOwnerEmail(user?.email))
      throw new ForbiddenException('Admin access required');

    return true;
  }
}
