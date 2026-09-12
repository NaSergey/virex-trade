'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
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

/**
 * Таймфрейм, на котором окно проверки диапазона открывается. Живёт здесь, а не
 * в самом окне: с ним же греется кэш до открытия, а префетч другого ТФ грел бы
 * пустоту — ключ запроса не совпал бы с тем, который окно потом спросит.
 */
export const RANGE_TF_DEFAULT: RangeTf = '4h';

// Один набор опций на хук и на префетч — по той же причине: ключ и запрос
// обязаны совпадать до знака.
const rangeCheckQuery = (tradeId: string, tf: RangeTf) => ({
  queryKey: ['rangeCheck', tradeId, tf],
  queryFn: () => apiJson<RangeCheckResponse>(`/api/trades/${tradeId}/range-check${qs({ tf })}`),
  staleTime: DETAIL_STALE,
});

export const useRangeCheck = (tradeId: string | null, tf: RangeTf) =>
  useQuery({
    ...rangeCheckQuery(tradeId ?? '', tf),
    enabled: !!tradeId,
  });

/**
 * Свечи для окна проверки диапазона — заранее, пока человек только тянется к
 * кнопке. Бэкенд ходит за ними живьём на биржу, и без прогрева окно открывается
 * пустым на полсекунды: сначала заглушка, потом график.
 *
 * `prefetchQuery` уважает staleTime, поэтому повторное наведение на ту же
 * кнопку запроса не шлёт, а промах (человек навёл и не нажал) стоит одного
 * запроса и попадает в тот же кэш, из которого окно потом и прочитает.
 */
export const usePrefetchRangeCheck = () => {
  const qc = useQueryClient();
  return (tradeId: string, tf: RangeTf = RANGE_TF_DEFAULT) => {
    void qc.prefetchQuery(rangeCheckQuery(tradeId, tf));
  };
};

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
