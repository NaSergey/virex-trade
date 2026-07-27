import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TradesService } from './trades.service';
import { TradeSyncService } from './trade-sync.service';
import { TradeContextService, type RangeTf } from './trade-context.service';
import { LabService } from './lab.service';
import { BybitTradeService } from '../bybit/services/bybit-trade.service';
import { CredentialsService } from '../credentials/credentials.service';

@UseGuards(JwtAuthGuard)
@Controller('api/trades')
export class TradesController {
  constructor(
    private readonly tradesService: TradesService,
    private readonly syncService: TradeSyncService,
    private readonly tradeContext: TradeContextService,
    private readonly labService: LabService,
    private readonly bybitTrade: BybitTradeService,
    private readonly credentials: CredentialsService,
  ) {}

  @Get()
  async list(
    @CurrentUser('userId') userId: string,
    @Query('symbol') symbol?: string,
    @Query('days') days?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('tagId') tagId?: string,
    @Query('combo') combo?: string,
    @Query('hasTags') hasTags?: string,
  ) {
    return this.tradesService.list(userId, {
      symbol,
      days: days ? parseInt(days, 10) : undefined,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      tagId: tagId || undefined,
      // Exact tag set of a combo card, comma-separated ids.
      comboTagIds: combo ? combo.split(',').filter(Boolean) : undefined,
      // Contains-all set of a saved combo card, comma-separated ids.
      hasTagIds: hasTags ? hasTags.split(',').filter(Boolean) : undefined,
    });
  }

  @Get('stats')
  async stats(
    @CurrentUser('userId') userId: string,
    @Query('symbol') symbol?: string,
    @Query('days') days?: string,
    @Query('tagId') tagId?: string,
  ) {
    return this.tradesService.stats(userId, {
      symbol,
      days: days ? parseInt(days, 10) : undefined,
      tagId: tagId || undefined,
    });
  }

  // Winrate / PnL by local weekday & hour + hold-duration stats.
  // `tz` is the client's Date.getTimezoneOffset() in minutes.
  @Get('stats-by-time')
  async statsByTime(
    @CurrentUser('userId') userId: string,
    @Query('days') days?: string,
    @Query('tz') tz?: string,
    @Query('tagId') tagId?: string,
  ) {
    return this.tradesService.statsByTime(userId, {
      days: days ? parseInt(days, 10) : undefined,
      tzOffsetMin: tz != null && tz !== '' ? parseInt(tz, 10) : undefined,
      tagId: tagId || undefined,
    });
  }

  // Winrate / PnL grouped by entry-reason tag.
  @Get('stats-by-tag')
  async statsByTag(@CurrentUser('userId') userId: string, @Query('days') days?: string) {
    return this.tradesService.statsByTag(userId, days ? parseInt(days, 10) : undefined);
  }

  // Winrate / PnL grouped by exact tag combination (which combo wins most).
  @Get('stats-by-tag-combo')
  async statsByTagCombo(@CurrentUser('userId') userId: string, @Query('days') days?: string) {
    return this.tradesService.statsByTagCombo(userId, days ? parseInt(days, 10) : undefined);
  }

  // «Лаборатория»: произвольная комбинация фильтров (теги / время / рыночный
  // контекст) → сводка, фасеты и кривая P&L. Все csv-параметры — списки.
  @Get('lab')
  async lab(
    @CurrentUser('userId') userId: string,
    @Query('days') days?: string,
    @Query('tz') tz?: string,
    @Query('tags') tags?: string,
    @Query('direction') direction?: string,
    @Query('symbols') symbols?: string,
    @Query('weekdays') weekdays?: string,
    @Query('hourFrom') hourFrom?: string,
    @Query('hourTo') hourTo?: string,
    @Query('sessions') sessions?: string,
    @Query('trend4h') trend4h?: string,
    @Query('ema200') ema200?: string,
    @Query('atr') atr?: string,
    @Query('vol') vol?: string,
    @Query('rangeTf') rangeTf?: string,
    @Query('range') range?: string,
  ) {
    const csv = (s?: string) => (s ? s.split(',').filter(Boolean) : undefined);
    const int = (s?: string) => {
      const n = s != null && s !== '' ? parseInt(s, 10) : NaN;
      return Number.isFinite(n) ? n : undefined;
    };
    return this.labService.query(userId, {
      days: int(days),
      tzOffsetMin: int(tz),
      tagIds: csv(tags),
      direction: direction === 'long' || direction === 'short' ? direction : undefined,
      symbols: csv(symbols),
      weekdays: csv(weekdays)
        ?.map((w) => parseInt(w, 10))
        .filter((w) => w >= 0 && w <= 6),
      hourFrom: int(hourFrom),
      hourTo: int(hourTo),
      sessions: csv(sessions),
      trend4h: csv(trend4h),
      ema200: ema200 === 'above' || ema200 === 'below' ? ema200 : undefined,
      atr: atr === 'high' || atr === 'low' ? atr : undefined,
      vol: vol === 'high' || vol === 'low' ? vol : undefined,
      rangeTf: rangeTf === '1h' || rangeTf === '4h' || rangeTf === '1d' ? rangeTf : undefined,
      range: range === 'low' || range === 'mid' || range === 'high' ? range : undefined,
    });
  }

  // Entry context of the currently open position (computed at open time by
  // TradeSyncService, so it's available while the position is still running).
  @Get('open-context')
  async openContext(
    @CurrentUser('userId') userId: string,
    @Query('symbol') symbol?: string,
    @Query('direction') direction?: string,
  ) {
    return this.tradesService.openPositionContext(userId, symbol ?? '', direction ?? '');
  }

  // Entry/exit fill markers for the chart (one per order, recent window).
  @Get('executions')
  async executions(
    @CurrentUser('userId') userId: string,
    @Query('symbol') symbol: string,
    @Query('days') days?: string,
  ) {
    if (!symbol) return { success: false, executions: [] };
    const creds = await this.credentials.requireDecrypted(userId);
    const executions = await this.bybitTrade.fetchExecutions(creds, {
      symbol,
      days: days ? parseInt(days, 10) : undefined,
    });
    return { success: true, executions };
  }

  // Все ордера одной позиции (раскрытая строка таблицы сделок). Объявлен
  // после статических путей, иначе ':id' перехватил бы 'stats' и остальные.
  @Get(':id/orders')
  async orders(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.tradesService.positionOrders(userId, id);
  }

  // Свечи + границы окна + вход: всё, чтобы глазами проверить, что «диапазон
  // входа» посчитан по тем свечам и по той цене, по которым должен.
  @Get(':id/range-check')
  async rangeCheck(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Query('tf') tf?: string,
  ) {
    const timeframe: RangeTf = tf === '1h' || tf === '1d' ? tf : '4h';
    return this.tradeContext.rangeCheck(userId, id, timeframe);
  }

  // Manual re-sync (full backfill) — useful after connecting new API keys.
  @Post('sync')
  async sync(@CurrentUser('userId') userId: string) {
    await this.credentials.requireDecrypted(userId);
    const { inserted } = await this.syncService.syncUser(userId, { full: true });
    return { success: true, inserted };
  }
}
