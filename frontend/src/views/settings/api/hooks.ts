'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiJson } from '@/shared/api/http';

export interface BybitStatus {
  success: boolean;
  connected: boolean;
  apiKeyMasked: string | null;
}

export const useBybitStatus = () =>
  useQuery({
    queryKey: ['settings', 'bybit'],
    queryFn: () => apiJson<BybitStatus>('/api/settings/bybit'),
    staleTime: 30000,
  });

export const useSaveBybitKeys = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { apiKey: string; apiSecret: string }) =>
      apiJson<{ success: boolean; apiKeyMasked: string }>('/api/settings/bybit', {
        method: 'PUT',
        body: JSON.stringify(vars),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['settings', 'bybit'] });
      void qc.invalidateQueries({ queryKey: ['usdtBalance'] });
      void qc.invalidateQueries({ queryKey: ['openPositions'] });
      void qc.invalidateQueries({ queryKey: ['bots'] });
    },
  });
};

export const useDisconnectBybit = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiJson('/api/settings/bybit', { method: 'DELETE' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['settings', 'bybit'] }),
  });
};
