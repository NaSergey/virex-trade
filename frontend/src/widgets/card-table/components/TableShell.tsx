'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { cn } from '@/shared/lib/utils/css';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { TableDefs } from './TableDefs';

/**
 * Страница стола: `.ct-page`, тёмная в обеих темах, как и заливка под ней
 * (`.games-bg` — общая у трёх тёмных маршрутов раздела игр, рендерится в
 * `(app)` layout через `GamesVeil`, а не здесь). Пока снимка стола нет —
 * строка загрузки или ошибка.
 */
export function TableFrame({
  loading,
  error,
  className,
  children,
}: {
  loading: boolean;
  error: unknown;
  className?: string;
  children: ReactNode;
}) {
  const t = useTranslations('cardTable');
  return (
    <div className={cn('ct-page', className)}>
      {children ??
        (loading ? <p className="ct-wait">{t('loading')}</p> : <ErrorNote error={error} fallback={t('loadFailed')} />)}
    </div>
  );
}

/**
 * Раскладка стола: шапка со ссылкой в лобби и меню «⋯», сцена и низ под
 * панель хода. Стол со всеми кнопками — ровно один экран без прокрутки
 * (требование владельца): сцена вписывается в то, что осталось от низа
 * (`.ct-stage-box`), поэтому всё, что добавляется под стол, отнимает высоту у
 * сцены. `side` — колонка слева от стола (справка по комбинациям покера).
 */
export function TableShell({
  backHref,
  menu,
  side,
  stage,
  bottom,
}: {
  backHref: string;
  menu: ReactNode;
  side?: ReactNode;
  stage: ReactNode;
  bottom: ReactNode;
}) {
  const t = useTranslations('cardTable');
  return (
    <>
      <TableDefs />
      <header className="ct-top">
        <Link href={backHref} className="ct-backlink">
          ← {t('backToLobby')}
        </Link>
        {menu}
      </header>

      <div className="ct-body">
        {side}
        <div className="ct-main">
          <div className="ct-stage-box">{stage}</div>
          <div className="ct-bottom">{bottom}</div>
        </div>
      </div>
    </>
  );
}
