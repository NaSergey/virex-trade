import { Module } from '@nestjs/common';
import { AdminAnalyticsController } from './admin-analytics.controller';
import { AdminAnalyticsService } from './admin-analytics.service';
import { AdminGuard } from './guards/admin.guard';
import { UsageCleanupService } from './usage/usage-cleanup.service';
import { UsageModule } from './usage/usage.module';

/**
 * Владельческая аналитика по учёту использования. Сам учёт (трекер и
 * глобальный интерсептор) — в `UsageModule`: он нужен и процессу игр, которому
 * отчёты ни к чему.
 */
@Module({
  imports: [UsageModule],
  controllers: [AdminAnalyticsController],
  providers: [AdminAnalyticsService, AdminGuard, UsageCleanupService],
})
export class AdminModule {}
