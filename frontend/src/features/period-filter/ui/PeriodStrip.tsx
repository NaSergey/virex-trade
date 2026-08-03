'use client';

import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/utils/css';
import { PeriodRail } from './PeriodRail';
import type { usePeriodFilter } from '../model/usePeriodFilter';

type Period = ReturnType<typeof usePeriodFilter>;

/**
 * Полоса периода: рейка с фильтром и то, что этим периодом посчитано.
 *
 * Три страницы («Обзор», «Теги», «Выборка») открываются одним и тем же — «за
 * что сейчас идёт речь», — и до этого каждая собирала полосу сама, прокидывая
 * в рейку пять значений одного и того же хука по отдельности. Здесь передаётся
 * сам хук: страница выбирает период, а не пересказывает его по полям.
 *
 * `onChange` — то, что должно случиться на странице от смены периода помимо
 * самой смены (сбросить нумерацию страниц журнала). Вызывается на любое
 * изменение, потому что для страницы это одно событие, а не два.
 */
export function PeriodStrip({
  period,
  title,
  trades,
  spaced,
  onChange,
  children,
}: {
  period: Period;
  /** Что сводится: «Теги за период». Без него подпись слева — только счётчик. */
  title?: string;
  /** Число записей в периоде; undefined — ещё не пришло. */
  trades?: number;
  /** Полоса стоит первой на листе и отбивается сверху и снизу. */
  spaced?: boolean;
  onChange?: () => void;
  /** Что посчитано за этот период — встаёт под рейкой, внутри той же полосы. */
  children?: ReactNode;
}) {
  return (
    <div className={cn('strip', spaced && 'spaced', !children && 'rail-only')}>
      <PeriodRail
        title={title}
        days={period.days}
        customDate={period.customDate}
        customActive={period.customActive}
        trades={trades}
        onSelectDays={(d) => {
          period.setDays(d);
          onChange?.();
        }}
        onCustomDate={(iso) => {
          period.setCustomDate(iso);
          onChange?.();
        }}
      />
      {children}
    </div>
  );
}
