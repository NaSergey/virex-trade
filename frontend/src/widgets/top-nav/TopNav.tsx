'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/features/auth';
import { Button } from '@/shared/ui/Button';
import { KeyValue } from '@/shared/ui/Lookup';
import { LocaleSwitch } from '@/shared/ui/LocaleSwitch';
import { ThemeToggle } from '@/shared/ui/ThemeToggle';
import { VirexLogo } from '@/shared/ui/VirexLogo';

type Tab = 'overview' | 'tags' | 'lab' | 'analytics' | 'settings' | 'admin';

type NavItem = { id: Tab; labelKey: Tab; ownerOnly?: boolean };

const NAV: NavItem[] = [
  { id: 'overview', labelKey: 'overview' },
  { id: 'tags', labelKey: 'tags' },
  { id: 'lab', labelKey: 'lab' },
  { id: 'analytics', labelKey: 'analytics' },
  { id: 'settings', labelKey: 'settings' },
  // Аналитика по пользователям сервиса. Стоит последней и видна только
  // владельцу: остальным ссылка вернула бы 403, а пункт в рейке обещал бы
  // раздел, которого у них нет.
  { id: 'admin', labelKey: 'admin', ownerOnly: true },
];

/**
 * Открыт ли этот раздел сейчас.
 *
 * Не строгое равенство: у раздела могут появиться вложенные адреса
 * (`/tags/<id>`), и пункт обязан оставаться подсвеченным внутри своей ветки.
 * Граница проверяется по слэшу, иначе `/lab` подсвечивался бы на `/labels`.
 */
const isActive = (pathname: string, id: Tab) => pathname === `/${id}` || pathname.startsWith(`/${id}/`);

/**
 * Разделы стоят горизонтальной рейкой в шапке, а не колонкой сбоку: страницы
 * этого продукта — таблицы и кривые, им нужна вся ширина листа, а 232px
 * сайдбара отгрызали её на каждом экране. Активный раздел показан инверсной
 * плашкой — в системе, где цвет означает только деньги, «активно» нельзя
 * покрасить, его можно только вывернуть.
 *
 * Пункты — ссылки, а не кнопки, и это не косметика: у раздела есть адрес, и
 * рейка обязана его отдавать. Ссылку открывают в новой вкладке средней
 * кнопкой, кладут в закладки и видят в строке браузера, куда попали; кнопка не
 * умеет ничего из этого. Заодно роутер сам качает код раздела заранее, как
 * только пункт попал в поле зрения, — предзагружать его руками по наведению
 * больше не нужно.
 *
 * Какой раздел открыт, рейка узнаёт из адреса, а не из пропа: адрес и есть
 * единственный источник этого знания, и передавать его сверху значило бы
 * завести второй, способный с ним разойтись.
 */
export function TopNav() {
  const { user, logout } = useAuth();
  const t = useTranslations('nav');
  const tc = useTranslations('common');
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);

  // На узком экране разделы стоят рейкой, которая листается вбок, и выбранный
  // может оказаться за её краем — после перезагрузки страницы или перехода не
  // мышью. Рейка подводит его к себе сама; block: 'nearest' держит при этом
  // вертикальную прокрутку страницы на месте.
  useEffect(() => {
    const active = navRef.current?.querySelector('[aria-current="page"]');
    active?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [menuOpen]);

  return (
    <header className="top">
      <div className="top-in">
        <div className="mark">
          <VirexLogo width={30} height={30} />
          Virex
        </div>

        {/* role="tablist" здесь больше нет: вкладки не меняют адрес, а эти
            пункты меняют. Скринридер должен услышать навигацию по разделам
            сайта, а не переключатель панелей внутри одной страницы. */}
        <nav className="nav" aria-label={t('sections')} ref={navRef}>
          {NAV.filter((item) => !item.ownerOnly || user?.isAdmin).map((item) => (
            <Link
              key={item.id}
              href={`/${item.id}`}
              aria-current={isActive(pathname, item.id) ? 'page' : undefined}
            >
              {t(item.labelKey)}
            </Link>
          ))}
        </nav>

        <div className="top-r" ref={menuRef}>
          <ThemeToggle />
          <Button
            variant="none"
            className="acct"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            {t('profile')}
          </Button>
          {menuOpen && (
            <div className="acct-menu" role="menu">
              <KeyValue label={t('who')}>{user?.name || t('noName')}</KeyValue>
              <KeyValue label={t('email')}>{user?.email}</KeyValue>
              {/* Язык — свойство учётной записи, а не раздел сайта: в рейке
                  шапки он стоял наравне с «Обзором» и «Тегами», хотя ничего
                  не открывает. Здесь он рядом с именем и почтой — там, где
                  человек и ищет настройки своего профиля, — и заодно
                  освобождает узкую шапку на телефоне. */}
              <KeyValue label={tc('language')} control valueClassName="">
                <LocaleSwitch />
              </KeyValue>
              <Button
                variant="risk"
                style={{ marginTop: 'var(--s3)', width: '100%' }}
                onClick={() => {
                  setMenuOpen(false);
                  void logout();
                }}
              >
                {t('logout')}
              </Button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export type { Tab };
