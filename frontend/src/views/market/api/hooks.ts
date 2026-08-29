'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/shared/api/http';

export interface MarketData {
  marketCap: number;
  marketCapChange24h: number;
}

export interface FearGreedData {
  value: number;
  classification: string;
}

export interface TvlPoint {
  date: number;
  tvl: number;
}

export interface DeFiTVLData {
  tvl: TvlPoint[];
}

export interface SentimentPoint {
  timestamp: number;
  buyRatio: number;
  sellRatio: number;
  openInterest: number; // в монетах (BTC для BTCUSDT)
  openInterestUsd: number; // OI × часовой close — то, что показывает график
}

export interface MarketSentimentData {
  points: SentimentPoint[];
}

export const useMarketData = () =>
  useQuery({
    queryKey: ['analyticsMarket'],
    queryFn: async () => {
      const response = await apiFetch('/api/analytics/market', { method: 'GET' });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      return response.json() as Promise<MarketData>;
    },
    staleTime: 600_000,
    refetchInterval: 600_000,
  });

export const useFearAndGreed = () =>
  useQuery({
    queryKey: ['analyticsFearGreed'],
    queryFn: async () => {
      const response = await apiFetch('/api/analytics/fear-greed', { method: 'GET' });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      return response.json() as Promise<FearGreedData>;
    },
    staleTime: 600_000,
    refetchInterval: 600_000,
  });

export const useDeFiTVL = () =>
  useQuery({
    queryKey: ['analyticsDeFiTVL'],
    queryFn: async () => {
      const response = await apiFetch('/api/analytics/defi-tvl', { method: 'GET' });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      return response.json() as Promise<DeFiTVLData>;
    },
    staleTime: 600_000,
    refetchInterval: 600_000,
  });

export interface Cmc20Data {
  index: number;
  change24h: number;
}

export const useCMC20 = () =>
  useQuery({
    queryKey: ['analyticsCmc20'],
    queryFn: async () => {
      const response = await apiFetch('/api/analytics/cmc20', { method: 'GET' });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      return response.json() as Promise<Cmc20Data>;
    },
    staleTime: 600_000,
    refetchInterval: 600_000,
  });

export const useMarketSentiment = (symbol = 'BTCUSDT') =>
  useQuery({
    queryKey: ['analyticsMarketSentiment', symbol],
    queryFn: async () => {
      const response = await apiFetch(
        `/api/analytics/market-sentiment?symbol=${symbol}`,
        { method: 'GET' },
      );
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      return response.json() as Promise<MarketSentimentData>;
    },
    staleTime: 600_000,
    refetchInterval: 600_000,
  });

export interface VolatilityData {
  currentVolPct: number; // realized vol, последние 24ч, в дневном масштабе
  avgVolPct: number; // realized vol за 7-дневную базу, тот же масштаб
  elevated: boolean; // currentVolPct > avgVolPct
  volume24hUsd: number;
  avgDailyVolumeUsd: number;
  volumeChangePct: number;
  volumeRising: boolean;
  buyVolumeUsd: number; // прокси по свечам: close >= open за последние 24ч
  sellVolumeUsd: number;
  dominantSide: 'buy' | 'sell' | 'neutral';
}

export const useVolatility = (symbol = 'BTCUSDT') =>
  useQuery({
    queryKey: ['analyticsVolatility', symbol],
    queryFn: async () => {
      const response = await apiFetch(`/api/analytics/volatility?symbol=${symbol}`, { method: 'GET' });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      return response.json() as Promise<VolatilityData>;
    },
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });
