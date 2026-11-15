import { Module } from '@nestjs/common';
import { LiquidationRecorderService } from './liquidation-recorder.service';

/** Запись ликвидаций Binance и Bybit по минутам (фон `worker`). HTTP-маршрутов нет — данные читает скрипт анализа. */
@Module({
  providers: [LiquidationRecorderService],
})
export class LiquidationsModule {}
