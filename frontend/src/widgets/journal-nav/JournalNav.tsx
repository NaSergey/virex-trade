'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { JOURNAL_PAGES, isJournalPage } from '@/shared/lib/utils/journal-route';
import { Wrap } from '@/shared/ui/Wrap';

/**
 * Вкладки «Дневника»: обзор, теги, аналитика (решение владельца 2026-10-14 —
 * три раздела рейки стали одним пунктом с подстраницами).
 *
 * **Только на сенсорных экранах.** С мышью страницы дневника открываются
 * панелью под пунктом по наведению на «Дневник» (`TopNav`, `.jmenu`), а эти
 * вкладки спрятаны (`@media (hover: hover)`): наведения на телефоне нет, и без
 * них до тегов и аналитики было бы не дойти.
 *
 * Ссылки, а не переключатель: у каждой вкладки свой адрес, и прежние
 * `/overview`, `/tags`, `/analytics` не изменились — на них ведут гейт,
 * туры обучения и ссылки из уведомлений. Выбранная вкладка подчёркнута на
 * линейке, а не вывернута плашкой: плашка уже стоит у «Дневника» в рейке
 * выше, и вторая такая же под ней спорила бы с ней за «где я».
 */
export function JournalNav() {
  const t = useTranslations('nav');
  const pathname = usePathname();

  return (
    <Wrap>
      <nav className="subnav" aria-label={t('journalSections')}>
        {JOURNAL_PAGES.map((id) => (
          <Link key={id} href={`/${id}`} aria-current={isJournalPage(pathname, id) ? 'page' : undefined}>
            {t(id)}
          </Link>
        ))}
      </nav>
    </Wrap>
  );
}
