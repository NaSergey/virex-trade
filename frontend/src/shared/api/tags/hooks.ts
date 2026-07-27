'use client';

import { useMemo } from 'react';
import { keepPreviousData, useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/shared/api/http';
import { useOpenPositions } from '@/shared/api/bybit/hooks';

// Journal categories: setups (entry reasons) vs emotions/mistakes — the stats
// page groups tags by these so "what wins" and "what my mistakes cost" read
// separately.
export const TAG_TYPES = ['setup', 'emotion', 'mistake'] as const;
export type TagType = (typeof TAG_TYPES)[number];
export const TAG_TYPE_LABELS: Record<TagType, string> = {
  setup: 'Сетап',
  emotion: 'Эмоция',
  mistake: 'Ошибка',
};

export interface TagItem {
  id: string;
  name: string;
  color: string;
  type?: TagType;
  createdAt?: string;
  tradesCount?: number;
}

/** Long-only / short-only slice of a tag bucket. */
export interface TagSideAgg {
  trades: number;
  wins: number;
  losses: number;
  totalPnl: number;
  winRate: number; // 0..100
}

export interface TagBucket {
  id: string | null;
  name: string;
  color: string;
  type: TagType | null; // null for the untagged bucket
  trades: number;
  wins: number;
  losses: number;
  totalPnl: number;
  grossProfit: number;
  grossLoss: number;
  avgPnl: number;
  avgWin: number;
  avgLoss: number; // ≤ 0
  profitFactor: number; // 0 when the tag has no losses yet
  winRate: number; // 0..100
  wilsonLow: number; // 0..100, 95% lower confidence bound on winrate
  long: TagSideAgg;
  short: TagSideAgg;
  equity: Array<{ time: number; value: number }>; // cumulative PnL sparkline
}

export interface TagStatsResponse {
  success: boolean;
  totalTrades: number;
  tags: TagBucket[];
  untagged: TagBucket;
}

export interface TagComboBucket {
  tagIds: string[];
  tagNames: string[];
  colors: string[];
  trades: number;
  wins: number;
  losses: number;
  totalPnl: number;
  avgPnl: number;
  winRate: number; // 0..100
  wilsonLow: number; // 0..100
}

/** User-composed pinned combo: counts trades CONTAINING all its tags. */
export interface SavedComboBucket extends TagComboBucket {
  id: string;
  pinned: boolean;
}

export interface TagComboStatsResponse {
  success: boolean;
  totalTrades: number;
  combos: TagComboBucket[];
  saved: SavedComboBucket[];
}

async function requestJson<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await apiFetch(path, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    throw new Error(data.message || data.error || `HTTP error! status: ${res.status}`);
  }
  return data as T;
}

export const useTags = () =>
  useQuery({
    queryKey: ['tags'],
    queryFn: () => requestJson<{ success: boolean; tags: TagItem[] }>('/api/tags'),
    staleTime: 60_000,
  });

// Every mutation that changes the tag graph invalidates the same family of
// caches — stats, combos, trade lists and the tag list itself.
const invalidateTagCaches = (qc: ReturnType<typeof useQueryClient>) => {
  void qc.invalidateQueries({ queryKey: ['tags'] });
  void qc.invalidateQueries({ queryKey: ['tagStats'] });
  void qc.invalidateQueries({ queryKey: ['tagComboStats'] });
  void qc.invalidateQueries({ queryKey: ['trades'] });
  void qc.invalidateQueries({ queryKey: ['tradeStats'] });
  void qc.invalidateQueries({ queryKey: ['positionTags'] });
};

// Color is assigned by the server (see TagsService.pickColor) — the caller
// only names the tag, keeping color choice out of the user's hands entirely.
export const useCreateTag = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; type?: TagType }) =>
      requestJson<{ success: boolean; tag: TagItem }>('/api/tags', {
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
      requestJson<{ success: boolean; tag: TagItem }>(`/api/tags/${input.id}`, {
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
      requestJson<{ success: boolean; tag: TagItem }>(`/api/tags/${input.sourceId}/merge`, {
        method: 'POST',
        body: JSON.stringify({ intoTagId: input.intoTagId }),
      }),
    onSuccess: () => invalidateTagCaches(qc),
  });
};

export const useDeleteTag = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => requestJson(`/api/tags/${id}`, { method: 'DELETE' }),
    onSuccess: () => invalidateTagCaches(qc),
  });
};

