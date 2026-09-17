import { BadRequestException, Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MarketDataService } from './market-data.service';

// Потолок отдачи наружу. Внутренние потребители (market-events) лимит не
// передают и получают весь диапазон — им нужно 17 тысяч часовых свечей за два
// года, и резать их этим числом было бы ошибкой.
const MAX_LIMIT = 5000;

// Дефолт, когда клиент вовсе не передал `limit` — не то же самое, что потолок
// явного запроса. 5000 в этой роли было случайно тяжёлым дефолтом: обычный
// график просит недавние свечи, а не всю историю разом.
const DEFAULT_LIMIT = 500;

// Непарсящееся значение не должно молча превращаться в «границы нет»: тогда
// битый `from`/`to` тихо отдаёт последние MAX_LIMIT свечей вместо запрошенного
// окна, и клиент получает HTTP 200 с правдоподобными, но неверными данными.
// Отсутствующий параметр (не передан вовсе) — это законное «границы нет», и
// его правка не касается.
const asDate = (raw: string | undefined, paramName: string): Date | undefined => {
  if (!raw) return undefined;
  const ms = Number(raw);
  if (!Number.isFinite(ms)) {
    throw new BadRequestException(
      `Параметр «${paramName}» не распознан: «${raw}». Формат — миллисекунды эпохи Unix.`,
    );
  }
  return new Date(ms);
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
    @Res({ passthrough: true }) res?: Response,
  ) {
    const requested = Number(limit);
    const toDate = asDate(to, 'to');
    const candles = await this.marketData.getCandles({
      symbol,
      timeframe: Number(tf),
      from: asDate(from, 'from'),
      to: toDate,
      limit: Number.isFinite(requested) && requested > 0 ? Math.min(requested, MAX_LIMIT) : DEFAULT_LIMIT,
    });

    // Правая граница окна раньше текущего момента — свечи в нём больше
    // никогда не изменятся, в отличие от текущей/последней свечи, которая
    // ещё формируется. `to` не задан — верхняя граница «сейчас» или вовсе не
    // задана, кэшировать нельзя.
    if (toDate && toDate.getTime() < Date.now()) {
      res?.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    }

    return candles;
  }

  @Get('coverage')
  async getCoverage(@Query('symbol') symbol?: string) {
    return this.marketData.getCoverage(symbol);
  }
}
