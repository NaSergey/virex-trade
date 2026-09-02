import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthUser } from '../../auth/strategies/jwt.strategy';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Доступ к владельческой аналитике.
 *
 * Право админа живёт в переменной окружения ADMIN_EMAILS, а не колонкой в
 * users, сознательно: колонку можно выставить любым багом в коде, который
 * пишет в профиль, а раздел показывает почты и поведение ВСЕХ пользователей.
 * Список в .env меняется только тем, у кого есть доступ к серверу.
 *
 * Закрыт по умолчанию: пустой или незаданный ADMIN_EMAILS означает, что админки
 * нет ни у кого. Обратное поведение (нет списка — пускаем всех) один раз
 * ошибиться разрешало бы навсегда.
 *
 * Почта сверяется с БД по userId, а не берётся из токена: адрес в JWT — снимок
 * на момент выдачи, и жить пятнадцать минут после смены почты он не должен.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  private readonly logger = new Logger(AdminGuard.name);
  private warnedMissingConfig = false;

  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const admins = parseAdminEmails(process.env.ADMIN_EMAILS);
    if (admins.size === 0) {
      if (!this.warnedMissingConfig) {
        this.logger.warn(
          'ADMIN_EMAILS is empty — /api/admin is closed to everyone',
        );
        this.warnedMissingConfig = true;
      }
      throw new ForbiddenException('Admin access is not configured');
    }

    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthUser }>();
    const userId = req.user?.userId;
    if (!userId) throw new ForbiddenException('Admin access required');

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (!user || !admins.has(user.email.trim().toLowerCase())) {
      throw new ForbiddenException('Admin access required');
    }

    return true;
  }
}

export function parseAdminEmails(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}
