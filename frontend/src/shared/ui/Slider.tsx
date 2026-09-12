'use client';

import type { ChangeEvent, CSSProperties } from 'react';
import { cn } from '@/shared/lib/utils/css';

export interface SliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  className?: string;
  disabled?: boolean;
  'aria-label'?: string;
}

/**
 * Ползунок числового значения в диапазоне — свой, без сторонней библиотеки:
 * нативный `<input type="range">` даёт клавиатуру и доступность из коробки,
 * а перекрашивается токенами продукта через псевдоэлементы track/thumb —
 * единого кросс-браузерного способа стилизовать range нет, отсюда отдельные
 * правила под webkit и moz в globals.css.
 *
 * Заполненная часть трека рисуется градиентом до текущего значения — при
 * min≠0 или max≠100 браузер сам не показывает, докуда дотянут ползунок.
 */
export function Slider({ value, min, max, step = 1, onChange, className, disabled, ...rest }: SliderProps) {
  const range = max - min;
  const pct = range > 0 ? ((value - min) / range) * 100 : 0;
  const onInput = (e: ChangeEvent<HTMLInputElement>) => onChange(Number(e.target.value));

  return (
    <input
      type="range"
      className={cn('slider', className)}
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={onInput}
      disabled={disabled}
      style={{ '--slider-pct': `${pct}%` } as CSSProperties}
      {...rest}
    />
  );
}
