import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  /**
   * Для `healthcheck` в docker-compose.prod.yml. Намеренно без обращения к
   * БД: смысл проверки — «процесс Node жив и принимает соединения», а не
   * «база доступна» (это уже покрыто healthcheck'ом сервиса `db` и падением
   * `api` при старте, если `prisma db push` не проходит).
   */
  @Get('health')
  getHealth(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
