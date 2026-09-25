import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { CoinsModule } from '../coins/coins.module';
import { GamesController } from './games.controller';
import { GamesGateway } from './games.gateway';
import { GamesService } from './games.service';

/**
 * Общая инфраструктура столов покера/блэкджека: лобби, эскроу фишек, канал
 * реалтайма. Правила самой игры — отдельные модули поверх этого слоя.
 *
 * `JwtModule.register({})` — как в `AuthModule`: секрет передаётся явно в
 * месте проверки (`GamesGateway`), а не через конфиг модуля.
 *
 * PrismaModule глобальный, поэтому здесь не импортируется. Гейтинг по роли
 * (`role.ts`) не нужен: в `worker` HTTP-порт не открывается, поэтому сокеты
 * там физически недостижимы — тот же принцип, что и у обычных контроллеров.
 */
@Module({
  imports: [CoinsModule, JwtModule.register({})],
  controllers: [GamesController],
  providers: [GamesService, GamesGateway],
  exports: [GamesService, GamesGateway],
})
export class GamesModule {}
