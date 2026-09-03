'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiJson } from '@/shared/api/http';

interface TelegramStatus {
  success: boolean;
  enabled: boolean; // bot token configured server-side
  linked: boolean; // this user's chat is linked
  botUsername: string | null;
  /** Включённые сигналы — только для показа; правятся они в боте. */
  notifications: Array<{ key: string; title: string }>;
}

// Linking completes out-of-band (user taps Start in Telegram), so while the
// chat is not linked yet the status is polled to flip the UI automatically.
export const useTelegramStatus = () =>
  useQuery({
    queryKey: ['telegramStatus'],
    queryFn: () => apiJson<TelegramStatus>('/api/telegram/status'),
    staleTime: 15_000,
    refetchInterval: (query) => (query.state.data && !query.state.data.linked ? 5_000 : 60_000),
  });

/** Returns the t.me deep link the user must open to finish linking. */
export const useTelegramLink = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiJson<{ success: boolean; url: string }>('/api/telegram/link', { method: 'POST' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['telegramStatus'] }),
  });
};

export const useTelegramUnlink = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiJson('/api/telegram/link', { method: 'DELETE' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['telegramStatus'] }),
  });
};

export const useTelegramTest = () =>
  useMutation({
    mutationFn: () => apiJson('/api/telegram/test', { method: 'POST' }),
  });
