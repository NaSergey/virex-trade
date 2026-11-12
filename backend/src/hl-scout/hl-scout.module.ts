import { Module } from '@nestjs/common';
import { AdminGuard } from '../admin/guards/admin.guard';
import { TelegramModule } from '../telegram/telegram.module';
import { HlScoutService } from './hl-scout.service';
import { HlSnapshotService } from './hl-snapshot.service';
import { HlPositionWatchService } from './hl-position-watch.service';
import { HlWalletsService } from './hl-wallets.service';
import { HlWalletsController } from './hl-wallets.controller';

/**
 * Бот отбора кошельков Hyperliquid (фон `worker`, `HlScoutService`), уведомления
 * о взятых позициях сохранённых кошельков (`HlPositionWatchService`, тоже
 * `worker`) и страница владельца на поддомене админки (`HlWalletsController`).
 */
@Module({
  imports: [TelegramModule],
  controllers: [HlWalletsController],
  providers: [
    HlScoutService,
    HlSnapshotService,
    HlPositionWatchService,
    HlWalletsService,
    AdminGuard,
  ],
})
export class HlScoutModule {}
