'use client';

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { apiJson } from '@/shared/api/http';
import { afterExits } from '../model/exits';
import type { BjActionType, BlackjackView, CreateTableInput, GameTableRow, GameType, PokerAction, PokerView } from './types';

const mineKey = ['game-tables', 'mine'] as const;
const publicKey = (gameType: GameType) => ['game-tables', 'public', gameType] as const;
export const pokerViewKey = (id: string) => ['game-tables', 'poker', id] as const;
export const blackjackViewKey = (id: string) => ['game-tables', 'blackjack', id] as const;

/** Свободные столы наполняют другие люди — список перечитывается сам. */
const PUBLIC_POLL_MS = 10_000;

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});

/** Посадка, уход и закрытие меняют списки и баланс монет в шапке. */
function refresh(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: ['game-tables'] });
  void qc.invalidateQueries({ queryKey: ['coins'] });
}

/**
 * Мои столы — обоих типов игр; страница игры отбирает свои. Оба списка
 * сначала дожидаются выхода из-за стола, если он ещё в пути (`afterExits`):
 * иначе лобби, открытое прямо со стола, рисовало бы себя сидящим, а через миг
 * перерисовывалось.
 */
export const useMyTables = () =>
  useQuery({
    queryKey: mineKey,
    queryFn: async () => {
      await afterExits();
      return apiJson<GameTableRow[]>('/api/games/tables/mine');
    },
  });

export const usePublicTables = (gameType: GameType) =>
  useQuery({
    queryKey: publicKey(gameType),
    queryFn: async () => {
      await afterExits();
      return apiJson<GameTableRow[]>(`/api/games/tables/public?gameType=${gameType}`);
    },
    refetchInterval: PUBLIC_POLL_MS,
  });

export const useCreateTable = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTableInput) => apiJson<GameTableRow>('/api/games/tables', json('POST', input)),
    onSettled: () => refresh(qc),
  });
};

export const useJoinTable = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, buyIn }: { id: string; buyIn: number }) =>
      apiJson<unknown>(`/api/games/tables/${id}/join`, json('POST', { buyIn })),
    onSettled: () => refresh(qc),
  });
};

export const useLeaveTable = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiJson<unknown>(`/api/games/tables/${id}/leave`, json('POST')),
    onSettled: () => refresh(qc),
  });
};

export const useCloseTable = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiJson<unknown>(`/api/games/tables/${id}`, json('DELETE')),
    onSettled: () => refresh(qc),
  });
};

/**
 * Вид покерного стола. Первый снимок — REST; дальше его подменяют события
 * сокета (`usePokerSocket` пишет их в этот же ключ), поэтому опроса нет.
 */
export const usePokerView = (id: string) =>
  useQuery({ queryKey: pokerViewKey(id), queryFn: () => apiJson<PokerView>(`/api/games/tables/${id}/poker`) });

export const usePokerAction = (id: string) =>
  useMutation({
    mutationFn: (action: PokerAction) => apiJson<unknown>(`/api/games/tables/${id}/poker/action`, json('POST', action)),
  });

export const usePokerFlags = (id: string) =>
  useMutation({
    mutationFn: (flags: { sitOut?: boolean; foldAny?: boolean }) =>
      apiJson<unknown>(`/api/games/tables/${id}/poker/flags`, json('POST', flags)),
  });

/**
 * Вид стола блэкджека. Как у покера: первый снимок — REST, дальше его
 * подменяют события сокета (`blackjack_state`).
 */
export const useBlackjackView = (id: string) =>
  useQuery({ queryKey: blackjackViewKey(id), queryFn: () => apiJson<BlackjackView>(`/api/games/tables/${id}/blackjack`) });

export const useBlackjackBet = (id: string) =>
  useMutation({
    mutationFn: (amount: number) => apiJson<unknown>(`/api/games/tables/${id}/blackjack/bet`, json('POST', { amount })),
  });

export const useBlackjackAction = (id: string) =>
  useMutation({
    mutationFn: (type: BjActionType) => apiJson<unknown>(`/api/games/tables/${id}/blackjack/action`, json('POST', { type })),
  });

export const useBlackjackFlags = (id: string) =>
  useMutation({
    mutationFn: (flags: { sitOut: boolean }) =>
      apiJson<unknown>(`/api/games/tables/${id}/blackjack/flags`, json('POST', flags)),
  });
