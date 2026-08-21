'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/features/auth';
import { Button } from '@/shared/ui/Button';
import { KeyValue } from '@/shared/ui/Lookup';
import { LocaleSwitch } from '@/shared/ui/LocaleSwitch';
import { VirexLogo } from '@/shared/ui/VirexLogo';

type Tab = 'overview' | 'tags' | 'lab' | 'analytics' | 'settings';

const NAV: { id: Tab; labelKey: 'overview' | 'tags' | 'lab' | 'analytics' | 'settings' }[] = [
  { id: 'overview', labelKey: 'overview' },
  { id: 'tags', labelKey: 'tags' },
  { id: 'lab', labelKey: 'lab' },
  { id: 'analytics', labelKey: 'analytics' },
  { id: 'settings', labelKey: 'settings' },
];

/**
 * Разделы стоят горизонтальной рейкой в шапке, а не колонкой сбоку: страницы
 * этого продукта — таблицы и кривые, им нужна вся ширина листа, а 232px
 * сайдбара отгрызали её на каждом экране. Активный раздел показан инверсной
 * плашкой — в системе, где цвет означает только деньги, «активно» нельзя
 * покрасить, его можно только вывернуть.
 */
export function TopNav({ activeTab, onTabChange }: { activeTab: Tab; onTabChange: (tab: Tab) => void }) {
  const { user, logout } = useAuth();
  const t = useTranslations('nav');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);

  // На узком экране разделы стоят рейкой, которая листается вбок, и выбранный
  // может оказаться за её краем — после перезагрузки страницы или перехода не
  // мышью. Рейка подводит его к себе сама; block: 'nearest' держит при этом
  // вертикальную прокрутку страницы на месте.
  useEffect(() => {
    const active = navRef.current?.querySelector('[aria-selected="true"]');
    active?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [activeTab]);

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

        <nav className="nav" role="tablist" aria-label={t('sections')} ref={navRef}>
          {NAV.map((item) => (
            <Button
              key={item.id}
              variant="none"
              role="tab"
              aria-selected={activeTab === item.id}
              onClick={() => onTabChange(item.id)}
            >
              {t(item.labelKey)}
            </Button>
          ))}
        </nav>

        <div className="top-r" ref={menuRef}>
          <LocaleSwitch />
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
