'use client';

import { useEffect, useRef, type ChangeEvent, type CSSProperties } from 'react';
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
 *
 * Событие `input` при быстром драге сыпется чаще, чем страница успевает
 * перерисовать зависимые от значения тяжёлые куски (график сессии бектеста,
 * пересчёт превью) — каждое из них раньше синхронно гнало родителя в
 * ре-рендер, и на быстром движении мыши это глушило кадры, а сам ползунок
 * выглядел дёрганым. `onChange` наружу теперь зовётся не чаще раза в кадр
 * (`requestAnimationFrame`), с самым свежим значением — кадры не копятся и
 * не теряются, просто схлопываются в один на кадр отрисовки.
 */
export function Slider({ value, min, max, step = 1, onChange, className, disabled, ...rest }: SliderProps) {
  const range = max - min;
  const pct = range > 0 ? ((value - min) / range) * 100 : 0;

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const rafRef = useRef<number | null>(null);
  const pendingRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  const onInput = (e: ChangeEvent<HTMLInputElement>) => {
    pendingRef.current = Number(e.target.value);
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      if (pendingRef.current != null) onChangeRef.current(pendingRef.current);
    });
  };

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
