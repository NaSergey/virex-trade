'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiJson } from '@/shared/api/http';

export interface ReferralStats {
  total: number;
  withKey: number;
  /** Кастомное имя вместо userId в ссылке — null, если не задано. */
  slug: string | null;
}

/**
 * Счётчик приглашённых и текущий слаг. Число меняется редко — не в реальном
 * времени, как статус доната, — поэтому без опроса, только при открытии окна.
 */
export const useReferralStats = () =>
  useQuery({
    queryKey: ['referralStats'],
    queryFn: () => apiJson<ReferralStats>('/api/referrals/me'),
    staleTime: 60_000,
  });

/**
 * Живая проверка доступности слага при вводе. `enabled` решает вызывающий:
 * запрос имеет смысл только когда формат уже валиден и значение отличается
 * от уже сохранённого — см. ReferralDialog.
 */
export const useSlugAvailable = (slug: string, enabled: boolean) =>
  useQuery({
    queryKey: ['referralSlugAvailable', slug],
    queryFn: () => apiJson<{ available: boolean }>(`/api/referrals/slug-available?slug=${encodeURIComponent(slug)}`),
    enabled,
    staleTime: 0,
  });

export const useSetReferralSlug = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (slug: string) =>
      apiJson<{ slug: string }>('/api/referrals/slug', {
        method: 'PUT',
        body: JSON.stringify({ slug }),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['referralStats'] }),
  });
};
