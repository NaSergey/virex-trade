import { Module } from '@nestjs/common';
import { BybitModule } from '../bybit/bybit.module';
import { CredentialsModule } from '../credentials/credentials.module';
import { TagsModule } from '../tags/tags.module';
import { TelegramModule } from '../telegram/telegram.module';
import { TradesController } from './trades.controller';
import { TradesService } from './trades.service';
import { TradeSyncService } from './trade-sync.service';
import { TradeContextService } from './trade-context.service';
import { PositionBuilderService } from './position-builder.service';
import { LabService } from './lab.service';
import { IndicatorsService } from './indicators.service';

// PrismaModule is @Global, so PrismaService is available without importing it.
@Module({
  imports: [BybitModule, CredentialsModule, TagsModule, TelegramModule],
  controllers: [TradesController],
  providers: [
    TradesService,
    TradeSyncService,
    TradeContextService,
    PositionBuilderService,
    LabService,
    IndicatorsService,
  ],
})
export class TradesModule {}
