import { Module } from '@nestjs/common';
import { BybitModule } from '../bybit/bybit.module';
import { MarketEventsController } from './market-events.controller';
import { MarketEventsService } from './market-events.service';
import { DailyPriceSyncService } from './daily-price-sync.service';
import { HourlyPriceSyncService } from './hourly-price-sync.service';

@Module({
  imports: [BybitModule],
  controllers: [MarketEventsController],
  providers: [MarketEventsService, DailyPriceSyncService, HourlyPriceSyncService],
})
export class MarketEventsModule {}
