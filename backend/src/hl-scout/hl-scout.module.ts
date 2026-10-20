import { Module } from '@nestjs/common';
import { AdminGuard } from '../admin/guards/admin.guard';
import { HlScoutService } from './hl-scout.service';
import { HlSnapshotService } from './hl-snapshot.service';
import { HlWalletsService } from './hl-wallets.service';
import { HlWalletsController } from './hl-wallets.controller';

/**
 * Бот отбора кошельков Hyperliquid (фон `worker`, `HlScoutService`) и страница
 * владельца на поддомене админки (`HlWalletsController`).
 */
@Module({
  controllers: [HlWalletsController],
  providers: [HlScoutService, HlSnapshotService, HlWalletsService, AdminGuard],
})
export class HlScoutModule {}
