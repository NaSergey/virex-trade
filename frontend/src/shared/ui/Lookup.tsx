'use client';

import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/shared/lib/utils/css';

/**
 * Справочная пара «подпись → значение»: слева слово, справа число, снизу
 * волосяная линейка.
 *
 * Одна разметка на весь продукт — меню профиля, настройки, справка под кривой,
 * сверка диапазона, часы входа в условиях выборки. Раньше это были два почти
 * одинаковых набора классов (`.kv` и `.lookup > div`), и подписи в них
 * набирались разным трекингом — разницу нельзя было заметить, потому что рядом
 * они никогда не стояли.
 */
export function KeyValue({
  label,
  children,
  /** Значение набирается не цифрами: `mask` — маскированный ключ, `n pos` и т.п. */
  valueClassName = 'n',
  control = false,
}: {
  label: ReactNode;
  children: ReactNode;
  valueClassName?: string;
  /**
   * Справа не значение, а орган управления (переключатель языка в меню
   * профиля). Меняется только тег обёртки — span не имеет права содержать
   * блочную разметку, из которой собран `Seg`. Строка, линейка и подпись
   * остаются теми же: пара «подпись → что-то справа» в продукте одна.
   */
  control?: boolean;
}) {
  const Value = control ? 'div' : 'span';
  return (
    <div className={cn('kv', control && 'ctl')}>
      <span className="lbl">{label}</span>
      <Value className={valueClassName || undefined}>{children}</Value>
    </div>
  );
}

/**
 * Столбцы справочных пар. Две колонки по умолчанию, одна — когда пар мало или
 * значения длинные: в маргиналии шириной в четверть листа два столбца не
 * помещаются.
 */
export function Lookup({
  one,
  children,
  className,
  style,
}: {
  /** В одну колонку вместо двух. */
  one?: boolean;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={cn('lookup', one && 'one', className)} style={style}>
      {children}
    </div>
  );
}
