'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiJson } from '@/shared/api/http';
import type { SavedComboBucket, TagComboBucket, TagComboStatsResponse } from './types';

/**
 * Комбинации тегов: те, что система вывела сама, и те, что пользователь
 * закрепил. Держатся отдельно от самих тегов — у них свой кеш
 * (`tagComboStats`), свой набор действий и своя оптимистика.
 */

const comboKey = (tagIds: string[]) => (tagIds.length > 0 ? [...tagIds].sort().join('|') : '__untagged__');

export const useTagComboStats = (days: number) =>
  useQuery({
    queryKey: ['tagComboStats', days],
    queryFn: () => apiJson<TagComboStatsResponse>(`/api/trades/stats-by-tag-combo?days=${days}`),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

/**
 * Pin a combination card in «Мои комбинации» (2+ tags). Pass the source
 * bucket as `optimistic` and the pinned card appears instantly; the refetch
 * then replaces its exact-set numbers with the contains-all ones.
 */
export const useCreateSavedCombo = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { tagIds: string[]; optimistic?: TagComboBucket }) =>
      apiJson('/api/tags/combos', {
        method: 'POST',
        body: JSON.stringify({ tagIds: input.tagIds }),
      }),
    onMutate: (input) => {
      if (!input.optimistic) return;
      void qc.cancelQueries({ queryKey: ['tagComboStats'] });
      const pending: SavedComboBucket = {
        ...input.optimistic,
        id: `pending-${[...input.tagIds].sort().join('|')}`,
        pinned: true,
      };
      qc.setQueriesData<TagComboStatsResponse>({ queryKey: ['tagComboStats'] }, (old) =>
        old ? { ...old, saved: [...old.saved, pending] } : old,
      );
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ['tagComboStats'] }),
  });
};

/**
 * Explicit, deliberate delete — as opposed to unpinning (useUpdateSavedCombo
 * with {pinned: false}), which keeps the card. Optimistically drops the card,
 * refetch reconciles (or restores on error).
 */
export const useDeleteSavedCombo = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiJson(`/api/tags/combos/${id}`, { method: 'DELETE' }),
    onMutate: (id) => {
      void qc.cancelQueries({ queryKey: ['tagComboStats'] });
      qc.setQueriesData<TagComboStatsResponse>({ queryKey: ['tagComboStats'] }, (old) =>
        old ? { ...old, saved: old.saved.filter((s) => s.id !== id) } : old,
      );
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ['tagComboStats'] }),
  });
};

/**
 * Toggle pin state and/or edit the tag set of an existing saved combo —
 * never deletes it. Pin-toggle updates optimistically (instant feedback);
 * tag-set edits wait for the real response since names/colors/stats need
 * recomputing server-side anyway.
 */
export const useUpdateSavedCombo = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; tagIds?: string[]; pinned?: boolean }) =>
      apiJson(`/api/tags/combos/${input.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ tagIds: input.tagIds, pinned: input.pinned }),
      }),
    onMutate: (input) => {
      void qc.cancelQueries({ queryKey: ['tagComboStats'] });
      if (input.pinned === undefined) return;
      qc.setQueriesData<TagComboStatsResponse>({ queryKey: ['tagComboStats'] }, (old) =>
        old
          ? { ...old, saved: old.saved.map((s) => (s.id === input.id ? { ...s, pinned: input.pinned! } : s)) }
          : old,
      );
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ['tagComboStats'] }),
  });
};

/**
 * Hide an auto-derived combo card from the grid going forward (server-side,
 * so it stays hidden across sessions) — as opposed to pinning, which is the
 * opposite direction (promote a combo into «Мои комбинации»).
 */
export const useDismissCombo = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tagIds: string[]) =>
      apiJson('/api/tags/combos/dismiss', {
        method: 'POST',
        body: JSON.stringify({ tagIds }),
      }),
    onMutate: (tagIds) => {
      void qc.cancelQueries({ queryKey: ['tagComboStats'] });
      const key = comboKey(tagIds);
      qc.setQueriesData<TagComboStatsResponse>({ queryKey: ['tagComboStats'] }, (old) =>
        old ? { ...old, combos: old.combos.filter((c) => comboKey(c.tagIds) !== key) } : old,
      );
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ['tagComboStats'] }),
  });
};
