import { Module } from '@nestjs/common';
import { BattlePassCoreModule } from './battlepass-core.module';
import { BattlePassController } from './battlepass.controller';

/**
 * Battle Pass. Сервис экспортируется: XP начисляется в транзакциях чужих
 * модулей — турнира, бектеста, игр, — и своей транзакции не открывает (кроме
 * `awardSafe` для действий без транзакции в базе). Сам сервис — в
 * `BattlePassCoreModule`: модулям игр он нужен без контроллера.
 *
 * Фоновых сервисов здесь нет: сезон вычисляется из календаря, сброс — смена
 * ключа, награды забирает сам человек. В разделении api/worker ничего не
 * меняется.
 *
 * PrismaModule глобальный, поэтому здесь не импортируется.
 */
@Module({
  imports: [BattlePassCoreModule],
  controllers: [BattlePassController],
  exports: [BattlePassCoreModule],
})
export class BattlePassModule {}
