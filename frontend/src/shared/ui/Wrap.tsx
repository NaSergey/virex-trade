'use client';

import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/utils/css';

/**
 * Наборная полоса листа: одна ширина (--wrap) и одни поля на все страницы.
 * Кривая P&L из неё сознательно выходит в край вьюпорта (см. .bleed) — это
 * единственный контролируемый выход за сетку во всём продукте.
 */
export function Wrap({ children, className, style }: { children: ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={cn('wrap', className)} style={style}>
      {children}
    </div>
  );
}
