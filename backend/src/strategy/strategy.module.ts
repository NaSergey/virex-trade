import { Module } from '@nestjs/common';
import { AdminGuard } from '../admin/guards/admin.guard';
import { BybitTerminalClient } from '../terminal/bybit-terminal.client';
import { StrategyController } from './strategy.controller';
import { StrategyReportService } from './strategy-report.service';

/**
 * Стратегия владельца в админке. Раздел изолирован: снаружи берёт Prisma,
 * guard'ы и клиент публичного API Bybit; продукт от него не берёт ничего — снос
 * описан в `frontend/src/views/strategy/README.md`.
 */
@Module({
  controllers: [StrategyController],
  providers: [StrategyReportService, AdminGuard, BybitTerminalClient],
})
export class StrategyModule {}
