import { Body, Controller, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { BacktestService } from './backtest.service';
import {
  AddToTradeDto,
  AdvanceDto,
  CloseTradeDto,
  CreateSessionDto,
  ModifyTradeDto,
  OpenTradeDto,
  SetBacktestTagsDto,
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

  @Post('trades/:id/close')
  close(@CurrentUser('userId') userId: string, @Param('id') id: string, @Body() dto: CloseTradeDto) {
    return this.backtest.closeTrade(userId, id, { ...dto, exitTime: new Date(dto.exitTime) });
  }

  @Put('trades/:id/tags')
  tags(@CurrentUser('userId') userId: string, @Param('id') id: string, @Body() dto: SetBacktestTagsDto) {
    return this.backtest.setTradeTags(userId, id, dto.tagIds);
  }

  @Get('stats')
  stats(@CurrentUser('userId') userId: string) {
    return this.backtest.stats(userId);
  }
}
