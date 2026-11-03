import { isAdminHost } from './admin-host';

/**
 * Части продукта (спека 2026-11-03-split-play-journal-design.md): игровая площадка на
 * главном домене, журнал на `journal.*`, админка на `admin.*`. Код один, часть
 * определяется по Host: гейт разводит адреса (`proxy.ts`), обвязка читает её из
 * контекста (`useAppPart`).
 */
export type AppPart = 'play' | 'journal' | 'admin';

export function partOfHost(host: string | null | undefined): AppPart {
  if (isAdminHost(host)) return 'admin';
  return /^journal\./i.test(host ?? '') ? 'journal' : 'play';
}

/** Куда ведут знак, вход и «/» вошедшего. */
export const HOME_OF: Record<AppPart, string> = { play: '/games', journal: '/terminal', admin: '/' };

const bare = (host: string) => host.replace(/^(www|journal)\./i, '');
export const journalHost = (host: string) => `journal.${bare(host)}`;
export const playHost = bare;

const under = (path: string, root: string) => path === root || path.startsWith(`${root}/`);

const JOURNAL_ROUTES = ['/terminal', '/overview', '/tags', '/analytics', '/market', '/backtest', '/settings'];
const PLAY_ROUTES = ['/games', '/profile'];

export const isJournalRoute = (path: string) => JOURNAL_ROUTES.some((root) => under(path, root));
export const isPlayRoute = (path: string) => PLAY_ROUTES.some((root) => under(path, root));
