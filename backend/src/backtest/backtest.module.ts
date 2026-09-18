import { Module } from '@nestjs/common';
import { MarketDataModule } from '../market-data/market-data.module';
import { BacktestController } from './backtest.controller';
import { BacktestService } from './backtest.service';
import { SyntheticMarketService } from './synthetic/synthetic-market.service';

@Module({
  imports: [MarketDataModule],
  controllers: [BacktestController],
  providers: [BacktestService, SyntheticMarketService],
})
export class BacktestModule {}
