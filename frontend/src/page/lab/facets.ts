'use client';

import { useMemo, useState } from 'react';
import type { LabFacetValue, LabResponse } from '@/shared/api/lab/hooks';

/** Пустой срез: чип без единой сделки всё равно показывает «0 · PF — · —». */
export const EMPTY_FACET = (key: string): LabFacetValue => ({
  key,
  trades: 0,
  wins: 0,
  losses: 0,
  totalPnl: 0,
  winRate: 0,
  profitFactor: 0,
  avgPnl: 0,
  wilsonLow: 0,
});

/**
 * Плоский список фасетов с сервера → быстрый доступ «измерение + значение →
 * статистика этого среза при остальных активных фильтрах».
 * @param data - ответ /api/trades/lab
 * @returns fv(dimension, key) — статистика среза либо undefined
 */
export function useFacetLookup(data?: LabResponse) {
  const byDimension = useMemo(() => {
    const m = new Map<string, Map<string, LabFacetValue>>();
    for (const f of data?.facets ?? []) m.set(f.dimension, new Map(f.values.map((v) => [v.key, v])));
    return m;
  }, [data]);

  return (dimension: string, key: string) => byDimension.get(dimension)?.get(key);
}

/**
 * Фасет «символ» (в отличие от тегов/направления/дней) сервер считает только
 * по символам, у которых есть сделки при ОСТАЛЬНЫХ активных фильтрах — то
 * есть список символов то растёт, то схлопывается при каждом клике, и ряд
 * чипов дёргается. Копим все увиденные за сессию символы, чтобы группа только
 * росла: у символа без совпадений просто обнулится статистика.
 * @param facetKeys - символы из текущего ответа
 * @param selected - выбранные символы (не должны пропадать никогда)
 */
export function useStickySymbols(facetKeys: string[], selected: string[]): string[] {
  const [seen, setSeen] = useState<Set<string>>(new Set());
  if (facetKeys.some((k) => !seen.has(k))) setSeen(new Set([...seen, ...facetKeys]));
  return [...new Set([...seen, ...selected])];
}
