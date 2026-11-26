import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../strategies/jwt.strategy';
import { demoLocked, isDemoEmail } from '../demo-account';

/**
 * Закрывает действие демо-аккаунту (403 `ACCOUNT_DEMO_LOCKED`). Ставится после
 * `JwtAuthGuard` — на методе, когда тот стоит на контроллере.
 *
 * Демо общий: его пароль публичен (кнопка «Посмотреть демо»). Ключ биржи,
 * подключённый к нему одним посетителем, торговал бы настоящими деньгами этого
 * посетителя в руках следующего; привязанный Telegram получал бы чужие
 * сигналы. Почта — из базы по id, как у `AdminGuard`.
 */
@Injectable()
export class DemoLockedGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const userId = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthUser }>().user?.userId;
    if (!userId) return true;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (isDemoEmail(user?.email)) throw demoLocked();
    return true;
  }
}
