'use client';

import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/utils/css';
import { Skeleton } from '@/shared/ui/Skeleton';
import { Tooltip } from '@/shared/ui/Tooltip';

/**
 * Ячейка плотной строки величин (`.metrics` / `.mcell`): подпись, число,
 * подпись под числом.
 *
 * Три жёстких строки грида — отсюда общие базовые линии у соседей по строке, и
 * третья строка занимает место даже пустой: без неё ячейка без подписи
 * подтягивала бы своё число вверх и выпадала из ряда. Пустой `<span />` в
 * разметке помнить больше не нужно — его ставит компонент.
 *
 * Раньше эта тройка span-ов переписывалась в каждой ячейке «Рынка» — десять
 * раз на одну страницу, вместе с одинаковой заглушкой на время загрузки.
 */
export function MetricCell({
  label,
  /** Маленький «!» рядом с подписью — для чисел, которые сами за себя не говорят. */
  hint,
  value,
  /**
   * Подпись под числом: классификация Fear & Greed, суточное изменение,
   * сравнение со средним. `undefined` — у ячейки её нет вовсе (строка всё
   * равно остаётся пустой, чтобы ряд не разъехался).
   */
  sub,
  /** Краска числа: рост/падение, а не прибыль/убыток — здесь это одно и то же движение. */
  tone,
  /** Краска подписи под числом; чаще всего совпадает с tone, но не обязана. */
  subTone,
  loading,
}: {
  label: ReactNode;
  hint?: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: 'pos' | 'neg';
  subTone?: 'pos' | 'neg';
  loading?: boolean;
}) {
  return (
    <div className="mcell mcell-tall">
      <span className="lbl">
        {label}
        {hint && (
          <Tooltip text={hint}>
            <span className="hint" tabIndex={0}>
              !
            </span>
          </Tooltip>
        )}
      </span>
      <span className={cn('mval', tone)}>
        {loading ? <Skeleton as="span" flush height={16} width="58%" /> : value}
      </span>
      {sub === undefined ? (
        <span />
      ) : (
        <span className={cn('coef-sub', subTone)}>
          {loading ? <Skeleton as="span" flush height={10} width="46%" /> : sub}
        </span>
      )}
    </div>
  );
}
