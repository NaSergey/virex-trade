'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/shared/lib/utils/css';

/**
 * Строка плана дня — крупная ссылка на весь ряд (под палец). Справа — ✓, когда
 * цель дня выполнена, иначе стрелка. У строки без цели (ошибки) отметки нет.
 */
export function PlanRow({
  href,
  title,
  status,
  done,
}: {
  href: string;
  title: string;
  status: string;
  done?: boolean;
}) {
  return (
    <li>
      <Link href={href} className={cn('en-plan-row', done && 'is-done')}>
        <span className="en-plan-text">
          <span className="en-plan-title">{title}</span>
          <span className="en-plan-status muted">{status}</span>
        </span>
        {done ? (
          <span className="en-plan-mark pos" role="img" aria-label="сделано">
            ✓
          </span>
        ) : (
          <ChevronRight className="en-plan-go" size={18} aria-hidden />
        )}
      </Link>
    </li>
  );
}
