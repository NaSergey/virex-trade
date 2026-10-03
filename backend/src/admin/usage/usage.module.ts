import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { UsageTrackerService } from './usage-tracker.service';
import { UsageTrackingInterceptor } from './usage-tracking.interceptor';

/**
 * Учёт посещений: трекер и глобальный интерсептор (APP_INTERCEPTOR —
 * учитывать надо все запросы приложения, а не только те, чей контроллер кто-то
 * не забыл пометить).
 *
 * Отдельно от `AdminModule`, потому что учёт нужен каждой HTTP-роли, а отчёты
 * владельца — только `api`: процесс игр (`GamesAppModule`) берёт учёт без
 * аналитики.
 */
@Module({
  providers: [UsageTrackerService, { provide: APP_INTERCEPTOR, useClass: UsageTrackingInterceptor }],
})
export class UsageModule {}
