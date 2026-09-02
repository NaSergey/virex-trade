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
 * Глобальный интерсептор, отмечающий присутствие пользователя.
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
    const path = req.originalUrl || req.url || '';

    if (userId) {
      const foreground = readForegroundFlag(req);
      // Учитываем сразу, не дожидаясь ответа: присутствие — это факт запроса,
      // а не факт успешного ответа, и ошибка 500 не означает, что человека тут
      // не было. Что именно считать использованием, решает сам трекер
      // (isTrackedPath) — правило одно и живёт в одном месте.
      this.tracker.record(userId, path, req.method, foreground);
    }

    return next.handle();
  }
}

/**
 * `X-Client-Active: 1` фронт шлёт, когда вкладка на переднем плане.
 *
 * Пока не шлёт — и это не оговорка, а состояние: без такого сигнала открытая
 * фоном вкладка со своими опросами неотличима от человека за экраном. Метрика
 * foreground до появления заголовка отдаётся как «нет данных», а не как ноль.
 */
function readForegroundFlag(req: Request): boolean {
  const raw = req.headers['x-client-active'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === '1' || value === 'true';
}
