'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiJson } from '@/shared/api/http';
import type { ProfileOverview, ProfilePositions, ProfileTrades } from './types';

/**
 * Ключ строкой, а не импортом в чужие сущности: его сбрасывает и выдача
 * наград Battle Pass (лента и баланс меняются от неё), а сущности друг друга
 * не импортируют. Сброс по префиксу `['profile']` задевает и свой, и чужие.
 */
export const profileKey = ['profile'] as const;

/**
 * Дашборд профиля по id — и свой, и чужой: свой профиль живёт по тому же
 * адресу `/profile/<id>`, что видят другие, и ответ у них один. Без опроса:
 * всё на нём — итоги игр, которые человек доиграл не на этой странице; заход
 * на страницу и есть момент перечитать.
 *
 * `enabled` — потому что профиль требует входа (решение владельца 2026-10-02), а
 * гость доходит до этой страницы: без выключателя он получал бы заведомый 401,
 * а сброс кэша по нему перезапускал бы запрос по кругу.
 */
export const useProfile = (userId: string, enabled = true) =>
  useQuery({
    queryKey: [...profileKey, userId],
    queryFn: () => apiJson<ProfileOverview>(`/api/profile/${encodeURIComponent(userId)}`),
    enabled: enabled && userId.length > 0,
    retry: false,
  });

/**
 * Его настоящие сделки с биржи — вкладка «Сделки на бирже» на профиле.
 *
 * `pageSize` — сколько строк влезает в окно: профиль стоит в экран без
 * прокрутки, и лист режется под него (сервер держит 1…20). `enabled` держит
 * вызывающий: вкладка заказывает лист только когда открыта, и профиль, у
 * которого сделок нет, за ними не ходит вовсе. `retry: false` — у скрытого
 * показа ответ 403, и повторять его незачем.
 */
export const useProfileTrades = (userId: string, page: number, pageSize: number, enabled: boolean) =>
  useQuery({
    queryKey: [...profileKey, userId, 'trades', pageSize, page],
    queryFn: () =>
      apiJson<ProfileTrades>(
        `/api/profile/${encodeURIComponent(userId)}/trades?page=${page}&pageSize=${pageSize}`,
      ),
    enabled,
    retry: false,
    // Пока едет следующий лист, стоит прежний: иначе листалка на миг писала бы
    // «0—0 из 0», а таблица мигала заглушкой.
    placeholderData: keepPreviousData,
  });

/**
 * Его открытые позиции — снимок синка, который обновляется раз в минуту,
 * поэтому и опрос раз в минуту, и только пока вкладка открыта (`enabled`).
 */
export const useProfilePositions = (userId: string, enabled: boolean) =>
  useQuery({
    queryKey: [...profileKey, userId, 'positions'],
    queryFn: () => apiJson<ProfilePositions>(`/api/profile/${encodeURIComponent(userId)}/positions`),
    enabled,
    retry: false,
    refetchInterval: 60_000,
  });

/**
 * Видят ли другие мои сделки — выключатель на странице настроек.
 *
 * Ключ лежит вне `['profile']`, а не внутри: это настройка смотрящего, а не
 * данные чьего-то профиля, и сброс профилей по префиксу не должен тащить её за
 * собой — переключение само кладёт свежий ответ в кэш. Профили при этом
 * сбрасываются: от флага зависит, есть ли на них вкладка «Биржа».
 */
export const privacyKey = ['profile-privacy'] as const;

export const usePrivacy = () =>
  useQuery({
    queryKey: privacyKey,
    queryFn: () => apiJson<{ showTrades: boolean }>('/api/profile/privacy'),
  });

export function useSetPrivacy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (showTrades: boolean) =>
      apiJson<{ showTrades: boolean }>('/api/profile/privacy', {
        method: 'PATCH',
        body: JSON.stringify({ showTrades }),
      }),
    onSuccess: (data) => {
      qc.setQueryData(privacyKey, data);
      void qc.invalidateQueries({ queryKey: profileKey });
    },
  });
}

/**
 * Новое имя из настроек профиля. Профили перечитываются (имя стоит на карточке),
 * а шапку обновляет вызывающий через `useAuth().setName` — сущность о сессии не
 * знает.
 */
export function useSetName() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      apiJson<{ name: string }>('/api/profile/name', { method: 'PATCH', body: JSON.stringify({ name }) }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: profileKey }),
  });
}

/**
 * Поставить или снять картинку профиля. Ответ — новый адрес картинки; его
 * берёт шапка (через `onSuccess` вызывающего), а профиль перечитывается.
 */
export function useAvatar() {
  const qc = useQueryClient();
  const done = () => void qc.invalidateQueries({ queryKey: profileKey });
  const upload = useMutation({
    mutationFn: (file: Blob) => {
      const body = new FormData();
      body.append('file', file, 'avatar.webp');
      return apiJson<{ avatar: string | null }>('/api/profile/avatar', { method: 'PUT', body });
    },
    onSuccess: done,
  });
  const remove = useMutation({
    mutationFn: () => apiJson<{ avatar: null }>('/api/profile/avatar', { method: 'DELETE' }),
    onSuccess: done,
  });
  return { upload, remove };
}
