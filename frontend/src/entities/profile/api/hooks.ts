'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiJson } from '@/shared/api/http';
import type { ProfileOverview } from './types';

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
