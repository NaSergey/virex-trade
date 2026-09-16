import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import * as cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Без этого SIGTERM (docker stop / деплой) убивает процесс сразу, не
  // дав OnModuleDestroy-хукам отработать — в частности, UsageTrackerService
  // теряет последний, ещё не сброшенный буфер минут активности молча.
  app.enableShutdownHooks();

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
}
bootstrap();
