'use client';

import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { closeGamesSocket, openGamesSocket } from '@/shared/api/games-socket';
import { apiJson } from '@/shared/api/http';
import type { JetpackView, JetpackWire } from './types';

export const jetpackKey = ['jetpack'] as const;
const ROOM = 'jetpack';

export const stamp = (view: JetpackWire, now = Date.now()): JetpackView => ({ ...view, offset: view.serverNow - now });

/**
 * Снимки приходят двумя путями — сокетом и ответами REST, — и более старый
 * может доехать позже нового. Решают серверные часы снимка.
 */
export const newer = (old: JetpackView | undefined, next: JetpackView) =>
  old && old.serverNow > next.serverNow ? old : next;

const put = (qc: QueryClient, view: JetpackWire) =>
  qc.setQueryData<JetpackView>(jetpackKey, (old) => newer(old, stamp(view)));

/** Первый снимок — REST, дальше его подменяет сокет. Страница ничего не опрашивает. */
export const useJetpack = () =>
  useQuery({
    queryKey: jetpackKey,
    queryFn: async () => stamp(await apiJson<JetpackWire>('/api/jetpack')),
  });

/**
 * Ставка и вывод отвечают свежим видом — он кладётся в кэш сразу: без этого
 * между ответом и рассылкой кнопка на миг снова звала бы «Поставить».
 */
export const useJetpackBet = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { amount: number; autoCashout?: number }) =>
      apiJson<JetpackWire>('/api/jetpack/bet', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: (view) => put(qc, view),
    onSettled: () => void qc.invalidateQueries({ queryKey: ['coins'] }),
  });
};

export const useJetpackCashout = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiJson<JetpackWire>('/api/jetpack/cashout', { method: 'POST' }),
    onSuccess: (view) => put(qc, view),
    onSettled: () => void qc.invalidateQueries({ queryKey: ['coins'] }),
  });
};

/**
 * Живой раунд: комната `jetpack` канала игр. На каждое (пере)подключение —
 * свежий REST-снимок: за время обрыва раунд мог смениться. Он же будит цикл
 * на сервере, если тот спал.
 */
export function useJetpackSocket() {
  const qc = useQueryClient();
  useEffect(() => {
    const socket = openGamesSocket(ROOM, () => void qc.invalidateQueries({ queryKey: jetpackKey }));
    socket.on('jetpack_state', (view: JetpackWire) => put(qc, view));
    return () => closeGamesSocket(socket, ROOM);
  }, [qc]);
}
