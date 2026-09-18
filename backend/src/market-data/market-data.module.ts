import { Module } from '@nestjs/common';
import { BinanceKlinesClient } from './binance-klines.client';
import { LiveMarketService } from './live-market.service';
import { MarketDataController } from './market-data.controller';
import { MarketDataService } from './market-data.service';
import { PriceSyncService } from './price-sync.service';

@Module({
  controllers: [MarketDataController],
  providers: [MarketDataService, PriceSyncService, BinanceKlinesClient, LiveMarketService],
  exports: [MarketDataService, LiveMarketService],
})
export class MarketDataModule {}
