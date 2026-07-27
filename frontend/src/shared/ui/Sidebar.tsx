'use client';

import { useEffect, useRef, useState } from 'react';
import { BarChart3, LineChart, Tags, FlaskConical, Settings, LogOut, ChevronsUpDown } from 'lucide-react';
import { VirexLogo } from '@/shared/ui/icon/VirexLogo';
import { useAuth } from '@/shared/auth/AuthContext';

type Tab = 'overview' | 'tags' | 'analytics' | 'lab' | 'settings';

const NAV: { id: Tab; label: string; icon: typeof BarChart3 }[] = [
  { id: 'overview', label: 'Обзор', icon: LineChart },
  { id: 'tags', label: 'Теги', icon: Tags },
  { id: 'lab', label: 'Лаборатория', icon: FlaskConical },
  { id: 'analytics', label: 'Аналитика', icon: BarChart3 },
  { id: 'settings', label: 'Настройки', icon: Settings },
];

interface SidebarProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

export function Sidebar({ activeTab, onTabChange }: SidebarProps) {
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

  const initial = (user?.name?.[0] || user?.email?.[0] || 'U').toUpperCase();

  return (
    <aside className="flex h-screen w-[232px] shrink-0 flex-col border-r border-line bg-app">
      <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-line px-4">
        <VirexLogo className="h-6 w-6 text-white" />
        <span className="text-sm font-semibold tracking-tight text-fg">Virex</span>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2 text-[13px]">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 font-medium transition-colors ${
                active ? 'sheen bg-elevated-2 text-fg' : 'text-muted hover:bg-elevated hover:text-fg'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="relative mt-auto shrink-0 border-t border-line p-2" ref={menuRef}>
        {menuOpen && (
          <div className="absolute bottom-[calc(100%+8px)] left-2 right-2 z-50 rounded-lg border border-line-strong bg-surface p-1.5 shadow-(--shadow-high)">
            <div className="border-b border-line px-2.5 py-2">
              <p className="truncate text-xs font-medium text-fg">{user?.name || 'Пользователь'}</p>
              <p className="truncate text-[11px] text-muted">{user?.email}</p>
            </div>
            <button
              onClick={() => {
                setMenuOpen(false);
                void logout();
              }}
              className="mt-1 flex w-full cursor-pointer items-center gap-2 rounded px-2.5 py-2 text-left text-xs text-muted transition-colors hover:bg-elevated hover:text-down"
            >
              <LogOut className="h-3.5 w-3.5" />
              Выйти
            </button>
          </div>
        )}
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-elevated"
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line-strong bg-elevated text-[11px] font-semibold text-muted">
            {initial}
          </span>
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-fg">
            {user?.name || user?.email || 'Пользователь'}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-subtle" />
        </button>
      </div>
    </aside>
  );
}

export type { Tab };
