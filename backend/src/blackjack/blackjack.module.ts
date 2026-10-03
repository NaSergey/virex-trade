import { Module } from '@nestjs/common';
import { CoinsModule } from '../coins/coins.module';
import { GamesModule } from '../games/games.module';
import { BlackjackController } from './blackjack.controller';
import { BlackjackService } from './blackjack.service';

/**
 * Блэкджек против крупье-казино поверх общих столов игр. Раунд живёт в памяти
 * процесса игр (`ROLE=games`) — поэтому он обязан оставаться одним, как и для
 * покера; см. спеку `2026-09-24-blackjack-design.md`.
 */
@Module({
  imports: [CoinsModule, GamesModule],
  controllers: [BlackjackController],
  providers: [BlackjackService],
})
export class BlackjackModule {}
