'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { closeGamesSocket, openGamesSocket } from '@/shared/api/games-socket';

/**
 * Живой стол: сокет приносит новый вид после каждого хода и кладёт его в тот
 * же кэш, что и первый REST-снимок, — страница о сокете не знает. Имя события
 * и ключ кэша у каждой игры свои (`poker_state`, `blackjack_state`); `viewKey`
 * — функция модуля, а не массив, чтобы эффект не переподключался на каждом
 * рендере. Рукопожатие и его грабли — `openGamesSocket`.
 */
export function useTableSocket(tableId: string, event: string, viewKey: (id: string) => readonly unknown[]) {
  const qc = useQueryClient();

  useEffect(() => {
    const socket = openGamesSocket(tableId, () => void qc.invalidateQueries({ queryKey: viewKey(tableId) }));
    socket.on(event, (view: { table?: { id?: string } }) => {
      if (view?.table?.id === tableId) qc.setQueryData(viewKey(tableId), view);
    });
    return () => closeGamesSocket(socket, tableId);
  }, [qc, tableId, event, viewKey]);
}
