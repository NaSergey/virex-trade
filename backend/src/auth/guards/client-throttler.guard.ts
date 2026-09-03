import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { createHash } from 'crypto';
import { THROTTLE_BY_SESSION } from '../decorators/throttle-by-session.decorator';
import { REFRESH_COOKIE } from '../refresh-cookie';

/**
 * Тот же лимит, но с корректным ключом за прокси.
 *
 * Браузер не ходит в API напрямую: Next проксирует /api и /auth через rewrites
 * (frontend/next.config.ts), поэтому для NestJS источником всех запросов был
 * один адрес — контейнер фронта. Бюджет, задуманный «на человека», оказывался
 * общим на всю базу: при 1000 пользователей одни только плановые /auth/refresh
 * (access-токен живёт 15 минут) дают ~65 запросов в минуту на 30 разрешённых, и
 * лишних выкидывало из сессии без всякой их вины.
 *
 * Настоящий адрес достаётся из X-Forwarded-For — этим занимается сам Express,
 * когда в main.ts выставлен `trust proxy`; здесь остаётся `req.ip`, как в базовом
 * классе. А там, где ключ по адресу всё равно врёт — за NAT оператора связи
 * тысяча трейдеров с телефонов делит десяток адресов, — считаем по сессии:
 * см. {@link ThrottleBySession}.
 */
@Injectable()
export class ClientThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(
    req: Record<string, any>,
    context?: ExecutionContext,
  ): Promise<string> {
    if (context && this.bySession(context)) {
      const raw = req.cookies?.[REFRESH_COOKIE];
      // Куки нет — запрос всё равно будет отвергнут как невалидный; считаем его
      // по адресу, чтобы перебор пустых refresh'ей не проходил мимо лимита.
      if (typeof raw === 'string' && raw.length > 0) {
        return `session:${createHash('sha256').update(raw).digest('hex')}`;
      }
    }
    return `ip:${req.ip}`;
  }

  private bySession(context: ExecutionContext): boolean {
    return (
      this.reflector.getAllAndOverride<boolean>(THROTTLE_BY_SESSION, [
        context.getHandler(),
        context.getClass(),
      ]) === true
    );
  }
}
