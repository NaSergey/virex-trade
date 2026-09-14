import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { parseCandleQuery } from './candle-query';
import { MarketDataService } from './market-data.service';

/**
 * Данные публичные, но эндпоинт под гвардом: открытым он сделал бы из сервера
 * бесплатный прокси к истории BTC для кого угодно.
 */
@UseGuards(JwtAuthGuard)
@Controller('api/market-data')
export class MarketDataController {
  constructor(private readonly marketData: MarketDataService) {}

  @Get('candles')
  async getCandles(
    @Query('tf') tf?: string,
    @Query('symbol') symbol?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    return this.marketData.getCandles({ symbol, ...parseCandleQuery({ tf, from, to, limit }) });
  }

  @Get('coverage')
  async getCoverage(@Query('symbol') symbol?: string) {
    return this.marketData.getCoverage(symbol);
  }
}
