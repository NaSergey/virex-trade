import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MarketEventsService } from './market-events.service';

@UseGuards(JwtAuthGuard)
@Controller('api/market-events')
export class MarketEventsController {
  constructor(private readonly marketEvents: MarketEventsService) {}

  @Get('correlation')
  async getCorrelation(@Query('days') days?: string) {
    return this.marketEvents.getCorrelation(days ? parseInt(days, 10) : 730);
  }

  @Get('hourly')
  async getHourly(@Query('days') days?: string) {
    return this.marketEvents.getHourlyStats(days ? parseInt(days, 10) : 730);
  }
}
