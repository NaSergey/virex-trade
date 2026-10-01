import { Module } from '@nestjs/common';
import { BattlePassModule } from '../battlepass/battlepass.module';
import { MarketDataModule } from '../market-data/market-data.module';
import { BacktestController } from './backtest.controller';
import { BacktestService } from './backtest.service';
import { LiveEngineService } from './live-engine.service';
import { LiveSessionRunnerService } from './live-session-runner.service';
import { SyntheticMarketService } from './synthetic/synthetic-market.service';

@Module({
  imports: [MarketDataModule, BattlePassModule],
  controllers: [BacktestController],
  providers: [BacktestService, SyntheticMarketService, LiveEngineService, LiveSessionRunnerService],
  // Сессии турнира — обычные BacktestSession: модуль турниров ходит сюда за
  // движком эфира (`LiveEngineService`) и финалом сессии.
  exports: [BacktestService, LiveEngineService],
})
export class BacktestModule {}
