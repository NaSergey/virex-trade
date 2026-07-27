import { Injectable } from '@nestjs/common';
import { BybitAuthService, BybitCredentials } from './bybit-auth.service';
import { BybitMarketService } from './bybit-market.service';

@Injectable()
export class BybitOrderService extends BybitAuthService {
  constructor(private marketService: BybitMarketService) {
    super();
  }

  // Normalize quantity according to symbol's lot size filter
  private normalizeQuantity(qty: string, symbolInfo: any): string {
    const quantity = parseFloat(qty);
    if (isNaN(quantity) || quantity <= 0) {
      return qty;
    }

    // Get lot size filter from symbol info
    const lotSizeFilter = symbolInfo?.lotSizeFilter;
    if (!lotSizeFilter) {
      // Default: round to 3 decimal places, minimum 0.001
      const rounded = Math.max(0.001, Math.round(quantity * 1000) / 1000);
      return rounded.toString();
    }

    const minQty = parseFloat(lotSizeFilter.minOrderQty || '0.001');
    const maxQty = parseFloat(lotSizeFilter.maxOrderQty || '1000000');
    const qtyStep = parseFloat(lotSizeFilter.qtyStep || '0.001');

    // Round to qtyStep precision
    const steps = Math.round(quantity / qtyStep);
    let normalizedQty = steps * qtyStep;

    // Ensure it's within min/max bounds
    normalizedQty = Math.max(minQty, Math.min(maxQty, normalizedQty));

    // Format to appropriate decimal places
    const decimals = qtyStep.toString().split('.')[1]?.length || 3;
    return normalizedQty.toFixed(decimals);
  }

  // Align a price to the symbol's tick size — Bybit rejects off-tick prices,
  // and chart drag-to-move produces arbitrary floats.
  private normalizePrice(price: string, symbolInfo: any): string {
    const p = parseFloat(price);
    if (!isFinite(p) || p <= 0) return price;
    const tickStr = symbolInfo?.priceFilter?.tickSize;
    const tick = parseFloat(tickStr || '0');
    if (!tick || tick <= 0) return price;
    const aligned = Math.round(p / tick) * tick;
    const decimals = tickStr?.toString().split('.')[1]?.length || 2;
    return aligned.toFixed(decimals);
  }

  // Map Bybit "insufficient available balance / margin" rejections to a clear,
  // actionable RU message. Returns null when it isn't a balance-related error.
  // The most common one is retCode 110007 ("ab not enough for new order"):
  // the order's required margin (notional / leverage) exceeds the free balance.
  private friendlyBalanceError(retCode: number, retMsg: string): string | null {
    const msg = (retMsg || '').toLowerCase();
    const isBalance =
      retCode === 110007 ||
      retCode === 110004 ||
      retCode === 110012 ||
      retCode === 110045 ||
      msg.includes('ab not enough') ||
      msg.includes('not enough') ||
      msg.includes('insufficient');
    if (!isBalance) return null;
    return (
      'Недостаточно свободного баланса (маржи) для этого ордера. ' +
      'Маржа под этот размер позиции превышает доступные средства. ' +
      'Уменьшите размер позиции или процент риска, увеличьте кредитное плечо ' +
      'по этому символу в Bybit, либо пополните баланс.'
    );
  }

