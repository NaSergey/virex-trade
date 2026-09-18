import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { parseCandleQuery } from './candle-query';
import { LiveMarketService } from './live-market.service';
import { MarketDataService } from './market-data.service';

// Дефолт, когда клиент вовсе не передал `limit` — не то же самое, что потолок
// явного запроса (`MAX_LIMIT` в candle-query). 5000 в этой роли было случайно
// тяжёлым дефолтом: обычный график просит недавние свечи, а не всю историю разом.
const DEFAULT_LIMIT = 500;

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
    @Res({ passthrough: true }) res?: Response,
  ) {
    const query = parseCandleQuery({ tf, from, to, limit }, DEFAULT_LIMIT);
    const candles = await this.marketData.getCandles({ symbol, ...query });

    // Правая граница окна раньше текущего момента — свечи в нём больше
    // никогда не изменятся, в отличие от текущей/последней свечи, которая
    // ещё формируется. `to` не задан — верхняя граница «сейчас» или вовсе не
    // задана, кэшировать нельзя.
    if (query.to && query.to.getTime() < Date.now()) {
      res?.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    }

    return candles;
  }

  @Get('coverage')
  async getCoverage(@Query('symbol') symbol?: string) {
    return this.marketData.getCoverage(symbol);
  }
}
