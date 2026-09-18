import { Module } from '@nestjs/common';
import { CoinsController } from './coins.controller';
import { CoinsService } from './coins.service';

/**
 * Внутренняя валюта. Сервис экспортируется: монеты меняются в транзакциях
 * чужих модулей — доната (покупка) и турниров (взнос, возврат, приз), — и
 * своей транзакции не открывают.
 *
 * PrismaModule глобальный, поэтому здесь не импортируется.
 */
@Module({
  controllers: [CoinsController],
  providers: [CoinsService],
  exports: [CoinsService],
})
export class CoinsModule {}
