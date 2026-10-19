'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { Socket } from 'socket.io-client';
import { closeGamesSocket, openGamesSocket } from '@/shared/api/games-socket';
import { apiJson } from '@/shared/api/http';
import type { LiveStore } from '../model/live';
import type { CarId, Input } from '../model/sim';
import type { RaceView, RaceWire } from './types';

export const raceKey = ['race'] as const;

export const stamp = (w: RaceWire, now = Date.now()): RaceView => ({ ...w, offset: w.serverNow - now });

const newer = (old: RaceView | undefined, next: RaceView) => (old && old.serverNow > next.serverNow ? old : next);

/** Что меняет разметку страницы: фаза, состав, итог. Положения машин — нет. */
const shape = (v: RaceView | undefined) =>
  v ? JSON.stringify([v.phase, v.race?.id, v.race?.racers, v.race?.result, v.race?.startAt]) : '';

const put = (qc: QueryClient, w: RaceWire) => qc.setQueryData<RaceView>(raceKey, (old) => newer(old, stamp(w)));

/** Своя гонка (лобби, идущая, итог) или её отсутствие. Дальше вид несёт сокет. */
export const useRace = () =>
  useQuery({
    queryKey: raceKey,
    queryFn: async () => stamp(await apiJson<RaceWire>('/api/games/race')),
  });

export const useRaceJoin = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { stake: number; car: CarId }) =>
      apiJson<RaceWire>('/api/games/race/join', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: (w) => put(qc, w),
    onSettled: () => void qc.invalidateQueries({ queryKey: ['coins'] }),
  });
};

export const useRaceLeave = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiJson<RaceWire>('/api/games/race/leave', { method: 'POST' }),
    onSuccess: (w) => put(qc, w),
    onSettled: () => void qc.invalidateQueries({ queryKey: ['coins'] }),
  });
};

/**
 * Сокет гонки: комната `race:<id>`. Каждый снимок — в `store` (его читает
 * сцена), в кэш — только смена разметки. На (пере)подключение — свежий REST.
 * Возвращает отправку нажатий: `t` — время гонки, когда нажали.
 */
export function useRaceSocket(raceId: string | null, store: LiveStore) {
  const qc = useQueryClient();
  const sock = useRef<Socket | null>(null);
  useEffect(() => {
    if (!raceId) return;
    const room = `race:${raceId}`;
    const socket = openGamesSocket(room, () => void qc.invalidateQueries({ queryKey: raceKey }));
    socket.on('race_state', (w: RaceWire) => {
      const v = stamp(w);
      store.push(v);
      const old = qc.getQueryData<RaceView>(raceKey);
      if (shape(old) !== shape(v)) qc.setQueryData<RaceView>(raceKey, (o) => newer(o, v));
      // После итога сервер шлёт снимок один раз — по нему и перечитать монеты.
      if (v.phase === 'over') void qc.invalidateQueries({ queryKey: ['coins'] });
    });
    sock.current = socket;
    return () => {
      sock.current = null;
      closeGamesSocket(socket, room);
    };
  }, [raceId, qc, store]);

  return useCallback(
    (t: number, input: Input) => {
      // volatile: при обрыве нажатие не копится в буфере сокета — пачка старых
      // нажатий после переподключения легла бы на гонку задним числом.
      sock.current?.volatile.emit('race_input', { raceId, t, l: input.left, r: input.right, b: input.brake });
    },
    [raceId],
  );
}