  // Create order
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
    try {
      if (!this.hasKeys(creds)) {
        return { success: false, error: 'API keys not configured' };
      }

      if (orderData.positionType === 'neutral') {
        return { success: false, error: 'Cannot create order with neutral position type' };
      }

      // Apply the requested leverage before placing (best-effort: a failure here,
      // e.g. "leverage not modified", shouldn't block the order itself).
      if (orderData.leverage) {
        await this.setLeverage(creds, { symbol: orderData.symbol, leverage: orderData.leverage });
      }

      // Get symbol information to normalize quantity
      const symbolInfo = await this.marketService.getSymbolInfo(orderData.symbol);
      const normalizedQty = this.normalizeQuantity(orderData.positionSizeCrypto, symbolInfo);

      // Check if normalized quantity is valid
      const qtyNum = parseFloat(normalizedQty);
      if (isNaN(qtyNum) || qtyNum <= 0) {
        return { success: false, error: 'Неверный размер позиции. Размер позиции слишком мал или равен нулю' };
      }

      const side = orderData.positionType === 'long' ? 'Buy' : 'Sell';

      // В Bybit v5 при включённом hedge-режиме обязателен positionIdx:
      // 1 - long, 2 - short. Если у аккаунта one-way режим, Bybit, как правило,
      // игнорирует это поле или ожидает 0. Мы выставляем 1/2 в зависимости от стороны.
      const positionIdx =
        orderData.positionType === 'long'
          ? '1'
          : orderData.positionType === 'short'
          ? '2'
          : '0';

      const timestamp = Date.now().toString();
      const recvWindow = '5000';

      // Build request body parameters (must be sorted alphabetically for signature)
      const bodyParams: Record<string, string> = {
        category: 'linear',
        orderType: 'Limit',
        price: orderData.entryPrice,
        qty: normalizedQty,
        positionIdx,
        side: side,
        symbol: orderData.symbol,
        stopLoss: orderData.stopLoss,
        timeInForce: 'GTC', // Good Till Cancel
      };

      // For POST requests, signature is created from JSON string of sorted body
      // Sort keys alphabetically
      const sortedKeys = Object.keys(bodyParams).sort();
      const sortedBody: Record<string, string> = {};
      sortedKeys.forEach(key => {
        sortedBody[key] = bodyParams[key];
      });

      // Signature string: timestamp + apiKey + recvWindow + JSON.stringify(body)
      const bodyString = JSON.stringify(sortedBody);
      const signatureString = timestamp + creds.apiKey + recvWindow + bodyString;
      const signature = this.createSignature(signatureString, creds.apiSecret);

      const response = await fetch(`${this.baseUrl}/order/create`, {
        method: 'POST',
        headers: this.buildAuthHeaders(creds.apiKey, timestamp, signature, recvWindow),
        body: bodyString,
      });

      const data = await response.json();

      // Check if request was successful (Bybit returns 200 even for errors, check retCode)
      if (data.retCode !== 0) {
        let errorMessage = data.retMsg || 'Failed to create order';
        const balanceErr = this.friendlyBalanceError(data.retCode, data.retMsg);

        // Специальная обработка популярных ошибок Bybit
        // Provide more helpful error messages
        if (errorMessage.includes('Permission denied') || errorMessage.includes('permission')) {
          errorMessage = 'Недостаточно прав у API ключа. Убедитесь, что API ключ имеет права на создание ордеров (не только Read-Only). Проверьте настройки API ключа в Bybit.';
        } else if (balanceErr) {
          errorMessage = balanceErr;
        } else if (errorMessage.includes('Invalid price')) {
          errorMessage = 'Неверная цена ордера. Проверьте цену входа и стоп-лосс';
        } else if (errorMessage.includes('Invalid qty') || errorMessage.includes('Qty invalid') || errorMessage.includes('qty')) {
          let details = '';
          if (symbolInfo?.lotSizeFilter) {
            const minQty = symbolInfo.lotSizeFilter.minOrderQty;
            const qtyStep = symbolInfo.lotSizeFilter.qtyStep;
            const maxQty = symbolInfo.lotSizeFilter.maxOrderQty;
            details = ` Минимальный размер: ${minQty}, шаг: ${qtyStep}, максимальный: ${maxQty}. Ваш размер: ${orderData.positionSizeCrypto}, нормализованный: ${normalizedQty}`;
          } else {
            details = ` Ваш размер позиции: ${orderData.positionSizeCrypto}, нормализованный: ${normalizedQty}`;
          }
          errorMessage = `Неверный размер позиции. Размер позиции не соответствует требованиям символа.${details} Попробуйте увеличить размер позиции или процент риска.`;
        } else if (
          errorMessage.includes('position idx not match position mode') ||
          data.retCode === 10001
        ) {
          errorMessage =
            'Ошибка режима позиции на Bybit: positionIdx не соответствует режиму позиции (one-way / hedge). ' +
            'Проверьте в настройках Bybit, включён ли у вас режим Hedge для деривативов. ' +
            'Если включён Hedge, убедитесь, что для данного символа разрешены раздельные long/short позиции. ' +
            'Если режим one-way, попробуйте переключиться в Hedge или изменить настройки режима позиции.';
        }

        console.error('Bybit API error:', {
          status: response.status,
          retCode: data.retCode,
          message: errorMessage,
          fullResponse: data,
        });

        return { success: false, error: errorMessage };
      }

      if (data.result) {
        return {
          success: true,
          orderId: data.result.orderId,
          orderLinkId: data.result.orderLinkId,
        };
      }

      return { success: false, error: 'Неизвестная ошибка при создании ордера' };
    } catch (error: any) {
      console.error('createOrder error:', error);
      return { success: false, error: error.message };
    }
  }

  // Set leverage (buy = sell) for a symbol. retCode 110043 ("leverage not
  // modified") means it's already at that value, which we treat as success.
  async setLeverage(creds: BybitCredentials, params: { symbol: string; leverage: string | number }) {
    try {
      if (!this.hasKeys(creds)) {
        return { success: false, error: 'API keys not configured' };
      }
      const lev = String(params.leverage);
      if (!lev || parseFloat(lev) <= 0) {
        return { success: false, error: 'Неверное значение плеча' };
      }

      const bodyParams: Record<string, string> = {
        buyLeverage: lev,
        category: 'linear',
        sellLeverage: lev,
        symbol: params.symbol,
      };

      const timestamp = Date.now().toString();
      const recvWindow = '5000';
      const sortedKeys = Object.keys(bodyParams).sort();
      const sortedBody: Record<string, string> = {};
      sortedKeys.forEach((k) => (sortedBody[k] = bodyParams[k]));

      const bodyString = JSON.stringify(sortedBody);
      const signatureString = timestamp + creds.apiKey + recvWindow + bodyString;
      const signature = this.createSignature(signatureString, creds.apiSecret);

      const response = await fetch(`${this.baseUrl}/position/set-leverage`, {
        method: 'POST',
        headers: this.buildAuthHeaders(creds.apiKey, timestamp, signature, recvWindow),
        body: bodyString,
      });

      const data = await response.json();
      if (data.retCode !== 0 && data.retCode !== 110043) {
        return { success: false, error: data.retMsg || 'Не удалось установить плечо', retCode: data.retCode };
      }
      return { success: true, leverage: lev };
    } catch (error: any) {
      console.error('setLeverage error:', error);
      return { success: false, error: error.message };
    }
  }

  // Amend an open order's price and/or quantity (chart drag-to-move).
  async amendOrder(creds: BybitCredentials, params: { symbol: string; orderId: string; price?: string; qty?: string }) {
    try {
      if (!this.hasKeys(creds)) {
        return { success: false, error: 'API keys not configured' };
      }
      if (!params.orderId) {
        return { success: false, error: 'Не указан orderId' };
      }

      const symbolInfo = await this.marketService.getSymbolInfo(params.symbol);

      const bodyParams: Record<string, string> = {
        category: 'linear',
        orderId: params.orderId,
        symbol: params.symbol,
      };
      if (params.price) bodyParams.price = this.normalizePrice(params.price, symbolInfo);
      if (params.qty) bodyParams.qty = this.normalizeQuantity(params.qty, symbolInfo);

      const timestamp = Date.now().toString();
      const recvWindow = '5000';
      const sortedKeys = Object.keys(bodyParams).sort();
      const sortedBody: Record<string, string> = {};
      sortedKeys.forEach((k) => (sortedBody[k] = bodyParams[k]));

      const bodyString = JSON.stringify(sortedBody);
      const signatureString = timestamp + creds.apiKey + recvWindow + bodyString;
      const signature = this.createSignature(signatureString, creds.apiSecret);

      const response = await fetch(`${this.baseUrl}/order/amend`, {
        method: 'POST',
        headers: this.buildAuthHeaders(creds.apiKey, timestamp, signature, recvWindow),
        body: bodyString,
      });

      const data = await response.json();
      if (data.retCode !== 0) {
        const errorMessage =
          this.friendlyBalanceError(data.retCode, data.retMsg) || data.retMsg || 'Не удалось изменить ордер';
        return { success: false, error: errorMessage, retCode: data.retCode };
      }
      return { success: true, orderId: data.result?.orderId };
    } catch (error: any) {
      console.error('amendOrder error:', error);
      return { success: false, error: error.message };
    }
  }

  // Set Take Profit / Stop Loss for an open position
  async setTradingStop(
    creds: BybitCredentials,
    params: {
      symbol: string;
      positionType: 'long' | 'short';
      takeProfit?: string;
      stopLoss?: string;
    },
  ) {
    try {
      if (!this.hasKeys(creds)) {
        return { success: false, error: 'API keys not configured' };
      }

      if (!params.takeProfit && !params.stopLoss) {
        return { success: false, error: 'Необходимо указать takeProfit или stopLoss' };
      }

      const positionIdx = params.positionType === 'long' ? '1' : '2';
      const symbolInfo = await this.marketService.getSymbolInfo(params.symbol);

      const timestamp = Date.now().toString();
      const recvWindow = '5000';

      const bodyParams: Record<string, string> = {
        category: 'linear',
        positionIdx,
        symbol: params.symbol,
      };
      if (params.takeProfit) bodyParams.takeProfit = this.normalizePrice(params.takeProfit, symbolInfo);
      if (params.stopLoss) bodyParams.stopLoss = this.normalizePrice(params.stopLoss, symbolInfo);

      // sort body keys for signature
      const sortedKeys = Object.keys(bodyParams).sort();
      const sortedBody: Record<string, string> = {};
      sortedKeys.forEach((k) => (sortedBody[k] = bodyParams[k]));

      const bodyString = JSON.stringify(sortedBody);
      const signatureString = timestamp + creds.apiKey + recvWindow + bodyString;
      const signature = this.createSignature(signatureString, creds.apiSecret);

      const response = await fetch(`${this.baseUrl}/position/trading-stop`, {
        method: 'POST',
        headers: this.buildAuthHeaders(creds.apiKey, timestamp, signature, recvWindow),
        body: bodyString,
      });

      const data = await response.json();
      if (data.retCode !== 0) {
        const errorMessage = data.retMsg || 'Failed to set TP/SL';
        return { success: false, error: errorMessage, full: data };
      }

      return { success: true, result: data.result };
    } catch (error: any) {
      console.error('setTradingStop error:', error);
      return { success: false, error: error.message };
    }
  }

  // Close position (market or limit order)
  async closePosition(
    creds: BybitCredentials,
    params: {
      symbol: string;
      positionType: 'long' | 'short';
      orderType: 'Market' | 'Limit';
      price?: string; // Required for Limit orders
      quantity?: string; // Optional: if not provided, closes full position
    },
  ) {
    try {
      if (!this.hasKeys(creds)) {
        return { success: false, error: 'API keys not configured' };
      }

      if (params.orderType === 'Limit' && !params.price) {
        return { success: false, error: 'Цена обязательна для лимитного ордера' };
      }

      // Get position size first
      const timestamp = Date.now().toString();
      const recvWindow = '5000';
      const queryParams = {
        category: 'linear',
        symbol: params.symbol,
        settleCoin: 'USDT',
        recv_window: recvWindow,
        timestamp: timestamp,
      };
      const queryString = this.buildQueryString(queryParams);
      const signatureString = timestamp + creds.apiKey + recvWindow + queryString;
      const signature = this.createSignature(signatureString, creds.apiSecret);

      const positionResponse = await fetch(
        `${this.baseUrl}/position/list?${queryString}`,
        {
          method: 'GET',
          headers: this.buildAuthHeaders(creds.apiKey, timestamp, signature, recvWindow),
        },
      );

      const positionData = await positionResponse.json();
      if (positionData.retCode !== 0 || !positionData.result?.list?.length) {
        return { success: false, error: 'Не удалось получить информацию о позиции' };
      }

      const position = positionData.result.list.find(
        (p: any) => parseFloat(p.size) > 0 && (params.positionType === 'long' ? p.side === 'Buy' : p.side === 'Sell'),
      );

      if (!position || parseFloat(position.size) <= 0) {
        return { success: false, error: 'Позиция не найдена или уже закрыта' };
      }

      const positionSize = position.size;
      const side = params.positionType === 'long' ? 'Sell' : 'Buy'; // Opposite side to close
      const positionIdx = params.positionType === 'long' ? '1' : '2';

      // Use provided quantity or full position size
      const quantityToClose = params.quantity || positionSize;
      const qtyNum = parseFloat(quantityToClose);
      if (isNaN(qtyNum) || qtyNum <= 0) {
        return { success: false, error: 'Неверное количество для закрытия' };
      }
      if (qtyNum > parseFloat(positionSize)) {
        return { success: false, error: 'Количество для закрытия превышает размер позиции' };
      }

      // Get symbol info to normalize quantity
      const symbolInfo = await this.marketService.getSymbolInfo(params.symbol);
      const normalizedQty = this.normalizeQuantity(quantityToClose, symbolInfo);

      const orderTimestamp = Date.now().toString();
      const orderRecvWindow = '5000';

      const bodyParams: Record<string, string> = {
        category: 'linear',
        orderType: params.orderType,
        positionIdx,
        qty: normalizedQty,
        reduceOnly: 'true', // Only close position, don't open new one
        side: side,
        symbol: params.symbol,
      };

      if (params.orderType === 'Limit') {
        bodyParams.price = params.price!;
        bodyParams.timeInForce = 'GTC';
      }

      // Sort keys alphabetically for signature
      const sortedKeys = Object.keys(bodyParams).sort();
      const sortedBody: Record<string, string> = {};
      sortedKeys.forEach((k) => (sortedBody[k] = bodyParams[k]));

      const bodyString = JSON.stringify(sortedBody);
      const orderSignatureString = orderTimestamp + creds.apiKey + orderRecvWindow + bodyString;
      const orderSignature = this.createSignature(orderSignatureString, creds.apiSecret);

      const response = await fetch(`${this.baseUrl}/order/create`, {
        method: 'POST',
        headers: this.buildAuthHeaders(creds.apiKey, orderTimestamp, orderSignature, orderRecvWindow),
        body: bodyString,
      });

      const data = await response.json();
      if (data.retCode !== 0) {
        const errorMessage = data.retMsg || 'Не удалось закрыть позицию';
        return { success: false, error: errorMessage, full: data };
      }

      return { success: true, result: data.result, orderId: data.result?.orderId };
    } catch (error: any) {
      console.error('closePosition error:', error);
      return { success: false, error: error.message };
    }
  }

  // Create a single limit order (internal method, with optional stopLoss and takeProfit)
  private async createLimitOrder(
    creds: BybitCredentials,
    params: {
      symbol: string;
      price: string;
      quantity: string;
      positionType: 'long' | 'short';
      stopLoss?: string;
      takeProfit?: string;
    },
  ) {
    try {
      if (!this.hasKeys(creds)) {
        return { success: false, error: 'API keys not configured' };
      }

      // Get symbol information to normalize quantity
      const symbolInfo = await this.marketService.getSymbolInfo(params.symbol);
      const normalizedQty = this.normalizeQuantity(params.quantity, symbolInfo);

      // Check if normalized quantity is valid
      const qtyNum = parseFloat(normalizedQty);
      if (isNaN(qtyNum) || qtyNum <= 0) {
        return { success: false, error: 'Неверный размер позиции' };
      }

      const side = params.positionType === 'long' ? 'Buy' : 'Sell';
      const positionIdx = params.positionType === 'long' ? '1' : '2';

      const timestamp = Date.now().toString();
      const recvWindow = '5000';

      // Build request body parameters (sorted alphabetically for signature)
      const bodyParams: Record<string, string> = {
        category: 'linear',
        orderType: 'Limit',
        price: params.price,
        qty: normalizedQty,
        positionIdx,
        side: side,
        symbol: params.symbol,
        timeInForce: 'GTC',
      };

      // Add stopLoss and takeProfit if provided (Bybit supports TP/SL in limit order creation)
      if (params.stopLoss) {
        bodyParams.stopLoss = params.stopLoss;
      }
      if (params.takeProfit) {
        bodyParams.takeProfit = params.takeProfit;
      }

      // Sort keys alphabetically
      const sortedKeys = Object.keys(bodyParams).sort();
      const sortedBody: Record<string, string> = {};
      sortedKeys.forEach((key) => {
        sortedBody[key] = bodyParams[key];
      });

      const bodyString = JSON.stringify(sortedBody);
      const signatureString = timestamp + creds.apiKey + recvWindow + bodyString;
      const signature = this.createSignature(signatureString, creds.apiSecret);

      const response = await fetch(`${this.baseUrl}/order/create`, {
        method: 'POST',
        headers: this.buildAuthHeaders(creds.apiKey, timestamp, signature, recvWindow),
        body: bodyString,
      });

      const data = await response.json();

      if (data.retCode !== 0) {
        const errorMessage =
          this.friendlyBalanceError(data.retCode, data.retMsg) || data.retMsg || 'Failed to create order';
        console.error('createLimitOrder Bybit error:', {
          retCode: data.retCode,
          retMsg: data.retMsg,
          symbol: params.symbol,
          price: params.price,
          qty: normalizedQty,
        });
        return { success: false, error: errorMessage, retCode: data.retCode };
      }

      return {
        success: true,
        orderId: data.result?.orderId,
        orderLinkId: data.result?.orderLinkId,
      };
    } catch (error: any) {
      console.error('createLimitOrder error:', error);
      return { success: false, error: error.message };
    }
  }

  // Create grid orders (multiple limit orders)
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
    try {
      if (!this.hasKeys(creds)) {
        return { success: false, error: 'API keys not configured' };
      }

      if (!gridData.orders || gridData.orders.length === 0) {
        return { success: false, error: 'Нет ордеров для создания' };
      }

      const createdOrders: Array<{ orderId?: string; orderLinkId?: string; price: string; quantity: string }> = [];
      const errors: Array<{ price: string; quantity: string; error: string }> = [];

      // For Long: create orders from highest to lowest price (132 -> 125)
      // For Short: create orders from lowest to highest price (125 -> 132)
      const sortedOrders = [...gridData.orders].sort((a, b) => {
        const priceA = parseFloat(a.price);
        const priceB = parseFloat(b.price);
        return gridData.positionType === 'long' ? priceB - priceA : priceA - priceB;
      });

      // Create each order sequentially
      for (const order of sortedOrders) {
        const result = await this.createLimitOrder(creds, {
          symbol: gridData.symbol,
          price: order.price,
          quantity: order.quantity,
          positionType: gridData.positionType,
          stopLoss: gridData.stopLoss, // Add stopLoss to each order
          takeProfit: gridData.takeProfit, // Add takeProfit to each order
        });

        if (result.success) {
          createdOrders.push({
            orderId: result.orderId,
            orderLinkId: result.orderLinkId,
            price: order.price,
            quantity: order.quantity,
          });
        } else {
          errors.push({
            price: order.price,
            quantity: order.quantity,
            error: result.error || 'Unknown error',
          });
        }

        // Small delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // TP/SL are already set in each order, so we don't need to set them again for position
      // (position doesn't exist yet - it will be created when orders execute)

      // Surface the real Bybit reason to the frontend: when nothing was
      // created, expose the first order's error as a top-level `error` so the
      // UI shows it instead of a generic message.
      const topLevelError =
        createdOrders.length === 0 && errors.length > 0
          ? errors[0].error
          : undefined;

      return {
        success: createdOrders.length > 0,
        createdOrders,
        errors: errors.length > 0 ? errors : undefined,
        error: topLevelError,
        stopLossSet: gridData.stopLoss ? true : false,
        takeProfitSet: gridData.takeProfit ? true : false,
      };
    } catch (error: any) {
      console.error('createGridOrders error:', error);
      return { success: false, error: error.message };
    }
  }

  // Get open orders
  async getOpenOrders(creds: BybitCredentials) {
    try {
      if (!this.hasKeys(creds)) {
        return { orders: [], success: false, error: 'API keys not configured' };
      }

      const timestamp = Date.now().toString();
      const recvWindow = '5000';

      // Build query parameters (must be sorted alphabetically)
      const queryParams = {
        category: 'linear',
        recv_window: recvWindow,
        settleCoin: 'USDT',
        timestamp: timestamp,
      };

      const queryString = this.buildQueryString(queryParams);

      // Signature string: timestamp + apiKey + recvWindow + queryString
      const signatureString = timestamp + creds.apiKey + recvWindow + queryString;
      const signature = this.createSignature(signatureString, creds.apiSecret);

      const response = await fetch(`${this.baseUrl}/order/realtime?${queryString}`, {
        method: 'GET',
        headers: this.buildAuthHeaders(creds.apiKey, timestamp, signature, recvWindow),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.retMsg || `HTTP error! status: ${response.status}`;
        console.error('Bybit API error:', {
          status: response.status,
          message: errorMessage,
          retCode: errorData.retCode,
        });
        throw new Error(errorMessage);
      }

      const data = await response.json();

      if (data.retCode === 0 && data.result?.list) {
        // Filter only active orders (New, PartiallyFilled, Untriggered)
        const activeOrders = data.result.list.filter((order: any) => {
          const status = order.orderStatus;
          return status === 'New' || status === 'PartiallyFilled' || status === 'Untriggered';
        });

        // Transform orders to match frontend interface
        const orders = activeOrders.map((order: any) => ({
          orderId: order.orderId,
          orderLinkId: order.orderLinkId || '',
          symbol: order.symbol,
          side: order.side, // 'Buy' or 'Sell'
          orderType: order.orderType || order.category || 'Unknown',
          price: order.price || '0',
          qty: order.qty || '0',
          leavesQty: order.leavesQty || order.qty || '0', // Remaining quantity
          cumExecQty: order.cumExecQty || '0', // Filled quantity
          status: order.orderStatus || 'Unknown',
          createdAt: order.createdTime || order.createdAt || undefined,
          updatedAt: order.updatedTime || order.updatedAt || undefined,
          stopOrderType: order.stopOrderType || undefined, // For conditional orders: 'TakeProfit', 'StopLoss', etc.
          triggerPrice: order.triggerPrice || order.stopPx || undefined, // Trigger price for stop orders
          reduceOnly: order.reduceOnly || false, // If true, order is for closing position
        }));

        return { orders, success: true };
      }

      return { orders: [], success: false, error: data.retMsg || 'Failed to get orders' };
    } catch (error: any) {
      console.error('getOpenOrders error:', error);
      return { orders: [], success: false, error: error.message };
    }
  }

  // ── Bot engine primitives ────────────────────────────────────────────────
  // Generic signed POST to a Bybit v5 endpoint (body signature scheme).
  private async signedPost(creds: BybitCredentials, path: string, bodyParams: Record<string, string>) {
    const timestamp = Date.now().toString();
    const recvWindow = '5000';
    const sortedBody: Record<string, string> = {};
    Object.keys(bodyParams)
      .sort()
      .forEach((k) => (sortedBody[k] = bodyParams[k]));
    const bodyString = JSON.stringify(sortedBody);
    const signatureString = timestamp + creds.apiKey + recvWindow + bodyString;
    const signature = this.createSignature(signatureString, creds.apiSecret);
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: this.buildAuthHeaders(creds.apiKey, timestamp, signature, recvWindow),
      body: bodyString,
    });
    return response.json();
  }

  // Generic signed GET to a Bybit v5 endpoint (query signature scheme).
  private async signedGet(creds: BybitCredentials, path: string, params: Record<string, string>) {
    const timestamp = Date.now().toString();
    const recvWindow = '5000';
    const queryString = this.buildQueryString({ ...params, recv_window: recvWindow, timestamp });
    const signatureString = timestamp + creds.apiKey + recvWindow + queryString;
    const signature = this.createSignature(signatureString, creds.apiSecret);
    const response = await fetch(`${this.baseUrl}${path}?${queryString}`, {
      method: 'GET',
      headers: this.buildAuthHeaders(creds.apiKey, timestamp, signature, recvWindow),
    });
    return response.json();
  }

  // Place a limit order with full control (orderLinkId, reduceOnly) — used by
  // the grid bot engine. Price/qty are normalized to the instrument filters.
  async placeLimitOrder(
    creds: BybitCredentials,
    params: {
      symbol: string;
      side: 'Buy' | 'Sell';
      price: string;
      qty: string;
      positionIdx: '1' | '2';
      reduceOnly?: boolean;
      orderLinkId?: string;
    },
  ) {
    try {
      if (!this.hasKeys(creds)) {
        return { success: false, error: 'API keys not configured' };
      }
      const symbolInfo = await this.marketService.getSymbolInfo(params.symbol);
      const price = this.normalizePrice(params.price, symbolInfo);
      const qty = this.normalizeQuantity(params.qty, symbolInfo);
      if (!(parseFloat(qty) > 0)) {
        return { success: false, error: 'Неверный размер ордера после нормализации' };
      }

      const bodyParams: Record<string, string> = {
        category: 'linear',
        orderType: 'Limit',
        positionIdx: params.positionIdx,
        price,
        qty,
        side: params.side,
        symbol: params.symbol,
        timeInForce: 'GTC',
      };
      if (params.reduceOnly) bodyParams.reduceOnly = 'true';
      if (params.orderLinkId) bodyParams.orderLinkId = params.orderLinkId;

      const data = await this.signedPost(creds, '/order/create', bodyParams);
      if (data.retCode !== 0) {
        const error =
          this.friendlyBalanceError(data.retCode, data.retMsg) || data.retMsg || 'Не удалось создать ордер';
        return { success: false, error, retCode: data.retCode };
      }
      return {
        success: true,
        orderId: data.result?.orderId as string,
        orderLinkId: data.result?.orderLinkId as string,
        price,
        qty,
      };
    } catch (error: any) {
      console.error('placeLimitOrder error:', error);
      return { success: false, error: error.message };
    }
  }

  // Place a market order (DCA bot: base entry at signal, forced deal close).
  // Same normalization and error mapping as placeLimitOrder.
  async placeMarketOrder(
    creds: BybitCredentials,
    params: {
      symbol: string;
      side: 'Buy' | 'Sell';
      qty: string;
      positionIdx: '1' | '2';
      reduceOnly?: boolean;
      orderLinkId?: string;
    },
  ) {
    try {
      if (!this.hasKeys(creds)) {
        return { success: false, error: 'API keys not configured' };
      }
      const symbolInfo = await this.marketService.getSymbolInfo(params.symbol);
      const qty = this.normalizeQuantity(params.qty, symbolInfo);
      if (!(parseFloat(qty) > 0)) {
        return { success: false, error: 'Неверный размер ордера после нормализации' };
      }

      const bodyParams: Record<string, string> = {
        category: 'linear',
        orderType: 'Market',
        positionIdx: params.positionIdx,
        qty,
        side: params.side,
        symbol: params.symbol,
      };
      if (params.reduceOnly) bodyParams.reduceOnly = 'true';
      if (params.orderLinkId) bodyParams.orderLinkId = params.orderLinkId;

      const data = await this.signedPost(creds, '/order/create', bodyParams);
      if (data.retCode !== 0) {
        const error =
          this.friendlyBalanceError(data.retCode, data.retMsg) || data.retMsg || 'Не удалось создать ордер';
        return { success: false, error, retCode: data.retCode };
      }
      return {
        success: true,
        orderId: data.result?.orderId as string,
        orderLinkId: data.result?.orderLinkId as string,
        qty,
      };
    } catch (error: any) {
      console.error('placeMarketOrder error:', error);
      return { success: false, error: error.message };
    }
  }

  // Cancel an open order by orderId or orderLinkId. retCode 110001
  // ("order not exists or too late to cancel") is treated as success — the
  // order is already gone (filled or cancelled), which the caller reconciles.
  async cancelOrder(creds: BybitCredentials, params: { symbol: string; orderId?: string; orderLinkId?: string }) {
    try {
      if (!this.hasKeys(creds)) {
        return { success: false, error: 'API keys not configured' };
      }
      const bodyParams: Record<string, string> = {
        category: 'linear',
        symbol: params.symbol,
      };
      if (params.orderId) bodyParams.orderId = params.orderId;
      else if (params.orderLinkId) bodyParams.orderLinkId = params.orderLinkId;
      else return { success: false, error: 'Нужен orderId или orderLinkId' };

      const data = await this.signedPost(creds, '/order/cancel', bodyParams);
      if (data.retCode !== 0 && data.retCode !== 110001) {
        return { success: false, error: data.retMsg || 'Не удалось отменить ордер', retCode: data.retCode };
      }
      return { success: true, alreadyGone: data.retCode === 110001 };
    } catch (error: any) {
      console.error('cancelOrder error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * All currently open (resting) orders for one symbol as a Map keyed by
   * orderId — the bot engines' reconciliation snapshot. One request replaces
   * a queryOrder per tracked order: an order present here is still working;
   * only orders that disappeared need an individual history lookup to learn
   * whether they filled or were cancelled. `success:false` means the snapshot
   * is unusable (API error) and callers must fall back to per-order queries.
   */
  async getOpenOrdersBySymbol(
    creds: BybitCredentials,
    symbol: string,
  ): Promise<{ success: boolean; orders: Map<string, { status: string }> }> {
    const orders = new Map<string, { status: string }>();
    try {
      if (!this.hasKeys(creds)) return { success: false, orders };
      let cursor = '';
      // Realtime list is paginated (max 50/page); 3 pages cover any bot here.
      for (let page = 0; page < 3; page++) {
        const params: Record<string, string> = { category: 'linear', symbol, limit: '50' };
        if (cursor) params.cursor = cursor;
        const data = await this.signedGet(creds, '/order/realtime', params);
        if (data?.retCode !== 0) return { success: false, orders };
        for (const o of data.result?.list ?? []) {
          orders.set(o.orderId, { status: o.orderStatus });
        }
        cursor = data.result?.nextPageCursor || '';
        if (!cursor) break;
      }
      return { success: true, orders };
    } catch (error: any) {
      console.error('getOpenOrdersBySymbol error:', error);
      return { success: false, orders };
    }
  }

  // Look up a single order: open orders first, then order history (finished
  // orders are only visible there). Returns null when not found anywhere.
  async queryOrder(
    creds: BybitCredentials,
    params: { symbol: string; orderId?: string; orderLinkId?: string },
  ): Promise<{
    found: boolean;
    status?: string;
    avgPrice?: number;
    cumExecQty?: number;
    cumExecFee?: number;
  }> {
    try {
      if (!this.hasKeys(creds)) return { found: false };
      const idParams: Record<string, string> = {};
      if (params.orderId) idParams.orderId = params.orderId;
      else if (params.orderLinkId) idParams.orderLinkId = params.orderLinkId;
      else return { found: false };

      for (const path of ['/order/realtime', '/order/history']) {
        const data = await this.signedGet(creds, path, {
          category: 'linear',
          symbol: params.symbol,
          ...idParams,
        });
        const order = data?.result?.list?.[0];
        if (data?.retCode === 0 && order) {
          return {
            found: true,
            status: order.orderStatus,
            avgPrice: parseFloat(order.avgPrice || '0') || undefined,
            cumExecQty: parseFloat(order.cumExecQty || '0') || 0,
            cumExecFee: parseFloat(order.cumExecFee || '0') || 0,
          };
        }
      }
      return { found: false };
    } catch (error: any) {
      console.error('queryOrder error:', error);
      return { found: false };
    }
  }
}
