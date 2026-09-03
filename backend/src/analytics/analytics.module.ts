import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { LiquiditySnapshotService } from './liquidity-snapshot.service';

@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsService, LiquiditySnapshotService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
