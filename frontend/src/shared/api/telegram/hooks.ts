'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/shared/api/http';

interface TelegramStatus {
  success: boolean;
  enabled: boolean; // bot token configured server-side
  linked: boolean; // this user's chat is linked
  botUsername: string | null;
}

async function requestJson<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await apiFetch(path, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    throw new Error(data.message || data.error || `HTTP error! status: ${res.status}`);
  }
  return data as T;
}

// Linking completes out-of-band (user taps Start in Telegram), so while the
// chat is not linked yet the status is polled to flip the UI automatically.
export const useTelegramStatus = () =>
  useQuery({
    queryKey: ['telegramStatus'],
    queryFn: () => requestJson<TelegramStatus>('/api/telegram/status'),
    staleTime: 15_000,
    refetchInterval: (query) => (query.state.data && !query.state.data.linked ? 5_000 : 60_000),
  });

/** Returns the t.me deep link the user must open to finish linking. */
export const useTelegramLink = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => requestJson<{ success: boolean; url: string }>('/api/telegram/link', { method: 'POST' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['telegramStatus'] }),
  });
};

export const useTelegramUnlink = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => requestJson('/api/telegram/link', { method: 'DELETE' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['telegramStatus'] }),
  });
};

export const useTelegramTest = () =>
  useMutation({
    mutationFn: () => requestJson('/api/telegram/test', { method: 'POST' }),
  });
