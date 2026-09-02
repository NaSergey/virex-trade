'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/shared/api/http';

export interface WeekdayBucket {
  weekday: number; // JS getUTCDay(): 0 = Sunday
  days: number;
  upDays: number;
  winRateLongPct: number;
  avgChangePct: number;
}

export interface MarketCorrelation {
  weekday: WeekdayBucket[];
  totalDays: number;
}

export const useMarketCorrelation = (days = 730) =>
  useQuery({
    queryKey: ['marketEventsCorrelation', days],
    queryFn: async () => {
      const response = await apiFetch(`/api/market-events/correlation?days=${days}`, { method: 'GET' });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      return response.json() as Promise<MarketCorrelation>;
    },
    staleTime: 30 * 60_000,
    refetchInterval: 30 * 60_000,
  });

export interface HourlyBucket {
  hour: number; // UTC hour, 0-23
  samples: number;
  winRateLongPct: number;
  avgChangePct: number;
  avgVolatilityPct: number; // (high-low)/open — magnitude only, ignores direction
}

export interface HourlyStats {
  hourly: HourlyBucket[];
  totalSamples: number;
}

export const useHourlyStats = (days = 730) =>
  useQuery({
    queryKey: ['marketEventsHourly', days],
    queryFn: async () => {
      const response = await apiFetch(`/api/market-events/hourly?days=${days}`, { method: 'GET' });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      return response.json() as Promise<HourlyStats>;
    },
    staleTime: 30 * 60_000,
    refetchInterval: 30 * 60_000,
  });
