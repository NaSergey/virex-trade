import { Module } from '@nestjs/common';
import { BattlePassCoreModule } from '../battlepass/battlepass-core.module';
import { CoinsModule } from '../coins/coins.module';
import { SlotsController } from './slots.controller';
import { SlotsService } from './slots.service';

/** Слоты против заведения. Состояния в памяти нет; живут в процессе игр рядом с остальными. */
@Module({
  imports: [CoinsModule, BattlePassCoreModule],
  controllers: [SlotsController],
  providers: [SlotsService],
})
export class SlotsModule {}
