'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Activity, ChartCandlestick, Gamepad2, History, NotebookPen, type LucideIcon } from 'lucide-react';
import { NAV, isActive, type Tab } from './sections';

const ICONS: Record<Tab, LucideIcon> = {
  terminal: ChartCandlestick,
  journal: NotebookPen,
  market: Activity,
  backtest: History,
  games: Gamepad2,
};

/**
 * Экраны игры, где панель разделов не нужна: стол, полёт и трасса занимают
 * весь экран, а выход из них — уход из-за стола (`useLeaveOnExit`), и
 * случайное касание вкладки под большим пальцем стоило бы места за столом.
 */
const isImmersive = (pathname: string) =>
  pathname === '/games/jetpack' ||
  pathname === '/games/race' ||
  /^\/games\/(poker|blackjack)\/[^/]+$/.test(pathname);

/**
 * Разделы на телефоне — панелью внизу под большим пальцем, как у приложения
 * (тот же приём, что у учебника английского в админке). Рейка шапки на узком
 * экране спрятана, шапка — одна строка. Видна только при `(max-width: 720px)`
 * (`.tabbar` в globals.css); высоту панели страницы берут из `--tab-h`.
 */
export function TabBar() {
  const t = useTranslations('nav');
  const pathname = usePathname();
  if (isImmersive(pathname)) return null;
  return (
    <nav className="tabbar" aria-label={t('sections')} data-tour="nav">
      {NAV.map((item) => {
        const Icon = ICONS[item.id];
        return (
          <Link key={item.id} href={item.href} aria-current={isActive(pathname, item.id) ? 'page' : undefined}>
            <Icon size={20} strokeWidth={1.6} aria-hidden />
            <span>{t(item.labelKey)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
