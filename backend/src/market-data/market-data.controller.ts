import { BadRequestException, Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { parseCandleQuery } from './candle-query';
import { LiveMarketService } from './live-market.service';
import { MarketDataService } from './market-data.service';
import { DEFAULT_SYMBOL, LIVE_SYMBOLS, isLiveSymbol } from './symbols';
import { SYMBOL } from './timeframes';

// Дефолт, когда клиент вовсе не передал `limit` — не то же самое, что потолок
// явного запроса (`MAX_LIMIT` в candle-query). 5000 в этой роли было случайно
// тяжёлым дефолтом: обычный график просит недавние свечи, а не всю историю разом.
const DEFAULT_LIMIT = 500;

const unknownSymbol = (symbol: string) =>
  new BadRequestException({ message: `Монеты ${symbol} нет в эфире`, code: 'MARKET_SYMBOL_UNKNOWN' });

/** Монета из адреса: пусто — BTC, не из списка эфира — 400. */
const liveSymbol = (raw?: string): string => {
  const symbol = raw || DEFAULT_SYMBOL;
  if (!isLiveSymbol(symbol)) throw unknownSymbol(symbol);
  return symbol;
};

/**
 * Данные публичные, но эндпоинт под гвардом: открытым он сделал бы из сервера
 * бесплатный прокси к истории BTC для кого угодно.
 */
@UseGuards(JwtAuthGuard)
@Controller('api/market-data')
export class MarketDataController {
  constructor(
    private readonly marketData: MarketDataService,
    private readonly live: LiveMarketService,
  ) {}

  /**
   * Хвост последних минуток монеты для графика эфира — последняя ещё
   * формируется. serverTime — чтобы браузер вёл момент по часам сервера: цены и
   * время сделок эфира ставит сервер.
   */
  @Get('live')
  async getLive(@Query('symbol') symbol?: string) {
    const { minutes } = await this.live.snapshot(liveSymbol(symbol));
    return { serverTime: new Date().toISOString(), minutes };
  }

  /** Монеты эфира — единственный список, фронт своего не держит. */
  @Get('live/symbols')
  getLiveSymbols() {
    return { symbols: LIVE_SYMBOLS };
  }

  /**
   * Последние цены монет через запятую — отметка позиций по монетам, которых
   * нет на графике. Чужие символы отбрасываются молча: цены им взять неоткуда.
   */
  @Get('live/prices')
  async getLivePrices(@Query('symbols') raw?: string) {
    const symbols = [...new Set((raw ?? '').split(','))].filter(isLiveSymbol);
    return { serverTime: new Date().toISOString(), prices: await this.live.prices(symbols) };
  }

  @Get('candles')
  async getCandles(
    @Query('tf') tf?: string,
    @Query('symbol') symbol?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const query = parseCandleQuery({ tf, from, to, limit }, DEFAULT_LIMIT);
    // BTC — из хранилища; остальные монеты эфира не хранятся, их историю отдаёт
    // Binance в той же форме (только закрытые свечи). Прочие символы — 400: иначе
    // эндпоинт стал бы прокси ко всему рынку.
    const sym = symbol || SYMBOL;
    if (sym !== SYMBOL && !isLiveSymbol(sym)) throw unknownSymbol(sym);
    const candles =
      sym === SYMBOL ? await this.marketData.getCandles({ symbol: sym, ...query }) : await this.live.history(sym, query);

    // Правая граница окна раньше текущего момента — свечи в нём больше
    // никогда не изменятся, в отличие от текущей/последней свечи, которая
    // ещё формируется. `to` не задан — верхняя граница «сейчас» или вовсе не
    // задана, кэшировать нельзя.
    if (query.to && query.to.getTime() < Date.now()) {
      res?.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    }

    return candles;
  }

  @Get('coverage')
  async getCoverage(@Query('symbol') symbol?: string) {
    return this.marketData.getCoverage(symbol);
  }
}
