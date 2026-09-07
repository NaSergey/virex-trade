'use client';

import { useQuery } from '@tanstack/react-query';
import { apiJson } from '@/shared/api/http';

export interface ReferralStats {
  total: number;
  withKey: number;
}

/**
 * Счётчик приглашённых. Число меняется редко — не в реальном времени, как
 * статус доната, — поэтому без опроса, только при открытии окна.
 */
export const useReferralStats = () =>
  useQuery({
    queryKey: ['referralStats'],
    queryFn: () => apiJson<ReferralStats>('/api/referrals/me'),
    staleTime: 60_000,
  });
