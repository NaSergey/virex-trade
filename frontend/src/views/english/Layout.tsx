'use client';

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BookOpen,
  CalendarCheck,
  Castle,
  Gamepad2,
  Layers,
  Library,
  Lightbulb,
  Menu,
  Mic,
  PenLine,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Wrap } from '@/shared/ui/Wrap';
import { adminPath } from '@/shared/lib/utils/admin-host';
import './english.css';

type Tab = { href: string; label: string; icon: LucideIcon };

/**
 * Порядок — путь занятия: план дня, затем учебник (урок → практика → речь на
 * фразах пройденных уроков), затем слова (карточки → темы-словарь). План на
 * «Сегодня» идёт в том же порядке. Игра — сразу после плана дня: второй путь
 * через те же слова и упражнения.
 */
const TABS: Tab[] = [
  { href: '/english', label: 'Сегодня', icon: CalendarCheck },
  { href: '/english/game', label: 'Игра', icon: Gamepad2 },
  { href: '/english/lessons', label: 'Уроки', icon: BookOpen },
  { href: '/english/practice', label: 'Практика', icon: PenLine },
  { href: '/english/speak', label: 'Речь', icon: Mic },
  { href: '/english/cards', label: 'Карточки', icon: Layers },
  { href: '/english/words', label: 'Темы', icon: Library },
];

/** Меню телефона — те же страницы группами: день, учебник, слова, игры (каждая игра — свой пункт). */
const GROUPS: { title: string; items: Tab[] }[] = [
  {
    title: 'День',
    items: [
      { href: '/english', label: 'Сегодня', icon: CalendarCheck },
      { href: '/english/insights', label: 'Разбор', icon: Lightbulb },
    ],
  },
  {
    title: 'Учебник',
    items: [
      { href: '/english/lessons', label: 'Уроки', icon: BookOpen },
      { href: '/english/practice', label: 'Практика', icon: PenLine },
      { href: '/english/speak', label: 'Речь', icon: Mic },
    ],
  },
  {
    title: 'Слова',
    items: [
      { href: '/english/cards', label: 'Карточки', icon: Layers },
      { href: '/english/words', label: 'Темы', icon: Library },
    ],
  },
  {
    title: 'Игры',
    items: [
      { href: '/english/game', label: 'Mind the Gap', icon: Gamepad2 },
      { href: '/english/hold', label: 'Ashen Hold', icon: Castle },
    ],
  },
];

/** Тест по теме открывается из «Тем», разбор — из «Сегодня»: вкладка горит и на них. */
const isTab = (path: string, href: string) =>
  path === href ||
  (href === '/english/words' && path === '/english/test') ||
  (href === '/english/game' && path === '/english/hold') ||
  (href === '/english' && path === '/english/insights');

/** Пункт меню телефона горит только на своей странице (тест — под «Темами»). */
const isItem = (path: string, href: string) => path === href || (href === '/english/words' && path === '/english/test');

/**
 * Учебник английского — раздел владельца на поддомене админки (спека
 * docs/superpowers/specs/2026-10-21-english-course-design.md). Весь раздел —
 * этот каталог; как его перенести или снести — README.md рядом.
 *
 * На компьютере страницы — строкой вкладок. На телефоне — бургером справа в общей
 * шапке админки (порталом в `#adm-m-slot`), а низ экрана свободен: там игра держит
 * свою навигацию. Добавленный на главный экран, раздел открывается без строки браузера
 * (манифест — `app/admin/(in)/english/layout.tsx`).
 */
export function EnglishLayout({ children }: { children: ReactNode }) {
  const path = adminPath(usePathname());
  return (
    <Wrap page className={'en en-app'}>
      <nav className="en-tabs" aria-label="Разделы учебника">
        {TABS.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} aria-current={isTab(path, href) ? 'page' : undefined}>
            <Icon className="en-tab-ic" size={20} aria-hidden />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
      <Burger path={path} />
      {children}
    </Wrap>
  );
}

const noop = () => () => {};

function Burger({ path }: { path: string }) {
  const slot = useSyncExternalStore(
    noop,
    () => document.getElementById('adm-m-slot'),
    () => null,
  );
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

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

  if (!slot) return null;
  return createPortal(
    <div className="en-burger" ref={box}>
      <button
        type="button"
        className="en-burger-btn"
        aria-label="Страницы учебника"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <X size={22} aria-hidden /> : <Menu size={22} aria-hidden />}
      </button>
      {open ? (
        <nav className="en-burger-menu" aria-label="Страницы учебника">
          {GROUPS.map((g) => (
            <section key={g.title}>
              <p>{g.title}</p>
              {g.items.map(({ href, label, icon: Icon }) => (
                <Link key={href} href={href} aria-current={isItem(path, href) ? 'page' : undefined}>
                  <Icon size={18} aria-hidden />
                  {label}
                </Link>
              ))}
            </section>
          ))}
        </nav>
      ) : null}
    </div>,
    slot,
  );
}
