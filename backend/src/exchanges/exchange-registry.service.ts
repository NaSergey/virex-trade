import { BadRequestException, Injectable } from '@nestjs/common';
import { BybitAdapter } from './adapters/bybit.adapter';
import { OkxAdapter } from './adapters/okx.adapter';
import { BitgetAdapter } from './adapters/bitget.adapter';
import { KucoinAdapter } from './adapters/kucoin.adapter';
import { ExchangeAdapter, ExchangeId } from './exchange.types';

/**
 * Resolves an ExchangeId to the adapter that implements it.
 *
 * The one place that maps ids to implementations: a new exchange is a new
 * adapter listed here plus its EXCHANGE_CATALOG entry.
 */
@Injectable()
export class ExchangeRegistry {
  private readonly adapters: ReadonlyMap<ExchangeId, ExchangeAdapter>;

  constructor(
    bybit: BybitAdapter,
    okx: OkxAdapter,
    bitget: BitgetAdapter,
    kucoin: KucoinAdapter,
  ) {
    this.adapters = new Map<ExchangeId, ExchangeAdapter>([
      [bybit.id, bybit],
      [okx.id, okx],
      [bitget.id, bitget],
      [kucoin.id, kucoin],
    ]);
  }

  get(id: ExchangeId): ExchangeAdapter {
    const adapter = this.adapters.get(id);
    if (!adapter) {
      // Reachable if a connection row outlives its adapter (an exchange removed
      // from the build while users still have it connected).
      throw new BadRequestException(`Биржа «${id}» не поддерживается этой версией приложения`);
    }
    return adapter;
  }
}
