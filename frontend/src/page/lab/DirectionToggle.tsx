'use client';

import { cn } from '@/shared/lib/utils/css';
import type { LabFacetValue, LabFilters } from '@/shared/api/lab/hooks';
import { DIR_LABELS } from './constants';

const DIRECTIONS = ['long', 'short'] as const;

/**
 * Long/Short с винрейтом прямо на кнопке. Активная сторона подсвечивается
 * up/down по знаку totalPnl этого направления (тот же язык цвета, что у P&L
 * по всему приложению) — то есть не просто «светлее», а осмысленно
 * зелёная/красная. Рендерится внутри общего бара с «Сбросить» (см.
 * LabFilterPanel) — это один блок контролов, а не два случайных соседа.
 */
export function DirectionToggle({
  value,
  statsOf,
  onToggle,
}: {
  value: LabFilters['direction'];
  statsOf: (direction: string) => LabFacetValue | undefined;
  onToggle: (direction: 'long' | 'short') => void;
}) {
  return (
    <>
      {DIRECTIONS.map((d) => {
        const s = statsOf(d);
        const hasStats = !!s && s.trades > 0;
        const tone = hasStats ? (s.totalPnl > 0 ? 'up' : s.totalPnl < 0 ? 'down' : null) : null;
        return (
          <button
            key={d}
            onClick={() => onToggle(d)}
            title={
              hasStats
                ? `Винрейт ${DIR_LABELS[d]}: ${s.winRate.toFixed(0)}% (${s.wins}W/${s.losses}L из ${s.trades})`
                : `Винрейт ${DIR_LABELS[d]}: нет сделок под текущие фильтры`
            }
            className={cn(
              'cursor-pointer rounded px-2.5 py-1 font-medium transition-colors',
              value !== d
                ? 'text-muted hover:text-fg'
                : tone === 'up'
                  ? 'bg-up/20 text-up'
                  : tone === 'down'
                    ? 'bg-down/20 text-down'
                    : 'bg-elevated-2 text-fg',
            )}
          >
            {DIR_LABELS[d]}
            {hasStats && <span className="ml-1.5 font-mono text-[11px]">{s.winRate.toFixed(0)}%</span>}
          </button>
        );
      })}
    </>
  );
}
