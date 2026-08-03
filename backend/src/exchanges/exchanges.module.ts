import { Module } from '@nestjs/common';
import { BybitModule } from '../bybit/bybit.module';
import { CredentialsModule } from '../credentials/credentials.module';
import { BybitAdapter } from './adapters/bybit.adapter';
import { OkxAdapter } from './adapters/okx.adapter';
import { BitgetAdapter } from './adapters/bitget.adapter';
import { KucoinAdapter } from './adapters/kucoin.adapter';
import { GateAdapter } from './adapters/gate.adapter';
import { ExchangeRegistry } from './exchange-registry.service';
import { ExchangeController } from './exchange.controller';

/**
 * Owns the exchange abstraction: the adapters and the registry that resolves
 * them. The adapters themselves never look up credentials — they take them as
 * arguments; only the controller resolves the caller's active connection.
 */
@Module({
  imports: [BybitModule, CredentialsModule],
  controllers: [ExchangeController],
  providers: [
    BybitAdapter,
    OkxAdapter,
    BitgetAdapter,
    KucoinAdapter,
    GateAdapter,
    ExchangeRegistry,
  ],
  exports: [ExchangeRegistry],
})
export class ExchangesModule {}
