'use client';

import { useQuery } from '@tanstack/react-query';
import { apiJson } from '@/shared/api/http';
import type { Probabilities } from './types';

/**
 * Частоты после дивергенций RSI — экспериментальный индикатор терминала (спека
 * 2026-10-25). Сервер пересчитывает их раз в сутки: перечитывать чаще получаса
 * незачем.
 */
export const useProbabilities = (enabled: boolean) =>
  useQuery({
    queryKey: ['probabilities'],
    queryFn: () => apiJson<Probabilities>('/api/probabilities'),
    enabled,
    staleTime: 10 * 60_000,
    refetchInterval: enabled ? 30 * 60_000 : false,
  });
