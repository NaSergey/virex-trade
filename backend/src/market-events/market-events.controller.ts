import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MarketEventsService, SLOT_TIMEFRAMES } from './market-events.service';

// T-final-review (IMPORTANT): `days` идёт прямо в кэш-ключ и в полный проход
// по свечам (market-events.service.ts) — без зажима аутентифицированный
// пользователь мог бы дёрнуть `?days=100000` (полный проход по всем 17520
// свечам на каждый такой запрос) или `?days=abc` (`parseInt` даёт `NaN`,
// который ничего не отсекает сам по себе). 730 — тот же дефолт, что был
// раньше: именно столько свечей реально хранится и имеет смысл.
const MAX_CORRELATION_DAYS = 730;

function clampDays(days: string | undefined): number {
  const n = days ? parseInt(days, 10) : NaN;
  if (!Number.isFinite(n) || n < 1) return MAX_CORRELATION_DAYS;
  return Math.min(n, MAX_CORRELATION_DAYS);
}

/** Таймфрейм слотов — только из списка: иначе `?tf=1` поднял бы из базы миллион минуток. */
function slotTimeframe(tf: string | undefined): number {
  const n = tf ? parseInt(tf, 10) : NaN;
  return (SLOT_TIMEFRAMES as readonly number[]).includes(n) ? n : 60;
}

@UseGuards(JwtAuthGuard)
@Controller('api/market-events')
export class MarketEventsController {
  constructor(private readonly marketEvents: MarketEventsService) {}

  /** «Когда BTC чаще растёт» — страница «Рынок» (спека 2026-10-08). */
  @Get('seasonality')
  async getSeasonality(@Query('tf') tf?: string, @Query('days') days?: string) {
    return this.marketEvents.getTimeSlots(slotTimeframe(tf), clampDays(days));
  }

  @Get('hourly')
  async getHourly(@Query('days') days?: string) {
    return this.marketEvents.getHourlyStats(clampDays(days));
  }
}
