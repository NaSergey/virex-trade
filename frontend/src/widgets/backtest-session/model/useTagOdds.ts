'use client';

import { useMemo } from 'react';
import { tagOddsOf, useTagStats, type TagOdds } from '@/entities/tag';
import { useBacktestStats } from '../api/hooks';
import type { StatsSource } from '../api/types';

export type TagOddsSource = 'journal' | StatsSource;

/**
 * Статистика тегов для окна разметки терминала (спека 2026-10-25): журнал за всё
 * время — у биржевого терминала, статистика бектеста по источнику — у сессий.
 * Выключено — запросов нет и чисел нет.
 */
export function useTagOdds(source: TagOddsSource, enabled: boolean): Record<string, TagOdds> | undefined {
  const journal = useTagStats(0, enabled && source === 'journal');
  const backtest = useBacktestStats(source === 'journal' ? 'real' : source, enabled && source !== 'journal');
  return useMemo(() => {
    if (!enabled) return undefined;
    const out: Record<string, TagOdds> = {};
    if (source === 'journal') {
      if (!journal.data) return undefined;
      for (const b of journal.data.tags) {
        const o = b.id ? tagOddsOf({ trades: b.trades, wins: b.wins, avgWin: b.avgWin, avgLoss: b.avgLoss }) : null;
        if (b.id && o) out[b.id] = o;
      }
      return out;
    }
    if (!backtest.data) return undefined;
    for (const r of backtest.data.byTag) {
      const o = tagOddsOf({ trades: r.trades, wins: r.wins, avgWin: r.avgWinR, avgLoss: r.avgLossR });
      if (o) out[r.tag.id] = o;
    }
    return out;
  }, [enabled, source, journal.data, backtest.data]);
}
