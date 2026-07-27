'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/shared/api/http';

export interface BybitStatus {
  success: boolean;
  connected: boolean;
  apiKeyMasked: string | null;
}

async function requestJson<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await apiFetch(path, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    throw new Error(data.message || data.error || `HTTP error! status: ${res.status}`);
  }
  return data as T;
}

export const useBybitStatus = () =>
  useQuery({
    queryKey: ['settings', 'bybit'],
    queryFn: () => requestJson<BybitStatus>('/api/settings/bybit'),
    staleTime: 30000,
  });

export const useSaveBybitKeys = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { apiKey: string; apiSecret: string }) =>
      requestJson<{ success: boolean; apiKeyMasked: string }>('/api/settings/bybit', {
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
    mutationFn: () => requestJson('/api/settings/bybit', { method: 'DELETE' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['settings', 'bybit'] }),
  });
};
