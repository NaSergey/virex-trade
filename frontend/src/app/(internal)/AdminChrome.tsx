'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  Bookmark,
  BookOpen,
  CalendarCheck,
  ChevronDown,
  FlaskConical,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AuthGuard, useAuth } from '@/features/auth';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { LocaleSwitch } from '@/shared/ui/LocaleSwitch';
import { Wrap } from '@/shared/ui/Wrap';
import { adminPath } from '@/shared/lib/utils/admin-host';

const ITEMS: {
  href: string;
  key: 'wallets' | 'saved' | 'users' | 'english' | 'plan' | 'strategy';
  icon: LucideIcon;
}[] = [
  { href: '/', key: 'wallets', icon: Wallet },
  { href: '/saved', key: 'saved', icon: Bookmark },
  { href: '/users', key: 'users', icon: Users },
  // Учебник английского — свои вкладки внутри (views/english), пункт горит на всех.
  { href: '/english', key: 'english', icon: BookOpen },
  // План дня — свои вкладки внутри (views/plan).
  { href: '/plan', key: 'plan', icon: CalendarCheck },
  // Стратегия — отчёт бектеста и обучения (views/strategy).
  { href: '/strategy', key: 'strategy', icon: FlaskConical },
];

const isCurrent = (path: string, href: string) => path === href || (href !== '/' && path.startsWith(`${href}/`));

/** Потерявшего сессию — на вход поддомена, с возвратом туда, где он был. */
const toLogin = (path: string) => `/login?next=${encodeURIComponent(adminPath(path))}`;

/**
 * Обвязка админки на поддомене `admin.*`: название, разделы, почта и
 * выход. Рейки продукта, баланса и Battle Pass здесь нет — это инструмент
 * владельца, а не продукт, и их запросы здесь никому не нужны.
 *
 * Право проверяет бэкенд на каждом запросе (AdminGuard); здесь — только чтобы
 * не рисовать пустые таблицы тому, кто вошёл не владельцем.
 */
export function AdminChrome({ children }: { children: ReactNode }) {
  const t = useTranslations('adminShell');
  const { user, loading, logout } = useAuth();
  // На поддомене адрес переписан в /admin/*. Видимый или переписанный путь
  // вернёт usePathname — не важно: префикс снимается.
  const path = adminPath(usePathname());

  return (
    <>
      <MobileNav path={path} email={user?.email} onLogout={user ? () => void logout() : undefined} />
      <header className="adm-top">
        <span className="adm-brand">{t('brand')}</span>
        <nav className="adm-nav">
          {ITEMS.map((i) => (
            <Link key={i.href} href={i.href} aria-current={isCurrent(path, i.href) ? 'page' : undefined}>
              {t(i.key)}
            </Link>
          ))}
        </nav>
        <span className="adm-user muted">{user?.email}</span>
        {/* Кука языка — без Domain, как и кука сессии: выбор основного сайта на
            поддомен не доезжает, и без своего переключателя админка стояла бы
            на языке по умолчанию (английском). */}
        <LocaleSwitch className="seg-tight" />
        {user ? (
          <Button variant="bare" tight onClick={() => void logout()}>
            {t('logout')}
          </Button>
        ) : null}
      </header>
      <AuthGuard loginUrl={toLogin}>
        {!loading && user && !user.isAdmin ? (
          <Wrap page>
            <EmptyState title={t('deniedTitle')}>{t('deniedBody')}</EmptyState>
          </Wrap>
        ) : (
          children
        )}
      </AuthGuard>
    </>
  );
}

/**
 * Разделы админки на телефоне (≤760px, где строка `.adm-top` не помещается):
 * название открытого раздела со стрелкой, по нажатию — список разделов. Нижняя
 * панель у учебника и плана — их собственные вкладки; переход между разделами —
 * только здесь, поэтому шапка одна на все разделы, а не своя у каждого.
 */
function MobileNav({ path, email, onLogout }: { path: string; email?: string; onLogout?: () => void }) {
  const t = useTranslations('adminShell');
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const current = ITEMS.find((i) => isCurrent(path, i.href));

  // Переход по пункту меняет адрес — меню закрывается само.
  const [shownFor, setShownFor] = useState(path);
  if (shownFor !== path) {
    setShownFor(path);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const Icon = current?.icon;
  return (
    <div className="adm-m" ref={box}>
      <Button
        variant="none"
        className="adm-m-btn"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
      >
        {Icon && <Icon size={18} aria-hidden />}
        <span>{current ? t(current.key) : t('brand')}</span>
        <ChevronDown size={16} aria-hidden className="adm-m-chev" />
      </Button>
      {open && (
        <nav className="adm-m-menu" aria-label={t('brand')}>
          {ITEMS.map(({ href, key, icon: ItemIcon }) => (
            <Link key={href} href={href} aria-current={isCurrent(path, href) ? 'page' : undefined}>
              <ItemIcon size={18} aria-hidden />
              {t(key)}
            </Link>
          ))}
          <div className="adm-m-foot">
            <span className="muted">{email}</span>
            <LocaleSwitch className="seg-tight" />
            {onLogout && (
              <Button variant="bare" tight onClick={onLogout}>
                {t('logout')}
              </Button>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}
