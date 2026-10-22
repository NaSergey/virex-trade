'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, CalendarCheck, Layers, Library, Mic, PenLine, type LucideIcon } from 'lucide-react';
import { Wrap } from '@/shared/ui/Wrap';
import { adminPath } from '@/shared/lib/utils/admin-host';
import './english.css';

/**
 * Порядок — путь занятия: план дня, затем учебник (урок → практика → речь на
 * фразах пройденных уроков), затем слова (карточки → темы-словарь). План на
 * «Сегодня» идёт в том же порядке.
 */
const TABS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: '/english', label: 'Сегодня', icon: CalendarCheck },
  { href: '/english/lessons', label: 'Уроки', icon: BookOpen },
  { href: '/english/practice', label: 'Практика', icon: PenLine },
  { href: '/english/speak', label: 'Речь', icon: Mic },
  { href: '/english/cards', label: 'Карточки', icon: Layers },
  { href: '/english/words', label: 'Темы', icon: Library },
];

/** Тест по теме открывается из «Тем» — вкладка горит и на нём. */
const isTab = (path: string, href: string) => path === href || (href === '/english/words' && path === '/english/test');

/**
 * Учебник английского — раздел владельца на поддомене админки (спека
 * docs/superpowers/specs/2026-10-21-english-course-design.md). Весь раздел —
 * этот каталог; как его перенести или снести — README.md рядом.
 *
 * На телефоне раздел — приложение: вкладки внизу под большим пальцем, шапки
 * админки нет (`.en-app` в english.css), а сверху — своя строка с выходом в
 * админку. Добавленный на главный экран, он открывается без строки браузера
 * (манифест — `app/admin/(in)/english/layout.tsx`).
 */
export function EnglishLayout({ children }: { children: ReactNode }) {
  const path = adminPath(usePathname());
  return (
    <Wrap page className="en en-app">
      <div className="en-mtop">
        <span className="en-mtop-brand">English</span>
        <Link href="/" className="en-mtop-out">
          Админка
        </Link>
      </div>
      <nav className="en-tabs" aria-label="Разделы учебника">
        {TABS.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} aria-current={isTab(path, href) ? 'page' : undefined}>
            <Icon className="en-tab-ic" size={20} aria-hidden />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
      {children}
    </Wrap>
  );
}
