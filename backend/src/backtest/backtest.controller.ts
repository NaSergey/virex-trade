import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { parseCandleQuery } from '../market-data/candle-query';
import { BacktestService } from './backtest.service';
import {
  AddToTradeDto,
  AdvanceDto,
  CloseTradeDto,
  CreateCloseGridDto,
  CreateCloseOrderDto,
  CreateEntryOrdersDto,
  CreateSessionDto,
  ModifyTradeDto,
  MoveOrderDto,
  OpenTradeDto,
  SetBacktestTagsDto,
  SetLeverageDto,
  StartBotDto,
} from './dto/backtest.dto';

@UseGuards(JwtAuthGuard)
@Controller('api/backtest')
export class BacktestController {
  constructor(private readonly backtest: BacktestService) {}

  @Post('sessions')
  create(@CurrentUser('userId') userId: string, @Body() dto: CreateSessionDto) {
    return this.backtest.createSession(userId, dto);
  }

  @Get('sessions')
  list(@CurrentUser('userId') userId: string) {
    return this.backtest.listSessions(userId);
  }

  @Get('sessions/:id')
  get(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.backtest.getSession(userId, id);
  }

  // Только у тренажёра: у реальной сессии свечи из /api/market-data/candles.
  @Get('sessions/:id/candles')
  candles(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Query('tf') tf?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    return this.backtest.sessionCandles(userId, id, parseCandleQuery({ tf, from, to, limit }));
  }

  // Момент сессии браузер сохраняет с задержкой; сервер двигает его только вперёд.
  @Patch('sessions/:id')
  advance(@CurrentUser('userId') userId: string, @Param('id') id: string, @Body() dto: AdvanceDto) {
    return this.backtest.advance(userId, id, new Date(dto.cursorTime));
  }

  @Post('sessions/:id/finish')
  finish(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.backtest.finish(userId, id);
  }

  @Delete('sessions/:id')
  remove(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.backtest.deleteSession(userId, id);
  }

  @Post('sessions/:id/trades')
  open(@CurrentUser('userId') userId: string, @Param('id') id: string, @Body() dto: OpenTradeDto) {
    return this.backtest.openTrade(userId, id, { ...dto, entryTime: new Date(dto.entryTime) });
  }

  @Patch('trades/:id')
  modify(@CurrentUser('userId') userId: string, @Param('id') id: string, @Body() dto: ModifyTradeDto) {
    return this.backtest.modifyTrade(userId, id, dto);
  }

  @Post('trades/:id/add')
  add(@CurrentUser('userId') userId: string, @Param('id') id: string, @Body() dto: AddToTradeDto) {
    return this.backtest.addToTrade(userId, id, { ...dto, entryTime: new Date(dto.entryTime) });
  }

  @Patch('sessions/:id/leverage')
  setLeverage(@CurrentUser('userId') userId: string, @Param('id') id: string, @Body() dto: SetLeverageDto) {
    return this.backtest.setLeverage(userId, id, dto.leverage, dto.symbol);
  }

  @Post('trades/:id/close')
  close(@CurrentUser('userId') userId: string, @Param('id') id: string, @Body() dto: CloseTradeDto) {
    return this.backtest.closeTrade(userId, id, { ...dto, exitTime: new Date(dto.exitTime) });
  }

  @Put('trades/:id/tags')
  tags(@CurrentUser('userId') userId: string, @Param('id') id: string, @Body() dto: SetBacktestTagsDto) {
    return this.backtest.setTradeTags(userId, id, dto.tagIds);
  }

  @Post('trades/:id/close-orders')
  createCloseOrder(@CurrentUser('userId') userId: string, @Param('id') id: string, @Body() dto: CreateCloseOrderDto) {
    return this.backtest.createCloseOrder(userId, id, dto);
  }

  @Post('trades/:id/close-grid')
  createCloseGrid(@CurrentUser('userId') userId: string, @Param('id') id: string, @Body() dto: CreateCloseGridDto) {
    return this.backtest.createCloseGrid(userId, id, dto);
  }

  @Patch('close-orders/:id')
  moveCloseOrder(@CurrentUser('userId') userId: string, @Param('id') id: string, @Body() dto: MoveOrderDto) {
    return this.backtest.moveCloseOrder(userId, id, dto.price);
  }

  @Delete('close-orders/:id')
  cancelCloseOrder(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.backtest.cancelCloseOrder(userId, id);
  }

  @Post('sessions/:id/entry-orders')
  createEntryOrders(@CurrentUser('userId') userId: string, @Param('id') id: string, @Body() dto: CreateEntryOrdersDto) {
    return this.backtest.createEntryOrders(userId, id, dto);
  }

  @Patch('entry-orders/:id')
  moveEntryOrder(@CurrentUser('userId') userId: string, @Param('id') id: string, @Body() dto: MoveOrderDto) {
    return this.backtest.moveEntryOrder(userId, id, dto.price);
  }

  @Delete('entry-orders/:id')
  cancelEntryOrder(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.backtest.cancelEntryOrder(userId, id);
  }

  @Post('sessions/:id/bots')
  startBot(@CurrentUser('userId') userId: string, @Param('id') id: string, @Body() dto: StartBotDto) {
    return this.backtest.startBot(userId, id, { ...dto, entryTime: new Date(dto.entryTime) });
  }

  @Post('bots/:id/stop')
  stopBot(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.backtest.stopBot(userId, id);
  }

  @Get('stats')
  stats(@CurrentUser('userId') userId: string, @Query('source') source?: string) {
    return this.backtest.stats(userId, source === 'synthetic' ? 'synthetic' : 'real');
  }
}
