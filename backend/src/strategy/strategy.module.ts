import { Module } from '@nestjs/common';
import { AdminGuard } from '../admin/guards/admin.guard';
import { StrategyController } from './strategy.controller';
import { StrategyReportService } from './strategy-report.service';

/**
 * Стратегия владельца в админке. Раздел изолирован: снаружи берёт Prisma,
 * guard'ы и символ BTC; продукт от него не берёт ничего — снос описан в
 * `frontend/src/views/strategy/README.md`.
 */
@Module({
  controllers: [StrategyController],
  providers: [StrategyReportService, AdminGuard],
})
export class StrategyModule {}
