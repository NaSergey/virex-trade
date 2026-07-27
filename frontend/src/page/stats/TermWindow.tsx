'use client';

import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/utils/css';

/**
 * Обёртка «окна терминала» — общий мотив страницы статистики.
 */
export function TermWindow({
  accent,
  tight,
  children,
}: {
  accent?: boolean;
  tight?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={cn('term-window', accent && 'accent')}>
      <div className={tight ? '' : 'p-3.5'}>{children}</div>
    </div>
  );
}
