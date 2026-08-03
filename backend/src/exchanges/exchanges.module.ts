import { Module } from '@nestjs/common';
import { BybitModule } from '../bybit/bybit.module';
import { CredentialsModule } from '../credentials/credentials.module';
import { BybitAdapter } from './adapters/bybit.adapter';
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
  providers: [BybitAdapter, ExchangeRegistry],
  exports: [ExchangeRegistry],
})
export class ExchangesModule {}
