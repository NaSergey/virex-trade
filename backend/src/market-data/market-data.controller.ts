import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { parseCandleQuery } from './candle-query';
import { LiveMarketService } from './live-market.service';
import { MarketDataService } from './market-data.service';

/**
 * Данные публичные, но эндпоинт под гвардом: открытым он сделал бы из сервера
 * бесплатный прокси к истории BTC для кого угодно.
 */
@UseGuards(JwtAuthGuard)
@Controller('api/market-data')
export class MarketDataController {
  constructor(
    private readonly marketData: MarketDataService,
    private readonly live: LiveMarketService,
  ) {}

  /**
   * Хвост последних минуток для графика турнира в прямом эфире — последняя ещё
   * формируется. serverTime — чтобы браузер вёл момент по часам сервера: цены и
   * время сделок эфира ставит сервер.
   */
  @Get('live')
  async getLive() {
    const { minutes } = await this.live.snapshot();
    return { serverTime: new Date().toISOString(), minutes };
  }

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
