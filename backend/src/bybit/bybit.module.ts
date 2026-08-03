import { Module } from '@nestjs/common';
import { CredentialsModule } from '../credentials/credentials.module';
import { BybitController } from './bybit.controller';
import { BybitService } from './bybit.service';
import { BybitAuthService } from './services/bybit-auth.service';
import { BybitBalanceService } from './services/bybit-balance.service';
import { BybitPositionService } from './services/bybit-position.service';
import { BybitMarketService } from './services/bybit-market.service';
import { BybitOrderService } from './services/bybit-order.service';
import { BybitTradeService } from './services/bybit-trade.service';

@Module({
  imports: [CredentialsModule],
  controllers: [BybitController],
  providers: [
    BybitAuthService,
    BybitBalanceService,
    BybitPositionService,
    BybitMarketService,
    BybitOrderService,
    BybitTradeService,
    BybitService,
  ],
  exports: [
    BybitService,
    BybitTradeService,
    BybitOrderService,
    BybitMarketService,
    BybitBalanceService,
    BybitPositionService,
  ],
})
export class BybitModule {}

