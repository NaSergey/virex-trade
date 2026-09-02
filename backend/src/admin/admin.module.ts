import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AdminAnalyticsController } from './admin-analytics.controller';
import { AdminAnalyticsService } from './admin-analytics.service';
import { AdminGuard } from './guards/admin.guard';
import { UsageTrackerService } from './usage/usage-tracker.service';
import { UsageTrackingInterceptor } from './usage/usage-tracking.interceptor';

/**
 * Учёт использования + владельческая аналитика по нему.
 *
 * Интерсептор регистрируется глобально (APP_INTERCEPTOR) прямо отсюда:
 * учитывать надо все запросы приложения, а не только те, чей контроллер кто-то
 * не забыл пометить.
 */
@Module({
  controllers: [AdminAnalyticsController],
  providers: [
    AdminAnalyticsService,
    AdminGuard,
    UsageTrackerService,
    { provide: APP_INTERCEPTOR, useClass: UsageTrackingInterceptor },
  ],
})
export class AdminModule {}
