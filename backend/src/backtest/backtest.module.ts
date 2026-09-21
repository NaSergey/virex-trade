import { Module } from '@nestjs/common';
import { BattlePassModule } from '../battlepass/battlepass.module';
import { MarketDataModule } from '../market-data/market-data.module';
import { BacktestController } from './backtest.controller';
import { BacktestService } from './backtest.service';
import { SyntheticMarketService } from './synthetic/synthetic-market.service';

@Module({
  imports: [MarketDataModule, BattlePassModule],
  controllers: [BacktestController],
  providers: [BacktestService, SyntheticMarketService],
  // Сессии турнира — обычные BacktestSession: модуль турниров ходит сюда за
  // закрытиями движка (`systemClose`) и финалом сессии.
  exports: [BacktestService],
})
export class BacktestModule {}
