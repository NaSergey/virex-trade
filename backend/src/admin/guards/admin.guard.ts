import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthUser } from '../../auth/strategies/jwt.strategy';
import { PrismaService } from '../../prisma/prisma.service';
import { isOwnerUser } from '../owner';

/**
 * Пускает к аналитике по пользователям только владельца сервиса (см. owner.ts).
 *
 * Сверяется id аккаунта владельца из БД (`isOwnerUser`), а не почта из
 * токена: адрес в JWT — снимок на момент выдачи, а совпадение почты без учёта
 * регистра давало права любому, кто завёл её вариант (`WXTX.NS@…`).
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

    if (!(await isOwnerUser(this.prisma, userId)))
      throw new ForbiddenException('Admin access required');

    return true;
  }
}
