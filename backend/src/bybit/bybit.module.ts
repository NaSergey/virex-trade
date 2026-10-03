import { Module } from '@nestjs/common';
import { BybitApiKeyService } from './services/bybit-api-key.service';
import { BybitAuthService } from './services/bybit-auth.service';
import { BybitBalanceService } from './services/bybit-balance.service';
import { BybitPositionService } from './services/bybit-position.service';
import { BybitMarketService } from './services/bybit-market.service';
import { BybitTradeService } from './services/bybit-trade.service';

// Контроллера нет: ордера на биржу ставит только терминал
// (`terminal/bybit-terminal.client.ts`), а здесь — чтение для синка, адаптера
// и рынка. Прежние /api/bybit/order*, /position/*, /orders/grid сняты.
@Module({
  providers: [
    BybitApiKeyService,
    BybitAuthService,
    BybitBalanceService,
    BybitPositionService,
    BybitMarketService,
    BybitTradeService,
  ],
  exports: [
    BybitApiKeyService,
    BybitTradeService,
    BybitMarketService,
    BybitBalanceService,
    BybitPositionService,
  ],
})
export class BybitModule {}
