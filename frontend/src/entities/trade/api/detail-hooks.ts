'use client';

import { useQuery } from '@tanstack/react-query';
import { apiJson, qs } from '@/shared/api/http';
import type {
  ExecMarker,
  InstrumentInfo,
  RangeCheckResponse,
  RangeTf,
  TradeOrder,
} from './types';

/**
 * Разбор одной сделки или символа: то, что подгружается по требованию, когда
 * запись раскрыли или открыли проверку диапазона.
 *
 * Отсюда staleTime в минутах, а не в секундах: разобранная сделка уже закрыта,
 * её ордера и свечи задним числом не меняются.
 */

const DETAIL_STALE = 5 * 60 * 1000;

// Ордера подгружаются лениво — только когда строку реально раскрыли.
export const useTradeOrders = (tradeId: string | null) =>
  useQuery({
    queryKey: ['tradeOrders', tradeId],
    queryFn: () =>
      apiJson<{
        success: boolean;
        positionId: string | null;
        orders: TradeOrder[];
        // null, когда за время жизни позиции фандинга не записано — это не то
        // же самое, что ноль: у сделок старше бэкфилла его просто нет.
        funding: { total: number; payments: number } | null;
        error?: string;
      }>(`/api/trades/${tradeId}/orders`),
    enabled: !!tradeId,
    staleTime: DETAIL_STALE,
  });

export const useRangeCheck = (tradeId: string | null, tf: RangeTf) =>
  useQuery({
    queryKey: ['rangeCheck', tradeId, tf],
    queryFn: () => apiJson<RangeCheckResponse>(`/api/trades/${tradeId}/range-check${qs({ tf })}`),
    enabled: !!tradeId,
    staleTime: DETAIL_STALE,
  });

export const useExecutions = (symbol: string, days = 30) =>
  useQuery({
    queryKey: ['executions', symbol, days],
    queryFn: () =>
      apiJson<{ success: boolean; executions: ExecMarker[] }>(
        `/api/trades/executions${qs({ symbol, days })}`,
      ),
    enabled: !!symbol,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

export const useInstrumentInfo = (symbol: string) =>
  useQuery<InstrumentInfo>({
    queryKey: ['instrument', symbol],
    queryFn: () => apiJson<InstrumentInfo>(`/api/bybit/instrument${qs({ symbol })}`),
    enabled: !!symbol,
    staleTime: DETAIL_STALE,
  });
