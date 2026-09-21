import { Module } from '@nestjs/common';
import { CoinsModule } from '../coins/coins.module';
import { BattlePassController } from './battlepass.controller';
import { BattlePassService } from './battlepass.service';

/**
 * Battle Pass. Сервис экспортируется: XP начисляется в транзакциях чужих
 * модулей — турнира, бектеста, тегов, — и своей транзакции не открывает.
 *
 * Фоновых сервисов здесь нет: сезон вычисляется из календаря, сброс — смена
 * ключа, награды забирает сам человек. В разделении api/worker ничего не
 * меняется.
 *
 * PrismaModule глобальный, поэтому здесь не импортируется.
 */
@Module({
  imports: [CoinsModule],
  controllers: [BattlePassController],
  providers: [BattlePassService],
  exports: [BattlePassService],
})
export class BattlePassModule {}
