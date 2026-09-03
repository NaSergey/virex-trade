import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

/**
 * Сколько прокси перед API отдают настоящий адрес клиента в X-Forwarded-For.
 *
 * Ноль (по умолчанию) — не доверять заголовку вовсе. Это важно именно здесь:
 * браузер ходит в API через rewrites Next, а Next ставит x-forwarded-for
 * оператором `??=` — то есть заголовок, присланный самим браузером, доезжает до
 * нас нетронутым. Довериться ему без своего прокси впереди значит разрешить
 * подбор пароля: лимит на /auth/login считается по адресу, а адрес тогда
 * называет сам подбиральщик.
 *
 * Единица — когда перед Next стоит обратный прокси (Caddy, nginx): он дописывает
 * или переписывает X-Forwarded-For реальным адресом соединения, и подделка
 * клиента оказывается левее нужного элемента списка. Так настроен
 * docker-compose.prod.yml.
 */
const TRUST_PROXY_HOPS = Math.max(0, Number(process.env.TRUST_PROXY_HOPS) || 0);

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  if (TRUST_PROXY_HOPS > 0) {
    app.set('trust proxy', TRUST_PROXY_HOPS);
  }

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
