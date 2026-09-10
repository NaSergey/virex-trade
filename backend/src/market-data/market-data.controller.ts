import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MarketDataService } from './market-data.service';
import { SYMBOL } from './timeframes';

// Потолок отдачи наружу. Внутренние потребители (market-events) лимит не
// передают и получают весь диапазон — им нужно 17 тысяч часовых свечей за два
// года, и резать их этим числом было бы ошибкой.
const MAX_LIMIT = 5000;

const asDate = (raw?: string): Date | undefined => {
  if (!raw) return undefined;
  const ms = Number(raw);
  return Number.isFinite(ms) ? new Date(ms) : undefined;
};

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
    const requested = Number(limit);
    return this.marketData.getCandles({
      symbol: symbol ?? SYMBOL,
      timeframe: Number(tf),
      from: asDate(from),
      to: asDate(to),
      limit: Number.isFinite(requested) && requested > 0 ? Math.min(requested, MAX_LIMIT) : MAX_LIMIT,
    });
  }

  @Get('coverage')
  async getCoverage(@Query('symbol') symbol?: string) {
    return this.marketData.getCoverage(symbol ?? SYMBOL);
  }
}
