import { Controller, INestApplication, Post, UseGuards } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { Throttle, ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import * as request from 'supertest';
import { trustProxy } from './http-proxy';

@Controller('limited')
@UseGuards(ThrottlerGuard)
class LimitedController {
  @Post()
  @Throttle({ default: { limit: 2, ttl: 60_000 } })
  hit() {
    return { ok: true };
  }
}

async function appWith(trust: boolean): Promise<INestApplication> {
  const module = await Test.createTestingModule({
    imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 30 }])],
    controllers: [LimitedController],
  }).compile();
  const app = module.createNestApplication<NestExpressApplication>();
  if (trust) trustProxy(app);
  await app.init();
  return app;
}

const hit = (app: INestApplication, forwarded: string) =>
  request(app.getHttpServer())
    .post('/limited')
    .set('X-Forwarded-For', forwarded);

describe('лимит за прокси', () => {
  let app: INestApplication;
  afterEach(() => app.close());

  it('без trustProxy все посетители делят один счётчик: то, что и чинится', async () => {
    app = await appWith(false);
    await hit(app, '9.9.9.1').expect(201);
    await hit(app, '9.9.9.2').expect(201);
    await hit(app, '9.9.9.3').expect(429);
  });

  it('у каждого посетителя свой счётчик: чужие запросы его не тратят', async () => {
    app = await appWith(true);
    await hit(app, '9.9.9.1').expect(201);
    await hit(app, '9.9.9.1').expect(201);
    await hit(app, '9.9.9.1').expect(429);
    await hit(app, '9.9.9.2').expect(201);
  });

  it('подделка в левой части заголовка не даёт нового счётчика: перебор паролей не обойти', async () => {
    app = await appWith(true);
    await hit(app, '1.1.1.1, 9.9.9.1').expect(201);
    await hit(app, '2.2.2.2, 9.9.9.1').expect(201);
    await hit(app, '3.3.3.3, 9.9.9.1').expect(429);
  });
});
