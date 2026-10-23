import { isJournalPath } from '@/shared/lib/utils/journal-route';

export type Tab = 'terminal' | 'journal' | 'market' | 'backtest' | 'games';

type NavItem = { id: Tab; labelKey: Tab; href: string };

/**
 * Биржевой терминал — первым, перед «Дневником», и у всех (решение владельца
 * 2026-10-16): без ключа с правом торговли страница предлагает подключить его
 * или торговать на демо-счёте.
 *
 * «Дневник» — один пункт на три страницы: обзор, теги, аналитика (решение
 * владельца 2026-10-14). Ведёт на обзор, а между страницами переключают
 * вкладки самого дневника (`widgets/journal-nav`).
 *
 * Один список на рейку шапки и нижнюю панель телефона (`TabBar`).
 */
export const NAV: NavItem[] = [
  { id: 'terminal', labelKey: 'terminal', href: '/terminal' },
  { id: 'journal', labelKey: 'journal', href: '/overview' },
  { id: 'market', labelKey: 'market', href: '/market' },
  { id: 'backtest', labelKey: 'backtest', href: '/backtest' },
  { id: 'games', labelKey: 'games', href: '/games' },
];

/**
 * Открыт ли этот раздел сейчас.
 *
 * Не строгое равенство: у раздела могут появиться вложенные адреса
 * (`/tags/<id>`), и пункт обязан оставаться подсвеченным внутри своей ветки.
 * Граница проверяется по слэшу, иначе `/lab` подсвечивался бы на `/labels`.
 * «Дневник» — открыт на любой из своих страниц.
 */
export const isActive = (pathname: string, id: Tab) =>
  id === 'journal' ? isJournalPath(pathname) : pathname === `/${id}` || pathname.startsWith(`/${id}/`);
