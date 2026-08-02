'use client';

import type { ReactNode } from 'react';

/**
 * Состояние «здесь ничего нет» — на месте таблицы или кривой.
 *
 * Всегда две части: что произошло и что с этим делать. Одного заголовка мало —
 * «Ни одна сделка не подошла» без второй строки выглядит как поломка, хотя
 * это ответ на заданный пользователем вопрос.
 */
export function EmptyState({
  title,
  children,
}: {
  title: ReactNode;
  /** Что делать дальше; без этого состояние читается как ошибка. */
  children?: ReactNode;
}) {
  return (
    <div className="state">
      <h3>{title}</h3>
      {children != null && <p>{children}</p>}
    </div>
  );
}
