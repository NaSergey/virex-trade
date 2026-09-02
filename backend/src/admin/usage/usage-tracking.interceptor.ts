import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { Request } from 'express';
import { AuthUser } from '../../auth/strategies/jwt.strategy';
import { UsageTrackerService } from './usage-tracker.service';

/**
 * Глобальный интерсептор, отмечающий, что пользователь был в сервисе.
 *
 * Регистрируется глобально, а не навешивается на каждый контроллер, ровно
 * потому, что забытый декоратор здесь не ломается заметно: раздел просто тихо
 * выпадает из статистики, и понять это можно только по подозрительно ровному
 * нулю через месяц.
 *
 * Интерсепторы в Nest выполняются ПОСЛЕ guard-ов, поэтому request.user здесь
 * уже проставлен JwtAuthGuard-ом. Запросы без него — публичные (логин,
 * health-check) — не учитываются: пользователь неизвестен, а гадать по IP
 * значит смешивать разных людей в одного.
 */
@Injectable()
export class UsageTrackingInterceptor implements NestInterceptor {
  constructor(private readonly tracker: UsageTrackerService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthUser }>();
    const userId = req.user?.userId;

    if (userId) {
      // Учитываем сразу, не дожидаясь ответа: заход — это факт запроса, а не
      // факт успешного ответа, и ошибка 500 не означает, что человека тут не
      // было. Что именно считать использованием, решает сам трекер
      // (isTrackedPath) — правило одно и живёт в одном месте.
      this.tracker.record(userId, req.originalUrl || req.url || '', req.method);
    }

    return next.handle();
  }
}
