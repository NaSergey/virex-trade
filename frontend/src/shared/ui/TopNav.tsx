'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/shared/auth/AuthContext';

type Tab = 'overview' | 'tags' | 'lab' | 'analytics' | 'settings';

const NAV: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Обзор' },
  { id: 'tags', label: 'Теги' },
  { id: 'lab', label: 'Лаборатория' },
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
            <button
              key={item.id}
              role="tab"
              aria-selected={activeTab === item.id}
              onClick={() => onTabChange(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="top-r" ref={menuRef}>
          <button className="acct" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((v) => !v)}>
            Профиль
          </button>
          {menuOpen && (
            <div className="acct-menu" role="menu">
              <div className="kv">
                <span>кто</span>
                <span className="n">{user?.name || 'без имени'}</span>
              </div>
              <div className="kv">
                <span>почта</span>
                <span className="n">{user?.email}</span>
              </div>
              <button
                className="btn risk"
                style={{ marginTop: 'var(--s3)', width: '100%' }}
                onClick={() => {
                  setMenuOpen(false);
                  void logout();
                }}
              >
                Выйти
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export type { Tab };
