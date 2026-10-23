'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, CalendarCheck, CalendarRange, Settings, type LucideIcon } from 'lucide-react';
import { Wrap } from '@/shared/ui/Wrap';
import { adminPath } from '@/shared/lib/utils/admin-host';
import './plan.css';

const TABS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: '/plan', label: 'Сегодня', icon: CalendarCheck },
  { href: '/plan/template', label: 'Шаблон', icon: CalendarRange },
  { href: '/plan/stats', label: 'Отчёт', icon: BarChart3 },
  { href: '/plan/settings', label: 'Настройки', icon: Settings },
];

/**
 * План дня — раздел владельца на поддомене админки (спека
 * docs/superpowers/specs/2026-10-23-daily-plan-design.md). Весь раздел — этот
 * каталог; снос — README.md рядом.
 *
 * На телефоне — приложение, как учебник английского: шапки админки нет,
 * вкладки панелью внизу под большим пальцем, сверху своя строка с выходом в
 * админку. Управление — не меньше 44 px (мерки приложения из мобильной ветки).
 */
export function PlanLayout({ children }: { children: ReactNode }) {
  const path = adminPath(usePathname());
  return (
    <Wrap page className="pl pl-app">
      <div className="pl-mtop">
        <span className="pl-mtop-brand">План</span>
        <Link href="/" className="pl-mtop-out">
          Админка
        </Link>
      </div>
      <nav className="pl-tabs" aria-label="Разделы плана">
        {TABS.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} aria-current={path === href ? 'page' : undefined}>
            <Icon className="pl-tab-ic" size={20} aria-hidden />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
      {children}
    </Wrap>
  );
}