/**
 * Pin a combination card in «Мои комбинации» (2+ tags). Pass the source
 * bucket as `optimistic` and the pinned card appears instantly; the refetch
 * then replaces its exact-set numbers with the contains-all ones.
 */
export const useCreateSavedCombo = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { tagIds: string[]; optimistic?: TagComboBucket }) =>
      requestJson('/api/tags/combos', {
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
    mutationFn: (id: string) => requestJson(`/api/tags/combos/${id}`, { method: 'DELETE' }),
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
      requestJson(`/api/tags/combos/${input.id}`, {
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

const comboKey = (tagIds: string[]) => (tagIds.length > 0 ? [...tagIds].sort().join('|') : '__untagged__');

/**
 * Hide an auto-derived combo card from the grid going forward (server-side,
 * so it stays hidden across sessions) — as opposed to pinning, which is the
 * opposite direction (promote a combo into «Мои комбинации»).
 */
export const useDismissCombo = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tagIds: string[]) =>
      requestJson('/api/tags/combos/dismiss', {
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

// `openedAt` — когда наш sync-цикл впервые увидел эту позицию открытой
// (Bybit createdTime для этого не годится, см. OpenPositionSeen).
export const fetchPositionTags = (symbol: string, direction: 'long' | 'short') =>
  requestJson<{ success: boolean; openedAt: string | null; tags: TagItem[] }>(
    `/api/tags/position?symbol=${encodeURIComponent(symbol)}&direction=${direction}`,
  );

export const usePositionTags = (symbol: string, direction: 'long' | 'short', enabled = true) =>
  useQuery({
    queryKey: ['positionTags', symbol, direction],
    queryFn: () => fetchPositionTags(symbol, direction),
    enabled: enabled && !!symbol,
  });

// Open positions that already carry tags: their winrate isn't known yet
// (still open), so surface them separately instead of silently omitting.
export const useOpenPositionTags = () => {
  const { data: openPosData } = useOpenPositions();
  const openPositions = useMemo(
    () => (openPosData?.positions ?? []).filter((p) => parseFloat(p.size) > 0),
    [openPosData],
  );
  const pendingQueries = useQueries({
    queries: openPositions.map((p) => {
      const direction: 'long' | 'short' = p.side === 'Buy' ? 'long' : 'short';
      return {
        queryKey: ['positionTags', p.symbol, direction] as const,
        queryFn: () => fetchPositionTags(p.symbol, direction),
        staleTime: 15_000,
      };
    }),
  });
  const pendingTagged = openPositions
    .map((p, i) => ({ position: p, tags: pendingQueries[i]?.data?.tags ?? [] }))
    .filter((x) => x.tags.length > 0);
  return { pendingTagged };
};

export const useSetPositionTags = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { symbol: string; direction: 'long' | 'short'; tagIds: string[] }) =>
      requestJson('/api/tags/position', { method: 'PUT', body: JSON.stringify(input) }),
    onSuccess: (_d, vars) =>
      void qc.invalidateQueries({ queryKey: ['positionTags', vars.symbol, vars.direction] }),
  });
};

// Replace the tag set of a single closed trade — used from the trade history
// view, as opposed to useSetPositionTags which tags the still-open position.
export const useSetTradeTags = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { tradeId: string; tagIds: string[] }) =>
      requestJson(`/api/tags/trade/${input.tradeId}`, {
        method: 'PUT',
        body: JSON.stringify({ tagIds: input.tagIds }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['trades'] });
      void qc.invalidateQueries({ queryKey: ['tagStats'] });
      void qc.invalidateQueries({ queryKey: ['tagComboStats'] });
      void qc.invalidateQueries({ queryKey: ['tags'] });
    },
  });
};

// keepPreviousData: switching the period keeps showing the old buckets while
// the new ones load, instead of flashing the empty state.
export const useTagStats = (days: number) =>
  useQuery({
    queryKey: ['tagStats', days],
    queryFn: () => requestJson<TagStatsResponse>(`/api/trades/stats-by-tag?days=${days}`),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

export const useTagComboStats = (days: number) =>
  useQuery({
    queryKey: ['tagComboStats', days],
    queryFn: () => requestJson<TagComboStatsResponse>(`/api/trades/stats-by-tag-combo?days=${days}`),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
