'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiJson, qs } from '@/shared/api/http';
import type { RangeCheckResponse, RangeTf, TradeOrder } from './types';

/**
 * Разбор одной сделки или символа: то, что подгружается по требованию, когда
 * запись раскрыли или открыли проверку диапазона.
 *
 * Отсюда staleTime в минутах, а не в секундах: разобранная сделка уже закрыта,
 * её ордера и свечи задним числом не меняются.
 */

const DETAIL_STALE = 5 * 60 * 1000;

// Один набор опций на хук и на префетч окна диапазона: ключ обязан совпадать.
const tradeOrdersQuery = (tradeId: string) => ({
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
  staleTime: DETAIL_STALE,
});

// Ордера подгружаются лениво — когда строку раскрыли или открыли окно
// диапазона (там из них берутся доборы).
export const useTradeOrders = (tradeId: string | null) =>
  useQuery({
    ...tradeOrdersQuery(tradeId ?? ''),
    enabled: !!tradeId,
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
    // Окно рисует по ордерам среднюю и доборы, а открыть его можно и с цены
    // в строке, которую не раскрывали, — без прогрева метки входов
    // появлялись бы на уже нарисованном графике.
    void qc.prefetchQuery(tradeOrdersQuery(tradeId));
  };
};
