import { Test } from '@nestjs/testing';
import { UsageTrackerService } from './admin/usage/usage-tracker.service';
import { AppController } from './app.controller';
import { BlackjackController } from './blackjack/blackjack.controller';
import { GamesAppModule } from './games-app.module';
import { GamesController } from './games/games.controller';
import { GamesGateway } from './games/games.gateway';
import { JetpackController } from './jetpack/jetpack.controller';
import { PokerController } from './poker/poker.controller';

/**
 * Корень процесса игр собирается отдельно от `AppModule`, и забытая в нём
 * зависимость проявилась бы только краш-лупом контейнера `games` на проде.
 * `compile()` разрешает весь DI, не вызывая хуков жизненного цикла, — базы не
 * нужно.
 */
describe('GamesAppModule', () => {
  it('собирается и несёт игровые контроллеры, сокет, /health и учёт посещений', async () => {
    const ref = await Test.createTestingModule({ imports: [GamesAppModule] }).compile();
    for (const token of [
      AppController,
      GamesController,
      PokerController,
      BlackjackController,
      JetpackController,
      GamesGateway,
      UsageTrackerService,
    ]) {
      expect(ref.get(token, { strict: false })).toBeInstanceOf(token);
    }
    await ref.close();
  });
});
