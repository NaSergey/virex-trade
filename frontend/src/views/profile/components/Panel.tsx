'use client';

import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/utils/css';

/**
 * Панель дашборда профиля: заголовок со счётчиком и содержимое на тёмной
 * карточке. `tone` — цвет смысла панели (опыт — фиолетовый, монеты — золото):
 * он красит знак у заголовка, свет в углу и графики внутри. Не цвет игры —
 * игр будет двадцать и больше.
 *
 * `scroll` — длинное содержимое (лента, рейтинг, игры) прокручивается внутри
 * панели: страница профиля стоит ровно в экран и сама не прокручивается.
 */
export function Panel({
  title,
  count,
  aside,
  tone = 'neutral',
  scroll,
  className,
  children,
}: {
  title: ReactNode;
  count?: ReactNode;
  aside?: ReactNode;
  tone?: 'neutral' | 'violet' | 'gold' | 'green' | 'cyan' | 'pink' | 'orange';
  scroll?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn('pf-panel', `pf-t-${tone}`, className)}>
      <div className="pf-ph">
        <h2>
          {title}
          {count != null && <span className="pf-count n">{count}</span>}
        </h2>
        {aside}
      </div>
      <div className={cn('pf-pb', scroll && 'is-scroll')}>{children}</div>
    </section>
  );
}
