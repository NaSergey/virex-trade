import { Module } from '@nestjs/common';
import { BacktestModule } from '../backtest/backtest.module';
import { CoinsModule } from '../coins/coins.module';
import { MarketDataModule } from '../market-data/market-data.module';
import { TournamentsController } from './tournaments.controller';
import { TournamentsService } from './tournaments.service';

/**
 * Торговый турнир — первая игра раздела «Турниры».
 *
 * Своего торгового движка у него нет: сессия участника — обычная
 * `BacktestSession`, поэтому модуль ходит в `BacktestModule` за закрытиями и
 * финалом сессии, а в `MarketDataModule` — за живой ценой.
 *
 * PrismaModule глобальный, поэтому здесь не импортируется.
 */
@Module({
  imports: [CoinsModule, MarketDataModule, BacktestModule],
  controllers: [TournamentsController],
  providers: [TournamentsService],
  exports: [TournamentsService],
})
export class TournamentsModule {}
