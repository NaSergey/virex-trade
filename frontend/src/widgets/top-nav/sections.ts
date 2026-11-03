import type { AppPart } from '@/shared/lib/utils/app-part';
import { isJournalPath } from '@/shared/lib/utils/journal-route';

export type Tab = 'terminal' | 'journal' | 'market' | 'backtest' | 'games' | 'tournaments' | 'profile';

export type NavItem = { id: Tab; labelKey: Tab; href: string };

/**
 * Площадка и журнал — отдельные продукты, ссылок друг на друга в них нет (владелец
 * 2026-11-03: «журнал идёт отдельно от этого всего»).
 *
 * Биржевой терминал — первым, перед «Дневником», и у всех (решение владельца
 * 2026-10-16): без ключа с правом торговли страница предлагает подключить его
 * или торговать на демо-счёте.
 *
 * «Дневник» — один пункт на три страницы: обзор, теги, аналитика (решение
 * владельца 2026-10-14). Ведёт на обзор, а между страницами переключают
 * вкладки самого дневника (`widgets/journal-nav`).
 */
const JOURNAL_NAV: NavItem[] = [
  { id: 'terminal', labelKey: 'terminal', href: '/terminal' },
  { id: 'journal', labelKey: 'journal', href: '/overview' },
  { id: 'market', labelKey: 'market', href: '/market' },
  { id: 'backtest', labelKey: 'backtest', href: '/backtest' },
];

/**
 * Площадка — одна игровая площадка, где игроки соревнуются, а не набор отдельных игр:
 * пункта под каждую игру нет (владелец 2026-11-03), игры открываются с витрины.
 */
const PLAY_NAV: NavItem[] = [
  { id: 'games', labelKey: 'games', href: '/games' },
  { id: 'tournaments', labelKey: 'tournaments', href: '/games/trading' },
  { id: 'profile', labelKey: 'profile', href: '/profile' },
];

/** Рейка шапки. */
export const navOf = (part: AppPart) => (part === 'journal' ? JOURNAL_NAV : PLAY_NAV);

/** Нижняя панель телефона (`TabBar`) — те же пункты, что у рейки. */
export const tabsOf = navOf;

const under = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

/**
 * Открыт ли этот раздел сейчас.
 *
 * Не строгое равенство: у раздела могут появиться вложенные адреса
 * (`/tags/<id>`), и пункт обязан оставаться подсвеченным внутри своей ветки.
 * Граница проверяется по слэшу, иначе `/lab` подсвечивался бы на `/labels`.
 * «Дневник» — открыт на любой из своих страниц; «Игры» — на витрине и в любой игре,
 * кроме турниров: у тех свой пункт.
 */
export function isActive(pathname: string, item: NavItem): boolean {
  if (item.id === 'journal') return isJournalPath(pathname);
  if (item.id === 'games') return under(pathname, '/games') && !under(pathname, '/games/trading');
  return under(pathname, item.href);
}
