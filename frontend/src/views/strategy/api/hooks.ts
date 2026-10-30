'use client';

import { useQuery } from '@tanstack/react-query';
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

/** Свеча, как её отдаёт `/api/market-data/candles`. */
export interface ChartCandle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export const CHART_BEFORE = 60;
export const CHART_AFTER = 20;

/** Свечи вокруг сделки: от 60 свечей до свипа до 20 после выхода. */
export function useTradeCandles(trade: TradeRow) {
  const step = trade.tf * 60_000;
  const from = trade.sweepMs - CHART_BEFORE * step;
  const to = trade.exitMs + CHART_AFTER * step;
  return useQuery({
    queryKey: ['strategy', 'candles', trade.tf, from, to],
    queryFn: () =>
      apiJson<ChartCandle[]>(`/api/market-data/candles${qs({ tf: trade.tf, from, to, limit: 5000 })}`),
    staleTime: Infinity,
  });
}
