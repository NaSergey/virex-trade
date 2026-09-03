import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module';
import { MarketEventsModule } from '../market-events/market-events.module';
import { TelegramModule } from '../telegram/telegram.module';
import { PrefsModule } from './prefs.module';
import { NotifierService } from './notifier.service';
import { MarketAlertsService } from './market-alerts.service';
import { TradeAlertsService } from './trade-alerts.service';
import { WeeklyReportService } from './weekly-report.service';
import { NotificationsController } from './notifications.controller';

@Module({
  imports: [PrefsModule, TelegramModule, AnalyticsModule, MarketEventsModule],
  controllers: [NotificationsController],
  providers: [NotifierService, MarketAlertsService, TradeAlertsService, WeeklyReportService],
  exports: [NotifierService, TradeAlertsService],
})
export class NotificationsModule {}
