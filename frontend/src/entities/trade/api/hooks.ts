'use client';

import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { apiJson, qs } from '@/shared/api/http';
import type {
  EquityPoint,
  HabitsResponse,
  TimeStatsResponse,
  TradeStats,
  TradesPage,
} from './types';

/**
 * Журнал закрытых сделок и своды по нему.
 *
 * Разбор одной сделки (ордера, свечи, инструмент) живёт в `detail-hooks` — он
 * грузится лениво, по клику, и смешивать его с тем, что страница запрашивает
 * сразу, значило бы прятать эту разницу.
 *
 * `days: 0` во всех трёх хуках означает «за всё время» и в запрос не уходит:
 * `|| undefined` гасит ноль до того, как его увидит `qs` (ноль сам по себе —
 * значащее значение, и `qs` его не выбрасывает).
 */

// keepPreviousData во всех сводах: без него смена периода роняет метрики и
// график в undefined до ответа — мастхед схлопывается, страница прыгает,
// потом отрисовывается заново.
const LIVE = {
  placeholderData: keepPreviousData,
  staleTime: 30_000,
  refetchInterval: 60_000,
} as const;

// `tagId` narrows to trades carrying that tag; the literal 'untagged' narrows
// to trades with no tags (tag drill-down / разметка неразмеченных).
// `combo` narrows to trades whose tag set is EXACTLY these ids (combo card);
// `hasTags` narrows to trades CONTAINING all these ids (saved combo card).
export const useTrades = (params?: {
  symbol?: string;
  days?: number;
  page?: number;
  pageSize?: number;
  tagId?: string;
  combo?: string[];
  hasTags?: string[];
}) =>
  useQuery({
    queryKey: [
      'trades',
      params?.symbol ?? 'all',
      params?.days ?? 0,
      params?.page ?? 1,
      params?.pageSize ?? 20,
      params?.tagId ?? 'any',
      params?.combo?.join(',') ?? 'any',
      params?.hasTags?.join(',') ?? 'any',
    ],
    queryFn: () =>
      apiJson<TradesPage>(
        `/api/trades${qs({
          symbol: params?.symbol,
          days: params?.days || undefined,
          page: params?.page || undefined,
          pageSize: params?.pageSize || undefined,
          tagId: params?.tagId,
          combo: params?.combo,
          hasTags: params?.hasTags,
        })}`,
      ),
    ...LIVE,
  });

export const useTradeStats = (params?: { symbol?: string; days?: number; tagId?: string }) =>
  useQuery({
    queryKey: ['tradeStats', params?.symbol ?? 'all', params?.days ?? 0, params?.tagId ?? 'any'],
    queryFn: () =>
      apiJson<{ success: boolean; stats: TradeStats; equity: EquityPoint[] }>(
        `/api/trades/stats${qs({
          symbol: params?.symbol,
          days: params?.days || undefined,
          tagId: params?.tagId,
        })}`,
      ),
    ...LIVE,
  });

export const useTimeStats = (params?: { days?: number; tagId?: string }) =>
  useQuery({
    queryKey: ['timeStats', params?.days ?? 0, params?.tagId ?? 'any'],
    queryFn: () =>
      apiJson<TimeStatsResponse>(
        `/api/trades/stats-by-time${qs({
          days: params?.days || undefined,
          tagId: params?.tagId,
          // Bucket by the user's local clock, not the server's.
          tz: new Date().getTimezoneOffset(),
        })}`,
      ),
    ...LIVE,
  });

export const useHabits = (params?: { days?: number }) =>
  useQuery({
    queryKey: ['habits', params?.days ?? 0],
    queryFn: () =>
      apiJson<HabitsResponse>(
        `/api/trades/habits${qs({
          days: params?.days || undefined,
          tz: new Date().getTimezoneOffset(),
        })}`,
      ),
    ...LIVE,
  });
