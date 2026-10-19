import { Module } from '@nestjs/common';
import { BattlePassCoreModule } from '../battlepass/battlepass-core.module';
import { CoinsModule } from '../coins/coins.module';
import { GamesModule } from '../games/games.module';
import { RaceController } from './race.controller';
import { RaceService } from './race.service';

/**
 * Гонки трёх машин. Лобби и гонки живут в памяти процесса игр (`ROLE=games`) —
 * поэтому он один, как для столов и джетпака. Из `games` — канал сокета.
 * Спека — `2026-10-18-race-game-design.md`.
 */
@Module({
  imports: [CoinsModule, GamesModule, BattlePassCoreModule],
  controllers: [RaceController],
  providers: [RaceService],
})
export class RaceModule {}
