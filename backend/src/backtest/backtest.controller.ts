import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { BacktestService } from './backtest.service';
import {
  AddToTradeDto,
  AdvanceDto,
  CloseTradeDto,
  CreateCloseOrderDto,
  CreateSessionDto,
  ModifyTradeDto,
  OpenTradeDto,
  SetBacktestTagsDto,
  SetLeverageDto,
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
    return this.backtest.addToTrade(userId, id, dto);
  }

  @Patch('sessions/:id/leverage')
  setLeverage(@CurrentUser('userId') userId: string, @Param('id') id: string, @Body() dto: SetLeverageDto) {
    return this.backtest.setLeverage(userId, id, dto.leverage);
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

  @Delete('close-orders/:id')
  cancelCloseOrder(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.backtest.cancelCloseOrder(userId, id);
  }

  @Get('stats')
  stats(@CurrentUser('userId') userId: string) {
    return this.backtest.stats(userId);
  }
}
