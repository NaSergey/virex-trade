import { Module } from '@nestjs/common';
import { TelegramModule } from '../telegram/telegram.module';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { VolatilityAlertService } from './volatility-alert.service';

@Module({
  imports: [TelegramModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, VolatilityAlertService],
})
export class AnalyticsModule {}
