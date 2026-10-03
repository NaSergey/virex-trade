import { Module } from '@nestjs/common';
import { BacktestModule } from '../backtest/backtest.module';
import { BattlePassModule } from '../battlepass/battlepass.module';
import { CoinsModule } from '../coins/coins.module';
import { MarketDataModule } from '../market-data/market-data.module';
import { TournamentRunnerService } from './tournament-runner.service';
import { TournamentRatingController, TournamentsController } from './tournaments.controller';
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
  imports: [CoinsModule, MarketDataModule, BacktestModule, BattlePassModule],
  // Рейтинг — первым: его `GET rating` обязан встать раньше `GET :id` турниров.
  controllers: [TournamentRatingController, TournamentsController],
  providers: [TournamentsService, TournamentRunnerService],
  exports: [TournamentsService],
})
export class TournamentsModule {}
