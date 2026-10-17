'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiJson } from '@/shared/api/http';

export interface NotifPreset {
  value: number;
  label: string;
}

export interface NotifItem {
  key: string;
  emoji: string;
  title: string;
  enabled: boolean;
  /** Индекс в presets. */
  preset: number;
  /** Пустой массив — у сигнала нет порога. */
  presets: NotifPreset[];
}

export interface NotifCategory {
  key: string;
  emoji: string;
  title: string;
  items: NotifItem[];
}

export interface NotificationsState {
  success: boolean;
  quietHours: boolean;
  categories: NotifCategory[];
}

export interface NotificationsPatch {
  items?: Record<string, { enabled?: boolean; preset?: number }>;
  quietHours?: boolean;
}

// Состав сигналов приходит с сервера вместе с состоянием: список живёт в
// реестре бэкенда, и держать его вторую копию здесь значило бы однажды
// разойтись с ним в названиях или порогах.
export const useNotifications = () =>
  useQuery({
    queryKey: ['notifications'],
    queryFn: () => apiJson<NotificationsState>('/api/notifications'),
    staleTime: 60_000,
  });

export const usePatchNotifications = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: NotificationsPatch) =>
      apiJson<NotificationsState>('/api/notifications', {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    // Ответ — то же самое состояние целиком, поэтому кладём его в кэш вместо
    // повторного запроса: переключение тумблера не должно моргать списком.
    onSuccess: (data) => qc.setQueryData(['notifications'], data),
  });
};
