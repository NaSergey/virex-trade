'use client';

import { memo } from 'react';
import { cn } from '@/shared/lib/utils/css';

interface WinLossCountProps {
  wins: number;
  losses: number;
  className?: string;
}

/** «5[W]/1[L]» — победы/убытки как маленькие цветные значки-буквы, компактно
 * (это всегда стоит бок о бок с ещё как минимум одним таким же значением —
 * Long/Short на одной строке — так что лишний пиксель тут дорог). */
export const WinLossCount = memo(({ wins, losses, className }: WinLossCountProps) => (
  <span className={cn('inline-flex items-center gap-0.5', className)}>
    {wins}
    <span className="inline-flex h-3 w-3 items-center justify-center rounded-full bg-up/20 text-[8px] font-bold leading-none text-up">
      W
    </span>
    <span className="text-subtle">/</span>
    {losses}
    <span className="inline-flex h-3 w-3 items-center justify-center rounded-full bg-down/20 text-[8px] font-bold leading-none text-down">
      L
    </span>
  </span>
));
WinLossCount.displayName = 'WinLossCount';
