import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { parseCandleQuery } from '../market-data/candle-query';
import { CloseGridDto, ClosePositionDto, MoveOrderDto, PlaceOrderDto, SetLevelsDto } from './dto/terminal.dto';
import { TerminalMarketService } from './terminal-market.service';
import { TerminalService } from './terminal.service';

/** Сколько свечей отдать, когда клиент `limit` не передал, — как у `/api/market-data/candles`. */
const DEFAULT_LIMIT = 500;

/** Id ордера Bybit — uuid; в путь запроса к бирже он попадает только в таком виде. */
const ORDER_ID = /^[A-Za-z0-9-]{1,64}$/;

const orderId = (raw: string): string => {
  if (!ORDER_ID.test(raw)) throw new BadRequestException('Неверный id ордера');
  return raw;
};

/**
 * Биржевой терминал — `/api/terminal`.
 *
 * Единственное место продукта, которое отправляет на биржу ордера. Всё под
 * гвардом, рыночные данные тоже: открытыми они сделали бы из сервера
 * бесплатный прокси к свечам Bybit.
 */
@UseGuards(JwtAuthGuard)
@Controller('api/terminal')
export class TerminalController {
  constructor(
    private readonly terminal: TerminalService,
    private readonly market: TerminalMarketService,
  ) {}

  /** Показывать ли терминал этому пользователю — по этому ответу шапка рисует пункт меню. */
  @Get('access')
  access(@CurrentUser('userId') userId: string) {
    return this.terminal.access(userId);
  }

  @Get('state')
  state(@CurrentUser('userId') userId: string) {
    return this.terminal.state(userId);
  }

  @Get('symbols')
  async symbols() {
    return { symbols: await this.market.symbols() };
  }

  /** Хвост минуток монеты и время сервера — источник живого края графика. */
  @Get('live')
  async live(@Query('symbol') symbol: string) {
    return { serverTime: new Date().toISOString(), minutes: await this.market.tail(symbol ?? '') };
  }

  @Get('candles')
  candles(
    @Query('symbol') symbol: string,
    @Query('tf') tf?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    return this.market.candles(symbol ?? '', parseCandleQuery({ tf, from, to, limit }, DEFAULT_LIMIT));
  }

  @Post('orders')
  place(@CurrentUser('userId') userId: string, @Body() dto: PlaceOrderDto) {
    return this.terminal.placeOrders(userId, dto);
  }

  @Patch('orders/:id')
  move(@CurrentUser('userId') userId: string, @Param('id') id: string, @Body() dto: MoveOrderDto) {
    return this.terminal.moveOrder(userId, orderId(id), dto);
  }

  @Delete('orders/:id')
  cancel(@CurrentUser('userId') userId: string, @Param('id') id: string, @Query('symbol') symbol: string) {
    return this.terminal.cancelOrder(userId, orderId(id), symbol ?? '');
  }

  @Patch('positions/levels')
  levels(@CurrentUser('userId') userId: string, @Body() dto: SetLevelsDto) {
    return this.terminal.setLevels(userId, dto);
  }

  @Post('positions/close-grid')
  closeGrid(@CurrentUser('userId') userId: string, @Body() dto: CloseGridDto) {
    return this.terminal.closeGrid(userId, dto);
  }

  @Post('positions/close')
  close(@CurrentUser('userId') userId: string, @Body() dto: ClosePositionDto) {
    return this.terminal.closePosition(userId, dto);
  }
}
