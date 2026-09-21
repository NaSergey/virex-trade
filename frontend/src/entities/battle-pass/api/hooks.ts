'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiJson } from '@/shared/api/http';
import type { BattlePassState } from './types';

export const battlePassKey = ['battlepass'] as const;

/**
 * Состояние Battle Pass. Без опроса по интервалу: XP меняется только от
 * собственных действий человека — доигранного турнира, законченной сессии,
 * размеченной сделки, — и точки, где это происходит, сбрасывают ключ сами.
 */
export const useBattlePass = () =>
  useQuery({ queryKey: battlePassKey, queryFn: () => apiJson<BattlePassState>('/api/battlepass') });

const post = (path: string) => apiJson<{ coins: number; balance: number }>(path, { method: 'POST' });

/** После выдачи меняются и прогресс, и баланс монет в шапке. */
function useClaimMutation(path: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => post(path),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: battlePassKey });
      void qc.invalidateQueries({ queryKey: ['coins'] });
    },
  });
}

export const useClaimRewards = () => useClaimMutation('/api/battlepass/claim');
export const useClaimDaily = () => useClaimMutation('/api/battlepass/daily');
