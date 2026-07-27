import { Injectable } from '@nestjs/common';
import { BybitBalanceService } from './services/bybit-balance.service';
import { BybitPositionService } from './services/bybit-position.service';
import { BybitMarketService } from './services/bybit-market.service';
import { BybitOrderService } from './services/bybit-order.service';
import { BybitCredentials } from './services/bybit-auth.service';

/**
 * Facade service that provides unified interface to all Bybit services.
 * Delegates calls to specialized services. Every signed (private) endpoint
 * takes the caller's decrypted Bybit credentials explicitly — this service
 * is a singleton shared by all users, so it never caches or stores keys.
 */
@Injectable()
export class BybitService {
  constructor(
    private readonly balanceService: BybitBalanceService,
    private readonly positionService: BybitPositionService,
    private readonly marketService: BybitMarketService,
    private readonly orderService: BybitOrderService,
  ) {}

  // Balance operations
  async getUSDTBalance(creds: BybitCredentials) {
    return this.balanceService.getUSDTBalance(creds);
  }

  // Position operations
  async getOpenPositions(creds: BybitCredentials) {
    return this.positionService.getOpenPositions(creds);
  }

  async getMarginMode(creds: BybitCredentials, symbol: string) {
    return this.positionService.getMarginMode(creds, symbol);
  }

  // Market operations (public, no credentials needed)
  async getTickers() {
    return this.marketService.getTickers();
  }

  // Order operations
  async createOrder(
    creds: BybitCredentials,
    orderData: {
      symbol: string;
      entryPrice: string;
      stopLoss: string;
      positionSizeCrypto: string;
      positionType: 'long' | 'short' | 'neutral';
      leverage?: string;
    },
  ) {
    return this.orderService.createOrder(creds, orderData);
  }

  // Amend an open order (price / qty)
  async amendOrder(creds: BybitCredentials, params: { symbol: string; orderId: string; price?: string; qty?: string }) {
    return this.orderService.amendOrder(creds, params);
  }

  // Set leverage for a symbol
  async setLeverage(creds: BybitCredentials, params: { symbol: string; leverage: string | number }) {
    return this.orderService.setLeverage(creds, params);
  }

  // Instrument info (lot size, price tick, leverage range) — public
  async getInstrumentInfo(symbol: string) {
    const info = await this.marketService.getSymbolInfo(symbol);
    if (!info) {
      return { success: false, error: 'Инструмент не найден' };
    }
    return {
      success: true,
      symbol,
      leverageFilter: info.leverageFilter,
      lotSizeFilter: info.lotSizeFilter,
      priceFilter: info.priceFilter,
    };
  }

  // Position TP/SL operations
  async setTradingStop(
    creds: BybitCredentials,
    params: {
      symbol: string;
      positionType: 'long' | 'short';
      takeProfit?: string;
      stopLoss?: string;
    },
  ) {
    return this.orderService.setTradingStop(creds, params);
  }

  // Close position
  async closePosition(
    creds: BybitCredentials,
    params: {
      symbol: string;
      positionType: 'long' | 'short';
      orderType: 'Market' | 'Limit';
      price?: string;
      quantity?: string;
    },
  ) {
    return this.orderService.closePosition(creds, params);
  }

  // Get open orders
  async getOpenOrders(creds: BybitCredentials) {
    return this.orderService.getOpenOrders(creds);
  }

  // Create grid orders
  async createGridOrders(
    creds: BybitCredentials,
    gridData: {
      symbol: string;
      positionType: 'long' | 'short';
      orders: Array<{ price: string; quantity: string }>;
      takeProfit?: string;
      stopLoss?: string;
    },
  ) {
    return this.orderService.createGridOrders(creds, gridData);
  }
}
