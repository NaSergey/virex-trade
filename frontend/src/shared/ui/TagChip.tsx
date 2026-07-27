'use client';

import { memo } from 'react';
import { cn } from '@/shared/lib/utils/css';

/**
 * The colored tag pill used everywhere a tag is displayed read-only
 * (trade tables, combo cards, banners, filter headers).
 */
export const TagChip = memo(
  ({ name, color, size = 'xs' }: { name: string; color: string; size?: 'xs' | 'sm' }) => (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border text-fg',
        size === 'xs' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]',
      )}
      style={{ borderColor: `${color}80`, background: `${color}26` }}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {name}
    </span>
  ),
);
TagChip.displayName = 'TagChip';
