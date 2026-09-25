'use client';

import { io, type Socket } from 'socket.io-client';
import { refreshAccessToken } from '@/shared/api/http';
import { API_BASE_URL } from '@/shared/config/api';
import { tokenStore } from '@/shared/lib/tokenStore';

/**
 * Канал игр `/games` — столы карточных игр и джетпак. Одно место, где живут
 * три грабли рукопожатия, чтобы их не повторяли копией:
 *
 * - путь `/api/games/socket.io` обязан совпадать с серверным: наружу
 *   проксируется только `/api/*`;
 * - без завершающего слэша: Next в dev редиректит адрес со слэшем, и
 *   рукопожатие терялось (сервер настроен так же, `GamesGateway`);
 * - токен берётся функцией при каждой попытке — живёт он 15 минут. Отказ
 *   сервер отдаёт из middleware (`connect_error`), автопереподключения после
 *   него нет, поэтому токен обновляется и связь поднимается руками.
 *
 * `onConnect` зовётся на каждое (пере)подключение: это новый сокет на
 * сервере, и подписку на комнату и свежий снимок надо брать заново — иначе
 * пропущенное за время обрыва потеряется.
 */
export function openGamesSocket(room: string, onConnect: () => void): Socket {
  const socket = io(`${API_BASE_URL}/games`, {
    path: '/api/games/socket.io',
    addTrailingSlash: false,
    auth: (cb) => cb({ token: tokenStore.get() }),
    withCredentials: true,
  });
  let retried = false;

  socket.on('connect', () => {
    retried = false;
    socket.emit('join_table', room);
    onConnect();
  });
  socket.on('connect_error', async (err) => {
    if (err.message !== 'unauthorized' || retried) return;
    retried = true;
    if (await refreshAccessToken()) socket.connect();
  });
  return socket;
}

export function closeGamesSocket(socket: Socket, room: string) {
  socket.emit('leave_table', room);
  socket.disconnect();
}
