import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AnalyticsService } from './analytics.service';

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

  @Get('market-sentiment')
  async getMarketSentiment(@Query('symbol') symbol?: string) {
    return this.analyticsService.getLongShortRatio(symbol ?? 'BTCUSDT');
  }

  @Get('volatility')
  async getVolatility(@Query('symbol') symbol?: string) {
    return this.analyticsService.getVolatility(symbol ?? 'BTCUSDT');
  }
}
