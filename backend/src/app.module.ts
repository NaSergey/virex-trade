import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { BybitModule } from './bybit/bybit.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { TradesModule } from './trades/trades.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { SettingsModule } from './settings/settings.module';
import { TagsModule } from './tags/tags.module';
import { TelegramModule } from './telegram/telegram.module';
import { MarketEventsModule } from './market-events/market-events.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    PrismaModule,
    AuthModule,
    BybitModule,
    TradesModule,
    AnalyticsModule,
    SettingsModule,
    TagsModule,
    TelegramModule,
    MarketEventsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
