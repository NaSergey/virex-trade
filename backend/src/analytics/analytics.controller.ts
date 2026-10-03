import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AnalyticsService } from './analytics.service';

// T-final-review (IMPORTANT): `symbol` идёт прямо в ключ `longShortRatioCache`/
// `liquidityHistoryCache` (analytics.service.ts) БЕЗ проверки формата — сколько
// угодно различных значений от аутентифицированного пользователя (`?symbol=
// <мусор>`) означает сколько угодно записей в этих Map, они никогда не
// вытесняются. Формат тикера — заглавные буквы/цифры разумной длины (реальные
// примеры по кодовой базе: `BTCUSDT`, `1000PEPEUSDT`); нет отдельного реестра
// торгуемых пар, который стоило бы сюда тащить — только фильтр формата.
const SYMBOL_RE = /^[A-Z0-9]{3,20}$/;

function sanitizeSymbol(symbol: string | undefined): string {
  return symbol && SYMBOL_RE.test(symbol) ? symbol : 'BTCUSDT';
}

// All analytics endpoints require a valid access token.
@UseGuards(JwtAuthGuard)
@Controller('api/analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('market')
  async getMarket() {
    return this.analyticsService.getMarketData();
  }

  @Get('cmc20')
  async getCmc20() {
    return this.analyticsService.getCMC20();
  }

  @Get('fear-greed')
  async getFearGreed() {
    return this.analyticsService.getFearAndGreed();
  }

  @Get('defi-tvl')
  async getDefiTvl() {
    return this.analyticsService.getDeFiTVL();
  }

  @Get('liquidity-history')
  async getLiquidityHistory(@Query('symbol') symbol?: string) {
    return this.analyticsService.getLiquidityHistory(sanitizeSymbol(symbol));
  }

  @Get('market-sentiment')
  async getMarketSentiment(@Query('symbol') symbol?: string) {
    return this.analyticsService.getLongShortRatio(sanitizeSymbol(symbol));
  }

  @Get('volatility')
  async getVolatility(@Query('symbol') symbol?: string) {
    // Тот же фильтр формата, что у соседей: кэш волатильности теперь по монете,
    // и ключ из адреса без проверки рос бы без предела.
    return this.analyticsService.getVolatility(sanitizeSymbol(symbol));
  }
}
