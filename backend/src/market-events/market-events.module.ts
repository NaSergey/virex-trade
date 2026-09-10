import { Module } from '@nestjs/common';
import { MarketDataModule } from '../market-data/market-data.module';
import { MarketEventsController } from './market-events.controller';
import { MarketEventsService } from './market-events.service';

@Module({
  imports: [MarketDataModule],
  controllers: [MarketEventsController],
  providers: [MarketEventsService],
  exports: [MarketEventsService],
})
export class MarketEventsModule {}
