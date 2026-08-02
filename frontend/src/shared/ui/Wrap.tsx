'use client';

import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/shared/lib/utils/css';

/**
 * Наборная полоса листа: одна ширина (--wrap) и одни поля на все страницы.
 * Кривая P&L из неё сознательно выходит в край вьюпорта (см. .bleed) — это
 * единственный контролируемый выход за сетку во всём продукте.
 */
export function Wrap({
  children,
  /** Полоса заканчивает страницу — снизу остаётся поле (.wrap.page). */
  page,
  className,
  style,
}: {
  children: ReactNode;
  page?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={cn('wrap', page && 'page', className)} style={style}>
      {children}
    </div>
  );
}
