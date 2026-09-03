import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthUser } from '../strategies/jwt.strategy';

/**
 * Авторизация, если она есть, и проход дальше, если её нет.
 *
 * Обычный JwtAuthGuard отвечает 401 на отсутствующий или протухший токен.
 * Есть запросы, которым владелец нужен, но не обязателен: кнопка «Поддержать
 * разработчика» может стоять и на публичной странице, и донат анонима — это
 * нормальный донат, просто без userId.
 *
 * Отказ стратегии здесь гасится: `handleRequest` возвращает null вместо
 * исключения, и `request.user` остаётся пустым. Подделать пользователя это не
 * позволяет — валидным токен по-прежнему делает только подпись.
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<T = AuthUser>(_err: unknown, user: T | false): T | null {
    return user || null;
  }

  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }
}
