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
  // Без завершающего слэша. Next в dev отвечает 308 на `/api/games/socket.io/`
  // и срезает слэш (trailingSlash: false), а движок socket.io по умолчанию
  // слушает только адрес со слэшем — рукопожатие получало 404, и стол не
  // получал ни одного обновления. С этим флагом путь сверяется префиксом и
  // принимает обе формы. Клиент обязан ставить тот же флаг.
  addTrailingSlash: false,
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
    // Middleware выше досюда неаутентифицированный сокет не пускает, но
    // проверка остаётся: это граница аутентификации у канала, который возят
    // деньги, и при любой правке middleware обработчики обязаны падать
    // закрыто, а не открыто.
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

  /**
   * Каждому сокету комнаты — свой вид. Нужен покеру: карманные карты видны
   * только владельцу, и общий снимок в комнату их бы раскрыл.
   */
  async emitPersonal(tableId: string, event: string, build: (userId: string) => unknown) {
    const sockets = await this.server.in(tableId).fetchSockets();
    for (const s of sockets) {
      const userId = s.data.userId as string | undefined;
      if (userId) s.emit(event, build(userId));
    }
  }

  /** Снимок стола рассылается комнате после любой мутации (join/leave/close). */
  broadcastTableState(tableId: string, state: unknown) {
    this.server.to(tableId).emit('table_state', state);
  }

  /** Сколько сокетов подписано на комнату — джетпак засыпает, когда смотреть некому. */
  async roomSize(room: string): Promise<number> {
    return (await this.server.in(room).fetchSockets()).length;
  }
}
