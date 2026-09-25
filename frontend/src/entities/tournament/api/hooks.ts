'use client';

import { useMemo } from 'react';
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
 * Незаконченный турнир перечитывается раз в пять секунд.
 *
 * Идущий — потому что он может завершиться, пока страница открыта: итоги
 * подводит фоновый движок, а не чтение страницы.
 *
 * Лобби — потому что ВСЁ, что там происходит, делают другие: входят, выходят,
 * отмечают готовность и этим же запускают турнир. Пока опрос стоял на одном
 * `running`, нажавший «готов» последним видел старт сразу (его же мутация
 * сбрасывала кэш), а остальные сидели в застывшем лобби до перезагрузки
 * страницы — у них турнир уже шёл, а они об этом не знали.
 *
 * Законченный не перечитывается: меняться в нём больше нечему.
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

/** Один запрос турнира — и для показа, и для предзагрузки: ключ обязан совпасть. */
const detailQuery = (id: string) => ({
  queryKey: detailKey(id),
  queryFn: () => apiJson<TournamentDetail>(`/api/tournaments/${id}`),
});

export const useTournament = (id: string) =>
  useQuery({
    ...detailQuery(id),
    refetchInterval: (q) => (q.state.data?.tournament.status === 'finished' ? false : DETAIL_POLL_MS),
  });

/**
 * Турнир в кэш ДО того, как его показали.
 *
 * Окно турнира открывается поверх списков и центрируется по собственному
 * размеру: пока данные едут, в нём стоит заглушка на 200 пикселей, а с их
 * приходом окно разворачивается на всю сводку — и на глазах прыгает из одного
 * размера в другой. Лечится это не заглушкой поудобнее, а порядком: сначала
 * данные, потом окно.
 *
 * `warm` зовут по наведению и фокусу строки — на мыши и с клавиатуры данные
 * приезжают, пока рука идёт к кнопке, и окно открывается мгновенно. `ready`
 * зовут по клику: он ждёт тот же запрос, который уже мог уйти по наведению
 * (react-query не пошлёт второй), а на тачскрине, где наведения нет, — свой.
 */
export function useTournamentPreload() {
  const qc = useQueryClient();
  return useMemo(
    () => ({
      warm: (id: string) => void qc.prefetchQuery({ ...detailQuery(id), staleTime: DETAIL_POLL_MS }),
      /** Ошибку не глотаем наружу: окно откроется и покажет её сам TournamentView. */
      ready: (id: string) => qc.ensureQueryData(detailQuery(id)).catch(() => undefined),
    }),
    [qc],
  );
}

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

/**
 * Готовность участника. Команды «начать» у продукта нет: турнир выходит из
 * лобби сам, когда готовы все, — и ответ этого запроса уже несёт новый статус.
 */
export const useSetReady = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ready: boolean) =>
      apiJson<unknown>(`/api/tournaments/${id}/ready`, json('POST', { ready })),
    onSettled: () => refresh(qc, id),
  });
};

export const useRemoveTournament = (id: string) =>
  useTournamentAction(id, () => apiJson<unknown>(`/api/tournaments/${id}`, json('DELETE')));

export const useFinishTournament = (id: string) =>
  useTournamentAction(id, () => apiJson<unknown>(`/api/tournaments/${id}/finish`, json('POST')));
