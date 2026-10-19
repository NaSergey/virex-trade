'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AuthGuard, useAuth } from '@/features/auth';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { LocaleSwitch } from '@/shared/ui/LocaleSwitch';
import { Wrap } from '@/shared/ui/Wrap';
import { adminPath } from '@/shared/lib/utils/admin-host';

const ITEMS = [
  { href: '/', key: 'wallets' },
  { href: '/saved', key: 'saved' },
  { href: '/users', key: 'users' },
] as const;

/** Потерявшего сессию — на вход поддомена, с возвратом туда, где он был. */
const toLogin = (path: string) => `/login?next=${encodeURIComponent(adminPath(path))}`;

/**
 * Обвязка админки на поддомене `admin.*`: название, три раздела, почта и
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
      <header className="adm-top">
        <span className="adm-brand">{t('brand')}</span>
        <nav className="adm-nav">
          {ITEMS.map((i) => (
            <Link key={i.href} href={i.href} aria-current={path === i.href ? 'page' : undefined}>
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
