import type { ReactNode } from 'react';
import { JournalNav } from '@/widgets/journal-nav';

/**
 * «Дневник» — обзор, теги и аналитика под одной вкладкой рейки.
 *
 * Группа `(journal)` в адресе не появляется: страницы остаются `/overview`,
 * `/tags`, `/analytics`. Вкладки — в макете группы, а не в каждой странице:
 * один узел переживает переход между ними и не мигает. Видны они только на
 * сенсорных экранах; с мышью страницы дневника — панелью по наведению на
 * пункт в шапке (`TopNav`).
 */
export default function JournalLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <JournalNav />
      {children}
    </>
  );
}
