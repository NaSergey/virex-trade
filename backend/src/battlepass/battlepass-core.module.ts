import { Module } from '@nestjs/common';
import { CoinsModule } from '../coins/coins.module';
import { BattlePassService } from './battlepass.service';

/**
 * Начисление опыта — сервис Battle Pass без его страницы. Его берут модули
 * игр, а они живут и в процессе игр (`GamesAppModule`), где маршрутам
 * `/api/battlepass` делать нечего: их обслуживает `api`. Остальные модули
 * берут `BattlePassModule` — тот же сервис вместе с контроллером.
 *
 * PrismaModule глобальный, поэтому здесь не импортируется.
 */
@Module({
  imports: [CoinsModule],
  providers: [BattlePassService],
  exports: [BattlePassService],
})
export class BattlePassCoreModule {}
