'use client';

import { cn } from '@/shared/lib/utils/css';

export interface SkeletonProps {
  /** Ширина: число — пиксели, строка — как есть («70 %»). */
  width?: number | string;
  height?: number | string;
  /** Снимает нижний отступ — для сеток, где расстояние задаёт сам контейнер. */
  flush?: boolean;
  /** `span` — когда заглушка стоит в строке или в ячейке grid'а. */
  as?: 'div' | 'span';
  className?: string;
}

/**
 * Заглушка на месте ещё не пришедшего значения.
 *
 * Одна полоса краски в 7 % — не «анимированный шиммер»: мигание на тёмном листе
 * читается как ошибка, а не как ожидание.
 */
export function Skeleton({ width, height, flush, as = 'div', className }: SkeletonProps) {
  const Tag = as;
  return (
    <Tag
      className={cn('skel', className)}
      // display нужен только span'у: у него он inline, и height бы не сработала.
      style={{ width, height, display: as === 'span' ? 'block' : undefined, margin: flush ? 0 : undefined }}
    />
  );
}

/**
 * Несколько строк заглушки убывающей ширины — на месте абзаца или списка.
 *
 * Ширины передаются числами-процентами, а не рисуются в разметке: убывание —
 * это и есть весь смысл («здесь будет текст, он кончается неровно»), и
 * повторять три почти одинаковых `<div className="skel" style={{width}}>` ради
 * него не нужно.
 */
export function SkeletonLines({ widths = [100, 78, 56] }: { widths?: number[] }) {
  return (
    <>
      {widths.map((w, i) => (
        <Skeleton key={i} width={`${w}%`} />
      ))}
    </>
  );
}
