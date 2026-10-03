import { Module } from '@nestjs/common';
import { CoinsModule } from '../coins/coins.module';
import { GamesModule } from '../games/games.module';
import { PokerController } from './poker.controller';
import { PokerService } from './poker.service';

/**
 * Безлимитный холдем поверх общих столов игр. Раздачи живут в памяти
 * процесса игр (`ROLE=games`) — поэтому он обязан оставаться одним, см. спеку
 * `2026-09-23-poker-holdem-design.md`.
 */
@Module({
  imports: [CoinsModule, GamesModule],
  controllers: [PokerController],
  providers: [PokerService],
})
export class PokerModule {}
