import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import * as cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { GamesAppModule } from './games-app.module';
import { ROLE, servesHttp } from './role';

async function bootstrap() {
  // `games` — свой корень: только игры, без биржи и фона (games-app.module.ts).
  const app = await NestFactory.create(ROLE === 'games' ? GamesAppModule : AppModule);

  // Без этого SIGTERM (docker stop / деплой) убивает процесс сразу, не
  // дав OnModuleDestroy-хукам отработать — в частности, UsageTrackerService
  // (роль api) теряет последний, ещё не сброшенный буфер минут активности, а
  // TradeSyncService/TelegramService и остальной фон (роль worker) не
  // успевают снять свои таймеры и остановить поллинг. Нужен в обеих ролях.
  app.enableShutdownHooks();

  if (!servesHttp()) {
    // ROLE=worker: ни HTTP, ни `/health` этому процессу не нужны — он не
    // стоит за healthcheck'ом compose (тот смотрит на `api`). `listen()` сам
    // вызывает `init()`, если его не позвать явно — а без init() не
    // сработают OnApplicationBootstrap-хуки, и все десять фоновых сервисов
    // и telegram-поллинг просто не стартуют. Порт не открываем вовсе — это
    // и есть "не слушает HTTP", а не просто "на порт никто не приходит".
    await app.init();
    Logger.log(`worker started (ROLE=${ROLE})`, 'Bootstrap');
    return;
  }

  // Дефолт http.Server — 5s keepAliveTimeout. За обратным прокси (Caddy),
  // который держит соединение к api дольше этого срока, это спорадически
  // рвёт keep-alive соединение прямо в момент, когда прокси уже отправил
  // по нему следующий запрос — клиент получает 502. headersTimeout обязан
  // быть больше keepAliveTimeout (таково требование Node: иначе сервер сам
  // не запустится) — берём с тем же запасом, что рекомендует сам Node.
  const httpServer = app.getHttpServer();
  httpServer.keepAliveTimeout = 65_000;
  httpServer.headersTimeout = 66_000;

  // Parse cookies so the refresh token (HttpOnly cookie) is available.
  app.use(cookieParser());

  // Enable global validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strip properties that don't have decorators
      forbidNonWhitelisted: true, // Throw error if non-whitelisted properties are present
      transform: true, // Automatically transform payloads to DTO instances
      transformOptions: {
        enableImplicitConversion: true, // Enable implicit type conversion
      },
    }),
  );

  // Enable CORS for frontend access
  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  });

  await app.listen(process.env.PORT ?? 3000);
  Logger.log(`http started (ROLE=${ROLE})`, 'Bootstrap');
}
bootstrap();
