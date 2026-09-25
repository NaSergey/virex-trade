import { Module } from '@nestjs/common';
import { CoinsModule } from '../coins/coins.module';
import { GamesModule } from '../games/games.module';
import { JetpackController } from './jetpack.controller';
import { JetpackService } from './jetpack.service';

/**
 * Джетпак (crash-игра) против заведения. Раунд живёт в памяти процесса `api`
 * — поэтому `api` обязан оставаться одним процессом, как для покера и
 * блэкджека. Из `games` берётся только канал сокета. Спека —
 * `2026-09-25-jetpack-crash-design.md`.
 */
@Module({
  imports: [CoinsModule, GamesModule],
  controllers: [JetpackController],
  providers: [JetpackService],
})
export class JetpackModule {}
