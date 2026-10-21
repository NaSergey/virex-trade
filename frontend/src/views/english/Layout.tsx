'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Wrap } from '@/shared/ui/Wrap';
import { adminPath } from '@/shared/lib/utils/admin-host';
import './english.css';

const TABS = [
  { href: '/english', label: 'Уроки' },
  { href: '/english/cards', label: 'Карточки' },
  { href: '/english/practice', label: 'Практика' },
  { href: '/english/speak', label: 'Слух и речь' },
] as const;

/**
 * Учебник английского — раздел владельца на поддомене админки (спека
 * docs/superpowers/specs/2026-10-21-english-course-design.md). Весь раздел —
 * этот каталог; как его перенести или снести — README.md рядом.
 */
export function EnglishLayout({ children }: { children: ReactNode }) {
  const path = adminPath(usePathname());
  return (
    <Wrap page className="en">
      <nav className="en-tabs" aria-label="Разделы учебника">
        {TABS.map((t) => (
          <Link key={t.href} href={t.href} aria-current={path === t.href ? 'page' : undefined}>
            {t.label}
          </Link>
        ))}
      </nav>
      {children}
    </Wrap>
  );
}
