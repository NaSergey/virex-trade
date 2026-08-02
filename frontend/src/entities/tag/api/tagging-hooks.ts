'use client';

import { useMemo } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiJson } from '@/shared/api/http';
import { useOpenPositions } from '@/entities/position';
import type { TagItem } from './types';

/**
 * Навешивание тегов на то, что размечают: на открытую позицию и на закрытую
 * сделку. Отдельно от CRUD самих тегов — здесь тег уже существует, вопрос
 * только в том, к чему он привязан.
 */

// `openedAt` — когда наш sync-цикл впервые увидел эту позицию открытой
// (Bybit createdTime для этого не годится, см. OpenPositionSeen).
export const fetchPositionTags = (symbol: string, direction: 'long' | 'short') =>
  apiJson<{ success: boolean; openedAt: string | null; tags: TagItem[] }>(
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
      apiJson('/api/tags/position', { method: 'PUT', body: JSON.stringify(input) }),
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
      apiJson(`/api/tags/trade/${input.tradeId}`, {
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
