import { Controller, Get, Headers, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TradesService } from './trades.service';
import { TradeSyncService } from './trade-sync.service';
import { TradeContextService, isRangeTf, type RangeTf } from './trade-context.service';
import { LabService } from './lab.service';
import { HabitsService } from './habits.service';
import { CredentialsService } from '../credentials/credentials.service';
import { ExchangeRegistry } from '../exchanges/exchange-registry.service';
import { DataVersionService } from '../prisma/data-version.service';
import { buildEtag } from './aggregate-cache';
import type { LabFilter } from './lab.service';

@UseGuards(JwtAuthGuard)
@Controller('api/trades')
export class TradesController {
  constructor(
    private readonly tradesService: TradesService,
    private readonly syncService: TradeSyncService,
    private readonly tradeContext: TradeContextService,
    private readonly labService: LabService,
    private readonly habitsService: HabitsService,
    private readonly credentials: CredentialsService,
    private readonly exchanges: ExchangeRegistry,
    private readonly dataVersion: DataVersionService,
  ) {}

  /**
   * A2 (T10): ETag/304 на агрегатах сделок. Версия читается ОДНИМ дешёвым
   * `SELECT dataVersion` — до вызова тяжёлого сервисного метода, а не после,
   * так что запрос с совпавшим `If-None-Match` не трогает ни LRU-кэш агрегатов,
   * ни тем более сам агрегат: единственная работа с базой на этом пути — этот
   * самый SELECT. `ETag` слабый (`W/"..."`): тело может отличаться до байта
   * (например, порядок ключей JSON) при той же самой версии данных, а нас
   * интересует только "данные не менялись".
   *
   * `@Res()` без `passthrough` — контроллер сам решает, что уйдёт клиенту
   * (пустое тело+304 или JSON+200), поэтому автоматическая сериализация
   * возврата хендлера Nest'ом здесь не нужна и не используется.
   *
   * T-final-review (CRITICAL): `ETag` несёт `userId`+`scope` (не только
   * версию+params) — иначе два разных пользователя с одинаковой версией
   * данных и одинаковыми query-параметрами получали бы один и тот же ETag на
   * одном URL, и приватный браузерный кэш мог отдать 304 с телом чужого
   * ответа (см. `buildEtag`). `Cache-Control: private, no-cache` на ОБОИХ
   * путях (304 и 200) — чтобы поведение не зависело от эвристик конкретного
   * браузера при отсутствии заголовка: `no-cache` разрешает браузеру
   * переиспользовать сохранённый ответ ТОЛЬКО после ревалидации по ETag
   * (то есть заново дойдя до этого самого сравнения), `private` запрещает
   * общим/прокси-кэшам хранить ответ вовсе.
   */
  private async withEtag<T>(
    res: Response,
    userId: string,
    scope: string,
    params: unknown,
    ifNoneMatch: string | undefined,
    compute: () => Promise<T>,
  ): Promise<void> {
    const version = await this.dataVersion.get(userId);
    const etag = buildEtag(userId, scope, version, params);
    res.setHeader('Cache-Control', 'private, no-cache');
    if (ifNoneMatch === etag) {
      res.status(304).end();
      return;
    }
    const result = await compute();
    res.setHeader('ETag', etag);
    res.status(200).json(result);
  }

  @Get()
  async list(
    @CurrentUser('userId') userId: string,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res() res: Response,
    @Query('symbol') symbol?: string,
    @Query('days') days?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('tagId') tagId?: string,
    @Query('combo') combo?: string,
    @Query('hasTags') hasTags?: string,
  ) {
    const params = {
      symbol,
      days: days ? parseInt(days, 10) : undefined,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      tagId: tagId || undefined,
      // Exact tag set of a combo card, comma-separated ids.
      comboTagIds: combo ? combo.split(',').filter(Boolean) : undefined,
      // Contains-all set of a saved combo card, comma-separated ids.
      hasTagIds: hasTags ? hasTags.split(',').filter(Boolean) : undefined,
    };
    await this.withEtag(res, userId, 'list', params, ifNoneMatch, () =>
      this.tradesService.list(userId, params),
    );
  }

