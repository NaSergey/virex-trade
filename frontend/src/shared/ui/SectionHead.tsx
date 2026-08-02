'use client';

import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/shared/lib/utils/css';

/**
 * Заголовок раздела с управлением на той же линейке.
 *
 * Управление садится справа по базовой линии заголовка, а не отдельной строкой
 * под ним: тумблер таймфрейма и слово «Свечи и окно измерения» — одно
 * высказывание, и разносить их по двум строкам значило бы разорвать его.
 *
 * Раньше `<div className="h2row"><h2>…</h2>` писалось в семи местах. Разметка
 * из двух узлов кажется слишком мелкой для компонента ровно до того момента,
 * когда в одном из семи мест `<h2>` окажется не первым ребёнком, — а линейка
 * снизу и выключка вправо держатся именно на порядке детей.
 */
export function SectionHead({
  title,
  children,
  className,
  style,
}: {
  title: ReactNode;
  /** Что стоит справа: тумблер, счётчик, кнопка раздела. */
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={cn('h2row', className)} style={style}>
      <h2>{title}</h2>
      {children}
    </div>
  );
}
