'use client';

import { memo } from 'react';
import { cn } from '@/shared/lib/utils/css';

export interface SegmentedOption<T extends string | number> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string | number> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * Pill-style toggle group — период/вкладки/категория. Один компонент вместо
 * копипасты одного и того же `inline-flex ... bg-elevated` блока по всем
 * страницам и модалкам.
 */
function SegmentedControlInner<T extends string | number>({
  options,
  value,
  onChange,
  size = 'md',
  className,
}: SegmentedControlProps<T>) {
  const sizeClass = size === 'sm' ? 'gap-0.5 p-0.5 text-[11px]' : 'gap-0.5 p-0.5 text-xs';
  const buttonSizeClass = size === 'sm' ? 'px-2 py-1' : 'px-3 py-1.5';

  return (
    <div className={cn('sheen inline-flex items-center rounded-lg border border-line bg-elevated', sizeClass, className)}>
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            'cursor-pointer rounded font-medium transition-colors',
            buttonSizeClass,
            value === opt.value ? 'bg-elevated-2 text-fg' : 'text-muted hover:text-fg',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export const SegmentedControl = memo(SegmentedControlInner) as typeof SegmentedControlInner;
