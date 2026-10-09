'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/shared/api/http';
import type { Seasonality } from './types';

/**
 * «Когда BTC чаще растёт» — слоты таймфрейма `tf` (минуты) за `days` дней.
 * Сервер пересчитывает раз в час, поэтому и здесь перечитывать чаще получаса
 * незачем.
 */
export const useSeasonality = (tf: number, days: number) =>
  useQuery({
    queryKey: ['marketSeasonality', tf, days],
    queryFn: async () => {
      const response = await apiFetch(`/api/market-events/seasonality?tf=${tf}&days=${days}`, { method: 'GET' });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      return response.json() as Promise<Seasonality>;
    },
    // Смена таймфрейма не роняет список в заглушку: прежний ответ держится, пока
    // едет новый. Его `timeframe` — прежний, и потребитель рисует по нему.
    placeholderData: keepPreviousData,
    staleTime: 30 * 60_000,
    refetchInterval: 30 * 60_000,
  });
