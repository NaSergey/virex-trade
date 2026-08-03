import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { BybitService } from './bybit.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { CreateGridOrdersDto } from './dto/create-grid-orders.dto';
import { AmendOrderDto } from './dto/amend-order.dto';
import { SetLeverageDto } from './dto/set-leverage.dto';
import { SetTradingStopDto } from './dto/set-trading-stop.dto';
import { ClosePositionDto } from './dto/close-position.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CredentialsService } from '../credentials/credentials.service';

// All Bybit endpoints require a valid access token. Signed (private) endpoints
// additionally require the user to have connected their Bybit API keys —
// CredentialsService.requireDecrypted throws a clear 400 otherwise.
@UseGuards(JwtAuthGuard)
@Controller('api/bybit')
export class BybitController {
  constructor(
    private readonly bybitService: BybitService,
    private readonly credentials: CredentialsService,
  ) {}

  @Get('balance')
  async getBalance(@CurrentUser('userId') userId: string) {
    const creds = await this.credentials.requireDecrypted(userId);
    return this.bybitService.getUSDTBalance(creds);
  }

  @Get('positions')
  async getPositions(@CurrentUser('userId') userId: string) {
    const creds = await this.credentials.requireDecrypted(userId);
    return this.bybitService.getOpenPositions(creds);
  }

  // Public market data — no Bybit keys required.
  @Get('tickers')
  async getTickers() {
    return this.bybitService.getTickers();
  }

  @Post('order')
  async createOrder(@CurrentUser('userId') userId: string, @Body() createOrderDto: CreateOrderDto) {
    const creds = await this.credentials.requireDecrypted(userId);
    return this.bybitService.createOrder(creds, createOrderDto);
  }

  @Post('order/amend')
  async amendOrder(@CurrentUser('userId') userId: string, @Body() amendOrderDto: AmendOrderDto) {
    const creds = await this.credentials.requireDecrypted(userId);
    return this.bybitService.amendOrder(creds, amendOrderDto);
  }

  @Post('leverage')
  async setLeverage(@CurrentUser('userId') userId: string, @Body() setLeverageDto: SetLeverageDto) {
    const creds = await this.credentials.requireDecrypted(userId);
    return this.bybitService.setLeverage(creds, setLeverageDto);
  }

  // Public instrument metadata — no Bybit keys required.
  @Get('instrument')
  async getInstrument(@Query('symbol') symbol: string) {
    return this.bybitService.getInstrumentInfo(symbol);
  }

  @Post('position/tpsl')
  async setTradingStop(
    @CurrentUser('userId') userId: string,
    @Body() setTradingStopDto: SetTradingStopDto,
  ) {
    const creds = await this.credentials.requireDecrypted(userId);
    return this.bybitService.setTradingStop(creds, setTradingStopDto);
  }

  @Get('margin-mode')
  async getMarginMode(@CurrentUser('userId') userId: string, @Query('symbol') symbol: string) {
    const creds = await this.credentials.requireDecrypted(userId);
    return this.bybitService.getMarginMode(creds, symbol);
  }

  @Post('position/close')
  async closePosition(
    @CurrentUser('userId') userId: string,
    @Body() closePositionDto: ClosePositionDto,
  ) {
    const creds = await this.credentials.requireDecrypted(userId);
    return this.bybitService.closePosition(creds, closePositionDto);
  }

  @Get('orders')
  async getOrders(@CurrentUser('userId') userId: string) {
    const creds = await this.credentials.requireDecrypted(userId);
    return this.bybitService.getOpenOrders(creds);
  }

  @Post('orders/grid')
  async createGridOrders(
    @CurrentUser('userId') userId: string,
    @Body() createGridOrdersDto: CreateGridOrdersDto,
  ) {
    const creds = await this.credentials.requireDecrypted(userId);
    return this.bybitService.createGridOrders(creds, createGridOrdersDto);
  }
}
