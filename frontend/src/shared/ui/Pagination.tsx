'use client';

import { memo } from 'react';
import { cn } from '@/shared/lib/utils/css';

export interface PaginationProps {
  page: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
  /** Matches the surrounding surface so the hover state doesn't clash. */
  hoverBg?: 'elevated' | 'app';
  className?: string;
}

export const Pagination = memo(
  ({ page, totalPages, onPrev, onNext, hoverBg = 'elevated', className }: PaginationProps) => {
    const btnCls = cn(
      'cursor-pointer rounded border border-line px-2.5 py-1 text-fg transition-colors disabled:cursor-default disabled:opacity-40',
      hoverBg === 'elevated' ? 'hover:bg-elevated' : 'hover:bg-app',
    );

    return (
      <div className={cn('flex items-center justify-end gap-2 text-xs', className)}>
        <button onClick={onPrev} disabled={page <= 1} className={btnCls}>
          ← Назад
        </button>
        <span className="text-muted">
          Стр. {page} из {totalPages}
        </span>
        <button onClick={onNext} disabled={page >= totalPages} className={btnCls}>
          Вперёд →
        </button>
      </div>
    );
  },
);

Pagination.displayName = 'Pagination';