  @Get('stats')
  async stats(
    @CurrentUser('userId') userId: string,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res() res: Response,
    @Query('symbol') symbol?: string,
    @Query('days') days?: string,
    @Query('tagId') tagId?: string,
  ) {
    const params = {
      symbol,
      days: days ? parseInt(days, 10) : undefined,
      tagId: tagId || undefined,
    };
    await this.withEtag(res, userId, 'stats', params, ifNoneMatch, () =>
      this.tradesService.stats(userId, params),
    );
  }

  // Winrate / PnL by local weekday & hour + hold-duration stats.
  // `tz` is the client's Date.getTimezoneOffset() in minutes.
  @Get('stats-by-time')
  async statsByTime(
    @CurrentUser('userId') userId: string,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res() res: Response,
    @Query('days') days?: string,
    @Query('tz') tz?: string,
    @Query('tagId') tagId?: string,
  ) {
    const params = {
      days: days ? parseInt(days, 10) : undefined,
      tzOffsetMin: tz != null && tz !== '' ? parseInt(tz, 10) : undefined,
      tagId: tagId || undefined,
    };
    await this.withEtag(res, userId, 'stats-by-time', params, ifNoneMatch, () =>
      this.tradesService.statsByTime(userId, params),
    );
  }

  // Winrate / PnL grouped by entry-reason tag.
  @Get('stats-by-tag')
  async statsByTag(
    @CurrentUser('userId') userId: string,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res() res: Response,
    @Query('days') days?: string,
  ) {
    const d = days ? parseInt(days, 10) : undefined;
    await this.withEtag(res, userId, 'stats-by-tag', { days: d }, ifNoneMatch, () =>
      this.tradesService.statsByTag(userId, d),
    );
  }

  // Winrate / PnL grouped by exact tag combination (which combo wins most).
  @Get('stats-by-tag-combo')
  async statsByTagCombo(
    @CurrentUser('userId') userId: string,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res() res: Response,
    @Query('days') days?: string,
  ) {
    const d = days ? parseInt(days, 10) : undefined;
    await this.withEtag(res, userId, 'stats-by-tag-combo', { days: d }, ifNoneMatch, () =>
      this.tradesService.statsByTagCombo(userId, d),
    );
  }

  // «Выборка»: произвольная комбинация фильтров (теги / время / рыночный
  // контекст) → сводка, фасеты и кривая P&L. Все csv-параметры — списки.
  @Get('lab')
  async lab(
    @CurrentUser('userId') userId: string,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res() res: Response,
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
    const params: LabFilter = {
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
    };
    await this.withEtag(res, userId, 'lab', params, ifNoneMatch, () =>
      this.labService.query(userId, params),
    );
  }

  // «Цена привычек»: обратная «Выборке» — сервис сам перебирает срезы и
  // возвращает те, что стоили (или принесли) денег, уже в долларах.
  @Get('habits')
  async habits(
    @CurrentUser('userId') userId: string,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res() res: Response,
    @Query('days') days?: string,
    @Query('tz') tz?: string,
  ) {
    const int = (s?: string) => {
      const n = s != null && s !== '' ? parseInt(s, 10) : NaN;
      return Number.isFinite(n) ? n : undefined;
    };
    const d = int(days);
    const t = int(tz);
    await this.withEtag(res, userId, 'habits', { days: d, tz: t }, ifNoneMatch, () =>
      this.habitsService.scan(userId, d, t),
    );
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
    const { exchange, credentials } = await this.credentials.requireActive(userId);
    const executions = await this.exchanges.get(exchange).fetchExecutionMarkers(credentials, {
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
    const timeframe: RangeTf = isRangeTf(tf) ? tf : '4h';
    return this.tradeContext.rangeCheck(userId, id, timeframe);
  }

  // Manual re-sync (full backfill) — useful after connecting new API keys.
  @Post('sync')
  async sync(@CurrentUser('userId') userId: string) {
    await this.credentials.requireActive(userId);
    const { inserted, skipped } = await this.syncService.syncUser(userId, { full: true });
    // `skipped` = a sync for this user was already running, so this request did
    // nothing; without it the caller can't tell that apart from "no new trades".
    return { success: true, inserted, ...(skipped ? { skipped: true } : {}) };
  }
}
