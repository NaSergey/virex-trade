import { Module } from '@nestjs/common';
import { BybitModule } from '../bybit/bybit.module';
import { CredentialsModule } from '../credentials/credentials.module';
import { ExchangesModule } from '../exchanges/exchanges.module';
import { TagsModule } from '../tags/tags.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TelegramModule } from '../telegram/telegram.module';
import { TradesController } from './trades.controller';
import { TradesService } from './trades.service';
import { TradeSyncService } from './trade-sync.service';
import { TradeContextService } from './trade-context.service';
import { PositionBuilderService } from './position-builder.service';
import { LabService } from './lab.service';
import { HabitsService } from './habits.service';
import { IndicatorsService } from './indicators.service';
import { AggregateCacheService } from './aggregate-cache';

// PrismaModule is @Global, so PrismaService (and DataVersionService) are
// available without importing it.
@Module({
  imports: [BybitModule, CredentialsModule, ExchangesModule, TagsModule, TelegramModule, NotificationsModule],
  controllers: [TradesController],
  providers: [
    TradesService,
    TradeSyncService,
    TradeContextService,
    PositionBuilderService,
    LabService,
    HabitsService,
    IndicatorsService,
    // Один инстанс кэша на модуль — TradesService/LabService/HabitsService
    // делят один и тот же LRU (T10, A2), а не заводят по кэшу на сервис.
    AggregateCacheService,
  ],
})
export class TradesModule {}
