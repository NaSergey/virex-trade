/**
 * Страницы «Дневника» — его вкладки. Порядок — путь разбора: что вышло за
 * период, почему входил, какая выборка работает. Один список на рейку шапки
 * (подсветка «Дневника») и вкладки самого дневника (`widgets/journal-nav`).
 */
export const JOURNAL_PAGES = ['overview', 'tags', 'analytics'] as const;

export type JournalPage = (typeof JOURNAL_PAGES)[number];

/**
 * Открыта ли эта страница дневника. Граница — по слэшу, как у рейки: вложенный
 * адрес (`/tags/<id>`) — та же страница, а `/tagsx` — уже нет.
 */
export function isJournalPage(pathname: string, id: JournalPage): boolean {
  return pathname === `/${id}` || pathname.startsWith(`/${id}/`);
}

/** Открыта ли сейчас любая страница дневника. */
export function isJournalPath(pathname: string): boolean {
  return JOURNAL_PAGES.some((id) => isJournalPage(pathname, id));
}
