import type { AppPart } from '@/shared/lib/utils/app-part';
import { isJournalPath } from '@/shared/lib/utils/journal-route';

export type Tab =
  | 'terminal'
  | 'journal'
  | 'market'
  | 'backtest'
  | 'games'
  | 'tournaments'
  | 'poker'
  | 'blackjack'
  | 'jetpack'
  | 'race'
  | 'journalApp';

/**
 * `other` — раздел соседней части продукта: обычная ссылка, а не `Link`. Куда надо её
 * уводит гейт, а `Link` пытался бы заранее подгрузить чужую часть.
 */
export type NavItem = { id: Tab; labelKey: Tab; href: string; other?: boolean };

/**
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
  { id: 'games', labelKey: 'games', href: '/games', other: true },
];

const PLAY_NAV: NavItem[] = [
  { id: 'games', labelKey: 'games', href: '/games' },
  { id: 'tournaments', labelKey: 'tournaments', href: '/games/trading' },
  { id: 'poker', labelKey: 'poker', href: '/games/poker' },
  { id: 'blackjack', labelKey: 'blackjack', href: '/games/blackjack' },
  { id: 'jetpack', labelKey: 'jetpack', href: '/games/jetpack' },
  { id: 'race', labelKey: 'race', href: '/games/race' },
  { id: 'journalApp', labelKey: 'journalApp', href: '/terminal', other: true },
];

/** На телефоне в панель площадки шесть игр не влезут: отдельные игры открываются с витрины. */
const PLAY_TABS: readonly Tab[] = ['games', 'tournaments', 'journalApp'];

/** Рейка шапки. */
export const navOf = (part: AppPart) => (part === 'journal' ? JOURNAL_NAV : PLAY_NAV);

/** Нижняя панель телефона (`TabBar`). */
export const tabsOf = (part: AppPart) =>
  part === 'journal' ? JOURNAL_NAV : PLAY_NAV.filter((item) => PLAY_TABS.includes(item.id));

/**
 * Открыт ли этот раздел сейчас.
 *
 * Не строгое равенство: у раздела могут появиться вложенные адреса
 * (`/tags/<id>`), и пункт обязан оставаться подсвеченным внутри своей ветки.
 * Граница проверяется по слэшу, иначе `/lab` подсвечивался бы на `/labels`.
 * «Дневник» — открыт на любой из своих страниц; витрина игр — только на самой
 * себе: под `/games` лежат отдельные игры со своими пунктами.
 */
export function isActive(pathname: string, item: NavItem): boolean {
  if (item.other) return false;
  if (item.id === 'journal') return isJournalPath(pathname);
  if (item.href === '/games') return pathname === '/games';
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
