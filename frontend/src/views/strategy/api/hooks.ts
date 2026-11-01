'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { fromApi, type ApiCandle } from '@/widgets/backtest-session';
import { apiJson, qs } from '@/shared/api/http';
import type { ReportResponse, TradeRow } from './types';

/**
 * Отчёт стратегии (`backend/src/strategy`). Считает его worker раз в сутки;
 * пока первого отчёта нет, страница спрашивает раз в полминуты и появится сама.
 */
export function useStrategyReport(enabled: boolean) {
  return useQuery({
    queryKey: ['strategy', 'report'],
    queryFn: () => apiJson<ReportResponse>('/api/admin/strategy/report'),
    enabled,
    staleTime: 5 * 60_000,
    refetchInterval: (q) => (q.state.data?.status === 'pending' ? 30_000 : false),
  });
}

export const CHART_BEFORE = 60;
export const CHART_AFTER = 20;

/**
 * Свечи вокруг сделки на выбранном ТФ: от 60 свечей до свипа (и `extra` глубже) до 20 после выхода.
 * Рынок Bybit, как у самого отчёта: на свечах Binance уровни сделки легли бы мимо.
 */
export function useTradeCandles(trade: TradeRow, tf: number, extra = 0) {
  const step = tf * 60_000;
  const from = trade.sweepMs - (CHART_BEFORE + extra) * step;
  const to = trade.exitMs + CHART_AFTER * step;
  const { symbol } = trade;
  return useQuery({
    queryKey: ['strategy', 'candles', symbol, tf, from, to],
    queryFn: async () => ({
      tf,
      candles: (await apiJson<ApiCandle[]>(`/api/terminal/candles${qs({ symbol, tf, from, to, limit: 5000 })}`)).map(fromApi),
    }),
    staleTime: Infinity,
    // Смена ТФ и догрузка истории: пока едут новые свечи, на экране прежние.
    placeholderData: keepPreviousData,
  });
}
