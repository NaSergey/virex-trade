import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { BybitModule } from './bybit/bybit.module';
import { ExchangesModule } from './exchanges/exchanges.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { TradesModule } from './trades/trades.module';
import { BalanceModule } from './balance/balance.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { SettingsModule } from './settings/settings.module';
import { TagsModule } from './tags/tags.module';
import { TelegramModule } from './telegram/telegram.module';
import { MarketDataModule } from './market-data/market-data.module';
import { MarketEventsModule } from './market-events/market-events.module';
import { BacktestModule } from './backtest/backtest.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AdminModule } from './admin/admin.module';
import { DonationsModule } from './donations/donations.module';
import { CoinsModule } from './coins/coins.module';
import { TournamentsModule } from './tournaments/tournaments.module';
import { ReferralsModule } from './referrals/referrals.module';
import { GamesModule } from './games/games.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    // Default budget for routes that opt into ThrottlerGuard. Deliberately not
    // registered as a global guard: the trading UI polls positions/orders and
    // would trip a blanket limit. AuthController opts in, since password
    // endpoints are the ones worth protecting from brute force.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 30 }]),
    PrismaModule,
    AuthModule,
    BybitModule,
    ExchangesModule,
    TradesModule,
    BalanceModule,
    AnalyticsModule,
    SettingsModule,
    TagsModule,
    TelegramModule,
    MarketDataModule,
    MarketEventsModule,
    BacktestModule,
    NotificationsModule,
    AdminModule,
    DonationsModule,
    CoinsModule,
    TournamentsModule,
    ReferralsModule,
    GamesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
