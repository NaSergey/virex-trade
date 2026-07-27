'use client';

import type { ReactNode } from 'react';

/**
 * Оболочка любой страницы приложения: своя прокрутка (страницы монтируются
 * внутрь AppShell, у которого скролла нет), фон и вертикальный ритм между
 * секциями. Раньше эти две обёртки были скопированы в Обзоре, Тегах,
 * Аналитике и Лаборатории — и расходились по мелочам при правках.
 */
export function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="h-full overflow-y-auto bg-app p-3">
      <div className="mx-auto flex flex-col gap-3">{children}</div>
    </div>
  );
}
