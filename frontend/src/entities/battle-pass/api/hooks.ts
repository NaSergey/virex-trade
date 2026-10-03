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
/**
 * `enabled: false` — на чужом профиле, который может открыть и гость: Battle
 * Pass — ключ смотрящего, и у гостя запрос получил бы 401.
 */
export const useBattlePass = (enabled = true) =>
  useQuery({ queryKey: battlePassKey, queryFn: () => apiJson<BattlePassState>('/api/battlepass'), enabled });

const post = (path: string) => apiJson<{ coins: number; balance: number }>(path, { method: 'POST' });

/**
 * После выдачи меняются и прогресс, и баланс монет в шапке. Баланс пишется
 * сразу из ответа (`setQueryData`), а не через `invalidateQueries`: он уже
 * точный, и ждать ради него второй круг по сети за тем же числом — это и
 * есть та самая заметная пауза перед тем, как монеты в шапке подрастут.
 */
function useClaimMutation(path: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => post(path),
    onSuccess: ({ balance }) => {
      qc.setQueryData(['coins'], { balance });
      void qc.invalidateQueries({ queryKey: battlePassKey });
      // Дашборд профиля (`entities/profile`, ключ строкой — сущности друг
      // друга не импортируют): выдача — новая строка ленты и точка графика
      // баланса.
      void qc.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}

export const useClaimRewards = () => useClaimMutation('/api/battlepass/claim');
export const useClaimDaily = () => useClaimMutation('/api/battlepass/daily');
