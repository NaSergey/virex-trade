'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/features/auth';
import { Button } from '@/shared/ui/Button';
import { KeyValue } from '@/shared/ui/Lookup';

type Tab = 'overview' | 'tags' | 'lab' | 'analytics' | 'settings';

const NAV: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Обзор' },
  { id: 'tags', label: 'Теги' },
  { id: 'lab', label: 'Выборка' },
  { id: 'analytics', label: 'Рынок' },
  { id: 'settings', label: 'Настройки' },
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
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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
        <div className="mark">Virex</div>

        <nav className="nav" role="tablist" aria-label="Разделы">
          {NAV.map((item) => (
            <Button
              key={item.id}
              variant="none"
              role="tab"
              aria-selected={activeTab === item.id}
              onClick={() => onTabChange(item.id)}
            >
              {item.label}
            </Button>
          ))}
        </nav>

        <div className="top-r" ref={menuRef}>
          <Button
            variant="none"
            className="acct"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            Профиль
          </Button>
          {menuOpen && (
            <div className="acct-menu" role="menu">
              <KeyValue label="кто">{user?.name || 'без имени'}</KeyValue>
              <KeyValue label="почта">{user?.email}</KeyValue>
              <Button
                variant="risk"
                style={{ marginTop: 'var(--s3)', width: '100%' }}
                onClick={() => {
                  setMenuOpen(false);
                  void logout();
                }}
              >
                Выйти
              </Button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export type { Tab };
