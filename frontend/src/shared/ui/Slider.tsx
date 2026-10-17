'use client';

import { startTransition, useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type CSSProperties } from 'react';
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

const pctOf = (v: number, min: number, max: number) => (max - min > 0 ? ((v - min) / (max - min)) * 100 : 0);

const paint = (el: HTMLInputElement, min: number, max: number) =>
  el.style.setProperty('--slider-pct', `${pctOf(Number(el.value), min, max)}%`);

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
 * **Бегунок не ждёт родителя.** От значения ползунка в терминале зависит весь
 * экран (черновые линии на графике, таблица сетки), и его перерисовка — сотни
 * миллисекунд при слабом ЦП. Управляемый input (`value` из React) двигался
 * только вместе с ней: React возвращал бегунок на старое значение после каждого
 * события, и стоило перерисовке совпасть с хвостом свечей или подгрузкой
 * истории — ползунок вставал, а потом догонял (жалоба владельца 2026-10-17).
 * Поэтому:
 * - пока ползунок держат, бегунок и заливку ведёт браузер, значение родителя в
 *   узел не пишется (приём `paintLast` графика — DOM напрямую, не состоянием);
 * - `onChange` уходит переходом (`startTransition`): тяжёлая перерисовка
 *   прерываема и не держит события указателя;
 * - значение родителя (там оно могло быть зажато или округлено) пишется в узел,
 *   только когда закоммичено последнее отправленное: вместе с `onChange` тем же
 *   переходом уходит свой счётчик (`settle`), и коммит, где он догнал число
 *   отправок (`sent`), несёт и последнее значение родителя. Коммит посередине
 *   вернул бы бегунок назад — а зажатая стрелка клавиатуры шагала бы от
 *   старого значения и теряла нажатия.
 */
export function Slider({ value, min, max, step = 1, onChange, className, disabled, ...rest }: SliderProps) {
  const ref = useRef<HTMLInputElement>(null);
  const onChangeRef = useRef(onChange);
  const held = useRef<AbortController | null>(null);
  const sent = useRef(0);
  const [settled, settle] = useState(0);

  useLayoutEffect(() => {
    onChangeRef.current = onChange;
  });

  // Каждый коммит: всё отправленное дошло и ползунок не держат — значение
  // родителя в узел; иначе — заливка по бегунку (React мог переписать её
  // стилем от отставшего `value`).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!held.current && settled === sent.current) el.value = String(value);
    paint(el, min, max);
  });

  useEffect(() => () => held.current?.abort(), []);

  /** Следующий коммит перехода сверит узел с родителем (см. эффект выше). */
  const bump = () => {
    sent.current += 1;
    settle((n) => n + 1);
  };

  const hold = () => {
    held.current?.abort();
    const ac = new AbortController();
    held.current = ac;
    const release = () => {
      ac.abort();
      if (held.current === ac) held.current = null;
      startTransition(bump);
    };
    window.addEventListener('pointerup', release, { signal: ac.signal });
    window.addEventListener('pointercancel', release, { signal: ac.signal });
    // Ушли из окна посреди драга — отпускания можно не дождаться.
    window.addEventListener('blur', release, { signal: ac.signal });
  };

  const onInput = (e: ChangeEvent<HTMLInputElement>) => {
    const el = e.currentTarget;
    const v = Number(el.value);
    paint(el, min, max);
    startTransition(() => {
      onChangeRef.current(v);
      bump();
    });
  };

  return (
    <input
      ref={ref}
      type="range"
      className={cn('slider', className)}
      min={min}
      max={max}
      step={step}
      defaultValue={value}
      onChange={onInput}
      onPointerDown={hold}
      disabled={disabled}
      style={{ '--slider-pct': `${pctOf(value, min, max)}%` } as CSSProperties}
      {...rest}
    />
  );
}
