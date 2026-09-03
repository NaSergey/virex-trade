import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module';
import { MarketEventsModule } from '../market-events/market-events.module';
import { TelegramModule } from '../telegram/telegram.module';
import { PrefsModule } from './prefs.module';
import { NotifierService } from './notifier.service';
import { MarketAlertsService } from './market-alerts.service';
import { TradeAlertsService } from './trade-alerts.service';

@Module({
  imports: [PrefsModule, TelegramModule, AnalyticsModule, MarketEventsModule],
  providers: [NotifierService, MarketAlertsService, TradeAlertsService],
  exports: [NotifierService, TradeAlertsService],
})
export class NotificationsModule {}
