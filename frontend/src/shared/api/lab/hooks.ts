'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { apiJson, qs } from '@/shared/api/http';
import type { EquityPoint, Trade } from '@/shared/api/bybit/hooks';

// «Лаборатория»: произвольная комбинация фильтров по сделкам → сводка против
// базовой линии периода + фасеты (разбивка каждого измерения при остальных
// активных фильтрах). Смыслы значений см. lab.service.ts на бэкенде.

export interface LabFilters {
  days: number; // 0 = всё время
  tagIds: string[]; // contains-all
  direction?: 'long' | 'short';
  symbols: string[];
  weekdays: number[]; // 0..6, JS getDay(), локальное время пользователя
  hourFrom?: number; // 0..23 включительно, локальное время
  hourTo?: number;
  sessions: string[]; // 'asia' | 'london' | 'ny' | 'night' (UTC)
  trend4h: string[]; // 'trend_up' | 'trend_down' | 'range'
  ema200?: 'above' | 'below';
  atr?: 'high' | 'low'; // относительно медианы периода
  vol?: 'high' | 'low';
}

export const emptyLabFilters = (days: number): LabFilters => ({
  days,
  tagIds: [],
  symbols: [],
  weekdays: [],
  sessions: [],
  trend4h: [],
});

export interface LabAgg {
  trades: number;
  wins: number;
  losses: number;
  totalPnl: number;
  winRate: number; // 0..100
  profitFactor: number;
  avgPnl: number;
  wilsonLow: number; // 0..100
}

export interface LabFacetValue extends LabAgg {
  key: string;
  // Только для фасета tags:
  name?: string;
  color?: string;
}

export interface LabFacet {
  dimension:
    | 'direction'
    | 'session'
    | 'weekday'
    | 'trend4h'
    | 'ema200'
    | 'atr'
    | 'vol'
    | 'symbol'
    | 'tags';
  values: LabFacetValue[];
}

export interface LabResponse {
  success: boolean;
  baseline: LabAgg; // весь период без фильтров
  filtered: LabAgg; // после всех фильтров
  equity: EquityPoint[];
  medians: { atrPct: number | null; volRel: number | null };
  coverage: { total: number; withContext: number };
  facets: LabFacet[];
  trades: Trade[]; // последние 200 подходящих
}

export const useLab = (f: LabFilters) =>
  useQuery({
    queryKey: ['lab', f],
    queryFn: () =>
      apiJson<LabResponse>(
        `/api/trades/lab${qs({
          // 0 = «всё время»: параметр просто не отправляем.
          days: f.days > 0 ? f.days : undefined,
          // Дни недели и часы бэкенд считает по локальным часам пользователя.
          tz: new Date().getTimezoneOffset(),
          tags: f.tagIds,
          direction: f.direction,
          symbols: f.symbols,
          weekdays: f.weekdays,
          hourFrom: f.hourFrom,
          hourTo: f.hourTo,
          sessions: f.sessions,
          trend4h: f.trend4h,
          ema200: f.ema200,
          atr: f.atr,
          vol: f.vol,
        })}`,
      ),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
