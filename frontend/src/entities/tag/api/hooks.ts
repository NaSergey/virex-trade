'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiJson } from '@/shared/api/http';
import { invalidateTagCaches } from './cache';
import type { TagItem, TagStatsResponse, TagType } from './types';

/**
 * Сами теги: список, CRUD и статистика по каждому.
 *
 * Комбинации тегов и навешивание тегов на позиции/сделки живут в соседних
 * файлах (`combo-hooks`, `tagging-hooks`) — у них свои кеши и свой набор
 * действий, и здесь они только запутывали бы, чем именно правит очередной хук.
 */

export const useTags = () =>
  useQuery({
    queryKey: ['tags'],
    queryFn: () => apiJson<{ success: boolean; tags: TagItem[] }>('/api/tags'),
    staleTime: 60_000,
  });

// Color is assigned by the server (see TagsService.pickColor) — the caller
// only names the tag, keeping color choice out of the user's hands entirely.
export const useCreateTag = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; type?: TagType }) =>
      apiJson<{ success: boolean; tag: TagItem }>('/api/tags', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['tags'] }),
  });
};

/** Rename / re-categorize a tag. Links stay put, stats keep working. */
export const useUpdateTag = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; name?: string; type?: TagType }) =>
      apiJson<{ success: boolean; tag: TagItem }>(`/api/tags/${input.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: input.name, type: input.type }),
      }),
    onSuccess: () => invalidateTagCaches(qc),
  });
};

/** Merge one tag into another (links move, source tag is deleted). */
export const useMergeTag = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { sourceId: string; intoTagId: string }) =>
      apiJson<{ success: boolean; tag: TagItem }>(`/api/tags/${input.sourceId}/merge`, {
        method: 'POST',
        body: JSON.stringify({ intoTagId: input.intoTagId }),
      }),
    onSuccess: () => invalidateTagCaches(qc),
  });
};

export const useDeleteTag = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiJson(`/api/tags/${id}`, { method: 'DELETE' }),
    onSuccess: () => invalidateTagCaches(qc),
  });
};

// keepPreviousData: switching the period keeps showing the old buckets while
// the new ones load, instead of flashing the empty state.
export const useTagStats = (days: number) =>
  useQuery({
    queryKey: ['tagStats', days],
    queryFn: () => apiJson<TagStatsResponse>(`/api/trades/stats-by-tag?days=${days}`),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
