'use client';

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { apiJson } from '@/shared/api/http';
import type {
  CreateTournamentInput,
  MyTournament,
  PublicTournament,
  Rating,
  TournamentDetail,
} from './types';

const listKey = ['tournaments', 'mine'] as const;
const publicKey = ['tournaments', 'public'] as const;
const ratingKey = ['tournaments', 'rating'] as const;
const detailKey = (id: string) => ['tournaments', 'detail', id] as const;

/**
 * Идущий турнир перечитывается раз в пять секунд: он может завершиться, пока
 * страница открыта, — итоги подводит фоновый движок, а не чтение страницы.
 */
const DETAIL_POLL_MS = 5000;

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});

/** После любой правки: турнир, оба списка, рейтинг и баланс монет. */
function refresh(qc: QueryClient, id?: string) {
  if (id) void qc.invalidateQueries({ queryKey: detailKey(id) });
  void qc.invalidateQueries({ queryKey: listKey });
  void qc.invalidateQueries({ queryKey: publicKey });
  void qc.invalidateQueries({ queryKey: ratingKey });
  // Взнос, возврат и приз меняют баланс в шапке — он же и должен это показать.
  void qc.invalidateQueries({ queryKey: ['coins'] });
}

export const useMyTournaments = () =>
  useQuery({ queryKey: listKey, queryFn: () => apiJson<MyTournament[]>('/api/tournaments') });

export const usePublicTournaments = () =>
  useQuery({ queryKey: publicKey, queryFn: () => apiJson<PublicTournament[]>('/api/tournaments/public') });

export const useTournamentRating = () =>
  useQuery({ queryKey: ratingKey, queryFn: () => apiJson<Rating>('/api/tournaments/rating') });

export const useTournament = (id: string) =>
  useQuery({
    queryKey: detailKey(id),
    queryFn: () => apiJson<TournamentDetail>(`/api/tournaments/${id}`),
    refetchInterval: (q) => (q.state.data?.tournament.status === 'running' ? DETAIL_POLL_MS : false),
  });

export const useCreateTournament = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTournamentInput) =>
      apiJson<{ tournament: MyTournament }>('/api/tournaments', json('POST', input)),
    onSettled: (data) => refresh(qc, data?.tournament.id),
  });
};

/** Действие над турниром: у всех одна форма — POST без тела и общий сброс кэшей. */
function useTournamentAction(id: string, request: () => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: request, onSettled: () => refresh(qc, id) });
}

export const useJoinTournament = (id: string) =>
  useTournamentAction(id, () => apiJson<unknown>(`/api/tournaments/${id}/join`, json('POST')));

export const useLeaveTournament = (id: string) =>
  useTournamentAction(id, () => apiJson<unknown>(`/api/tournaments/${id}/leave`, json('POST')));

export const useStartTournament = (id: string) =>
  useTournamentAction(id, () => apiJson<unknown>(`/api/tournaments/${id}/start`, json('POST')));

export const useRemoveTournament = (id: string) =>
  useTournamentAction(id, () => apiJson<unknown>(`/api/tournaments/${id}`, json('DELETE')));
