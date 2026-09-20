import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { resolveJwtAccessSecret } from '../auth/jwt-secret';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

/**
 * Первый WS-канал в проекте. У сокета нет Bearer-заголовка, поэтому токен
 * едет явным полем хендшейка (`auth.token`), а не через HTTP-guard.
 *
 * `join_table`/`leave_table` — это только подписка сокета на обновления
 * конкретного стола (комната socket.io = tableId), не посадка за него:
 * посадка остаётся REST-вызовом `/join`, чтобы деньги двигались только через
 * транзакцию с эскроу монет.
 */
@WebSocketGateway({
  // Хендшейк socket.io идёт своим HTTP-путём, и namespace его не задаёт.
  // Наружу проксируются только `/api/*` и `/auth/*` (deploy/Caddyfile,
  // next.config.ts), а всё прочее забирает гейт фронтенда и уводит на
  // /login — поэтому канал обязан ехать под `/api/`.
  path: '/api/games/socket.io',
  namespace: '/games',
  cors: { origin: process.env.FRONTEND_URL || 'http://localhost:3000', credentials: true },
})
export class GamesGateway implements OnGatewayInit, OnGatewayDisconnect {
  private readonly logger = new Logger(GamesGateway.name);

  @WebSocketServer()
  private server: Server;

  constructor(private readonly jwt: JwtService) {}

  /**
   * Аутентификация — middleware, а не `handleConnection`: socket.io шлёт
   * пакет CONNECT до этого хука, и отказ после него клиент видит как обрыв
   * связи, а не как отказ, и переподключается тем же мёртвым токеном
   * бесконечно. Отказ из middleware приходит клиенту как `connect_error`,
   * и автопереподключение не запускается.
   */
  afterInit(server: Server) {
    server.use(async (client: Socket, next: (err?: Error) => void) => {
      const token = client.handshake.auth?.token as unknown;
      if (typeof token !== 'string' || !token) {
        next(new Error('unauthorized'));
        return;
      }
      try {
        const payload = await this.jwt.verifyAsync<JwtPayload>(token, { secret: resolveJwtAccessSecret() });
        client.data.userId = payload.sub;
        next();
      } catch {
        next(new Error('unauthorized'));
      }
    });
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`disconnected: ${client.id}`);
  }

  @SubscribeMessage('join_table')
  handleJoinTable(client: Socket, tableId: unknown) {
    // handleConnection ждёт verifyAsync и может не успеть выставить userId
    // раньше, чем socket.io доставит это сообщение из того же хендшейка.
    if (!client.data.userId) return;
    if (typeof tableId !== 'string') return;
    client.join(tableId);
  }

  @SubscribeMessage('leave_table')
  handleLeaveTable(client: Socket, tableId: unknown) {
    if (!client.data.userId) return;
    if (typeof tableId !== 'string') return;
    client.leave(tableId);
  }

  /** Снимок стола рассылается комнате после любой мутации (join/leave/close). */
  broadcastTableState(tableId: string, state: unknown) {
    this.server.to(tableId).emit('table_state', state);
  }
}
