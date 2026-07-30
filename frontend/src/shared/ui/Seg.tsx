'use client';

import { memo } from 'react';
import { cn } from '@/shared/lib/utils/css';

export interface SegOption<T extends string | number> {
  value: T;
  label: string;
  title?: string;
}

/**
 * Группа взаимоисключающих кнопок в одной рамке. Выбранная — инверсная плашка:
 * в системе, где цвет означает деньги, выбор нельзя обозначить цветом, только
 * выворотом. Состояние держится на aria-pressed, а не на классе, — стиль и
 * доступность читают одно и то же.
 */
function SegInner<T extends string | number>({
  options,
  value,
  onChange,
  className,
  ariaLabel,
}: {
  options: readonly SegOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div className={cn('seg', className)} role="group" aria-label={ariaLabel}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          title={opt.title}
          aria-pressed={value === opt.value}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export const Seg = memo(SegInner) as typeof SegInner;
